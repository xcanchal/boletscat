import assert from "node:assert/strict";
import test from "node:test";
import {
  capConditionScore,
  conditionRating,
  hasCompleteEnvironmentalData,
} from "../prediction-confidence.mjs";

const complete = { host:"conifer", substrate:"calcareous", forestStructure:"dense" };

test("Molt alta exigeix un índex de 0,80 i dades ambientals completes", () => {
  assert.equal(conditionRating({ score:0.79, ...complete }).key, "high");
  assert.equal(conditionRating({ score:0.8, ...complete }).key, "very-high");
  assert.equal(conditionRating({ score:0.95, host:"conifer", substrate:null, forestStructure:"dense" }).key, "high");
});

test("les dades d'estació poden acreditar el bosc amb la fracció forestal", () => {
  assert.equal(hasCompleteEnvironmentalData({ host:"conifer", substrate:"mixed", forestFrac:0.64 }), true);
  assert.equal(hasCompleteEnvironmentalData({ host:"conifer", substrate:"mixed" }), false);
});

test("un índex incomplet queda per sota de la categoria màxima", () => {
  assert.equal(capConditionScore(0.92, complete), 0.92);
  assert.equal(capConditionScore(0.92, { host:"conifer", substrate:"calcareous" }), 0.79);
});

// El client es cacheja amb `max-age`, l'HTML no. Sense una URL versionada, un
// desplegament que afegeixi un export pot aparellar l'HTML nou amb un mòdul
// antic i deixar l'app penjada a l'import.
test("els mòduls ES s'importen amb versió i el build mòbil la sap desfer", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const app = await read("app.html");
  const build = await read("build-mobile.mjs");

  const imports = [...app.matchAll(/from '(\/[a-z-]+\.mjs)(\?v=[0-9a-z]+)?'/g)];
  assert.ok(imports.length >= 2, "l'app ha d'importar els mòduls compartits");
  for (const [, path, version] of imports) {
    assert.ok(version, `${path} s'importa sense versió`);
    assert.ok(build.includes(`"from '${path}${version}'"`), `build-mobile no reescriu ${path}${version}`);
  }
});
