import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("el mapa presenta la puntuació com un índex, no com una probabilitat", () => {
  assert.match(app, /Condicions estimades avui/);
  assert.match(app, /<span>Condicions<\/span>/);
  // El score és un producte de sis factors sobre 1, no una probabilitat de
  // trobar bolets: el signe % convidava a llegir-lo com si ho fos.
  assert.doesNotMatch(app, /Probabilitat estimada/);
  assert.match(app, /\$\{percentage\}% · \$\{r\.nivell\}/);
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

test("canviar d’espècie tanca el popup anterior", () => {
  assert.match(app, /getElementById\('species'\)\.addEventListener\('change', e => \{\s*dismissOpenPopup\(\);\s*load\(e\.target\.value\);/);
});

test("el suavitzat no escampa el color sobre diverses cel·les", () => {
  assert.match(app, /kind==='coverage'\?1\.25:\.9/);
  assert.doesNotMatch(app, /kind==='coverage'\?1\.25:2\.25/);
});

test("el popup consulta la mateixa reprojecció Web Mercator que la capa visual", () => {
  assert.match(app, /createRasterProjection, projectedPixelAtLngLat/);
  assert.match(app, /const displayed=projectedPixelAtLngLat\(currentRaster\.projection,lngLat\.lng,lngLat\.lat\)/);
  assert.match(app, /const index=currentRaster\.projection\.sourceIndices\[displayed\.index\]/);
  assert.doesNotMatch(app, /coordinates:grid\.coordinates/);
});

// hidePredictionLayers() amaga 'prediccio' i 'cobertura' en entrar a la
// descoberta, i load() només actualitza la imatge de la capa. Sense tornar-les
// a mostrar, en sortir de "Què hi ha ara" el mapa quedava buit per a totes les
// espècies.
test("en tornar de la descoberta el mapa de l'espècie es torna a veure", () => {
  assert.match(app, /const rasterLoaded=await load\(selected,\{preserveView:Boolean\(center\)\}\);\s*if\(!rasterLoaded\|\|experienceMode!=='species'\)return;/);
  assert.match(app, /for\(const layer of \['prediccio','cobertura'\]\)\s*\n\s*if\(map\.getLayer\(layer\)\)map\.setLayoutProperty\(layer,'visibility',stations\?'none':'visible'\);/);
});

test("una càrrega cancel·lada no trepitja el mode de descoberta", () => {
  assert.match(app, /if\(request!==predictionLoadRequest\|\|experienceMode!=='species'\)return false;\s*const metaSpecies/);
  assert.match(app, /return Boolean\(currentRaster\);/);
});

test("el commutador de mode viu només a la barra lateral", () => {
  assert.doesNotMatch(app, /discoveryFab|discovery-fab/);
  assert.match(app, /data-experience="discovery"/);
});
