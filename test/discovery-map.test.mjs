import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  dominantPredictionAt,
  maximumPredictionScore,
  predictionScoreFromAlpha,
  selectDiscoveryPoints,
  summarizeDiscoverySpecies,
} from "../discovery-map.mjs";

const raster = (alpha) => ({
  pixels: new Uint8ClampedArray([0, 0, 0, alpha]),
  projection: {
    width: 1,
    height: 1,
    left: 0,
    right: 1,
    top: 0,
    bottom: 1,
    sourceIndices: new Int32Array([0]),
  },
});

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la descoberta interpreta la mateixa escala d'opacitat que el heatmap", () => {
  assert.equal(predictionScoreFromAlpha(35), 0);
  assert.equal(predictionScoreFromAlpha(105), 0);
  assert.equal(predictionScoreFromAlpha(230), 1);
  assert.equal(maximumPredictionScore(raster(180)), 0.6);
});

test("la descoberta tria l'espècie amb més probabilitat al punt", () => {
  const result = dominantPredictionAt([
    { species:"rovello", raster:raster(155) },
    { species:"rossinyol", raster:raster(205) },
  ], { lng:1.5, lat:42 });

  assert.equal(result.species, "rossinyol");
  assert.equal(result.score, 0.8);
});

test("les icones representen zones separades i només condicions significatives", () => {
  const entries = [
    { species:"rovello", label:"Rovelló", raster:raster(145) },
    { species:"rossinyol", label:"Rossinyol", raster:raster(180) },
  ];
  const grid = { coordinates:[[1,42],[1.4,42],[1.4,41.6],[1,41.6]] };
  const points = selectDiscoveryPoints(entries,grid,{maxPoints:3,minDistanceKm:10,stepLat:.04,stepLng:.04});

  assert.equal(points.length, 3);
  assert.ok(points.every((point) => point.species === "rossinyol"));
  assert.ok(points.every((point) => point.score >= 0.25));
});

test("la llista només mostra espècies amb almenys una icona al mapa", () => {
  const entries = [
    { species:"rovello", label:"Rovelló" },
    { species:"rossinyol", label:"Rossinyol" },
    { species:"cep", label:"Cep" },
  ];
  const rows = summarizeDiscoverySpecies(entries, [
    { species:"rossinyol", score:.52 },
    { species:"rossinyol", score:.68 },
    { species:"cep", score:.31 },
  ]);

  assert.deepEqual(rows.map(({ species, visibleScore }) => ({ species, visibleScore })), [
    { species:"rossinyol", visibleScore:.68 },
    { species:"cep", visibleScore:.31 },
  ]);
});

test("el mapa permet alternar entre una espècie i la descoberta", async () => {
  const app = await readProjectFile("app.html");

  assert.match(app, /data-experience="species"/);
  assert.match(app, /data-experience="discovery"/);
  assert.match(app, /selectDiscoveryPoints\(discoveryEntries,grid\)/);
  assert.match(app, /renderDiscoveryRows\(discoveryEntries,points\)/);
  assert.match(app, /Veure el mapa de \$\{esc\(entry\.label\.toLowerCase\(\)\)\}/);
  assert.match(app, /experienceMode==='discovery'/);
});

test("la versió mòbil empaqueta el motor i les imatges de descoberta", async () => {
  const build = await readProjectFile("build-mobile.mjs");

  assert.match(build, /discovery-map\.mjs/);
  assert.match(build, /media\/bolets/);
});
