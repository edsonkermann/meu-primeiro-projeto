import { GAME_NAME } from "../shared/constants";
import { startGameServer } from "./app";
import { loadConfig } from "./config";
import { consoleLog } from "./logger";

const config = loadConfig();
const server = await startGameServer(config, { log: consoleLog });
consoleLog("info", `${GAME_NAME} rodando em ${server.url}`, {
  host: config.host,
  seed: config.seed,
  bots: config.bots,
  maxPlayers: config.maxPlayers,
  dataDir: config.dataDir,
});
if (config.host === "127.0.0.1") {
  consoleLog("info", "Aceitando conexões só desta máquina. Para jogar com amigos na rede, use HOST=0.0.0.0.");
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  consoleLog("info", `${signal} recebido: salvando personagens e desligando...`);
  await server.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
