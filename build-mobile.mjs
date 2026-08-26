#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "www");
const DATA_BASE = "https://boletada.cat/";

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "vendor"), { recursive: true });

let html = await readFile(join(ROOT, "index.html"), "utf8");
html = html
  .replace(
    'content="width=device-width, initial-scale=1, viewport-fit=cover"',
    'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"',
  )
  .replace(
    '<title>Predictor de bolets · Catalunya</title>',
    `<meta name="bolets-data-base" content="${DATA_BASE}" />\n  <title>Predictor de bolets · Catalunya</title>`,
  )
  .replace('href="/favicon.svg"', 'href="./favicon.svg"')
  .replace(
    'href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"',
    'href="./vendor/maplibre-gl.css"',
  )
  .replace(
    'src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"',
    'src="./vendor/maplibre-gl.js"',
  );

await Promise.all([
  writeFile(join(OUT, "index.html"), html),
  cp(join(ROOT, "favicon.svg"), join(OUT, "favicon.svg")),
  cp(join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.css"), join(OUT, "vendor/maplibre-gl.css")),
  cp(join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.js"), join(OUT, "vendor/maplibre-gl.js")),
]);

console.log(`Client mòbil generat a ${OUT}`);
