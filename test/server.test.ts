import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { MemoryStore } from "../src/game/store";
import { startGameServer, type GameServer } from "../src/server/app";
import { silentLog } from "../src/server/logger";
import { DEFAULT_SEED, PROTOCOL_VERSION } from "../src/shared/constants";
import type { ServerMessage } from "../src/shared/protocol";

let server: GameServer;
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "valdoria-test-"));
  const clientDir = path.join(tempDir, "client");
  await import("node:fs/promises").then((fs) => fs.mkdir(clientDir));
  await writeFile(path.join(clientDir, "index.html"), "<h1>Valdoria</h1>");
  server = await startGameServer(
    { port: 0, host: "127.0.0.1", seed: DEFAULT_SEED, maxPlayers: 10, bots: 0, dataDir: tempDir, clientDir },
    { log: silentLog, store: new MemoryStore() },
  );
});

afterAll(async () => {
  await server.close();
  await rm(tempDir, { recursive: true, force: true });
});

interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  waitFor(predicate: (m: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  closed: Promise<number>;
}

function connect(): Promise<TestClient> {
  const socket = new WebSocket(`${server.url.replace("http", "ws")}/ws`);
  const messages: ServerMessage[] = [];
  const waiters: { predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  const closed = new Promise<number>((resolve) => socket.on("close", (code) => resolve(code)));
  const waitFor = (predicate: (m: ServerMessage) => boolean, timeoutMs = 3000) => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Tempo esgotado esperando mensagem")), timeoutMs);
      waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  };
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve({ socket, messages, waitFor, closed }));
    socket.once("error", reject);
  });
}

function rawGet(pathname: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const url = new URL(server.url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, path: pathname, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("servidor HTTP", () => {
  it("responde o health check", async () => {
    const response = await rawGet("/health");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, players: 0 });
  });

  it("serve o cliente com cabeçalhos de segurança", async () => {
    const response = await rawGet("/");
    expect(response.status).toBe(200);
    expect(response.body).toContain("Valdoria");
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("bloqueia tentativas de sair da pasta do cliente", async () => {
    const response = await rawGet("/..%2f..%2fpackage.json");
    expect(response.status).toBe(404);
  });
});

describe("servidor WebSocket", () => {
  it("dois jogadores se veem e conversam pelo chat", async () => {
    const ana = await connect();
    const bia = await connect();
    ana.socket.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "AnaWs", cls: "mago" }));
    const welcomeAna = await ana.waitFor((m) => m.t === "welcome");
    bia.socket.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "BiaWs", cls: "arqueira" }));
    const welcomeBia = await bia.waitFor((m) => m.t === "welcome");
    expect(welcomeAna).toMatchObject({ seed: DEFAULT_SEED, w: 96, h: 96 });

    const biaId = welcomeBia.t === "welcome" ? welcomeBia.you : -1;
    await ana.waitFor((m) => m.t === "snap" && m.ents.some((e) => e.id === biaId));

    ana.socket.send(JSON.stringify({ t: "chat", text: "Olá, Bia!" }));
    const chat = await bia.waitFor((m) => m.t === "chat" && !m.sys);
    expect(chat).toEqual({ t: "chat", from: "AnaWs", text: "Olá, Bia!", sys: false });

    ana.socket.close();
    bia.socket.close();
    await Promise.all([ana.closed, bia.closed]);
  });

  it("recusa clientes com versão de protocolo antiga", async () => {
    const client = await connect();
    client.socket.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION + 99, name: "Velho", cls: "mago" }));
    const error = await client.waitFor((m) => m.t === "err");
    expect(error).toMatchObject({ code: "version" });
    await client.closed;
  });

  it("recusa um nome que já está em jogo", async () => {
    const first = await connect();
    first.socket.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "Duplicado", cls: "mago" }));
    await first.waitFor((m) => m.t === "welcome");
    const second = await connect();
    second.socket.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "duplicado", cls: "mago" }));
    const error = await second.waitFor((m) => m.t === "err");
    expect(error).toMatchObject({ code: "online" });
    first.socket.close();
    second.socket.close();
    await Promise.all([first.closed, second.closed]);
  });

  it("desconecta quem insiste em mandar lixo, sem derrubar o servidor", async () => {
    const client = await connect();
    for (let i = 0; i < 25; i++) client.socket.send("isso não é JSON");
    expect(await client.closed).toBe(1008);
    const health = await rawGet("/health");
    expect(health.status).toBe(200);
  });
});
