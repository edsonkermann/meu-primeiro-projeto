import { startClient } from "./app";
import { defaultServerUrl, WebSocketConnection } from "./net";

// Cliente online: conecta no servidor que entregou esta página.
startClient({
  mode: "online",
  connect: () => new WebSocketConnection(defaultServerUrl()),
});
