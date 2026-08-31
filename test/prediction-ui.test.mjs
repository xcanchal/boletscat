import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("el mapa presenta un índex de condicions, no una falsa probabilitat", () => {
  assert.match(app, /Índex de condicions/);
  assert.doesNotMatch(app, /Probabilitat estimada|Probabilitat \$\{/);
});

test("el popup identifica dades desconegudes i carrega l'estructura forestal", () => {
  assert.match(app, /Desconegut <b aria-hidden="true">\?<\/b>/);
  assert.match(app, /cobertura forestal/);
  assert.match(app, /bolets\.forest\.png/);
});
