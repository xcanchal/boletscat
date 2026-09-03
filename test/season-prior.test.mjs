import assert from "node:assert/strict";
import test from "node:test";
import { seasonPrior } from "../src/season-prior.mjs";
import { SPECIES } from "../src/species-model.mjs";

const near = (actual, expected, tolerance = 5e-4) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);

test("dins de la temporada típica el prior no penalitza", () => {
  for (const month of [9, 10, 11]) assert.equal(seasonPrior(month, [9, 10, 11], 1.5), 1);
});

test("la caiguda és progressiva i no un esglaó", () => {
  const months = [9, 10, 11];
  const august = seasonPrior(8, months, 1.5);
  const july = seasonPrior(7, months, 1.5);
  const june = seasonPrior(6, months, 1.5);

  near(august, 0.8007);
  near(july, 0.4111);
  assert.ok(august > july && july > june, "el prior ha de decaure de manera monòtona");
});

test("el desembre i l'agost pesen igual: la distància és circular", () => {
  assert.equal(seasonPrior(12, [1], 1.5), seasonPrior(2, [1], 1.5));
  assert.equal(seasonPrior(11, [1], 1.2), seasonPrior(3, [1], 1.2));
});

// Els dos casos que van motivar el canvi.
test("un cep d'agost continua sent possible", () => {
  const cep = SPECIES.cep;
  near(seasonPrior(8, cep.mesos, cep.spread), 0.8007);
  assert.ok(seasonPrior(8, cep.mesos, cep.spread) > 0.75);
});

test("una múrgola de setembre queda descartada", () => {
  const murgola = SPECIES.murgola;
  assert.ok(seasonPrior(9, murgola.mesos, murgola.spread) < 0.01);
  // Al juny, tot just passada la temporada, encara conserva una possibilitat.
  near(seasonPrior(6, murgola.mesos, murgola.spread), 0.2494);
});

test("cada espècie declara una amplada estacional positiva", () => {
  for (const [key, species] of Object.entries(SPECIES)) {
    assert.ok(species.spread > 0, key);
    assert.ok(Array.isArray(species.mesos) && species.mesos.length, key);
    assert.equal(seasonPrior(species.mesos[0], species.mesos, species.spread), 1, key);
  }
});

test("rebutja mesos i amplades invàlides", () => {
  assert.throws(() => seasonPrior(0, [3], 1), TypeError);
  assert.throws(() => seasonPrior(13, [3], 1), TypeError);
  assert.throws(() => seasonPrior(3, [], 1), TypeError);
  assert.throws(() => seasonPrior(3, [3], 0), TypeError);
});

test("l'scorer aplica el prior a les estacions i a la graella", async () => {
  const { readFile } = await import("node:fs/promises");
  const scorer = await readFile(new URL("../score_estacions.mjs", import.meta.url), "utf8");

  assert.match(scorer, /const fSeason = seasonPrior\(refMonth, sp\.mesos, sp\.spread\);/);
  assert.match(scorer, /hScore \* fT \* fTrend \* fAlt \* fHost \* fSoil \* fSeason/);
  assert.match(scorer, /fH\*fT\*fTrend\*fAlt\*fHost\*fSoil\*fSeason/);
});
