import assert from "node:assert/strict";
import test from "node:test";

import {
  createRasterProjection,
  projectedPixelAtLngLat,
  wgs84ToUtm31,
} from "../raster-projection.mjs";

const grid = {
  width: 1080,
  height: 1104,
  cell: 250,
  x0: 260000,
  y0: 4484000,
  y1: 4760000,
  coordinates: [
    [0.05776498450473856, 42.95483227778488],
    [3.3680129450848524, 42.99207106268313],
    [3.354081835470876, 40.50617169316801],
    [0.16896126830144184, 40.47202679402399],
  ],
};

function sourceIndexAt(lon, lat) {
  const [x, y] = wgs84ToUtm31(lon, lat);
  const col = Math.floor((x - grid.x0) / grid.cell);
  const row = Math.floor((grid.y1 - y) / grid.cell);
  return row * grid.width + col;
}

test("la reprojecció alinea el punt reportat amb la mateixa cel·la UTM", () => {
  const projection = createRasterProjection(grid);
  const pixel = projectedPixelAtLngLat(projection, 1.727636, 42.313025);

  assert.ok(pixel);
  assert.equal(projection.sourceIndices[pixel.index], sourceIndexAt(1.727636, 42.313025));
  assert.deepEqual(
    [projection.sourceIndices[pixel.index] % grid.width, Math.floor(projection.sourceIndices[pixel.index] / grid.width)],
    [540, 298],
  );
});

test("la capa Web Mercator conserva l'alineació en punts repartits per Catalunya", () => {
  const projection = createRasterProjection(grid);
  const samples = [
    [0.80197, 42.69737],
    [1.24244, 42.51881],
    [1.76216, 42.26478],
    [2.41877, 41.84008],
    [0.98161, 41.31481],
  ];

  for (const [lon, lat] of samples) {
    const pixel = projectedPixelAtLngLat(projection, lon, lat);
    assert.ok(pixel, `${lat}, ${lon} ha de quedar dins del raster`);
    const displayedSource = projection.sourceIndices[pixel.index];
    const exactSource = sourceIndexAt(lon, lat);
    const displayedCol = displayedSource % grid.width;
    const displayedRow = Math.floor(displayedSource / grid.width);
    const exactCol = exactSource % grid.width;
    const exactRow = Math.floor(exactSource / grid.width);
    assert.ok(
      Math.abs(displayedCol - exactCol) <= 1 && Math.abs(displayedRow - exactRow) <= 1,
      `${lat}, ${lon} no pot desviar-se més que la resolució de 250 m`,
    );
  }
});

test("la imatge de sortida és un rectangle Web Mercator", () => {
  const projection = createRasterProjection(grid);
  const [[leftTopLon, topLat], [rightTopLon, secondTopLat], [rightBottomLon, bottomLat], [leftBottomLon, secondBottomLat]] = projection.coordinates;

  assert.equal(leftTopLon, leftBottomLon);
  assert.equal(rightTopLon, rightBottomLon);
  assert.equal(topLat, secondTopLat);
  assert.equal(bottomLat, secondBottomLat);
});
