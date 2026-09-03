import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DISCOVERY_MIN_SCORE,
  selectDiscoveryPoints,
  summarizeDiscoverySpecies,
  zoneMaxima,
} from "../discovery-map.mjs";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Graella de joguina de 4×4 cel·les d'1 km. Amb zones de 2 km queden quatre
// blocs de 2×2 cel·les.
const grid = { width:4, height:4, cell:1000, x0:400000, y1:4600000 };
const build = (scores, species) => ({ score:Float32Array.from(scores), species });

test("cada zona aporta només la seva millor cel·la", () => {
  const zones = zoneMaxima(build(
    [.1,.9,0,0, .3,.2,0,0, 0,0,.5,0, 0,0,0,.4],
    ["rovello","cep","rovello","rovello","rovello","cep","rovello","rovello",
     "rovello","rovello","rossinyol","rovello","rovello","rovello","rovello","cep"],
  ), grid, { zoneMeters:2000 });

  // La zona de baix a la dreta conté .5 i .4: només hi passa la millor.
  const scores = zones.map((zone) => +zone.score.toFixed(2)).sort((a, b) => b - a);
  assert.deepEqual(scores, [.9, .5]);
  const best = zones.find((zone) => +zone.score.toFixed(2) === .9);
  assert.equal(best.species, "cep");
  // Centre de la cel·la (fila 0, columna 1).
  assert.equal(best.x, 401500);
  assert.equal(best.y, 4599500);
});

test("les cel·les per sota del llindar no generen zona", () => {
  assert.equal(DISCOVERY_MIN_SCORE, 0.25);
  const zones = zoneMaxima(build([.24,.1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], new Array(16).fill("rovello")), grid, { zoneMeters:2000 });
  assert.deepEqual(zones, []);
});

test("les zones seleccionades es reparteixen i no les monopolitza una espècie", () => {
  const candidates = [
    { species:"cep", score:.9, x:0, y:0 },
    { species:"cep", score:.85, x:5000, y:0 },      // massa a prop de l'anterior
    { species:"cep", score:.8, x:40000, y:0 },
    { species:"cep", score:.75, x:80000, y:0 },
    { species:"rovello", score:.7, x:120000, y:0 },
  ];
  const points = selectDiscoveryPoints(candidates, { maxPoints:4, maxPerSpecies:2, minDistanceMeters:16000 });

  assert.deepEqual(points.map((point) => point.score), [.9, .8, .7]);
  assert.equal(points.filter((point) => point.species === "cep").length, 2);
});

test("la llista resumeix la millor zona visible de cada espècie", () => {
  const rows = summarizeDiscoverySpecies([
    { species:"rossinyol", score:.52 },
    { species:"rossinyol", score:.68 },
    { species:"cep", score:.31 },
  ]);

  assert.deepEqual(rows, [
    { species:"rossinyol", visibleScore:.68 },
    { species:"cep", visibleScore:.31 },
  ]);
});

test("l'scorer publica la descoberta només quan puntua totes les espècies", async () => {
  const scorer = await readProjectFile("score_estacions.mjs");

  assert.match(scorer, /if \(best && score>best\.score\[i\]\) \{ best\.score\[i\]=score; best\.species\[i\]=spKey; \}/);
  assert.match(scorer, /if \(best && all\) \{[\s\S]*?bolets\.discovery\.json/);
  assert.match(scorer, /selectDiscoveryPoints\(zoneMaxima\(best, grid\)\)/);
});

test("la descoberta arriba al client com una sola descàrrega servida", async () => {
  const app = await readProjectFile("app.html");
  const server = await readProjectFile("src/server.mjs");

  assert.match(app, /fetch\(dataUrl\('bolets\.discovery\.json'\)/);
  assert.match(server, /predictionName = .*discovery\\\.json/);
  // El client ja no descarrega ni descodifica cap ràster per a la descoberta.
  assert.doesNotMatch(app, /discovery-map\.mjs/);
  assert.doesNotMatch(app, /dominantPredictionAt|discoveryEntries/);
});

test("el mapa permet alternar entre una espècie i la descoberta", async () => {
  const app = await readProjectFile("app.html");

  assert.match(app, /data-experience="species"/);
  assert.match(app, /data-experience="discovery"/);
  assert.match(app, /renderDiscoveryRows\(\(discovery\.species\?\?\[\]\)/);
  assert.match(app, /Veure el mapa de \$\{esc\(speciesLabel\(entry\.species\)\.toLowerCase\(\)\)\}/);
  assert.match(app, /experienceMode==='discovery'/);
});

test("la versió mòbil empaqueta les imatges de descoberta i no el mòdul del servidor", async () => {
  const build = await readProjectFile("build-mobile.mjs");

  assert.match(build, /media\/bolets/);
  assert.doesNotMatch(build, /discovery-map\.mjs/);
});
