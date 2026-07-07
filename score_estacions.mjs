#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREDICTOR DE BOLETS · Catalunya · scorer per estació
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Puntua cada estació meteorològica de la XEMA segons com de probable és que
 *  hi hagi bolets aquella setmana, a partir de dades obertes de Meteocat.
 *  Sortida: un rànquing a consola + un fitxer bolets.geojson per al mapa.
 *
 *  ── ÚS ──────────────────────────────────────────────────────────────────
 *    node score_estacions.mjs                    → condicions d'avui
 *    node score_estacions.mjs --date=2025-10-20  → backtest "com si fos" aquell dia
 *                                                   (clau per validar el model)
 *
 *  ── MODEL (resum; el raonament complet és al README) ─────────────────────
 *    score = humitat × temperatura × altitud × hoste     (cada factor 0..1)
 *
 *    · humitat    : pluja acumulada dels últims 30 dies, amb DOS matisos:
 *                   (a) sostre diari (CAP): per sobre de ~30 mm/dia és
 *                       escorrentia (riuada), no humitat de sòl → no compta més.
 *                   (b) lag de fructificació: la pluja de fa 6-14 dies pesa més
 *                       que la d'ahir, perquè el bolet triga ~1-2 setmanes a sortir.
 *    · temperatura: finestra ideal 10-20 °C; 0 amb glaçada o massa calor.
 *    · altitud    : PROXY provisional de "hi ha bosc?" mentre no tinguem el MCSC.
 *    · hoste      : arbre micoríxic (pineda…). Encara 1 per a tothom; ve del MCSC.
 *
 *  ── DADES (Socrata / portal de Dades Obertes de la Generalitat) ──────────
 *    Mesures XEMA  : dataset nzvn-apee  (semihorària, UTC)
 *    Estacions     : dataset yqwd-vj5e  (nom, latitud, longitud, altitud)
 *    Columnes reals: codi_estacio / codi_variable / data_lectura / valor_lectura
 *    Codis variable: 35=PPT (pluja)  32=T (temperatura)  [40=Tx 42=Tn 30=VV10 …]
 *
 *  Sense estat, sense base de dades, sense interpolació: tot es recalcula a
 *  cada execució a partir de la finestra de dies que demanem a l'API.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync } from "node:fs";

// ── Fonts de dades ─────────────────────────────────────────────────────────
const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES   = `${BASE}/nzvn-apee.json`;  // mesures semihoràries de la XEMA
const DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`;  // metadades d'estacions (lat/lon/alt)

// ── Codis de variable (del dataset de variables 4fb2-n3yi) ─────────────────
const V_PLUJA = "35";  // PPT · precipitació
const V_TEMP  = "32";  // T   · temperatura

// ── Paràmetres del model (aquí és on calibraràs quan validis) ──────────────
const DIES      = 30;  // finestra d'acumulació de pluja (dies enrere)
const DIES_TEMP = 5;   // finestra per a la temperatura recent (dies enrere)
const CAP       = 30;  // mm/dia màxims que compten com a humitat (la resta = escorrentia)
const H0        = 40;  // "mm efectius" on la humitat satura (corba 1 - e^(-H/H0))
const LAG_RISE  = 5;   // rapidesa amb què la pluja recent "es fa útil" (dies)
const LAG_FALL  = 12;  // rapidesa amb què la humitat es va assecant (dies)

// ── Hoste (arbre micoríxic) ────────────────────────────────────────────────
// Factor per codi d'estació: 1 = pineda / bosc bo, <1 = hàbitat pitjor.
// De moment buit (tot 1). S'omplirà creuant cada estació amb el MCSC (CREAF):
// mirar en quin tipus de bosc cau la coordenada de l'estació.
const HOST = {
  // "DP": 1.0,   // p. ex. Das → pineda
  // "XS": 0.4,   // p. ex. estació en zona agrícola
};
const hostFactor = (codi) => HOST[codi] ?? 1.0;

// ── Client SODA (l'API oberta de Socrata) ─────────────────────────────────
// Passem paràmetres SoQL ($select, $where, $group…) i rebem JSON.
async function soda(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

// Detecta el nom real d'una columna provant candidats i, si cal, per substring.
// Així el codi no es trenca si Socrata reanomena un camp.
const findKey = (row, ...c) => {
  for (const k of c) if (k in row) return k;
  for (const k of Object.keys(row))
    for (const x of c) if (k.replace(/_/g, "").toLowerCase().includes(x.replace(/_/g, ""))) return k;
  return null;
};

// ── FACTOR: pes per lag de fructificació ───────────────────────────────────
// Quant compta la pluja caiguda fa `d` dies. No és un simple decaïment:
//   · la d'avui / ahir compta poc (el bolet encara no ha sortit),
//   · el pic és cap als 6-9 dies,
//   · després es va esvaint a mesura que el sòl s'asseca (~3 setmanes).
// És la diferència de dues exponencials: puja (1-e^-d/rise) i baixa (e^-d/fall).
function lagWeight(d) {
  return (1 - Math.exp(-d / LAG_RISE)) * Math.exp(-d / LAG_FALL);
}

// ── FACTOR: altitud (PROXY de presència de bosc, provisional) ──────────────
// Banda òptima de pins/bolets a Catalunya ~400-1600 m. Per sobre de ~2000 m
// ja no hi ha bosc (roca/gespa alpina) → 0. És un tapaforats fins que el MCSC
// ens digui l'espècie real; un punt a 1200 m pot ser alzinar o pastura, no pineda.
function altFactor(a) {
  if (a == null || Number.isNaN(a)) return 0.5;      // altitud desconeguda → neutre
  if (a > 2000) return 0;                            // per sobre del límit del bosc
  if (a >= 1600) return (2000 - a) / 400;            // 1600 m→1 … 2000 m→0
  if (a >= 400)  return 1;                           // banda forestal òptima
  if (a >= 100)  return 0.3 + 0.7 * (a - 100) / 300; // 100 m→0.3 … 400 m→1
  return 0.3;                                        // costa baixa
}

// ── FACTOR: temperatura recent ─────────────────────────────────────────────
// Finestra ideal 10-20 °C. Glaçada (<2 °C) o massa calor (>28 °C) → 0.
function tempFactor(t) {
  if (t == null || Number.isNaN(t)) return 0.5;      // desconeguda → neutre-baix
  if (t < 2 || t > 28) return 0;                     // glaçada o massa calor
  if (t < 10) return (t - 2) / 8;                    // 2 °C→0 … 10 °C→1
  if (t <= 20) return 1;                             // finestra ideal (plateau)
  return (28 - t) / 8;                               // 20 °C→1 … 28 °C→0
}

// ── Agregació diària feta pel servidor ─────────────────────────────────────
// En lloc de baixar totes les mesures semihoràries (moltíssimes files), demanem
// a Socrata que agrupi per estació i dia i ens torni la suma/mitjana. Molt més lleuger.
// NOTA: si la teva instància es queixa del tipus de valor_lectura en fer sum()/avg(),
// caldria passar l'agregació a client-side (baixar cru i sumar en JS).
async function diari(variable, desdeISO, finsISO, agg) {
  return soda(DS_MESURES, {
    $select: `codi_estacio, date_trunc_ymd(data_lectura) AS dia, ${agg}(valor_lectura) AS v`,
    $where:  `codi_variable='${variable}' AND data_lectura >= '${desdeISO}' AND data_lectura <= '${finsISO}'`,
    $group:  "codi_estacio, dia",
    $limit:  100000,
  });
}

async function main() {
  // ── Data de referència (avui, o la del --date per fer backtest) ──────────
  const refArg = process.argv.find((a) => a.startsWith("--date="));
  const ref = refArg ? new Date(refArg.slice(7) + "T23:59:59") : new Date();
  const refISO = ref.toISOString().slice(0, 19);
  const desdePluja = new Date(ref - DIES * 864e5).toISOString().slice(0, 19);      // 864e5 = ms/dia
  const desdeTemp  = new Date(ref - DIES_TEMP * 864e5).toISOString().slice(0, 19);
  console.log(`Data de referència: ${refISO.slice(0, 10)}\n`);

  // ── Metadades d'estacions: codi → { nom, lat, lon, alt } ─────────────────
  const est = await soda(DS_ESTACIONS, { $limit: 1000 });
  const eCodi = findKey(est[0], "codi_estacio", "codi");
  const eNom  = findKey(est[0], "nom_estacio", "nom");
  const eLat  = findKey(est[0], "latitud", "lat");
  const eLon  = findKey(est[0], "longitud", "lon");
  const eAlt  = findKey(est[0], "altitud", "alt");
  const meta = new Map(est.map((e) => [e[eCodi], {
    nom: e[eNom], lat: +e[eLat], lon: +e[eLon], alt: +e[eAlt],
  }]));

  // ── Baixem pluja diària (30 dies) i temperatura mitjana diària (5 dies) ───
  const pluja = await diari(V_PLUJA, desdePluja, refISO, "sum");
  const temp  = await diari(V_TEMP,  desdeTemp,  refISO, "avg");

  // ── HUMITAT per estació: Σ  min(mm_del_dia, CAP) · lagWeight(dies_enrere) ──
  const H = new Map();
  for (const r of pluja) {
    const d = Math.round((ref - new Date(r.dia)) / 864e5);  // fa quants dies va ploure
    if (d < 0 || d >= DIES) continue;
    const mm = parseFloat(r.v);
    if (Number.isNaN(mm)) continue;
    const util = Math.min(mm, CAP) * lagWeight(d);          // sostre + lag
    H.set(r.codi_estacio, (H.get(r.codi_estacio) ?? 0) + util);
  }

  // ── TEMPERATURA recent per estació (mitjana de les mitjanes diàries) ──────
  const Tsum = new Map(), Tn = new Map();
  for (const r of temp) {
    const t = parseFloat(r.v);
    if (Number.isNaN(t)) continue;
    Tsum.set(r.codi_estacio, (Tsum.get(r.codi_estacio) ?? 0) + t);
    Tn.set(r.codi_estacio, (Tn.get(r.codi_estacio) ?? 0) + 1);
  }

  // ── SCORE = humitat × temperatura × altitud × hoste ──────────────────────
  const files = [];
  for (const [codi, m] of meta) {
    if (!m.lat || !m.lon) continue;                          // estació sense coordenades
    const h = H.get(codi) ?? 0;
    const hScore = 1 - Math.exp(-h / H0);                    // satura: més pluja ja no puja
    const tMean = Tn.has(codi) ? Tsum.get(codi) / Tn.get(codi) : null;
    const score = hScore * tempFactor(tMean) * altFactor(m.alt) * hostFactor(codi);
    files.push({ codi, ...m, h, tMean, score });
  }
  files.sort((a, b) => b.score - a.score);

  // ── Rànquing a consola (top 20) ──────────────────────────────────────────
  console.log("codi  estació                 alt   H     Tmit  score");
  console.log("────────────────────────────────────────────────────────");
  for (const f of files.slice(0, 20)) {
    console.log(
      `${(f.codi ?? "").padEnd(5)} ${(f.nom ?? "").slice(0, 22).padEnd(23)} ` +
      `${String(Math.round(f.alt || 0)).padStart(4)}  ${f.h.toFixed(1).padStart(5)}  ` +
      `${f.tMean == null ? "  -- " : f.tMean.toFixed(1).padStart(4)}  ${f.score.toFixed(3)}`
    );
  }

  // ── GeoJSON per al mapa (MapLibre el llegirà tal qual) ────────────────────
  const geojson = {
    type: "FeatureCollection",
    features: files.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },  // GeoJSON = [lon, lat]!
      properties: {
        codi: f.codi, nom: f.nom, alt: f.alt,
        H: +f.h.toFixed(1), tMean: f.tMean, score: +f.score.toFixed(3),
      },
    })),
  };
  writeFileSync("bolets.geojson", JSON.stringify(geojson));
  console.log(`\n✓ ${files.length} estacions puntuades → bolets.geojson`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
