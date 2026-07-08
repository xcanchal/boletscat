#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREDICTOR DE BOLETS · Catalunya · scorer per estació (MULTI-ESPÈCIE + HOSTE)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *    node score_estacions.mjs                              → rovelló, avui
 *    node score_estacions.mjs --species=cep --date=2025-10-20
 *    node score_estacions.mjs --all [--date=…]             → totes les espècies
 *    node score_estacions.mjs --list
 *
 *  Escriu un bolets.<espècie>.geojson per espècie (el mapa el llegeix).
 *
 *  ── MODEL ────────────────────────────────────────────────────────────────
 *    score = humitat × temperatura × altitud × estació × HOSTE     (0..1)
 *      · humitat    : pluja 30 dies amb sostre diari + lag de fructificació.
 *      · temperatura: finestra ideal per espècie.
 *      · altitud    : banda per espècie.
 *      · estació    : porta temporal — fora de temporada, ~0.
 *      · hoste      : tipus de bosc dominant a l'entorn de l'estació (del MCSC,
 *                     precalculat a estacions_host.json amb buildHost.mjs) comparat
 *                     amb l'arbre que vol cada espècie. AQUÍ ceps i rovellons es
 *                     diferencien de debò: cada un apunta al seu bosc.
 *
 *  Si falta estacions_host.json, el factor hoste = 1 (i s'avisa). Corre buildHost.mjs.
 *
 *  ── DADES ────────────────────────────────────────────────────────────────
 *    Meteo XEMA: nzvn-apee (35=pluja 32=temp) · Estacions: yqwd-vj5e
 *    Hoste     : estacions_host.json  ←  MCSC via WMS ICGC (buildHost.mjs)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync, readFileSync } from "node:fs";

const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES = `${BASE}/nzvn-apee.json`, DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`;
const V_PLUJA = "35", V_TEMP = "32";
const DIES = 30, DIES_TEMP = 5, CAP = 30, H0 = 40, LAG_RISE = 5, LAG_FALL = 12;

// ── Config per espècie ──────────────────────────────────────────────────────
// host = categories de bosc del MCSC: conifer (pins) · deciduous (roure/faig/castanyer)
//        · sclerophyll (alzina/surera) · ribera (bosc de ribera).
const SPECIES = {
  rovello:   { nom: "Rovelló / pinetell",               mesos:[9,10,11],    host:["conifer"],
               alt:[0,200,1500,1700],   temp:[2,8,20,26] },
  cep:       { nom: "Cep (grup Boletus edulis)",        mesos:[6,9,10,11],  host:["conifer","deciduous","sclerophyll"],
               alt:[400,800,1600,1900], temp:[2,8,18,24] },
  llenega:   { nom: "Llenega (Hygrophorus)",            mesos:[10,11,12],   host:["conifer"],
               alt:[100,300,1300,1500], temp:[0,4,14,20] },
  trompeta:  { nom: "Trompeta de la mort (Craterellus)",mesos:[9,10,11],    host:["deciduous","sclerophyll"],
               alt:[200,400,1300,1500], temp:[2,8,18,24] },
  rossinyol: { nom: "Rossinyol (Cantharellus cibarius)",mesos:[6,7,8,9,10], host:["conifer","deciduous","sclerophyll"],
               alt:[200,400,1500,1700], temp:[4,10,22,28] },
  camagroc:  { nom: "Camagroc (Cantharellus lutescens)",mesos:[10,11,12,1], host:["conifer"],
               alt:[300,500,1500,1700], temp:[-2,2,14,20] },
  murgola:   { nom: "Múrgola (Morchella)",              mesos:[3,4,5],      host:["ribera","deciduous"],
               alt:[100,300,1200,1500], temp:[2,8,18,24] },
};

// ── Hoste: carreguem el precompute del MCSC (si hi és) ──────────────────────
let HOST = null;
try { HOST = JSON.parse(readFileSync("estacions_host.json", "utf8")); }
catch { console.log("ℹ️  Sense estacions_host.json → factor hoste = 1. Corre  node buildHost.mjs\n"); }

// Factor hoste: compara el bosc dominant de l'estació amb el que vol l'espècie.
function hostFactor(codi, sp) {
  if (!HOST) return 1;                          // sense dades d'hoste → neutre
  const h = HOST[codi];
  if (!h || h.host == null) return 0.15;        // entorn no forestal → poc probable
  const frac = h.forestFrac ?? 1;
  if (sp.host.includes(h.host)) return 0.6 + 0.4 * frac;   // bosc dominant = el bo
  if (h.mix && sp.host.some((t) => t in h.mix)) return 0.45; // el bo hi és, però no domina
  return 0.25;                                  // bosc, però d'un altre arbre
}

// ── Utilitats ──────────────────────────────────────────────────────────────
async function soda(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}
const findKey = (row, ...c) => {
  for (const k of c) if (k in row) return k;
  for (const k of Object.keys(row))
    for (const x of c) if (k.replace(/_/g,"").toLowerCase().includes(x.replace(/_/g,""))) return k;
  return null;
};
function trapezoid(x, a, b, c, d) {
  if (x == null || Number.isNaN(x)) return 0.5;
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}
const lagWeight = (d) => (1 - Math.exp(-d / LAG_RISE)) * Math.exp(-d / LAG_FALL);
function seasonFactor(month, mesos) {
  if (mesos.includes(month)) return 1;
  const dist = Math.min(...mesos.map((m) => { const d = Math.abs(m - month); return Math.min(d, 12 - d); }));
  return dist === 1 ? 0.35 : 0;
}
async function diari(variable, desdeISO, finsISO, agg) {
  return soda(DS_MESURES, {
    $select: `codi_estacio, date_trunc_ymd(data_lectura) AS dia, ${agg}(valor_lectura) AS v`,
    $where:  `codi_variable='${variable}' AND data_lectura >= '${desdeISO}' AND data_lectura <= '${finsISO}'`,
    $group:  "codi_estacio, dia", $limit: 100000,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    console.log("Espècies disponibles:");
    for (const [k, s] of Object.entries(SPECIES)) console.log(`  ${k.padEnd(10)} ${s.nom}  ·  bosc ${s.host.join("/")}  ·  mesos ${s.mesos.join(",")}`);
    return;
  }
  const all = args.includes("--all");
  const spKeys = all ? Object.keys(SPECIES) : [(args.find((a) => a.startsWith("--species="))?.slice(10)) || "rovello"];
  for (const k of spKeys) if (!SPECIES[k]) { console.error(`Espècie desconeguda: ${k}. Prova --list`); process.exit(1); }

  const refArg = args.find((a) => a.startsWith("--date="));
  const ref = refArg ? new Date(refArg.slice(7) + "T23:59:59") : new Date();
  const refISO = ref.toISOString().slice(0, 19), month = ref.getMonth() + 1;
  const desdePluja = new Date(ref - DIES * 864e5).toISOString().slice(0, 19);
  const desdeTemp  = new Date(ref - DIES_TEMP * 864e5).toISOString().slice(0, 19);
  console.log(`Data de referència: ${refISO.slice(0, 10)}\n`);

  // ── Dades meteo un sol cop ───────────────────────────────────────────────
  const est = await soda(DS_ESTACIONS, { $limit: 1000 });
  const eCodi = findKey(est[0],"codi_estacio","codi"), eNom = findKey(est[0],"nom_estacio","nom");
  const eLat = findKey(est[0],"latitud","lat"), eLon = findKey(est[0],"longitud","lon"), eAlt = findKey(est[0],"altitud","alt");
  const meta = new Map(est.map((e) => [e[eCodi], { nom:e[eNom], lat:+e[eLat], lon:+e[eLon], alt:+e[eAlt] }]));

  const pluja = await diari(V_PLUJA, desdePluja, refISO, "sum");
  const temp  = await diari(V_TEMP,  desdeTemp,  refISO, "avg");
  const H = new Map();
  for (const r of pluja) {
    const d = Math.round((ref - new Date(r.dia)) / 864e5);
    if (d < 0 || d >= DIES) continue;
    const mm = parseFloat(r.v);
    if (!Number.isNaN(mm)) H.set(r.codi_estacio, (H.get(r.codi_estacio) ?? 0) + Math.min(mm, CAP) * lagWeight(d));
  }
  const Tsum = new Map(), Tn = new Map();
  for (const r of temp) {
    const t = parseFloat(r.v); if (Number.isNaN(t)) continue;
    Tsum.set(r.codi_estacio, (Tsum.get(r.codi_estacio) ?? 0) + t);
    Tn.set(r.codi_estacio, (Tn.get(r.codi_estacio) ?? 0) + 1);
  }

  // ── Puntuem cada espècie ─────────────────────────────────────────────────
  for (const spKey of spKeys) {
    const sp = SPECIES[spKey], gate = seasonFactor(month, sp.mesos);
    const files = [];
    for (const [codi, m] of meta) {
      if (!m.lat || !m.lon) continue;
      const h = H.get(codi) ?? 0, hScore = 1 - Math.exp(-h / H0);
      const tMean = Tn.has(codi) ? Tsum.get(codi) / Tn.get(codi) : null;
      const score = hScore * trapezoid(tMean, ...sp.temp) * trapezoid(m.alt, ...sp.alt) * gate * hostFactor(codi, sp);
      files.push({ codi, ...m, h, tMean, host: HOST?.[codi]?.host ?? null, score });
    }
    files.sort((a, b) => b.score - a.score);

    console.log(`── ${sp.nom}  (bosc: ${sp.host.join("/")} · estació: ${gate}${gate === 0 ? " · FORA DE TEMPORADA" : ""})`);
    for (const f of files.slice(0, all ? 5 : 15))
      console.log(`   ${(f.codi ?? "").padEnd(4)} ${(f.nom ?? "").slice(0,22).padEnd(23)} ` +
        `${String(Math.round(f.alt||0)).padStart(4)}m ${(f.host ?? "—").padEnd(10)} ` +
        `H${f.h.toFixed(1).padStart(5)} ${f.tMean==null?" --":f.tMean.toFixed(0).padStart(3)}°  ${f.score.toFixed(3)}`);

    const geojson = {
      type: "FeatureCollection", species: spKey, speciesNom: sp.nom, generated: refISO.slice(0, 10),
      features: files.map((f) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: { codi:f.codi, nom:f.nom, alt:f.alt, host:f.host, H:+f.h.toFixed(1), tMean:f.tMean, score:+f.score.toFixed(3) },
      })),
    };
    writeFileSync(`bolets.${spKey}.geojson`, JSON.stringify(geojson));
    console.log(`   ✓ → bolets.${spKey}.geojson\n`);
  }
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
