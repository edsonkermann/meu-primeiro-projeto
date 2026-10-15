import type { Connection } from "../client/net";
import type { World } from "../game/world";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "../shared/protocol";

/**
 * Conexão "de mentira" para a demo: em vez de um WebSocket, fala direto com o
 * mundo que roda na própria página. As mensagens passam por JSON e pela mesma
 * validação do servidor, então o comportamento é idêntico ao do jogo online.
 */
export class LocalConnection implements Connection {
  onOpen: () => void = () => undefined;
  onMessage: (message: ServerMessage) => void = () => undefined;
  onClose: (reason: string) => void = () => undefined;
  private playerId: number | null = null;
  private joining = false;
  private closed = false;

  constructor(private readonly world: World) {
    queueMicrotask(() => {
      if (!this.closed) this.onOpen();
    });
  }

  private readonly link = {
    send: (message: ServerMessage) => {
      if (this.closed) return;
      const copy = JSON.parse(JSON.stringify(message)) as ServerMessage;
      queueMicrotask(() => {
        if (!this.closed) this.onMessage(copy);
      });
    },
  };

  send(message: ClientMessage): void {
    if (this.closed) return;
    const parsed = parseClientMessage(JSON.stringify(message));
    if (!parsed) return;
    if (this.playerId !== null) {
      this.world.handle(this.playerId, parsed);
      return;
    }
    if (parsed.t !== "hello" || this.joining) return;
    this.joining = true;
    void this.world.join(parsed.name, parsed.cls, this.link).then((result) => {
      this.joining = false;
      if (result.ok) this.playerId = result.playerId;
      else this.link.send({ t: "err", code: result.code, msg: result.msg });
    });
  }

  close(): void {
    this.closed = true;
    if (this.playerId !== null) void this.world.leave(this.playerId);
    this.playerId = null;
  }
}
