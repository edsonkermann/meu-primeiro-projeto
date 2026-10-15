// Modo desenvolvimento: recompila o cliente a cada alteração e reinicia o
// servidor sozinho. Abra http://localhost:3000 depois de rodar `npm run dev`.
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { context } from "esbuild";

await mkdir("dist/client", { recursive: true });

async function copyStatic() {
  const [template, markup] = await Promise.all([
    readFile("src/client/index.html", "utf8"),
    readFile("src/client/markup.html", "utf8"),
  ]);
  await writeFile("dist/client/index.html", template.replace("<!-- MARKUP -->", () => markup));
  await copyFile("src/client/style.css", "dist/client/style.css");
}

await copyStatic();
for (const file of ["src/client/index.html", "src/client/markup.html", "src/client/style.css"]) {
  watch(file, () => {
    copyStatic().catch((error) => console.error("Falha ao copiar arquivos do cliente:", error.message));
  });
}

const client = await context({
  entryPoints: ["src/client/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "dist/client/app.js",
  sourcemap: true,
  logLevel: "info",
});
await client.watch();

const server = spawn(process.execPath, ["--import", "tsx", "--watch", "src/server/index.ts"], {
  stdio: "inherit",
  env: { BOTS: "3", ...process.env },
});

const stop = () => {
  server.kill("SIGINT");
  void client.dispose().finally(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
