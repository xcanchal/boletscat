import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodeRgbaPng } from '../../raster.mjs';
import { SPECIES } from '../../src/species-model.mjs';

export async function tempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'boletada-generation-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

export async function writeFixture(directory, generationId, { date = '2026-09-05', value = .6 } = {}) {
  const json = (name, data) => writeFile(join(directory, name), JSON.stringify(data));
  const png = encodeRgbaPng(2, 2, new Uint8Array(16).fill(Math.round(value * 255)));
  await json('bolets.grid.json', { width: 2, height: 2, cell: 250, x0: 400000, y0: 4599500, y1: 4600000,
    coordinates: [[1,42],[2,42],[2,41],[1,41]] });
  for (const name of ['terrain','weather','forest']) await writeFile(join(directory, `bolets.${name}.png`), png);
  for (const species of Object.keys(SPECIES)) {
    await json(`bolets.${species}.geojson`, { type: 'FeatureCollection', species, generated: date, generationId,
      model: { scoreVersion: 5, season: 1 },
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1.5,41.5] }, properties: { score: value } }] });
    await writeFile(join(directory, `bolets.${species}.png`), png);
  }
  await json('bolets.discovery.json', { generated: date, generationId, points: [{ species: 'rovello', lng: 1.5, lat: 41.5, score: value }],
    species: [{ species: 'rovello', visibleScore: value }] });
  return { referenceDate: date, modelVersion: 5, terrainVersion: 'fixture', sourceObservedThrough: null };
}
