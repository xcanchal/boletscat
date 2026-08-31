import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("el mapa presenta la puntuació amb el copy de probabilitat", () => {
  assert.match(app, /Probabilitat estimada avui/);
  assert.match(app, /Probabilitat \$\{Math\.round/);
  assert.doesNotMatch(app, /Índex de condicions \$\{/);
});

test("el popup identifica dades desconegudes i carrega l'estructura forestal", () => {
  assert.match(app, /<span class="unknown-value">Desconegut<\/span>/);
  assert.doesNotMatch(app, /Desconegut \?/);
  assert.match(app, /cobertura forestal/);
  assert.match(app, /bolets\.forest\.png/);
});
