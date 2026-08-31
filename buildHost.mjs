#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PRECOMPUTE HOSTE (MCSC) · tipus de bosc dominant al voltant de cada estació
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Es corre UN cop (el bosc no canvia cada dia). Per a cada estació de la XEMA:
 *    · mostreja una graella al voltant (radi ~2 km) via GetFeatureInfo del MCSC,
 *    · classifica cada punt en un tipus de bosc-hoste per paraula clau,
 *    · ignora el que no és bosc (conreu, carretera, urbà, prat, roca…),
 *    · es queda amb el tipus DOMINANT + quina fracció de l'entorn és bosc.
 *  Escriu estacions_host.json, que el scorer llegeix per al factor hoste.
 *
 *    node buildHost.mjs            → totes les estacions (~2-4 min)
 *    node buildHost.mjs --grid=5   → graella més densa (més precís, més lent)
 *
 *  Per què radi i no el punt: l'estació sol estar en clariana/camp obert, així
 *  que el píxel exacte sovint diu "no bosc" tot i estar envoltada de bosc.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync } from "node:fs";

const SOCRATA = "https://analisi.transparenciacatalunya.cat/resource/yqwd-vj5e.json";
const WMS = "https://geoserveis.icgc.cat/servei/catalunya/cobertes-sol/wms";
const LAYER = "cobertes_2024";

const GRID = parseInt(process.argv.find((a) => a.startsWith("--grid="))?.slice(7) || "5"); // NxN punts
const STEP = 0.01;   // ~1 km entre punts → 5×5 cobreix ~4 km
const CONC = 5;      // estacions en paral·lel (educadet amb el servei)

// Classifica l'etiqueta de coberta del MCSC en un tag d'hoste (o null si no és bosc).
function forestTag(label) {
  const s = label.toLowerCase();
  if (s.includes("aciculifoli")) return "conifer";                        // pins, avets
  if (s.includes("esclerofil") || s.includes("laurifoli")) return "sclerophyll"; // alzina, surera
  if (s.includes("caducifoli") || s.includes("planifoli")) return "deciduous";   // roure, faig, castanyer
  if (s.includes("ribera")) return "ribera";                              // bosc de ribera (freixe…)
  return null; // conreu, urbà, prat, matollar, aigua, viària, roca…
}

// GetFeatureInfo d'un punt → etiqueta 'class' (o null). Format text/plain (l'únic que va).
async function coverAt(lon, lat) {
  const d = 0.0006;
  const url = WMS + "?" + new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo",
    LAYERS: LAYER, QUERY_LAYERS: LAYER, STYLES: "", INFO_FORMAT: "text/plain",
    SRS: "EPSG:4326", BBOX: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    WIDTH: "101", HEIGHT: "101", X: "50", Y: "50", FEATURE_COUNT: "1",
  });
  try {
    const t = await fetch(url).then((r) => r.text());
    const m = t.match(/class = '(.+?)'\s+red\s*=/s);   // el label pot dur apòstrofs (d'aciculifolis)
    return m ? forestTag(m[1]) : null;
  } catch { return null; }
}

// Mostreja la graella al voltant d'una estació i decideix el bosc dominant.
async function hostOf(lon, lat) {
  const half = (GRID - 1) / 2, tally = new Map();
  let bosc = 0, total = 0;
  const pts = [];
  for (let i = -half; i <= half; i++)
    for (let j = -half; j <= half; j++) pts.push([lon + i * STEP, lat + j * STEP]);
  for (const [x, y] of pts) {                      // seqüencial dins l'estació
    const tag = await coverAt(x, y);
    total++;
    if (tag) { bosc++; tally.set(tag, (tally.get(tag) ?? 0) + 1); }
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return {
    host: ranked[0]?.[0] ?? null,                  // tipus de bosc dominant (o null)
    forestFrac: +(bosc / total).toFixed(2),        // quina part de l'entorn és bosc
    mix: Object.fromEntries(ranked),
  };
}

// Pool de concurrència senzill.
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

async function main() {
  const est = await fetch(`${SOCRATA}?$limit=1000`).then((r) => r.json());
  const key = (o, ...c) => c.find((k) => k in o) || Object.keys(o).find((k) => c.some((x) => k.includes(x)));
  const kC = key(est[0], "codi_estacio", "codi"), kN = key(est[0], "nom_estacio", "nom");
  const kLa = key(est[0], "latitud", "lat"), kLo = key(est[0], "longitud", "lon");
  const stations = est.map((e) => ({ codi: e[kC], nom: e[kN], lat: +e[kLa], lon: +e[kLo] }))
                      .filter((s) => s.lat && s.lon);

  console.log(`Mostrejant el MCSC per a ${stations.length} estacions (graella ${GRID}×${GRID})…\n`);
  let done = 0;
  const result = {};
  await pool(stations, CONC, async (s) => {
    const h = await hostOf(s.lon, s.lat);
    result[s.codi] = { nom: s.nom, ...h };
    if (++done % 25 === 0) console.log(`  ${done}/${stations.length}`);
  });

  writeFileSync("estacions_host.json", JSON.stringify(result, null, 0));

  // Resum per validar d'un cop d'ull, sense obrir el json
  const counts = {};
  for (const v of Object.values(result)) counts[v.host ?? "—(no bosc)"] = (counts[v.host ?? "—(no bosc)"] ?? 0) + 1;
  console.log("\nBosc dominant per estació (recompte):");
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
  console.log(`\n✓ ${Object.keys(result).length} estacions → estacions_host.json`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
