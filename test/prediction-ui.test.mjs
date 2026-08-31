import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("el mapa presenta la puntuació amb el copy de probabilitat", () => {
  assert.match(app, /Probabilitat estimada avui/);
  assert.match(app, /<span>Probabilitat estimada<\/span>/);
  assert.match(app, /class="pop-probability/);
  assert.doesNotMatch(app, /Índex de condicions \$\{/);
});

test("el popup identifica dades desconegudes i carrega l'estructura forestal", () => {
  assert.match(app, /<span class="unknown-value">Desconegut<\/span>/);
  assert.doesNotMatch(app, /Desconegut \?/);
  assert.match(app, /entorn dens/);
  assert.match(app, /bolets\.forest\.png/);
});

test("el popup concentra les xifres útils i no publica els factors interns", () => {
  assert.match(app, /Condicions del punt/);
  assert.match(app, /\$\{percentage\}% · \$\{r\.nivell\}/);
  assert.match(app, /°C · \$\{direction\}/);
  assert.doesNotMatch(app, /class="pop-fit/);
  assert.doesNotMatch(app, /fitBarHTML/);
  assert.doesNotMatch(app, /<details class="pop-environment"/);
  assert.doesNotMatch(app, /const FACTORS/);
  assert.doesNotMatch(app, /class="fbar"/);
});

test("el popup és ample, responsive i manté visible el botó de ruta", () => {
  assert.match(app, /width:min\(320px,calc\(100vw - 24px\)\)/);
  assert.match(app, /grid-template-columns:72px minmax\(0,1fr\)/);
  assert.match(app, /\.maplibregl-popup-content\{display:flex;flex-direction:column/);
  assert.match(app, /\.pop-scroll\{min-height:0;[^}]*overflow-y:auto/);
  assert.match(app, /\.pop-map-footer\{flex:none/);
  assert.match(app, /<div class="pop-map-footer"><a class="pop-map"/);
});

test("el raster diferencia el bosc de probabilitat baixa de les cel·les sense bosc", () => {
  assert.match(app, /const LOW_SCORE_FOREST_ALPHA = 20/);
  assert.match(app, /LOW_SCORE_FOREST_ALPHA\+\(pixels\[p\+3\]-LOW_SCORE_FOREST_ALPHA\)\*reveal/);
  assert.doesNotMatch(app, /if\(score<DISPLAY_SCORE_MIN\) continue/);
});

test("el mapa estrena la vista satèl·lit i recorda la preferència", () => {
  assert.match(app, /currentBase = 'sat'/);
  assert.match(app, /localStorage\.getItem\('map-base'\)/);
  assert.match(app, /localStorage\.setItem\('map-base',currentBase\)/);
  assert.match(app, /visibility:base\.id===currentBase\?'visible':'none'/);
  assert.match(app, /btn\.classList\.toggle\('on',b\.id===currentBase\)/);
});
