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
 *      · humitat    : combina l'impuls de fructificació (pic ~8 dies després
 *                     de la pluja) amb la reserva hídrica dels últims 30 dies.
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

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeRgbaPng } from "./raster.mjs";

const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES = `${BASE}/nzvn-apee.json`, DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`;
const V_PLUJA = "35", V_TEMP = "32";
const DIES = 30, DIES_TEMP = 5, CAP = 30;
// L'impuls de fructificació puja lentament després de ploure i té el màxim
// aproximadament al cap de 8 dies. La reserva sí que compta la pluja d'avui.
const LAG_RISE = 6, LAG_FALL = 16, RESERVE_FALL = 14;
// Llindars provisionals de condicions ideals. En arribar-hi el factor val 1
// exactament; s'han d'afinar amb observacions/backtests, no amb el màxim del dia.
const TRIGGER_IDEAL = 60, RESERVE_IDEAL = 100;
const HOST_CODE = { conifer:1, deciduous:2, sclerophyll:3, ribera:4 };
const COLOR_STOPS = [[0,[89,102,94]],[.1,[116,125,69]],[.25,[161,164,71]],[.4,[201,147,47]],[.6,[226,121,42]],[.8,[200,69,27]],[1,[169,46,20]]];

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
function seasonFactor(month, mesos) {
  if (mesos.includes(month)) return 1;
  const dist = Math.min(...mesos.map((m) => { const d = Math.abs(m - month); return Math.min(d, 12 - d); }));
  return dist === 1 ? 0.35 : 0;
}

function readGrid(path = "graella.bin") {
  if (!existsSync(path)) return null;
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "BGR1") throw new Error("graella.bin té un format desconegut");
  const width=b.readUInt16LE(4), height=b.readUInt16LE(6), x0=b.readInt32LE(8), y0=b.readInt32LE(12), y1=b.readInt32LE(16), cell=b.readUInt16LE(20);
  if (b.length !== 24 + width * height * 3) throw new Error("graella.bin és incomplet");
  return { b, width, height, x0, y0, y1, x1:x0+width*cell, cell };
}

// Conversió suficient per georeferenciar les quatre cantonades del ràster a MapLibre.
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
  const n=grid.width*grid.height, outH=new Float32Array(n), outR=new Float32Array(n), outT=new Float32Array(n);
  const tempSignals=signals.filter(s=>s.t!=null);
  const meanAlt=tempSignals.reduce((a,s)=>a+s.alt,0)/tempSignals.length, meanT=tempSignals.reduce((a,s)=>a+s.t,0)/tempSignals.length;
  let cov=0, variance=0;
  for (const s of tempSignals) { cov+=(s.alt-meanAlt)*(s.t-meanT); variance+=(s.alt-meanAlt)**2; }
  const lapse=Math.max(-.012,Math.min(-.002,cov/(variance||1))), intercept=meanT-lapse*meanAlt;
  for (const s of tempSignals) s.residual=s.t-(intercept+lapse*s.alt);
  const K=6, bestD=new Float64Array(K), bestI=new Int16Array(K);
  let processed=0;
  for (let row=0;row<grid.height;row++) for (let col=0;col<grid.width;col++) {
    const i=row*grid.width+col, host=grid.b[i*3+24], alt=grid.b.readInt16LE(i*3+25);
    if (!host || alt===-32768) continue;
    bestD.fill(Infinity); bestI.fill(-1);
    const x=grid.x0+(col+.5)*grid.cell, y=grid.y1-(row+.5)*grid.cell;
    for (let j=0;j<tempSignals.length;j++) {
      const s=tempSignals[j], d=(x-s.x)**2+(y-s.y)**2;
      if (d>=bestD[K-1]) continue;
      let p=K-1; while(p>0&&d<bestD[p-1]) { bestD[p]=bestD[p-1]; bestI[p]=bestI[p-1]; p--; }
      bestD[p]=d; bestI[p]=j;
    }
    let wh=0,h=0,r=0,res=0;
    for(let k=0;k<K&&bestI[k]>=0;k++) { const s=tempSignals[bestI[k]], w=1/Math.max(bestD[k],4e6); wh+=w; h+=w*s.h; r+=w*s.reserve; res+=w*s.residual; }
    outH[i]=h/wh; outR[i]=r/wh; outT[i]=intercept+lapse*alt+res/wh; processed++;
  }
  console.log(`Interpolació: ${processed.toLocaleString("ca")} cel·les · gradient tèrmic ${(lapse*1000).toFixed(1)} °C/km`);
  return { outH, outR, outT };
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
  const H = new Map(), R = new Map(), recentRain = new Map();
  for (const r of pluja) {
    const d = Math.round((ref - new Date(r.dia)) / 864e5);
    if (d < 0 || d >= DIES) continue;
    const mm = parseFloat(r.v);
    if (Number.isNaN(mm)) continue;
    const useful = Math.min(mm, CAP);
    H.set(r.codi_estacio, (H.get(r.codi_estacio) ?? 0) + useful * lagWeight(d));
    R.set(r.codi_estacio, (R.get(r.codi_estacio) ?? 0) + useful * reserveWeight(d));
    if (d <= 2) recentRain.set(r.codi_estacio, (recentRain.get(r.codi_estacio) ?? 0) + mm);
  }
  const Tsum = new Map(), Tn = new Map();
  for (const r of temp) {
    const t = parseFloat(r.v); if (Number.isNaN(t)) continue;
    Tsum.set(r.codi_estacio, (Tsum.get(r.codi_estacio) ?? 0) + t);
    Tn.set(r.codi_estacio, (Tn.get(r.codi_estacio) ?? 0) + 1);
  }

  const grid = readGrid();
  let gridWeather = null;
  if (grid) {
    const signals=[];
    for (const [codi,m] of meta) {
      if (!m.lat||!m.lon||!Tn.has(codi)) continue;
      const [x,y]=wgs84ToUtm31(m.lon,m.lat);
      signals.push({x,y,alt:m.alt||0,t:Tsum.get(codi)/Tn.get(codi),h:H.get(codi)??0,reserve:R.get(codi)??0});
    }
    gridWeather=interpolateGrid(grid,signals);
    writeFileSync(join(OUT,"bolets.grid.json"),JSON.stringify({
      width:grid.width,height:grid.height,cell:grid.cell,x0:grid.x0,y0:grid.y0,y1:grid.y1,
      coordinates:[utm31ToLngLat(grid.x0,grid.y1),utm31ToLngLat(grid.x1,grid.y1),utm31ToLngLat(grid.x1,grid.y0),utm31ToLngLat(grid.x0,grid.y0)],
    }));

    // Metadades compactes compartides per totes les espècies. Permeten que un clic
    // sobre qualsevol cel·la mostri el mateix detall que una estació sense enviar
    // 1,2 milions de geometries al navegador.
    const terrain=new Uint8Array(grid.width*grid.height*4), weather=new Uint8Array(grid.width*grid.height*4);
    for(let i=0;i<grid.width*grid.height;i++) {
      const host=grid.b[i*3+24], alt=grid.b.readInt16LE(i*3+25); if(!host||alt===-32768) continue;
      const p=i*4, encodedAlt=alt+32768;
      terrain[p]=host; terrain[p+1]=encodedAlt>>8; terrain[p+2]=encodedAlt&255; terrain[p+3]=255;
      weather[p]=Math.max(0,Math.min(255,Math.round((gridWeather.outT[i]+20)*4)));
      weather[p+1]=Math.round(humidityFactor(gridWeather.outH[i],gridWeather.outR[i])*255);
      weather[p+3]=255;
    }
    writeFileSync(join(OUT,"bolets.terrain.png"),encodeRgbaPng(grid.width,grid.height,terrain));
    writeFileSync(join(OUT,"bolets.weather.png"),encodeRgbaPng(grid.width,grid.height,weather));
  } else console.log("ℹ️  Sense graella.bin: es generen només els punts per estació. Corre node buildGrid.mjs\n");

  // ── Puntuem cada espècie ─────────────────────────────────────────────────
  for (const spKey of spKeys) {
    const sp = SPECIES[spKey], gate = seasonFactor(month, sp.mesos);
    const files = [];
    for (const [codi, m] of meta) {
      if (!m.lat || !m.lon) continue;
      const h = H.get(codi) ?? 0, reserve = R.get(codi) ?? 0;
      const hScore = humidityFactor(h, reserve);
      const tMean = Tn.has(codi) ? Tsum.get(codi) / Tn.get(codi) : null;
      const fT = trapezoid(tMean, ...sp.temp), fAlt = trapezoid(m.alt, ...sp.alt), fHost = hostFactor(codi, sp);
      const score = hScore * fT * fAlt * gate * fHost;
      files.push({ codi, ...m, h, reserve, recentRain: recentRain.get(codi) ?? 0,
                   tMean, host: HOST?.[codi]?.host ?? null, score,
                   fH: hScore, fT, fAlt, fSeason: gate, fHost });
    }
    files.sort((a, b) => b.score - a.score);

    console.log(`── ${sp.nom}  (bosc: ${sp.host.join("/")} · estació: ${gate}${gate === 0 ? " · FORA DE TEMPORADA" : ""})`);
    for (const f of files.slice(0, all ? 5 : 15))
      console.log(`   ${(f.codi ?? "").padEnd(4)} ${(f.nom ?? "").slice(0,22).padEnd(23)} ` +
        `${String(Math.round(f.alt||0)).padStart(4)}m ${(f.host ?? "—").padEnd(10)} ` +
        `H${f.h.toFixed(1).padStart(5)} ${f.tMean==null?" --":f.tMean.toFixed(0).padStart(3)}°  ${f.score.toFixed(3)}`);

    const geojson = {
      type: "FeatureCollection", species: spKey, speciesNom: sp.nom, generated: refISO.slice(0, 10),
      model: { host:sp.host, alt:sp.alt, temp:sp.temp, season:gate },
      features: files.map((f) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: { codi:f.codi, nom:f.nom, alt:f.alt, host:f.host,
                      H:+f.h.toFixed(1), reserve:+f.reserve.toFixed(1), recentRain:+f.recentRain.toFixed(1),
                      tMean:f.tMean, score:+f.score.toFixed(3),
                      fH:+f.fH.toFixed(2), fT:+f.fT.toFixed(2), fAlt:+f.fAlt.toFixed(2), fSeason:+f.fSeason.toFixed(2), fHost:+f.fHost.toFixed(2) },
      })),
    };
    writeFileSync(join(OUT, `bolets.${spKey}.geojson`), JSON.stringify(geojson));
    if (grid && gridWeather) {
      const rgba=new Uint8Array(grid.width*grid.height*4), wanted=new Set(sp.host.map(h=>HOST_CODE[h]));
      for(let i=0;i<grid.width*grid.height;i++) {
        const host=grid.b[i*3+24], alt=grid.b.readInt16LE(i*3+25); if(!host||alt===-32768) continue;
        const fH=humidityFactor(gridWeather.outH[i],gridWeather.outR[i]), fT=trapezoid(gridWeather.outT[i],...sp.temp), fAlt=trapezoid(alt,...sp.alt);
        const fHost=wanted.has(host)?1:.25, score=fH*fT*fAlt*gate*fHost, [red,green,blue]=scoreColor(score), p=i*4;
        rgba[p]=red; rgba[p+1]=green; rgba[p+2]=blue; rgba[p+3]=score<.01?35:Math.round(105+Math.min(1,score)*125);
      }
      writeFileSync(join(OUT,`bolets.${spKey}.png`),encodeRgbaPng(grid.width,grid.height,rgba));
    }
    console.log(`   ✓ → ${join(OUT, `bolets.${spKey}.geojson`)}${grid ? ` + bolets.${spKey}.png` : ""}\n`);
  }
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
