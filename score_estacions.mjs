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
 *    score = humitat × temperatura × tendència tèrmica × altitud × HOSTE × SUBSTRAT
 *      · humitat    : combina l'impuls de fructificació (pic ~8 dies després
 *                     de la pluja) amb la reserva hídrica dels últims 30 dies.
 *      · temperatura: finestra ideal per espècie i ajust petit segons la
 *                     tendència recent (refredament o escalfament).
 *      · altitud    : banda per espècie.
 *      · hoste      : tipus de bosc dominant a l'entorn de l'estació (del MCSC,
 *                     precalculat a estacions_host.json amb buildHost.mjs) comparat
 *                     amb l'arbre que vol cada espècie. AQUÍ ceps i rovellons es
 *                     diferencien de debò: cada un apunta al seu bosc.
 *      · substrat   : proxy geològic conservador (silícic, calcari o mixt) de
 *                     la graella estàtica. Només pesa en espècies amb una
 *                     preferència edàfica ben documentada.
 *
 *  Si falta estacions_host.json, el factor hoste = 1 (i s'avisa). Corre buildHost.mjs.
 *
 *  ── DADES ────────────────────────────────────────────────────────────────
 *    Meteo XEMA: nzvn-apee (35=pluja 32=temp) · Estacions: yqwd-vj5e
 *    Hoste     : estacions_host.json  ←  MCSC via WMS ICGC (buildHost.mjs)
 *    Substrat  : graella.bin          ←  geologia 1:250.000 ICGC (buildGrid.mjs)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeRgbaPng } from "./raster.mjs";
import { SUBSTRATE_BY_CODE } from "./substrate.mjs";
import { capConditionScore } from "./prediction-confidence.mjs";
import { DISCOVERY_MIN_SCORE, selectDiscoveryPoints, summarizeDiscoverySpecies, zoneMaxima } from "./discovery-map.mjs";
import { SPECIES, trapezoid } from "./src/species-model.mjs";
import { temperatureTrendFactor } from "./src/temperature-trend.mjs";

const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES = `${BASE}/nzvn-apee.json`, DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`;
const V_PLUJA = "35", V_TEMP = "32";
const DIES = 30, DIES_TEMP = 14, DIES_TEMP_RECENT = 5, CAP = 30;
// L'impuls de fructificació puja lentament després de ploure i té el màxim
// aproximadament al cap de 8 dies. La reserva sí que compta la pluja d'avui.
const LAG_RISE = 6, LAG_FALL = 16, RESERVE_FALL = 14;
// Llindars provisionals de condicions ideals. En arribar-hi el factor val 1
// exactament; s'han d'afinar amb observacions/backtests, no amb el màxim del dia.
const TRIGGER_IDEAL = 60, RESERVE_IDEAL = 100;
const HOST_CODE = { conifer:1, deciduous:2, sclerophyll:3, ribera:4 };
const COLOR_STOPS = [[0,[89,102,94]],[.1,[116,125,69]],[.25,[161,164,71]],[.4,[201,147,47]],[.6,[226,121,42]],[.8,[200,69,27]],[1,[169,46,20]]];

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

function substrateFactor(code, sp) {
  if (!sp.substrate?.length || !code) return 1;
  const substrate = SUBSTRATE_BY_CODE[code];
  if (substrate === "mixed") return 0.85;
  return sp.substrate.includes(substrate) ? 1 : 0.55;
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
const lagWeight = (d) => (1 - Math.exp(-d / LAG_RISE)) * Math.exp(-d / LAG_FALL);
const reserveWeight = (d) => Math.exp(-d / RESERVE_FALL);
function smoothRamp(x, ideal) {
  const t = Math.max(0, Math.min(1, x / ideal));
  return t * t * (3 - 2 * t); // transició suau; arriba exactament a 1
}
function humidityFactor(trigger, reserve) {
  // L'impuls decideix sobretot si toca fructificar; la reserva recent ajuda a
  // mantenir el sòl i els carpòfors humits, però una pluja d'avui no basta sola.
  return 0.8 * smoothRamp(trigger, TRIGGER_IDEAL) +
         0.2 * smoothRamp(reserve, RESERVE_IDEAL);
}
function readGrid(path = "graella.bin") {
  if (!existsSync(path)) return null;
  const b = readFileSync(path);
  const magic = b.toString("ascii", 0, 4);
  if (magic !== "BGR1" && magic !== "BGR2" && magic !== "BGR3") throw new Error("graella.bin té un format desconegut");
  const width=b.readUInt16LE(4), height=b.readUInt16LE(6), x0=b.readInt32LE(8), y0=b.readInt32LE(12), y1=b.readInt32LE(16), cell=b.readUInt16LE(20);
  const stride = magic === "BGR3" ? 5 : magic === "BGR2" ? 4 : 3;
  if (b.length !== 24 + width * height * stride) throw new Error("graella.bin és incomplet");
  return {
    b, width, height, x0, y0, y1, x1:x0+width*cell, cell, stride,
    substrateVersion:magic === "BGR1" ? 0 : 1,
    forestStructureVersion:magic === "BGR3" ? 1 : 0,
  };
}

function terrainCell(grid, index) {
  const offset=24+index*grid.stride;
  return {
    host:grid.b[offset],
    alt:grid.b.readInt16LE(offset+1),
    substrate:grid.substrateVersion ? grid.b[offset+3] : 0,
    forestStructure:grid.forestStructureVersion ? grid.b[offset+4] : 0,
  };
}

function terrainAt(grid, lon, lat) {
  const [x,y]=wgs84ToUtm31(lon,lat), col=Math.floor((x-grid.x0)/grid.cell), row=Math.floor((grid.y1-y)/grid.cell);
  if(col<0||row<0||col>=grid.width||row>=grid.height)return null;
  return terrainCell(grid,row*grid.width+col);
}

// Conversió de les cantonades que delimiten l'extensió. El client reprojecta
// després cada píxel a Web Mercator; no estira directament aquest quadrilàter.
function utm31ToLngLat(easting, northing) {
  const a=6378137, ecc=0.00669438, k0=.9996, e1=(1-Math.sqrt(1-ecc))/(1+Math.sqrt(1-ecc));
  const x=easting-500000, m=northing/k0, mu=m/(a*(1-ecc/4-3*ecc**2/64-5*ecc**3/256));
  const j1=3*e1/2-27*e1**3/32, j2=21*e1**2/16-55*e1**4/32, j3=151*e1**3/96, j4=1097*e1**4/512;
  const fp=mu+j1*Math.sin(2*mu)+j2*Math.sin(4*mu)+j3*Math.sin(6*mu)+j4*Math.sin(8*mu);
  const ePrime=ecc/(1-ecc), c1=ePrime*Math.cos(fp)**2, t1=Math.tan(fp)**2;
  const n1=a/Math.sqrt(1-ecc*Math.sin(fp)**2), r1=a*(1-ecc)/(1-ecc*Math.sin(fp)**2)**1.5, d=x/(n1*k0);
  const lat=fp-(n1*Math.tan(fp)/r1)*(d*d/2-(5+3*t1+10*c1-4*c1*c1-9*ePrime)*d**4/24+(61+90*t1+298*c1+45*t1*t1-252*ePrime-3*c1*c1)*d**6/720);
  const lon=(3*Math.PI/180)+(d-(1+2*t1+c1)*d**3/6+(5-2*c1+28*t1-3*c1*c1+8*ePrime+24*t1*t1)*d**5/120)/Math.cos(fp);
  return [lon*180/Math.PI, lat*180/Math.PI];
}

function wgs84ToUtm31(lon, lat) {
  const a=6378137, ecc=.00669438, k0=.9996, rad=Math.PI/180, p=lat*rad, l=lon*rad, l0=3*rad;
  const ep=ecc/(1-ecc), n=a/Math.sqrt(1-ecc*Math.sin(p)**2), t=Math.tan(p)**2, c=ep*Math.cos(p)**2, A=Math.cos(p)*(l-l0);
  const m=a*((1-ecc/4-3*ecc**2/64-5*ecc**3/256)*p-(3*ecc/8+3*ecc**2/32+45*ecc**3/1024)*Math.sin(2*p)+(15*ecc**2/256+45*ecc**3/1024)*Math.sin(4*p)-(35*ecc**3/3072)*Math.sin(6*p));
  return [500000+k0*n*(A+(1-t+c)*A**3/6+(5-18*t+t*t+72*c-58*ep)*A**5/120),
          k0*(m+n*Math.tan(p)*(A*A/2+(5-t+9*c+4*c*c)*A**4/24+(61-58*t+t*t+600*c-330*ep)*A**6/720))];
}

function scoreColor(score) {
  const s=Math.max(0,Math.min(1,score)); let a=COLOR_STOPS[0], b=COLOR_STOPS.at(-1);
  for (let i=1;i<COLOR_STOPS.length;i++) if (s<=COLOR_STOPS[i][0]) { a=COLOR_STOPS[i-1]; b=COLOR_STOPS[i]; break; }
  const t=(s-a[0])/(b[0]-a[0]||1);
  return [0,1,2].map(i=>Math.round(a[1][i]+(b[1][i]-a[1][i])*t));
}

function interpolateGrid(grid, signals) {
  const n=grid.width*grid.height, outH=new Float32Array(n), outR=new Float32Array(n), outT=new Float32Array(n), outTrend=new Float32Array(n);
  const tempSignals=signals.filter(s=>s.t!=null);
  const meanAlt=tempSignals.reduce((a,s)=>a+s.alt,0)/tempSignals.length, meanT=tempSignals.reduce((a,s)=>a+s.t,0)/tempSignals.length;
  let cov=0, variance=0;
  for (const s of tempSignals) { cov+=(s.alt-meanAlt)*(s.t-meanT); variance+=(s.alt-meanAlt)**2; }
  const lapse=Math.max(-.012,Math.min(-.002,cov/(variance||1))), intercept=meanT-lapse*meanAlt;
  for (const s of tempSignals) s.residual=s.t-(intercept+lapse*s.alt);
  const K=6, bestD=new Float64Array(K), bestI=new Int16Array(K);
  let processed=0;
  for (let row=0;row<grid.height;row++) for (let col=0;col<grid.width;col++) {
    const i=row*grid.width+col, {host,alt}=terrainCell(grid,i);
    if (!host || alt===-32768) continue;
    bestD.fill(Infinity); bestI.fill(-1);
    const x=grid.x0+(col+.5)*grid.cell, y=grid.y1-(row+.5)*grid.cell;
    for (let j=0;j<tempSignals.length;j++) {
      const s=tempSignals[j], d=(x-s.x)**2+(y-s.y)**2;
      if (d>=bestD[K-1]) continue;
      let p=K-1; while(p>0&&d<bestD[p-1]) { bestD[p]=bestD[p-1]; bestI[p]=bestI[p-1]; p--; }
      bestD[p]=d; bestI[p]=j;
    }
    let wh=0,h=0,r=0,res=0,wt=0,trend=0;
    for(let k=0;k<K&&bestI[k]>=0;k++) {
      const s=tempSignals[bestI[k]], w=1/Math.max(bestD[k],4e6); wh+=w; h+=w*s.h; r+=w*s.reserve; res+=w*s.residual;
      if (s.tTrend != null) { wt+=w; trend+=w*s.tTrend; }
    }
    outH[i]=h/wh; outR[i]=r/wh; outT[i]=intercept+lapse*alt+res/wh; outTrend[i]=wt ? trend/wt : 0; processed++;
  }
  console.log(`Interpolació: ${processed.toLocaleString("ca")} cel·les · gradient tèrmic ${(lapse*1000).toFixed(1)} °C/km`);
  return { outH, outR, outT, outTrend };
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
  const OUT = args.find((a) => a.startsWith("--out="))?.slice(6) || ".";  // on escriure els geojson
  mkdirSync(OUT, { recursive:true });
  const all = args.includes("--all");
  const spKeys = all ? Object.keys(SPECIES) : [(args.find((a) => a.startsWith("--species="))?.slice(10)) || "rovello"];
  for (const k of spKeys) if (!SPECIES[k]) { console.error(`Espècie desconeguda: ${k}. Prova --list`); process.exit(1); }

  const refArg = args.find((a) => a.startsWith("--date="));
  const ref = refArg ? new Date(refArg.slice(7) + "T23:59:59") : new Date();
  const refISO = ref.toISOString().slice(0, 19);
  const refDay = Date.parse(`${refISO.slice(0, 10)}T00:00:00Z`) / 864e5;
  const daysAgo = (value) => refDay - Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`) / 864e5;
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
  const H = new Map(), R = new Map(), recentRain = new Map();
  for (const r of pluja) {
    const d = daysAgo(r.dia);
    if (d < 0 || d >= DIES) continue;
    const mm = parseFloat(r.v);
    if (Number.isNaN(mm)) continue;
    const useful = Math.min(mm, CAP);
    H.set(r.codi_estacio, (H.get(r.codi_estacio) ?? 0) + useful * lagWeight(d));
    R.set(r.codi_estacio, (R.get(r.codi_estacio) ?? 0) + useful * reserveWeight(d));
    if (d <= 2) recentRain.set(r.codi_estacio, (recentRain.get(r.codi_estacio) ?? 0) + mm);
  }
  const Tsum = new Map(), Tn = new Map(), TpreviousSum = new Map(), TpreviousN = new Map();
  for (const r of temp) {
    const t = parseFloat(r.v); if (Number.isNaN(t)) continue;
    const age = daysAgo(r.dia);
    if (age < 0 || age >= DIES_TEMP) continue;
    const sums = age < DIES_TEMP_RECENT ? Tsum : TpreviousSum;
    const counts = age < DIES_TEMP_RECENT ? Tn : TpreviousN;
    sums.set(r.codi_estacio, (sums.get(r.codi_estacio) ?? 0) + t);
    counts.set(r.codi_estacio, (counts.get(r.codi_estacio) ?? 0) + 1);
  }
  const temperatureTrend = (codi) => Tn.has(codi) && TpreviousN.has(codi)
    ? Tsum.get(codi) / Tn.get(codi) - TpreviousSum.get(codi) / TpreviousN.get(codi)
    : null;

  const gridPath = args.find((a) => a.startsWith("--grid="))?.slice(7) || "graella.bin";
  const grid = readGrid(gridPath);
  let gridWeather = null;
  if (grid) {
    const signals=[];
    for (const [codi,m] of meta) {
      if (!m.lat||!m.lon||!Tn.has(codi)) continue;
      const [x,y]=wgs84ToUtm31(m.lon,m.lat);
      signals.push({x,y,alt:m.alt||0,t:Tsum.get(codi)/Tn.get(codi),tTrend:temperatureTrend(codi),h:H.get(codi)??0,reserve:R.get(codi)??0});
    }
    gridWeather=interpolateGrid(grid,signals);
    writeFileSync(join(OUT,"bolets.grid.json"),JSON.stringify({
      width:grid.width,height:grid.height,cell:grid.cell,x0:grid.x0,y0:grid.y0,y1:grid.y1,
      substrateVersion:grid.substrateVersion,forestStructureVersion:grid.forestStructureVersion,weatherVersion:2,
      coordinates:[utm31ToLngLat(grid.x0,grid.y1),utm31ToLngLat(grid.x1,grid.y1),utm31ToLngLat(grid.x1,grid.y0),utm31ToLngLat(grid.x0,grid.y0)],
    }));

    // Metadades compactes compartides per totes les espècies. Permeten que un clic
    // sobre qualsevol cel·la mostri el mateix detall que una estació sense enviar
    // 1,2 milions de geometries al navegador.
    const terrain=new Uint8Array(grid.width*grid.height*4), weather=new Uint8Array(grid.width*grid.height*4);
    const forest=new Uint8Array(grid.width*grid.height*4);
    for(let i=0;i<grid.width*grid.height;i++) {
      const {host,alt,substrate,forestStructure}=terrainCell(grid,i); if(!host||alt===-32768) continue;
      const p=i*4, encodedAlt=alt+32768;
      terrain[p]=host; terrain[p+1]=encodedAlt>>8; terrain[p+2]=encodedAlt&255; terrain[p+3]=252+substrate;
      forest[p]=forestStructure; forest[p+3]=255;
      weather[p]=Math.max(0,Math.min(255,Math.round((gridWeather.outT[i]+20)*4)));
      weather[p+1]=Math.round(humidityFactor(gridWeather.outH[i],gridWeather.outR[i])*255);
      weather[p+2]=Math.max(0,Math.min(255,Math.round((gridWeather.outTrend[i]+16)*8)));
      weather[p+3]=255;
    }
    writeFileSync(join(OUT,"bolets.terrain.png"),encodeRgbaPng(grid.width,grid.height,terrain));
    writeFileSync(join(OUT,"bolets.forest.png"),encodeRgbaPng(grid.width,grid.height,forest));
    writeFileSync(join(OUT,"bolets.weather.png"),encodeRgbaPng(grid.width,grid.height,weather));
  } else console.log("ℹ️  Sense graella.bin: es generen només els punts per estació. Corre node buildGrid.mjs\n");

  // ── Puntuem cada espècie ─────────────────────────────────────────────────
  // La descoberta necessita l'espècie dominant de cada cel·la. La calculem
  // mentre puntuem, sense cap passada extra sobre la graella.
  const cells = grid ? grid.width * grid.height : 0;
  const best = grid && gridWeather
    ? { score:new Float32Array(cells), species:new Array(cells).fill(null) }
    : null;

  for (const spKey of spKeys) {
    const sp = SPECIES[spKey];
    const files = [];
    for (const [codi, m] of meta) {
      if (!m.lat || !m.lon) continue;
      const h = H.get(codi) ?? 0, reserve = R.get(codi) ?? 0;
      const hScore = humidityFactor(h, reserve);
      const tMean = Tn.has(codi) ? Tsum.get(codi) / Tn.get(codi) : null;
      const tTrend = temperatureTrend(codi), fTrend = temperatureTrendFactor(tTrend, sp.trend);
      const substrateCode=grid ? (terrainAt(grid,m.lon,m.lat)?.substrate ?? 0) : 0;
      const substrate=SUBSTRATE_BY_CODE[substrateCode], fSoil=substrateFactor(substrateCode,sp);
      const fT = trapezoid(tMean, ...sp.temp), fAlt = trapezoid(m.alt, ...sp.alt), fHost = hostFactor(codi, sp);
      const host=HOST?.[codi]?.host ?? null, forestFrac=HOST?.[codi]?.forestFrac;
      const score = capConditionScore(hScore * fT * fTrend * fAlt * fHost * fSoil, { host, substrate, forestFrac });
      files.push({ codi, ...m, h, reserve, recentRain: recentRain.get(codi) ?? 0,
                   tMean, tTrend, host, substrate, forestFrac, score,
                   fH: hScore, fT, fTrend, fAlt, fHost, fSoil });
    }
    files.sort((a, b) => b.score - a.score);

    console.log(`── ${sp.nom}  (bosc: ${sp.host.join("/")} · tendència: ${sp.trend})`);
    for (const f of files.slice(0, all ? 5 : 15))
      console.log(`   ${(f.codi ?? "").padEnd(4)} ${(f.nom ?? "").slice(0,22).padEnd(23)} ` +
        `${String(Math.round(f.alt||0)).padStart(4)}m ${(f.host ?? "—").padEnd(10)} ` +
        `H${f.h.toFixed(1).padStart(5)} ${f.tMean==null?" --":f.tMean.toFixed(0).padStart(3)}°  ${f.score.toFixed(3)}`);

    const geojson = {
      type: "FeatureCollection", species: spKey, speciesNom: sp.nom, generated: refISO.slice(0, 10),
      model: { scoreVersion:4, host:sp.host, substrate:sp.substrate ?? [], alt:sp.alt, temp:sp.temp, trend:sp.trend, typicalMonths:sp.mesos },
      features: files.map((f) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: { codi:f.codi, nom:f.nom, alt:f.alt, host:f.host, substrate:f.substrate, forestFrac:f.forestFrac,
                      H:+f.h.toFixed(1), reserve:+f.reserve.toFixed(1), recentRain:+f.recentRain.toFixed(1),
                      tMean:f.tMean, tTrend:f.tTrend, score:+f.score.toFixed(3),
                      fH:+f.fH.toFixed(2), fT:+f.fT.toFixed(2), fTrend:+f.fTrend.toFixed(2), fAlt:+f.fAlt.toFixed(2), fHost:+f.fHost.toFixed(2), fSoil:+f.fSoil.toFixed(2) },
      })),
    };
    writeFileSync(join(OUT, `bolets.${spKey}.geojson`), JSON.stringify(geojson));
    if (grid && gridWeather) {
      const rgba=new Uint8Array(grid.width*grid.height*4), wanted=new Set(sp.host.map(h=>HOST_CODE[h]));
      for(let i=0;i<grid.width*grid.height;i++) {
        const {host,alt,substrate,forestStructure}=terrainCell(grid,i); if(!host||alt===-32768) continue;
        const fH=humidityFactor(gridWeather.outH[i],gridWeather.outR[i]), fT=trapezoid(gridWeather.outT[i],...sp.temp), fTrend=temperatureTrendFactor(gridWeather.outTrend[i],sp.trend), fAlt=trapezoid(alt,...sp.alt);
        const fHost=wanted.has(host)?1:.25, fSoil=substrateFactor(substrate,sp);
        const score=capConditionScore(fH*fT*fTrend*fAlt*fHost*fSoil,{ host,substrate,forestStructure });
        const [red,green,blue]=scoreColor(score), p=i*4;
        rgba[p]=red; rgba[p+1]=green; rgba[p+2]=blue; rgba[p+3]=score<.01?35:Math.round(105+Math.min(1,score)*125);
        if (best && score>best.score[i]) { best.score[i]=score; best.species[i]=spKey; }
      }
      writeFileSync(join(OUT,`bolets.${spKey}.png`),encodeRgbaPng(grid.width,grid.height,rgba));
    }
    console.log(`   ✓ → ${join(OUT, `bolets.${spKey}.geojson`)}${grid ? ` + bolets.${spKey}.png` : ""}\n`);
  }

  // ── Descoberta multiespècie ──────────────────────────────────────────────
  // Només té sentit amb totes les espècies puntuades: amb un subconjunt,
  // l'espècie dominant de cada zona seria falsa.
  if (best && all) {
    const points = selectDiscoveryPoints(zoneMaxima(best, grid));
    writeFileSync(join(OUT, "bolets.discovery.json"), JSON.stringify({
      generated: refISO.slice(0, 10),
      minScore: DISCOVERY_MIN_SCORE,
      points: points.map((point) => {
        const [lng, lat] = utm31ToLngLat(point.x, point.y);
        return { species:point.species, lng:+lng.toFixed(5), lat:+lat.toFixed(5), score:+point.score.toFixed(3) };
      }),
      species: summarizeDiscoverySpecies(points).map((row) => ({ ...row, visibleScore:+row.visibleScore.toFixed(3) })),
    }));
    console.log(`── Descoberta: ${points.length} zones → ${join(OUT, "bolets.discovery.json")}\n`);
  } else if (best) {
    console.log("ℹ️  Descoberta omesa: cal --all per saber l'espècie dominant de cada zona.\n");
  }
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
