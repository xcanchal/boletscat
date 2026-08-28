#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "vendor"), { recursive: true });
await mkdir(join(out, "app"), { recursive: true });
await mkdir(join(out, "assets/brand"), { recursive: true });
await mkdir(join(out, "legal"), { recursive: true });
await Promise.all([
  cp(join(root, "index.html"), join(out, "index.html")),
  cp(join(root, "app.html"), join(out, "app/index.html")),
  cp(join(root, "legal.html"), join(out, "legal/index.html")),
  cp(join(root, "preview-map.webp"), join(out, "preview-map.webp")),
  cp(join(root, "media"), join(out, "media"), { recursive: true }),
  cp(join(root, "preview-map.webp"), join(out, "app/preview-map.webp")),
  cp(join(root, "favicon.svg"), join(out, "favicon.svg")),
  cp(join(root, "manifest.webmanifest"), join(out, "manifest.webmanifest")),
  cp(join(root, "sw.js"), join(out, "sw.js")),
  cp(join(root, "assets/brand/boletada-og-1200x630.png"), join(out, "assets/brand/boletada-og-1200x630.png")),
  cp(join(root, "assets/brand/favicon-32.png"), join(out, "assets/brand/favicon-32.png")),
  cp(join(root, "assets/brand/apple-touch-icon-180.png"), join(out, "assets/brand/apple-touch-icon-180.png")),
  cp(join(root, "assets/brand/icon-192.png"), join(out, "assets/brand/icon-192.png")),
  cp(join(root, "assets/brand/icon-512.png"), join(out, "assets/brand/icon-512.png")),
  cp(join(root, "node_modules/maplibre-gl/dist/maplibre-gl.css"), join(out, "vendor/maplibre-gl.css")),
  cp(join(root, "node_modules/maplibre-gl/dist/maplibre-gl.js"), join(out, "vendor/maplibre-gl.js")),
  cp(join(root, "node_modules/@revenuecat/purchases-js/dist/Purchases.es.js"), join(out, "vendor/purchases.es.js")),
]);

console.log("Client web preparat a public/");
