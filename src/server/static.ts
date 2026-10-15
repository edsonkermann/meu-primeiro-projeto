import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** Cabeçalhos de segurança: a página só carrega scripts do próprio servidor. */
export function securityHeaders(host: string | undefined): Record<string, string> {
  const safeHost = host && /^[a-z0-9.\-:[\]]+$/i.test(host) ? host : "";
  const sockets = safeHost ? ` ws://${safeHost} wss://${safeHost}` : "";
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      `connect-src 'self'${sockets}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

/**
 * Serve os arquivos do cliente compilado. Retorna `false` se o arquivo não
 * existir. Caminhos fora da pasta raiz (ex.: "/../../etc/passwd") são recusados.
 */
export async function serveStatic(req: IncomingMessage, res: ServerResponse, rootDir: string): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (pathname.includes("\0")) return false;
  if (pathname.endsWith("/")) pathname += "index.html";

  const root = path.resolve(rootDir);
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root + path.sep)) return false;

  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    size = info.size;
  } catch {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300",
    ...securityHeaders(req.headers.host),
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(filePath)
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}
