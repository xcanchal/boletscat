import assert from "node:assert/strict";
import test from "node:test";
import { aggregateForestCover } from "../forest-cover.mjs";

const CONIFER_DENSE = 0x33cc33;
const CONIFER_OPEN = 0x19e61e;
const DECIDUOUS_DENSE = 0x66ff33;
const MEADOW = 0xffff00;

function categoricalImage(rows) {
  const height = rows.length, width = rows[0].length;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = rows[y][x], offset = (y * width + x) * 4;
    if (color == null) continue;
    rgba[offset] = color >> 16;
    rgba[offset + 1] = (color >> 8) & 0xff;
    rgba[offset + 2] = color & 0xff;
    rgba[offset + 3] = 255;
  }
  return { rgba, width, height };
}

test("la majoria forestal omple una cel·la encara que el centre sigui una clariana", () => {
  const image = categoricalImage([
    [CONIFER_DENSE, CONIFER_DENSE, CONIFER_DENSE],
    [CONIFER_DENSE, MEADOW, CONIFER_DENSE],
    [CONIFER_DENSE, CONIFER_DENSE, CONIFER_DENSE],
  ]);
  const result = aggregateForestCover(image, { gridWidth:1, gridHeight:1, samplesPerCell:3 });

  assert.deepEqual([...result.hosts], [1]);
  assert.deepEqual([...result.forestStructure], [1]);
});

test("un arbre aïllat al centre no converteix tota la cel·la en bosc", () => {
  const image = categoricalImage([
    [MEADOW, MEADOW, MEADOW],
    [MEADOW, CONIFER_DENSE, MEADOW],
    [MEADOW, MEADOW, MEADOW],
  ]);
  const result = aggregateForestCover(image, { gridWidth:1, gridHeight:1, samplesPerCell:3 });

  assert.deepEqual([...result.hosts], [0]);
  assert.deepEqual([...result.forestStructure], [0]);
});

test("assigna el tipus i l'estructura dominants dins de la cel·la", () => {
  const image = categoricalImage([
    [DECIDUOUS_DENSE, DECIDUOUS_DENSE, MEADOW],
    [CONIFER_OPEN, CONIFER_DENSE, DECIDUOUS_DENSE],
    [MEADOW, MEADOW, MEADOW],
  ]);
  const result = aggregateForestCover(image, { gridWidth:1, gridHeight:1, samplesPerCell:3 });

  assert.deepEqual([...result.hosts], [2]);
  assert.deepEqual([...result.forestStructure], [1]);
});

test("exigeix una imatge sobremostrejada amb un factor senar", () => {
  const image = categoricalImage([[CONIFER_DENSE]]);

  assert.throws(
    () => aggregateForestCover(image, { gridWidth:1, gridHeight:1, samplesPerCell:2 }),
    /senar positiu/,
  );
  assert.throws(
    () => aggregateForestCover(image, { gridWidth:2, gridHeight:1, samplesPerCell:1 }),
    /Dimensions inesperades/,
  );
});
