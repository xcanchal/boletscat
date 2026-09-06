import { readFile, lstat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { GENERATION_ID, PREDICTION_NAME, readCurrentGeneration } from './prediction-generations.mjs';

const types = { '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8', '.png': 'image/png' };

async function readGenerationAsset(root, generation, filename) {
  const directory = join(root, 'generations', generation);
  // Symlink directories/files must not permit escaping private storage.
  if (!(await lstat(directory)).isDirectory()) return { status: 404, error: 'not_found' };
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.generationId !== generation || !Object.hasOwn(manifest.files, filename)) {
    return { status: 404, error: 'not_found' };
  }
  const path = join(directory, filename);
  if (!(await lstat(path)).isFile()) return { status: 404, error: 'not_found' };
  const data = await readFile(path);
  if (data.length !== manifest.files[filename].bytes
    || createHash('sha256').update(data).digest('hex') !== manifest.files[filename].sha256) {
    return { status: 503, error: 'generation_unavailable' };
  }
  return { status: 200, data };
}

function assetResponse(c, result, filename) {
  return result.data
    ? c.body(result.data, 200, { 'Content-Type': types[extname(filename)] })
    : c.json({ error: result.error }, result.status);
}

export function registerPredictionRoutes(app, { root, authorize }) {
  app.use('/api/predictions/*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Cookie');
    const denial = await authorize(c);
    if (denial) return denial;
    await next();
  });
  app.get('/api/predictions/current.json', async c => {
    try { return c.json(await readCurrentGeneration(root)); }
    catch { return c.json({ error: 'predictions_unavailable' }, 503); }
  });
  app.get('/api/predictions/generations/:generation/:filename', async c => {
    const generation = c.req.param('generation'), filename = c.req.param('filename');
    if (!GENERATION_ID.test(generation) || !PREDICTION_NAME.test(filename)) return c.json({ error: 'not_found' }, 404);
    try {
      return assetResponse(c, await readGenerationAsset(root, generation, filename), filename);
    } catch (error) {
      if (error.code === 'ENOENT') return c.json({ error: 'generation_unavailable' }, 410);
      throw error;
    }
  });
  // Expand-phase adapter: an old browser resolves each allowlisted flat request
  // through the active immutable generation. Several old-client requests can
  // straddle a publication; generation-aware clients pin the whole bundle.
  app.get('/api/predictions/:filename', async c => {
    const filename = c.req.param('filename');
    if (!PREDICTION_NAME.test(filename)) return c.json({ error: 'not_found' }, 404);
    try {
      const manifest = await readCurrentGeneration(root);
      return assetResponse(c, await readGenerationAsset(root, manifest.generationId, filename), filename);
    } catch {
      return c.json({ error: 'predictions_unavailable' }, 503);
    }
  });
}
