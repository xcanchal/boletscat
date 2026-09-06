import { readFile, lstat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { GENERATION_ID, PREDICTION_NAME, readCurrentGeneration } from './prediction-generations.mjs';

const types = { '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8', '.png': 'image/png' };

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
    const directory = join(root, 'generations', generation);
    try {
      // Symlink directories/files must not permit escaping private storage.
      if (!(await lstat(directory)).isDirectory()) return c.json({ error: 'not_found' }, 404);
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      if (manifest.generationId !== generation || !Object.hasOwn(manifest.files, filename)) return c.json({ error: 'not_found' }, 404);
      const path = join(directory, filename);
      if (!(await lstat(path)).isFile()) return c.json({ error: 'not_found' }, 404);
      const data = await readFile(path);
      if (data.length !== manifest.files[filename].bytes
        || createHash('sha256').update(data).digest('hex') !== manifest.files[filename].sha256) {
        return c.json({ error: 'generation_unavailable' }, 503);
      }
      return c.body(data, 200, { 'Content-Type': types[extname(filename)] });
    } catch (error) {
      if (error.code === 'ENOENT') return c.json({ error: 'generation_unavailable' }, 410);
      throw error;
    }
  });
  // Older clients must reload the app to acquire the generation contract. Serving
  // flat aliases would preserve the mixed-generation race for those clients.
  app.get('/api/predictions/:filename', c => c.json({ error: 'client_update_required' }, 409));
}
