import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';
import { publishGeneration } from '../src/prediction-generations.mjs';
import { tempRoot, writeFixture } from './helpers/generation-fixture.mjs';

const execFileAsync = promisify(execFile);

const checkActiveGeneration = root => execFileAsync(
  process.execPath,
  ['scripts/check-active-predictions.mjs'],
  { cwd: process.cwd(), env: { ...process.env, PREDICTION_DIR: root } },
);

test('startup check rejects an empty prediction volume', async t => {
  const root = await tempRoot(t);
  await assert.rejects(checkActiveGeneration(root), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /No hi ha cap generació activa vàlida/);
    return true;
  });
});

test('startup check accepts and reports the active generation', async t => {
  const root = await tempRoot(t);
  const manifest = await publishGeneration(root, writeFixture);
  const { stdout } = await checkActiveGeneration(root);
  assert.match(stdout, new RegExp(`${manifest.generationId}.*${manifest.referenceDate}`));
});
