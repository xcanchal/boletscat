import assert from "node:assert/strict";
import test from "node:test";
import {
  ALTITUDE_UPPER_FADE_M,
  SPECIES,
  trapezoid,
} from "../src/species-model.mjs";

test("totes les espècies comparteixen una cua d'altitud progressiva de 700 m", () => {
  assert.equal(ALTITUDE_UPPER_FADE_M, 700);
  for (const [key, species] of Object.entries(SPECIES)) {
    const [, , idealMaximum, maximum] = species.alt;
    assert.equal(maximum - idealMaximum, ALTITUDE_UPPER_FADE_M, key);
    assert.equal(trapezoid(idealMaximum, ...species.alt), 1, key);
    assert.equal(trapezoid(maximum, ...species.alt), 0, key);
  }
});

test("el rovelló manté l'òptim i conserva possibilitat a 2.000 m", () => {
  const alt = SPECIES.rovello.alt;

  assert.deepEqual(alt, [0, 200, 1500, 2200]);
  assert.equal(trapezoid(1500, ...alt), 1);
  assert.ok(Math.abs(trapezoid(1700, ...alt) - 5 / 7) < 1e-12);
  assert.ok(Math.abs(trapezoid(2000, ...alt) - 2 / 7) < 1e-12);
  assert.ok(Math.abs(trapezoid(2047, ...alt) - 153 / 700) < 1e-12);
  assert.equal(trapezoid(2200, ...alt), 0);
});
