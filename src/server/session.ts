import { WebSocket, type RawData } from "ws";
import { TokenBucket } from "../game/ratelimit";
import type { LogFn, World } from "../game/world";
import { PROTOCOL_VERSION } from "../shared/constants";
import { parseClientMessage, type ServerMessage } from "../shared/protocol";

/** Se o cliente não consegue receber o que enviamos, ele está lento demais. */
const MAX_BUFFERED_BYTES = 1_000_000;
const MAX_VIOLATIONS = 20;

/**
 * Uma conexão WebSocket. Faz o handshake (mensagem "hello"), aplica limite de
 * taxa, valida cada mensagem e repassa os comandos válidos para o mundo.
 */
export class Session {
  private playerId: number | null = null;
  private joining = false;
  private closed = false;
  private violations = 0;
  private alive = true;
  private readonly limiter = new TokenBucket(60, 30, performance.now());

  constructor(
    private readonly socket: WebSocket,
    private readonly world: World,
    private readonly log: LogFn,
    private readonly address: string,
  ) {
    socket.on("message", (data, isBinary) => this.onMessage(data, isBinary));
    socket.on("close", () => this.onClose());
    socket.on("error", (error) => this.log("warn", "Erro no socket", { address, error: String(error) }));
    socket.on("pong", () => {
      this.alive = true;
    });
  }

  /** Chamado periodicamente: derruba conexões que pararam de responder. */
  heartbeat(): void {
    if (!this.alive) {
      this.socket.terminate();
      return;
    }
    this.alive = false;
    this.socket.ping();
  }

  private send(message: ServerMessage): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.log("warn", "Cliente lento demais, desconectando", { address: this.address });
      this.socket.terminate();
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private strike(reason: string): void {
    this.violations++;
    if (this.violations === MAX_VIOLATIONS) {
      this.log("warn", "Muitas mensagens inválidas, desconectando", { address: this.address, reason });
      this.socket.close(1008, "Protocolo violado");
    }
  }

  private onMessage(data: RawData, isBinary: boolean): void {
    if (this.closed) return;
    if (!this.limiter.take(performance.now())) {
      this.strike("taxa");
      return;
    }
    if (isBinary) {
      this.strike("binario");
      return;
    }
    const text = Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : Buffer.from(data).toString("utf8");
    const message = parseClientMessage(text);
    if (!message) {
      this.strike("invalida");
      return;
    }

    if (this.playerId !== null) {
      this.world.handle(this.playerId, message);
      return;
    }

    // Ainda sem personagem: a única mensagem aceita é o "hello".
    if (message.t !== "hello" || this.joining) return;
    if (message.v !== PROTOCOL_VERSION) {
      this.send({ t: "err", code: "version", msg: "Versão do jogo desatualizada. Recarregue a página." });
      this.socket.close(1000, "Versão incompatível");
      return;
    }
    this.joining = true;
    void this.world
      .join(message.name, message.cls, { send: (out) => this.send(out) })
      .then((result) => {
        this.joining = false;
        if (this.closed) {
          if (result.ok) void this.world.leave(result.playerId);
          return;
        }
        if (result.ok) this.playerId = result.playerId;
        else this.send({ t: "err", code: result.code, msg: result.msg });
      });
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.playerId !== null) void this.world.leave(this.playerId);
  }
}
