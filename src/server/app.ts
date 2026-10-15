import http from "node:http";
import { WebSocketServer } from "ws";
import type { CharacterStore } from "../game/store";
import { World, type LogFn } from "../game/world";
import { TICK_MS } from "../shared/constants";
import type { ClassId } from "../shared/data/classes";
import type { ServerConfig } from "./config";
import { FileStore } from "./fileStore";
import { consoleLog } from "./logger";
import { Session } from "./session";
import { securityHeaders, serveStatic } from "./static";

export interface GameServer {
  url: string;
  world: World;
  close(): Promise<void>;
}

const BOT_ROSTER: readonly [string, ClassId][] = [
  ["Aldric", "guerreiro"],
  ["Mirela", "arqueira"],
  ["Tobias", "mago"],
  ["Yara", "arqueira"],
  ["Bento", "guerreiro"],
  ["Lia", "mago"],
];

/**
 * Sobe o servidor completo: HTTP (cliente + /health), WebSocket em /ws e o loop
 * de simulação com passo fixo. Retorna um objeto para desligar tudo com segurança.
 */
export async function startGameServer(
  config: ServerConfig,
  options: { log?: LogFn; store?: CharacterStore } = {},
): Promise<GameServer> {
  const log = options.log ?? consoleLog;
  const world = new World({
    seed: config.seed,
    store: options.store ?? new FileStore(config.dataDir),
    maxPlayers: config.maxPlayers,
    log,
  });
  for (let i = 0; i < config.bots; i++) {
    const [name, cls] = BOT_ROSTER[i % BOT_ROSTER.length] as [string, ClassId];
    await world.addBot(i < BOT_ROSTER.length ? name : `${name}${i}`, cls);
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok: true, ...world.stats() }));
        return;
      }
      if (await serveStatic(req, res, config.clientDir)) return;
      const notBuilt = req.url === "/" || req.url === "/index.html";
      res.writeHead(notBuilt ? 503 : 404, { "Content-Type": "text/plain; charset=utf-8", ...securityHeaders(undefined) });
      res.end(notBuilt ? "O cliente ainda não foi compilado. Rode: npm run build" : "Não encontrado");
    })().catch((error: unknown) => {
      log("error", "Erro ao responder requisição HTTP", { error: String(error) });
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096, perMessageDeflate: false });
  const sessions = new Set<Session>();
  wss.on("connection", (socket, req) => {
    const session = new Session(socket, world, log, req.socket.remoteAddress ?? "desconhecido");
    sessions.add(session);
    socket.on("close", () => sessions.delete(session));
  });
  const heartbeat = setInterval(() => {
    for (const session of sessions) session.heartbeat();
  }, 15_000);

  // Loop de passo fixo: acumula o tempo real e executa quantos ticks couberem.
  // Se o servidor atrasar demais, descarta o atraso em vez de tentar compensar.
  let last = performance.now();
  let accumulator = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    accumulator += now - last;
    last = now;
    let steps = 0;
    while (accumulator >= TICK_MS && steps < 5) {
      world.tick();
      accumulator -= TICK_MS;
      steps++;
    }
    if (steps === 5) accumulator = 0;
  }, TICK_MS / 2);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  const displayHost = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(loop);
      clearInterval(heartbeat);
      await world.saveAll();
      for (const client of wss.clients) client.close(1001, "Servidor desligando");
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    })();
    return closing;
  };

  return { url: `http://${displayHost}:${port}`, world, close };
}
