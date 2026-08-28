#!/usr/bin/env node
/** Precalcula una graella estàtica de 250 m: coberta forestal + altitud + substrat. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decodeRgbaPng } from "./raster.mjs";
import { rasterizeSubstrate } from "./substrate.mjs";

const CELL = 250, X0 = 260000, Y0 = 4484000, X1 = 530000, Y1 = 4760000;
const WIDTH = (X1 - X0) / CELL, HEIGHT = (Y1 - Y0) / CELL;
const WMS = "https://geoserveis.icgc.cat/servei/catalunya/cobertes-sol/wms";
const WCS = "https://geoserveis.icgc.cat/icc_mdt/wcs/service?";
const GEOLOGY = "https://datacloud.icgc.cat/datacloud/geologia-territorial-250000-geologic/gpkg/geologia-territorial-250000-geologic-v3r0-202312.zip";
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) || "graella.bin";

const rgbHost = new Map([
  [0x33cc33, 1], [0x19e61e, 1], // coníferes denses / clares
  [0x66ff33, 2], [0xb4ff9b, 2], // caducifolis densos / clars
  [0x689018, 3], [0xaaa500, 3], // esclerofil·les densos / clars
  [0x00ff9b, 4],                // bosc de ribera
]);

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res;
}

function parseArcGrid(text) {
  const lines = text.trim().split(/\r?\n/), h = {};
  for (let i = 0; i < 6; i++) { const [k, v] = lines[i].trim().split(/\s+/); h[k.toLowerCase()] = +v; }
  const values = lines.slice(6).join(" ").trim().split(/\s+/).map(Number);
  if (values.length !== h.ncols * h.nrows) throw new Error("ARCGRID incomplet");
  return { ...h, values };
}

async function pool(items, n, fn) {
  let cursor = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (cursor < items.length) { const i = cursor++; await fn(items[i], i); }
  }));
}

async function buildSubstrate(hosts) {
  const work = mkdtempSync(join(tmpdir(), "boletada-geology-"));
  try {
    const zipPath = join(work, "geology.zip");
    console.log("Baixant geologia territorial 1:250.000…");
    const response = await fetchOk(GEOLOGY);
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    execFileSync("unzip", ["-q", zipPath, "-d", work]);
    const gpkgName = readdirSync(work).find((name) => name.endsWith(".gpkg"));
    if (!gpkgName) throw new Error("El paquet geològic no conté cap GeoPackage");

    const db = new DatabaseSync(join(work, gpkgName), { readOnly:true });
    const rows = db.prepare(`
      SELECT u.geom AS geometry,
             u.Descripcio AS description,
             COALESCE(u.Descripcio_protolit, '') AS protolith,
             r.minx, r.maxx, r.miny, r.maxy
        FROM _05_unitats_geologiques_250000 u
        JOIN rtree__05_unitats_geologiques_250000_geom r ON r.id = u.id
    `).all().map((row) => ({ ...row, geometry:Buffer.from(row.geometry) }));
    db.close();

    // La geologia també es desa fora del bosc: moltes estacions XEMA són en una
    // clariana, però el seu substrat continua sent informatiu per al rànquing.
    const result = rasterizeSubstrate(rows, { width:WIDTH, height:HEIGHT, cell:CELL, x0:X0, y1:Y1 });
    const forestCounts = new Uint32Array(4);
    for (let i = 0; i < result.substrate.length; i++) if (hosts[i]) forestCounts[result.substrate[i]]++;
    const labels = ["desconegut", "silícic", "calcari", "mixt"];
    console.log("  Substrat de les cel·les forestals:");
    for (let code = 0; code < forestCounts.length; code++)
      console.log(`    ${labels[code].padEnd(11)} ${forestCounts[code].toLocaleString("ca")}`);
    return result.substrate;
  } finally {
    rmSync(work, { recursive:true, force:true });
  }
}

async function main() {
  console.log(`Graella ${WIDTH}×${HEIGHT} (${(WIDTH * HEIGHT).toLocaleString("ca")} cel·les de ${CELL} m)`);
  const coverUrl = WMS + "?" + new URLSearchParams({
    SERVICE:"WMS", VERSION:"1.3.0", REQUEST:"GetMap", LAYERS:"cobertes_2024", STYLES:"",
    CRS:"EPSG:25831", BBOX:`${X0},${Y0},${X1},${Y1}`, WIDTH:String(WIDTH), HEIGHT:String(HEIGHT),
    FORMAT:"image/png", TRANSPARENT:"true",
  });
  console.log("Baixant cobertes del sòl…");
  const cover = decodeRgbaPng(Buffer.from(await (await fetchOk(coverUrl)).arrayBuffer()));
  if (cover.width !== WIDTH || cover.height !== HEIGHT) throw new Error("Dimensions inesperades del WMS");

  const hosts = new Uint8Array(WIDTH * HEIGHT), altitude = new Int16Array(WIDTH * HEIGHT);
  altitude.fill(-32768);
  let forest = 0;
  for (let i = 0; i < hosts.length; i++) {
    const p = i * 4;
    if (!cover.rgba[p + 3]) continue;
    hosts[i] = rgbHost.get((cover.rgba[p] << 16) | (cover.rgba[p + 1] << 8) | cover.rgba[p + 2]) ?? 0;
    if (hosts[i]) forest++;
  }
  console.log(`  ${(100 * forest / hosts.length).toFixed(1)}% de cel·les forestals`);

  const TILE = 180, tiles = [];
  for (let row = 0; row < HEIGHT; row += TILE)
    for (let col = 0; col < WIDTH; col += TILE) tiles.push({ row, col, w:Math.min(TILE, WIDTH-col), h:Math.min(TILE, HEIGHT-row) });
  console.log(`Baixant altitud (${tiles.length} blocs)…`);
  let done = 0;
  await pool(tiles, 4, async (tile) => {
    const x0 = X0 + tile.col * CELL, x1 = x0 + tile.w * CELL;
    const y1 = Y1 - tile.row * CELL, y0 = y1 - tile.h * CELL;
    const url = WCS + new URLSearchParams({
      SERVICE:"WCS", VERSION:"1.0.0", REQUEST:"GetCoverage", COVERAGE:"icc:met",
      CRS:"EPSG:25831", RESPONSE_CRS:"EPSG:25831", BBOX:`${x0},${y0},${x1},${y1}`,
      WIDTH:String(tile.w), HEIGHT:String(tile.h), FORMAT:"ARCGRID",
    });
    const text = await (await fetchOk(url)).text();
    if (text.startsWith("<?xml")) throw new Error(text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/)?.[1]?.trim() || "Error WCS");
    const grid = parseArcGrid(text);
    if (grid.ncols !== tile.w || grid.nrows !== tile.h || Math.abs(grid.cellsize - CELL) > 0.1)
      throw new Error(`Bloc DEM desalineat: ${grid.ncols}×${grid.nrows} @ ${grid.cellsize}`);
    for (let y = 0; y < tile.h; y++) for (let x = 0; x < tile.w; x++) {
      const v = grid.values[y * tile.w + x];
      if (v !== grid.nodata_value && Number.isFinite(v)) altitude[(tile.row + y) * WIDTH + tile.col + x] = Math.round(v);
    }
    if (++done % 10 === 0 || done === tiles.length) console.log(`  ${done}/${tiles.length}`);
  });

  const substrate = await buildSubstrate(hosts);

  const header = Buffer.alloc(24), cells = Buffer.alloc(hosts.length * 4);
  header.write("BGR2", 0); header.writeUInt16LE(WIDTH, 4); header.writeUInt16LE(HEIGHT, 6);
  header.writeInt32LE(X0, 8); header.writeInt32LE(Y0, 12); header.writeInt32LE(Y1, 16); header.writeUInt16LE(CELL, 20);
  for (let i = 0; i < hosts.length; i++) {
    cells[i * 4] = hosts[i];
    cells.writeInt16LE(altitude[i], i * 4 + 1);
    cells[i * 4 + 3] = substrate[i];
  }
  writeFileSync(OUT, Buffer.concat([header, cells]));
  const valid = altitude.reduce((n, v, i) => n + (hosts[i] && v !== -32768 ? 1 : 0), 0);
  console.log(`✓ ${OUT}: ${valid.toLocaleString("ca")} cel·les forestals amb altitud`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
