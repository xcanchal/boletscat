#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "vendor"), { recursive: true });
await mkdir(join(out, "app"), { recursive: true });
await Promise.all([
  cp(join(root, "index.html"), join(out, "index.html")),
  cp(join(root, "app.html"), join(out, "app/index.html")),
  cp(join(root, "preview-map.webp"), join(out, "preview-map.webp")),
  cp(join(root, "media"), join(out, "media"), { recursive: true }),
  cp(join(root, "preview-map.webp"), join(out, "app/preview-map.webp")),
  cp(join(root, "favicon.svg"), join(out, "favicon.svg")),
  cp(join(root, "node_modules/maplibre-gl/dist/maplibre-gl.css"), join(out, "vendor/maplibre-gl.css")),
  cp(join(root, "node_modules/maplibre-gl/dist/maplibre-gl.js"), join(out, "vendor/maplibre-gl.js")),
  cp(join(root, "node_modules/@revenuecat/purchases-js/dist/Purchases.es.js"), join(out, "vendor/purchases.es.js")),
]);

console.log("Client web preparat a public/");
