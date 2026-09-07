import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { publishGeneration, readCurrentGeneration, REQUIRED_FILES, OPTIONAL_FILES } from '../src/prediction-generations.mjs';
import { tempRoot, writeFixture } from './helpers/generation-fixture.mjs';

test('publication creates a complete manifest and retains the previous immutable generation', async t => {
  const root = await tempRoot(t);
  const first = await publishGeneration(root, writeFixture);
  assert.deepEqual(Object.keys(first.files), [...REQUIRED_FILES,...OPTIONAL_FILES]);
  const before = await readFile(join(root, 'generations', first.generationId, 'bolets.rovello.geojson'));
  const second = await publishGeneration(root, (dir, id) => writeFixture(dir, id, { value: .2 }));
  assert.equal((await readCurrentGeneration(root)).generationId, second.generationId);
  assert.notEqual(first.generationId, second.generationId);
  assert.deepEqual(await readFile(join(root, 'generations', first.generationId, 'bolets.rovello.geojson')), before);
  assert.equal((await readdir(join(root, '.staging'))).length, 0);
});

test('a pre-v6 generation without the comparison report remains readable',async t=>{
  const root=await tempRoot(t);
  const manifest=await publishGeneration(root,async(directory,id)=>{
    const metadata=await writeFixture(directory,id);
    await rm(join(directory,'bolets.model-comparison.json'));
    return metadata;
  });
  assert.equal((await readCurrentGeneration(root)).generationId,manifest.generationId);
  assert.ok(!Object.hasOwn(manifest.files,'bolets.model-comparison.json'));
});

test('interruption and invalid output never replace the active pointer', async t => {
  const root = await tempRoot(t);
  const first = await publishGeneration(root, writeFixture);
  const invalid = [
    async () => { throw new Error('interrupted'); },
    async dir => rm(join(dir, 'bolets.ou_de_reig.png')),
    async dir => writeFile(join(dir, 'bolets.rovello.geojson'), '{broken'),
    async dir => {
      const path = join(dir, 'bolets.rovello.geojson');
      const data = JSON.parse(await readFile(path)); data.generated = '2020-01-01';
      await writeFile(path, JSON.stringify(data));
    },
    async dir => {
      const path = join(dir, 'bolets.rovello.geojson');
      const data = JSON.parse(await readFile(path)); data.features[0].properties.score = null;
      await writeFile(path, JSON.stringify(data));
    },
    async dir => {
      const path = join(dir, 'bolets.weather.png');
      const data = await readFile(path); data.writeUInt32BE(3, 16);
      await writeFile(path, data);
    },
    async dir => {
      const path = join(dir, 'bolets.weather.png');
      await writeFile(path, (await readFile(path)).subarray(0, 40));
    },
  ];
  for (const corrupt of invalid) {
    await assert.rejects(publishGeneration(root, async (dir, id) => {
      const meta = await writeFixture(dir, id); await corrupt(dir); return meta;
    }));
    assert.equal((await readCurrentGeneration(root)).generationId, first.generationId);
  }
  assert.equal((await readdir(join(root, 'generations'))).length, 1);
  assert.equal((await readdir(join(root, '.staging'))).length, 0);
});

test('readers retain the previous generation while another writer stages; overlapping writer fails', async t => {
  const root = await tempRoot(t);
  const first = await publishGeneration(root, writeFixture);
  const staged = Promise.withResolvers(), release = Promise.withResolvers();
  const writer = publishGeneration(root, async (dir, id) => {
    const metadata = await writeFixture(dir, id); staged.resolve(); await release.promise; return metadata;
  });
  await staged.promise;
  try {
    assert.equal((await readCurrentGeneration(root)).generationId, first.generationId);
    await assert.rejects(publishGeneration(root, writeFixture), /already locked/);
  } finally { release.resolve(); }
  const second = await writer;
  assert.equal((await readCurrentGeneration(root)).generationId, second.generationId);
});

test('an initial failed generation leaves readiness unavailable', async t => {
  const root = await tempRoot(t);
  await assert.rejects(publishGeneration(root, async () => { throw new Error('offline'); }));
  await assert.rejects(readCurrentGeneration(root));
});
