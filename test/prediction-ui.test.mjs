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
  assert.match(app, /Cobertura forestal/);
  assert.match(app, /bolets\.forest\.png/);
});

test("el popup concentra les xifres útils i no publica els factors interns", () => {
  assert.match(app, /Dades de l’entorn/);
  assert.match(app, /\$\{percentage\}% · \$\{r\.nivell\}/);
  assert.match(app, /\$\{percentage\}% · \$\{level\}/);
  assert.match(app, /°C · \$\{direction\}/);
  assert.match(app, /últims 5 dies amb els 9 anteriors/);
  assert.doesNotMatch(app, /const FACTORS/);
  assert.doesNotMatch(app, /class="fbar"/);
});
