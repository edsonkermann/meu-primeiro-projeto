import type { ClientMessage, ServerMessage } from "../shared/protocol";

/**
 * Canal entre o cliente e o mundo. No jogo online é um WebSocket; na demo é uma
 * chamada direta para a simulação rodando na própria página. O resto do cliente
 * não sabe a diferença.
 */
export interface Connection {
  send(message: ClientMessage): void;
  close(): void;
  onOpen: () => void;
  onMessage: (message: ServerMessage) => void;
  onClose: (reason: string) => void;
}

export class WebSocketConnection implements Connection {
  onOpen: () => void = () => undefined;
  onMessage: (message: ServerMessage) => void = () => undefined;
  onClose: (reason: string) => void = () => undefined;
  private readonly socket: WebSocket;
  private closedByClient = false;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => this.onOpen());
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      this.onMessage(message);
    });
    this.socket.addEventListener("close", (event) => {
      if (this.closedByClient) return;
      this.onClose(event.reason || "Não foi possível falar com o servidor. Verifique se ele está rodando.");
    });
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.closedByClient = true;
    this.socket.close();
  }
}

export function defaultServerUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
