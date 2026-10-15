import type { LogFn } from "../game/world";

/** Log em uma linha por evento: data, nível, mensagem e dados extras em JSON. */
export const consoleLog: LogFn = (level, message, data) => {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${data ? ` ${JSON.stringify(data)}` : ""}`;
  if (level === "error") console.error(line);
  else console.log(line);
};

export const silentLog: LogFn = () => undefined;
