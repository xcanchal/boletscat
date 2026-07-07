#!/usr/bin/env node
/**
 * Score de bolets per estació XEMA — versió stateless, sense interpolació.
 *
 * node score_estacions.mjs                 → data d'avui
 * node score_estacions.mjs --date=2025-10-15   → backtest "com si fos" aquell dia
 *
 * Fa 3 crides a Socrata (pluja diària, temperatura diària, metadades d'estacions),
 * calcula score = humitat × temperatura × hoste, imprimeix el rànquing i escriu
 * bolets.geojson (llest per MapLibre).
 *
 * Camps reals confirmats: codi_estacio / codi_variable / data_lectura / valor_lectura
 * Variables: pluja=35 (PPT), temperatura=32 (T)
 */

import { writeFileSync } from "node:fs";

const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES  = `${BASE}/nzvn-apee.json`;
const DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`;

const V_PLUJA = "35";
const V_TEMP  = "32";
const DIES = 30;   // finestra d'acumulació de pluja
const DIES_TEMP = 5; // finestra per la temperatura recent
const K = 0.9;     // decaïment diari de la humitat
const H0 = 40;     // mm efectius on la humitat "satura"

// ── Hoste: 1 = pineda/bosc bo. Omplir amb el MCSC quan el tinguem. ──────────
const HOST = {
  // "ZB": 1.0, "C6": 0.3, ...
};
const hostFactor = (codi) => HOST[codi] ?? 1.0;

async function soda(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}
const findKey = (row, ...c) => {
  for (const k of c) if (k in row) return k;
  for (const k of Object.keys(row))
    for (const x of c) if (k.replace(/_/g, "").toLowerCase().includes(x.replace(/_/g, ""))) return k;
  return null;
};

function tempFactor(t) {
  if (t == null || Number.isNaN(t)) return 0.5;      // desconegut → neutre-baix
  if (t < 2 || t > 28) return 0;                      // glaçada o massa calor
  if (t < 10) return (t - 2) / 8;                     // 2°C→0 ... 10°C→1
  if (t <= 20) return 1;                              // finestra ideal
  return (28 - t) / 8;                                // 20°C→1 ... 28°C→0
}

// suma diària server-side (date_trunc_ymd + agregació). Si la teva instància es
// queixa del tipus de valor_lectura, avisa'm i ho passem a client-side.
async function diari(variable, desdeISO, finsISO, agg) {
  return soda(DS_MESURES, {
    $select: `codi_estacio, date_trunc_ymd(data_lectura) AS dia, ${agg}(valor_lectura) AS v`,
    $where: `codi_variable='${variable}' AND data_lectura >= '${desdeISO}' AND data_lectura <= '${finsISO}'`,
    $group: "codi_estacio, dia",
    $limit: 100000,
  });
}

async function main() {
  const refArg = process.argv.find((a) => a.startsWith("--date="));
  const ref = refArg ? new Date(refArg.slice(7) + "T23:59:59") : new Date();
  const refISO = ref.toISOString().slice(0, 19);
  const desdePluja = new Date(ref - DIES * 864e5).toISOString().slice(0, 19);
  const desdeTemp  = new Date(ref - DIES_TEMP * 864e5).toISOString().slice(0, 19);
  console.log(`Data de referència: ${refISO.slice(0, 10)}\n`);

  // ── metadades: codi → {nom, lat, lon, alt} ────────────────────────────────
  const est = await soda(DS_ESTACIONS, { $limit: 1000 });
  const eCodi = findKey(est[0], "codi_estacio", "codi");
  const eNom  = findKey(est[0], "nom_estacio", "nom");
  const eLat  = findKey(est[0], "latitud", "lat");
  const eLon  = findKey(est[0], "longitud", "lon");
  const eAlt  = findKey(est[0], "altitud", "alt");
  const meta = new Map(est.map((e) => [e[eCodi], {
    nom: e[eNom], lat: +e[eLat], lon: +e[eLon], alt: +e[eAlt],
  }]));

  // ── pluja diària (30 dies) i temperatura mitjana diària (5 dies) ───────────
  const pluja = await diari(V_PLUJA, desdePluja, refISO, "sum");
  const temp  = await diari(V_TEMP, desdeTemp, refISO, "avg");

  // humitat ponderada per estació
  const H = new Map();
  for (const r of pluja) {
    const d = Math.round((ref - new Date(r.dia)) / 864e5);
    if (d < 0 || d >= DIES) continue;
    const mm = parseFloat(r.v);
    if (!Number.isNaN(mm)) H.set(r.codi_estacio, (H.get(r.codi_estacio) ?? 0) + K ** d * mm);
  }
  // temperatura recent per estació (mitjana de les mitjanes diàries)
  const T = new Map(), Tn = new Map();
  for (const r of temp) {
    const t = parseFloat(r.v);
    if (Number.isNaN(t)) continue;
    T.set(r.codi_estacio, (T.get(r.codi_estacio) ?? 0) + t);
    Tn.set(r.codi_estacio, (Tn.get(r.codi_estacio) ?? 0) + 1);
  }

  // ── score per estació ─────────────────────────────────────────────────────
  const files = [];
  for (const [codi, m] of meta) {
    if (!m.lat || !m.lon) continue;
    const h = H.get(codi) ?? 0;
    const hScore = 1 - Math.exp(-h / H0);
    const tMean = Tn.has(codi) ? T.get(codi) / Tn.get(codi) : null;
    const tScore = tempFactor(tMean);
    const score = hScore * tScore * hostFactor(codi);
    files.push({ codi, ...m, h, tMean, score });
  }
  files.sort((a, b) => b.score - a.score);

  // ── rànquing a consola ────────────────────────────────────────────────────
  console.log("codi  estació                 alt   H     Tmit  score");
  console.log("────────────────────────────────────────────────────────");
  for (const f of files.slice(0, 20)) {
    console.log(
      `${(f.codi ?? "").padEnd(5)} ${(f.nom ?? "").slice(0, 22).padEnd(23)} ` +
      `${String(Math.round(f.alt || 0)).padStart(4)}  ${f.h.toFixed(1).padStart(5)}  ` +
      `${f.tMean == null ? "  -- " : f.tMean.toFixed(1).padStart(4)}  ${f.score.toFixed(3)}`
    );
  }

  // ── GeoJSON per al mapa ───────────────────────────────────────────────────
  const geojson = {
    type: "FeatureCollection",
    features: files.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      properties: { codi: f.codi, nom: f.nom, alt: f.alt, H: +f.h.toFixed(1), tMean: f.tMean, score: +f.score.toFixed(3) },
    })),
  };
  writeFileSync("bolets.geojson", JSON.stringify(geojson));
  console.log(`\n✓ ${files.length} estacions puntuades → bolets.geojson`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
