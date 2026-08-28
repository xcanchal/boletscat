import test from "node:test";
import assert from "node:assert/strict";
import { SUBSTRATE, classifyLithology, pointInPolygon } from "../substrate.mjs";

test("classifica només litologies inequívocament silícies", () => {
  assert.equal(classifyLithology("Roques intrusives varisques. Granodiorites biotítiques"), SUBSTRATE.siliceous);
  assert.equal(classifyLithology("Pissarres i quarsites"), SUBSTRATE.siliceous);
});

test("classifica litologies carbonatades", () => {
  assert.equal(classifyLithology("Dolomies i calcàries (Fàcies Muschelkalk inferior)"), SUBSTRATE.calcareous);
  assert.equal(classifyLithology("Margues i calcarenites"), SUBSTRATE.calcareous);
});

test("manté com a mixtes o desconegudes les descripcions ambigües", () => {
  assert.equal(classifyLithology("Pissarres, localment calcàries"), SUBSTRATE.mixed);
  assert.equal(classifyLithology("Conglomerats, gresos i lutites"), SUBSTRATE.unknown);
  assert.equal(classifyLithology("Roques volcàniques. Basalts"), SUBSTRATE.unknown);
});

test("el punt dins del contorn però dins d'un forat queda exclòs", () => {
  const polygon = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ];
  assert.equal(pointInPolygon(2, 2, polygon), true);
  assert.equal(pointInPolygon(5, 5, polygon), false);
  assert.equal(pointInPolygon(12, 5, polygon), false);
});
