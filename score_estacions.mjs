#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREDICTOR DE BOLETS · Catalunya · scorer per estació (MULTI-ESPÈCIE)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Puntua cada estació de la XEMA segons com de probable és trobar-hi una
 *  espècie de bolet aquella setmana, amb dades obertes de Meteocat.
 *
 *  ── ÚS ──────────────────────────────────────────────────────────────────
 *    node score_estacions.mjs                              → rovelló, avui
 *    node score_estacions.mjs --species=cep --date=2025-10-20
 *    node score_estacions.mjs --all                        → totes les espècies
 *    node score_estacions.mjs --all --date=2025-10-20      → totes, backtest
 *    node score_estacions.mjs --list
 *
 *  Escriu un fitxer per espècie: bolets.<espècie>.geojson  (el mapa el llegeix).
 *
 *  ── MODEL ────────────────────────────────────────────────────────────────
 *    score = humitat × temperatura × altitud × estació × hoste     (0..1)
 *      · humitat    : pluja 30 dies amb sostre diari + lag de fructificació. Compartit.
 *      · temperatura: finestra ideal PER ESPÈCIE.
 *      · altitud    : banda PER ESPÈCIE. Proxy de bosc fins que entri el MCSC.
 *      · estació    : PORTA temporal — fora de temporada, ~0.
 *      · hoste      : arbre micoríxic; encara 1 → ve del MCSC (imprescindible per
 *                     distingir espècies que només difereixen per l'arbre).
 *
 *  ⚠️ Els paràmetres per espècie són priors ecològics raonables, no òptims.
 *
 *  ── DADES ────────────────────────────────────────────────────────────────
 *    Mesures XEMA: nzvn-apee (codi_estacio/codi_variable/data_lectura/valor_lectura)
 *    Estacions   : yqwd-vj5e (nom, lat, lon, altitud) · Variables 35=pluja 32=temp
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync } from "node:fs";

const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES = `${BASE}/nzvn-apee.json`, DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`;
const V_PLUJA = "35", V_TEMP = "32";
const DIES = 30, DIES_TEMP = 5, CAP = 30, H0 = 40, LAG_RISE = 5, LAG_FALL = 12;

// ── Config per espècie ──────────────────────────────────────────────────────
// alt/temp = trapezis [entra, òptim_min, òptim_max, surt]. mesos = temporada.
// host = tags d'arbre (per creuar amb el MCSC en el futur).
const SPECIES = {
  rovello:   { nom: "Rovelló / pinetell",              mesos: [9,10,11],   host:["pi"],
               alt:[0,200,1500,1700],   temp:[2,8,20,26] },
  cep:       { nom: "Cep (grup Boletus edulis)",       mesos: [6,9,10,11], host:["faig","roure","castanyer","alzina","conifera"],
               alt:[400,800,1600,1900], temp:[2,8,18,24] },
  llenega:   { nom: "Llenega (Hygrophorus)",           mesos: [10,11,12],  host:["pi"],
               alt:[100,300,1300,1500], temp:[0,4,14,20] },
  trompeta:  { nom: "Trompeta de la mort (Craterellus)",mesos:[9,10,11],   host:["roure","faig","alzina"],
               alt:[200,400,1300,1500], temp:[2,8,18,24] },
  rossinyol: { nom: "Rossinyol (Cantharellus cibarius)",mesos:[6,7,8,9,10],host:["roure","faig","castanyer","pi"],
               alt:[200,400,1500,1700], temp:[4,10,22,28] },
  camagroc:  { nom: "Camagroc (Cantharellus lutescens)",mesos:[10,11,12,1],host:["pi"],
               alt:[300,500,1500,1700], temp:[-2,2,14,20] },
  murgola:   { nom: "Múrgola (Morchella)",             mesos: [3,4,5],     host:["freixe","ribera","cremat"],
               alt:[100,300,1200,1500], temp:[2,8,18,24] },
};
const hostFactor = (_codi, _sp) => 1.0;  // 1 fins que el MCSC comprovi sp.host

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
function trapezoid(x, a, b, c, d) {           // 0 fora de [a,d], plateau b..c
  if (x == null || Number.isNaN(x)) return 0.5;
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}
const lagWeight = (d) => (1 - Math.exp(-d / LAG_RISE)) * Math.exp(-d / LAG_FALL);
function seasonFactor(month, mesos) {          // porta temporal (mes adjacent = 0.35)
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
    for (const [k, s] of Object.entries(SPECIES)) console.log(`  ${k.padEnd(10)} ${s.nom}  ·  mesos ${s.mesos.join(",")}`);
    return;
  }
  const all = args.includes("--all");
  const spKeys = all ? Object.keys(SPECIES)
                     : [(args.find((a) => a.startsWith("--species="))?.slice(10)) || "rovello"];
  for (const k of spKeys) if (!SPECIES[k]) { console.error(`Espècie desconeguda: ${k}. Prova --list`); process.exit(1); }

  const refArg = args.find((a) => a.startsWith("--date="));
  const ref = refArg ? new Date(refArg.slice(7) + "T23:59:59") : new Date();
  const refISO = ref.toISOString().slice(0, 19), month = ref.getMonth() + 1;
  const desdePluja = new Date(ref - DIES * 864e5).toISOString().slice(0, 19);
  const desdeTemp  = new Date(ref - DIES_TEMP * 864e5).toISOString().slice(0, 19);
  console.log(`Data de referència: ${refISO.slice(0, 10)}\n`);

  // ── Baixem dades UN sol cop (són iguals per a totes les espècies) ─────────
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

  // ── Puntuem cada espècie a partir de les mateixes dades ──────────────────
  for (const spKey of spKeys) {
    const sp = SPECIES[spKey], gate = seasonFactor(month, sp.mesos);
    const files = [];
    for (const [codi, m] of meta) {
      if (!m.lat || !m.lon) continue;
      const h = H.get(codi) ?? 0, hScore = 1 - Math.exp(-h / H0);
      const tMean = Tn.has(codi) ? Tsum.get(codi) / Tn.get(codi) : null;
      const score = hScore * trapezoid(tMean, ...sp.temp) * trapezoid(m.alt, ...sp.alt) * gate * hostFactor(codi, sp);
      files.push({ codi, ...m, h, tMean, score });
    }
    files.sort((a, b) => b.score - a.score);

    // resum a consola
    console.log(`── ${sp.nom}  (estació: ${gate}${gate === 0 ? " · FORA DE TEMPORADA" : ""})`);
    const n = all ? 5 : 20;
    for (const f of files.slice(0, n)) {
      console.log(`   ${(f.codi ?? "").padEnd(4)} ${(f.nom ?? "").slice(0,24).padEnd(25)} ` +
        `${String(Math.round(f.alt||0)).padStart(4)}m  H${f.h.toFixed(1).padStart(5)}  ` +
        `${f.tMean==null?"  --":f.tMean.toFixed(1).padStart(4)}°  ${f.score.toFixed(3)}`);
    }

    const geojson = {
      type: "FeatureCollection", species: spKey, speciesNom: sp.nom, generated: refISO.slice(0, 10),
      features: files.map((f) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: { codi:f.codi, nom:f.nom, alt:f.alt, H:+f.h.toFixed(1), tMean:f.tMean, score:+f.score.toFixed(3) },
      })),
    };
    writeFileSync(`bolets.${spKey}.geojson`, JSON.stringify(geojson));
    console.log(`   ✓ → bolets.${spKey}.geojson\n`);
  }
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
