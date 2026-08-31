import assert from "node:assert/strict";
import test from "node:test";
import { temperatureTrendFactor } from "../src/temperature-trend.mjs";

test("la tendència tèrmica només fa un ajust moderat", () => {
  assert.equal(temperatureTrendFactor(-3, "cooling"), 1);
  assert.equal(temperatureTrendFactor(0, "cooling"), 0.95);
  assert.ok(Math.abs(temperatureTrendFactor(3, "cooling") - 0.9) < 1e-12);
  assert.equal(temperatureTrendFactor(3, "warming"), 1);
  assert.ok(Math.abs(temperatureTrendFactor(-3, "warming") - 0.9) < 1e-12);
});

test("les espècies neutrals i les dades absents no penalitzen", () => {
  assert.equal(temperatureTrendFactor(3, "neutral"), 1);
  assert.equal(temperatureTrendFactor(null, "cooling"), 1);
  assert.throws(() => temperatureTrendFactor(1, "sideways"), TypeError);
});
