import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/revenuecat.mjs", import.meta.url), "utf8");

test("la sincronització amb RevenueCat té un temps màxim", () => {
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 8_000\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /finally \{\s*clearTimeout\(timeout\);\s*\}/);
});
