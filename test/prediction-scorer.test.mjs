import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRoot } from './helpers/generation-fixture.mjs';
import { readCurrentGeneration, validateGeneration } from '../src/prediction-generations.mjs';

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL('..', import.meta.url));

test('real scorer publishes all species and isolates single-species CLI runs', async t => {
  const root = await tempRoot(t);
  const grid = Buffer.alloc(24 + 4 * 5);
  grid.write('BGR3'); grid.writeUInt16LE(2, 4); grid.writeUInt16LE(2, 6);
  grid.writeInt32LE(400000, 8); grid.writeInt32LE(4599500, 12); grid.writeInt32LE(4600000, 16); grid.writeUInt16LE(250, 20);
  for (let i = 0; i < 4; i++) {
    const offset = 24 + i * 5;
    grid[offset] = 1; grid.writeInt16LE(1000, offset + 1); grid[offset + 3] = 1; grid[offset + 4] = 1;
  }
  const gridPath = join(root, 'fixture.bin'); await writeFile(gridPath, grid);
  const run = (...args) => exec(process.execPath, ['--import', './test/helpers/scorer-weather.mjs', './score_estacions.mjs',
    '--date=2026-09-05', ...args, `--grid=${gridPath}`], {
    cwd, env: { ...process.env, PREDICTION_DIR: root, TZ: 'UTC' }, timeout: 15_000,
  });
  const { stdout } = await run('--all');
  assert.match(stdout, /Published g-/);
  const manifest = await readCurrentGeneration(root);
  assert.equal(manifest.referenceDate, '2026-09-05');
  const directory = join(root, 'generations', manifest.generationId);
  await validateGeneration(directory, manifest.generationId, manifest.referenceDate);
  const before = await readFile(join(directory, 'bolets.rovello.png'));
  await run('--species=rovello');
  assert.equal((await readCurrentGeneration(root)).generationId, manifest.generationId);
  assert.deepEqual(await readFile(join(directory, 'bolets.rovello.png')), before);
  const [experiment] = await readdir(join(root, 'experiments'));
  // Identical meteorology/model/terrain produce identical pixels in both modes.
  assert.deepEqual(await readFile(join(root, 'experiments', experiment, 'bolets.rovello.png')), before);
  await assert.rejects(run('--all', '--grid=/nonexistent/boletada-test-grid.bin'));
  assert.equal((await readCurrentGeneration(root)).generationId, manifest.generationId);
});

test('inline app module remains valid JavaScript after load orchestration changes', async () => {
  const html = await readFile(join(cwd, 'app.html'), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, ['--input-type=module', '--check'], (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve());
    child.stdin.end(script);
  });
});
