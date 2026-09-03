import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DISCOVERY_MIN_SCORE,
  DISCOVERY_MIN_SUPPORT,
  DISCOVERY_SUPPORT_RADIUS,
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
  ), grid, { zoneMeters:2000, minSupport:1 });

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
  const zones = zoneMaxima(build([.24,.1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], new Array(16).fill("rovello")), grid, { zoneMeters:2000, minSupport:1 });
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

// La icona és una gota girada -45°: la punta cau a mig diagonal per sota del
// centre. Amb `anchor:"center"` MapLibre hi ancorava el centre i la punta —
// que és el que l'ull llegeix— quedava desplaçada un nombre fix de píxels, és
// a dir desenes de km allunyat i uns metres a prop.
test("la punta del marcador s'ancora sobre la coordenada", async () => {
  const app = await readProjectFile("app.html");

  const size = app.match(/const DISCOVERY_MARKER_PX = (\d+);/);
  assert.ok(size, "cal declarar la mida del marcador al costat del càlcul");
  assert.match(app, /const DISCOVERY_MARKER_TIP_PX = DISCOVERY_MARKER_PX \/ Math\.SQRT2;/);
  assert.match(app, /new maplibregl\.Marker\(\{element:wrapper,anchor:'center',offset:\[0,-DISCOVERY_MARKER_TIP_PX\]\}\)/);

  // MapLibre escriu `transform` a l'element que li passem: si li donéssim el
  // marcador directament, el gir del CSS no s'aplicaria mai i la punta no
  // estaria on diu aquest càlcul.
  assert.match(app, /wrapper\.className='discovery-pin'/);

  // L'embolcall duu també la classe .maplibregl-marker. Declarar-hi `position`
  // guanya per ordre a la regla `absolute` de MapLibre i tira el marcador al
  // flux normal: cada icona surt 38 px més avall que l'anterior i el zoom les
  // escampa.
  const pin = app.match(/\.discovery-pin\{([^}]*)\}/);
  assert.ok(pin, "cal la regla .discovery-pin");
  assert.doesNotMatch(pin[1], /position:/);
  assert.match(app, /wrapper\.appendChild\(element\)/);
  assert.doesNotMatch(app, /new maplibregl\.Marker\(\{element,/);

  // El càlcul només val mentre el CSS mantingui aquesta mida i aquest gir.
  const rule = app.match(/\.discovery-marker\{([^}]*)\}/);
  assert.ok(rule, "cal la regla .discovery-marker");
  assert.match(rule[1], new RegExp(`width:${size[1]}px;height:${size[1]}px`));
  assert.match(rule[1], /transform:rotate\(-45deg\)/);
  assert.match(rule[1], /border-radius:50% 50% 50% 18%/);
});

// L'ou de reig és l'única espècie amb guió baix: el filtre de noms del servidor
// no l'acceptava i la seva predicció responia 404 des del primer desplegament.
test("el filtre de prediccions accepta els noms amb guió baix", async () => {
  const server = await readProjectFile("src/server.mjs");
  const line = server.match(/const predictionName = (\/.*\/);/);
  assert.ok(line, "cal el filtre de noms");
  const pattern = new RegExp(line[1].slice(1, -1));

  for (const name of ["bolets.ou_de_reig.geojson", "bolets.ou_de_reig.png", "bolets.rovello.geojson", "bolets.discovery.json"])
    assert.ok(pattern.test(name), name);
  for (const name of ["bolets.evil.txt", "../../etc/passwd", "bolets..%2Fetc.png"])
    assert.ok(!pattern.test(name), name);
});

// Una cel·la de 250 m amb bona puntuació però envoltada de no-res no és una
// destinació: al mapa per espècie no es veu i a peu no hi ha res. El màxim de la
// zona no pot ser un valor aïllat.
test("una cel·la aïllada no genera icona per alta que sigui", () => {
  const width = 9, height = 9;
  const scores = new Float32Array(width * height);
  const species = new Array(width * height).fill(null);
  // Cel·la solitària excel·lent a dalt a l'esquerra.
  scores[0] = 0.95; species[0] = "murgola";
  // Clapa contínua i més modesta a baix a la dreta.
  for (let row = 5; row < 9; row++) for (let col = 5; col < 9; col++) {
    scores[row * width + col] = 0.4; species[row * width + col] = "cep";
  }
  const grid = { width, height, cell:250, x0:400000, y1:4600000 };
  const zones = zoneMaxima({ score:scores, species }, grid, { zoneMeters:250 * width });

  assert.equal(zones.length, 1, "només la clapa amb suport ha de sobreviure");
  assert.equal(zones[0].species, "cep");
});

test("la clapa amb suport guanya la zona encara que un valor aïllat sigui més alt", () => {
  const width = 9, height = 9;
  const scores = new Float32Array(width * height);
  const species = new Array(width * height).fill("cep");
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) scores[row * width + col] = 0.4;
  scores[8 * width + 8] = 0.99; // aïllada, i la millor de la zona
  const grid = { width, height, cell:250, x0:400000, y1:4600000 };
  const [zone] = zoneMaxima({ score:scores, species }, grid, { zoneMeters:250 * width });

  assert.ok(Math.abs(zone.score - 0.4) < 1e-6, `esperava la clapa, no ${zone.score}`);
});

test("el suport es compta per espècie, no per qualsevol veí favorable", () => {
  const width = 9, height = 9;
  const scores = new Float32Array(width * height);
  const species = new Array(width * height).fill(null);
  // Un ou de reig sol envoltat de rossinyols excel·lents: continua sent sol.
  for (let i = 0; i < width * height; i++) { scores[i] = 0.6; species[i] = "rossinyol"; }
  scores[40] = 0.9; species[40] = "ou_de_reig";
  const grid = { width, height, cell:250, x0:400000, y1:4600000 };
  const [zone] = zoneMaxima({ score:scores, species }, grid, { zoneMeters:250 * width });

  assert.equal(zone.species, "rossinyol");
});

test("els paràmetres de suport descriuen mig km² en una finestra d'1,75 km", () => {
  assert.equal(DISCOVERY_SUPPORT_RADIUS, 3);
  assert.equal(DISCOVERY_MIN_SUPPORT, 8);
});
