// Compila o projeto:
//   npm run build       -> dist/client (página + app.js) e dist/server (servidor Node)
//   npm run build:demo  -> dist/demo/valdoria-demo.html (demo offline num arquivo só)
import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const demoOnly = process.argv.includes("--demo");

async function buildClient() {
  await mkdir("dist/client", { recursive: true });
  await build({
    entryPoints: ["src/client/main.ts"],
    bundle: true,
    format: "esm",
    target: "es2020",
    outfile: "dist/client/app.js",
    sourcemap: true,
    minify: true,
    legalComments: "none",
  });
  const [template, markup] = await Promise.all([
    readFile("src/client/index.html", "utf8"),
    readFile("src/client/markup.html", "utf8"),
  ]);
  // Função de substituição: evita que "$&" e afins no conteúdo sejam interpretados.
  await writeFile("dist/client/index.html", template.replace("<!-- MARKUP -->", () => markup));
  await copyFile("src/client/style.css", "dist/client/style.css");
}

async function buildServer() {
  await build({
    entryPoints: ["src/server/index.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: "dist/server/index.js",
    packages: "external",
    sourcemap: true,
  });
}

async function buildDemo() {
  const result = await build({
    entryPoints: ["src/demo/main.ts"],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: true,
    write: false,
    legalComments: "none",
  });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const [template, markup, css] = await Promise.all([
    readFile("src/demo/demo.html", "utf8"),
    readFile("src/client/markup.html", "utf8"),
    readFile("src/client/style.css", "utf8"),
  ]);
  const html = template
    .replace("/* STYLE */", () => css)
    .replace("<!-- MARKUP -->", () => markup)
    .replace("/* SCRIPT */", () => script);
  await mkdir("dist/demo", { recursive: true });
  await writeFile("dist/demo/valdoria-demo.html", html);
  return html.length;
}

const started = Date.now();
if (demoOnly) {
  const size = await buildDemo();
  console.log(`Demo gerada em dist/demo/valdoria-demo.html (${Math.round(size / 1024)} KB)`);
} else {
  await Promise.all([buildClient(), buildServer()]);
  console.log("Build pronto: dist/client e dist/server");
}
console.log(`Tempo: ${Date.now() - started} ms`);
