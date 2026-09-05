import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { DEFAULT_PREDICTION_DIR, resolvePredictionDir } from "../src/prediction-path.mjs";

test("the scorer and server default to the private predictions directory", () => {
  assert.equal(DEFAULT_PREDICTION_DIR, "private/predictions");
  assert.equal(resolvePredictionDir(""), resolve("private/predictions"));
  assert.equal(resolvePredictionDir("   "), resolve("private/predictions"));
});

test("an explicit prediction directory is normalized once", () => {
  assert.equal(resolvePredictionDir(" /tmp/boletada-predictions "), "/tmp/boletada-predictions");
});
