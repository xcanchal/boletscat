#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "www");
const DATA_BASE = "https://boletada.cat/";

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "vendor"), { recursive: true });

let html = await readFile(join(ROOT, "app.html"), "utf8");
html = html
  // El manifest i el service worker només tenen sentit a la web instal·lable:
  // dins del webview de Capacitor apuntarien a rutes que no existeixen.
  .replace(/[ \t]*<!-- pwa:start[\s\S]*?<!-- pwa:end -->\n/, "")
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
    'href="/vendor/maplibre-gl.css"',
    'href="./vendor/maplibre-gl.css"',
  )
  .replace(
    'src="/vendor/maplibre-gl.js"',
    'src="./vendor/maplibre-gl.js"',
  )
  .replace(
    "from '/vendor/purchases.es.js'",
    "from './vendor/purchases.es.js'",
  )
  .replace(
    "from '/prediction-confidence.mjs'",
    "from './prediction-confidence.mjs'",
  )
  .replace(
    "from '/raster-projection.mjs'",
    "from './raster-projection.mjs'",
  );

await Promise.all([
  writeFile(join(OUT, "index.html"), html),
  cp(join(ROOT, "preview-map.webp"), join(OUT, "preview-map.webp")),
  cp(join(ROOT, "favicon.svg"), join(OUT, "favicon.svg")),
  cp(join(ROOT, "prediction-confidence.mjs"), join(OUT, "prediction-confidence.mjs")),
  cp(join(ROOT, "raster-projection.mjs"), join(OUT, "raster-projection.mjs")),
  cp(join(ROOT, "media/bolets"), join(OUT, "media/bolets"), { recursive: true }),
  cp(join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.css"), join(OUT, "vendor/maplibre-gl.css")),
  cp(join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.js"), join(OUT, "vendor/maplibre-gl.js")),
  cp(join(ROOT, "node_modules/@revenuecat/purchases-js/dist/Purchases.es.js"), join(OUT, "vendor/purchases.es.js")),
]);

console.log(`Client mòbil generat a ${OUT}`);
