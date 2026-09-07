import { mkdir, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { decodeRgbaPng } from '../raster.mjs';
import { SPECIES } from './species-model.mjs';

export const GENERATION_ID = /^g-[a-f0-9-]{36}$/;
export const PREDICTION_NAME = /^bolets\.(?:grid\.json|discovery\.json|model-comparison\.json|[a-z0-9_-]+\.(?:geojson|png))$/;
export const REQUIRED_FILES = [
  'bolets.grid.json', 'bolets.terrain.png', 'bolets.forest.png', 'bolets.weather.png',
  ...Object.keys(SPECIES).flatMap(key => [`bolets.${key}.geojson`, `bolets.${key}.png`]),
  'bolets.discovery.json',
];
export const OPTIONAL_FILES = ['bolets.model-comparison.json'];
const digest = data => createHash('sha256').update(data).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const score = value => finite(value) && value >= 0 && value <= 1;
const coordinate = value => Array.isArray(value) && value.length === 2 && value.every(finite)
  && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;

export async function validateGeneration(directory, generationId, referenceDate) {
  ensure(GENERATION_ID.test(generationId), 'Invalid generation ID');
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(referenceDate), 'Invalid reference date');
  const files = {};
  const json = {};
  // Read all required files before publication; optional/extra files are never served.
  const presentOptional=[];
  for(const name of OPTIONAL_FILES) {
    try { if((await lstat(join(directory,name))).isFile())presentOptional.push(name); }
    catch(error) { if(error.code!=='ENOENT')throw error; }
  }
  for (const name of [...REQUIRED_FILES,...presentOptional]) {
    ensure((await lstat(join(directory, name))).isFile(), `Not a regular file: ${name}`);
    const data = await readFile(join(directory, name));
    ensure(data.length > 0, `Empty file: ${name}`);
    files[name] = { bytes: data.length, sha256: digest(data) };
    if (!name.endsWith('.png')) json[name] = JSON.parse(data);
  }
  const grid = json['bolets.grid.json'];
  ensure(Number.isInteger(grid.width) && grid.width > 0 && Number.isInteger(grid.height)
    && grid.height > 0 && grid.width * grid.height <= 20_000_000, 'Invalid grid dimensions');
  ensure([grid.cell, grid.x0, grid.y0, grid.y1].every(finite) && grid.cell > 0, 'Invalid grid bounds');
  ensure(grid.coordinates?.length === 4 && grid.coordinates.every(coordinate), 'Invalid grid coordinates');
  for (const name of REQUIRED_FILES.filter(name => name.endsWith('.png'))) {
    const data = await readFile(join(directory, name));
    ensure(data.length >= 45 && data.toString('ascii', data.length - 8, data.length - 4) === 'IEND', `Incomplete PNG: ${name}`);
    // Check dimensions before decompression/allocation.
    ensure(data.readUInt32BE(16) === grid.width && data.readUInt32BE(20) === grid.height, `PNG dimensions: ${name}`);
    const decoded = decodeRgbaPng(data);
    ensure(decoded.rgba.length === grid.width * grid.height * 4, `Invalid PNG: ${name}`);
  }
  for (const key of Object.keys(SPECIES)) {
    const geo = json[`bolets.${key}.geojson`];
    ensure(geo.type === 'FeatureCollection' && geo.species === key && geo.generated === referenceDate
      && geo.generationId === generationId, `Inconsistent species metadata: ${key}`);
    ensure([5,6].includes(geo.model?.scoreVersion) && finite(geo.model.season), `Invalid model metadata: ${key}`);
    ensure(Array.isArray(geo.features) && geo.features.length > 0, `Empty species: ${key}`);
    for (const feature of geo.features) {
      ensure(feature.type === 'Feature' && feature.geometry?.type === 'Point'
        && coordinate(feature.geometry.coordinates) && score(feature.properties?.score), `Invalid feature: ${key}`);
    }
  }
  const discovery = json['bolets.discovery.json'];
  ensure(discovery.generated === referenceDate && discovery.generationId === generationId
    && Array.isArray(discovery.points) && Array.isArray(discovery.species), 'Invalid discovery metadata');
  for (const point of discovery.points) {
    ensure(Object.hasOwn(SPECIES, point.species) && coordinate([point.lng, point.lat]) && score(point.score), 'Invalid discovery point');
  }
  for (const row of discovery.species) {
    ensure(score(row.visibleScore) && discovery.points.some(point => point.species === row.species), 'Invalid discovery row');
  }
  const comparison=json['bolets.model-comparison.json'];
  if(comparison)ensure(comparison.schemaVersion===1&&comparison.referenceDate===referenceDate&&comparison.generationId===generationId
    &&['baseline','candidate'].includes(comparison.activeModel)&&Array.isArray(comparison.species),'Invalid model comparison');
  return files;
}

export async function readCurrentGeneration(root) {
  const manifest = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'));
  ensure(manifest.schemaVersion === 1 && GENERATION_ID.test(manifest.generationId), 'Invalid current manifest');
  const saved = JSON.parse(await readFile(join(root, 'generations', manifest.generationId, 'manifest.json'), 'utf8'));
  ensure(JSON.stringify(saved) === JSON.stringify(manifest), 'Current generation is not finalized');
  ensure(REQUIRED_FILES.every(name => manifest.files?.[name]?.bytes > 0), 'Incomplete manifest');
  for (const name of REQUIRED_FILES) {
    const stat = await lstat(join(root, 'generations', manifest.generationId, name));
    ensure(stat.isFile() && stat.size === manifest.files[name].bytes, `Missing or incomplete active asset: ${name}`);
  }
  return manifest;
}

// The lock is deliberately never stolen on a timeout: a slow writer may still be alive.
// A killed process leaves an explicit operational recovery step (see runbook).
export async function publishGeneration(root, generate) {
  await mkdir(root, { recursive: true });
  const lock = join(root, '.generation-lock');
  try { await mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Prediction generation already locked; inspect .generation-lock/owner.json');
    throw error;
  }
  const generationId = `g-${randomUUID()}`;
  const staging = join(root, '.staging', generationId);
  const temporaryManifest = join(root, `.current-${generationId}.json`);
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ generationId, pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }));
    await mkdir(staging, { recursive: true });
    const metadata = await generate(staging, generationId);
    const files = await validateGeneration(staging, generationId, metadata.referenceDate);
    const manifest = { ...metadata, schemaVersion: 1, generationId, generatedAt: new Date().toISOString(), files };
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest));
    await mkdir(join(root, 'generations'), { recursive: true });
    await rename(staging, join(root, 'generations', generationId));
    // Same filesystem: readers see either the old pointer or the complete new one.
    await writeFile(temporaryManifest, JSON.stringify(manifest), { flag: 'wx' });
    await rename(temporaryManifest, join(root, 'current.json'));
    return manifest;
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(temporaryManifest, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
