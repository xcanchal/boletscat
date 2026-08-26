#!/usr/bin/env node
/**
 * Servidor estàtic mínim (sense dependències) per servir ./public.
 * Serveix index.html + els bolets.<espècie>.geojson que hi escriu el scorer.
 * Port des de la variable PORT (Coolify la injecta), per defecte 8080.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "public");
const PORT = process.env.PORT || 8080;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".geojson": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); } // anti path-traversal
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",   // que el navegador no serveixi geojson vells
      "Access-Control-Allow-Origin": "*", // dades públiques per al client web i Capacitor
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, () => console.log(`servint ./public a :${PORT}`));
