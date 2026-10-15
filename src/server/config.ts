import path from "node:path";
import { DEFAULT_SEED } from "../shared/constants";

export interface ServerConfig {
  port: number;
  host: string;
  seed: number;
  maxPlayers: number;
  bots: number;
  dataDir: string;
  clientDir: string;
}

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Configuração via variáveis de ambiente, com padrões seguros:
 * por padrão o servidor só aceita conexões da própria máquina (HOST=127.0.0.1).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: readInt(env.PORT, 3000, 0, 65535),
    host: env.HOST?.trim() || "127.0.0.1",
    seed: readInt(env.SEED, DEFAULT_SEED, 0, 2 ** 31 - 1),
    maxPlayers: readInt(env.MAX_PLAYERS, 100, 1, 1000),
    bots: readInt(env.BOTS, 0, 0, 20),
    dataDir: path.resolve(env.DATA_DIR?.trim() || "data"),
    clientDir: path.resolve(env.CLIENT_DIR?.trim() || "dist/client"),
  };
}
