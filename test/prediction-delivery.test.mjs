import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { rm, symlink, readFile, writeFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { registerPredictionRoutes } from '../src/prediction-routes.mjs';
import { publishGeneration } from '../src/prediction-generations.mjs';
import { loadSpeciesFiles, loadDiscoveryFiles } from '../prediction-client.mjs';
import { tempRoot, writeFixture } from './helpers/generation-fixture.mjs';

function harness(root) {
  const app = new Hono();
  registerPredictionRoutes(app, { root, authorize: c => {
    const cookie = c.req.header('Cookie');
    if (!cookie) return c.json({ error: 'unauthorized' }, 401);
    if (cookie !== 'access=active') return c.json({ error: 'subscription_required' }, 402);
  } });
  const fetchImpl = (url, options) => app.request(url, { ...options, headers: { Cookie: 'access=active' } });
  return { app, fetchImpl };
}

test('all manifest/assets/legacy paths are guarded and traversal never reaches files', async t => {
  const root = await tempRoot(t), manifest = await publishGeneration(root, writeFixture);
  const { app, fetchImpl } = harness(root);
  const asset = `/api/predictions/generations/${manifest.generationId}/bolets.ou_de_reig.geojson`;
  for (const path of ['/api/predictions/current.json', asset, '/api/predictions/bolets.rovello.png']) {
    assert.equal((await app.request(path)).status, 401);
    assert.equal((await app.request(path, { headers: { Cookie: 'access=inactive' } })).status, 402);
  }
  const response = await fetchImpl(asset);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await response.json()).species, 'ou_de_reig');
  for (const tail of ['..%2F..%2F.env', 'manifest.json', 'bolets.evil.png', 'bolets..%2F.env.png']) {
    assert.equal((await fetchImpl(`/api/predictions/generations/${manifest.generationId}/${tail}`)).status, 404);
  }
  for (const filename of Object.keys(manifest.files)) {
    const legacy = await fetchImpl(`/api/predictions/${filename}?v=old-client`);
    assert.equal(legacy.status, 200, filename);
    assert.equal(Number(legacy.headers.get('Content-Length') ?? (await legacy.arrayBuffer()).byteLength), manifest.files[filename].bytes);
  }
  const path = join(root, 'generations', manifest.generationId, 'bolets.rovello.png');
  await rm(path); await symlink(join(root, 'current.json'), path);
  assert.equal((await fetchImpl(`/api/predictions/generations/${manifest.generationId}/bolets.rovello.png`)).status, 404);
  assert.equal((await fetchImpl('/api/predictions/bolets.rovello.png')).status, 503);
});

test('legacy flat clients follow complete active generations across publications', async t => {
  const root = await tempRoot(t), first = await publishGeneration(root, writeFixture);
  const { fetchImpl } = harness(root);
  const before = await (await fetchImpl('/api/predictions/bolets.rovello.geojson?cache=old')).json();
  assert.equal(before.generationId, first.generationId);
  assert.equal(before.features[0].properties.score, .6);

  const second = await publishGeneration(root, (dir, id) => writeFixture(dir, id, { value: .2 }));
  const after = await (await fetchImpl('/api/predictions/bolets.rovello.geojson?cache=older')).json();
  assert.equal(after.generationId, second.generationId);
  assert.equal(after.features[0].properties.score, .2);
});

test('a publication between manifest and assets cannot mix a client bundle; discovery drilldown stays pinned', async t => {
  const root = await tempRoot(t), first = await publishGeneration(root, writeFixture);
  const { fetchImpl } = harness(root);
  let switched = false, second;
  const observed = [];
  const racingFetch = async (url, options) => {
    observed.push(url);
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'include');
    const result = await fetchImpl(url, options);
    if (!switched && url.endsWith('current.json')) {
      switched = true;
      second = await publishGeneration(root, (dir, id) => writeFixture(dir, id, { value: .2 }));
    }
    return result;
  };
  const bundle = await loadSpeciesFiles('.', 'rovello', { fetchImpl: racingFetch });
  assert.equal(bundle.geo.generationId, first.generationId);
  assert.equal(bundle.geo.features[0].properties.score, .6);
  assert.ok(observed.slice(1).every(url => url.includes(first.generationId)));
  assert.equal(Object.keys(bundle.images).length, 4);
  const discovery = await loadDiscoveryFiles('.', { snapshot: bundle.snapshot, fetchImpl });
  const drilled = await loadSpeciesFiles('.', 'ou_de_reig', { snapshot: discovery.snapshot, fetchImpl });
  assert.equal(drilled.snapshot.generationId, first.generationId);
  const refreshed = await loadSpeciesFiles('.', 'rovello', { fetchImpl });
  assert.equal(refreshed.snapshot.generationId, second.generationId);
  assert.equal(refreshed.geo.features[0].properties.score, .2);
});

test('an expired generation retries the whole bundle once with the latest manifest', async t => {
  const root = await tempRoot(t), first = await publishGeneration(root, writeFixture);
  const second = await publishGeneration(root, (dir, id) => writeFixture(dir, id, { value: .3 }));
  await rm(join(root, 'generations', first.generationId), { recursive: true });
  const { fetchImpl } = harness(root);
  const bundle = await loadSpeciesFiles('.', 'rovello', { snapshot: first, fetchImpl });
  assert.equal(bundle.geo.generationId, second.generationId);
  let count = 0;
  const gone = async url => {
    count++;
    return url.endsWith('current.json') ? Response.json(second) : new Response('', { status: 410 });
  };
  await assert.rejects(loadSpeciesFiles('.', 'rovello', { snapshot: first, fetchImpl: gone }), /410/);
  assert.equal(count, 13); // six assets twice, one new manifest
});

test('cold startup, missing assets and unauthorized users fail without flat-file fallback', async t => {
  const root = await tempRoot(t), { app, fetchImpl } = harness(root);
  assert.equal((await fetchImpl('/api/predictions/current.json')).status, 503);
  await assert.rejects(loadSpeciesFiles('.', 'rovello', { fetchImpl }), /503/);
  await assert.rejects(loadDiscoveryFiles('.', { fetchImpl: url => app.request(url) }), /401/);
});

test('same-size modification of a published asset is rejected by its digest', async t => {
  const root = await tempRoot(t), manifest = await publishGeneration(root, writeFixture);
  const path = join(root, 'generations', manifest.generationId, 'bolets.weather.png');
  const data = await readFile(path); data[30] ^= 1; await writeFile(path, data);
  const { fetchImpl } = harness(root);
  assert.equal((await fetchImpl(`/api/predictions/generations/${manifest.generationId}/bolets.weather.png`)).status, 503);
});
