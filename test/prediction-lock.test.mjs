import assert from "node:assert/strict";
import test from "node:test";
import { withPredictionGenerationLock } from "../src/prediction-lock.mjs";

function fakeClient(acquired = true) {
  const queries = [];
  return {
    queries,
    connected: false,
    ended: false,
    async connect() { this.connected = true; },
    async end() { this.ended = true; },
    async query(text) {
      queries.push(text);
      if (text.startsWith("SELECT pg_try_advisory_xact_lock")) return { rows: [{ acquired }] };
      return { rows: [] };
    },
  };
}

test("el lock de PostgreSQL executa i valida la publicació dins la transacció", async () => {
  const client = fakeClient();
  let probes = 0;
  const result = await withPredictionGenerationLock(async (assertHeld) => {
    await assertHeld();
    probes += 1;
    return "published";
  }, { client });

  assert.deepEqual(result, { acquired: true, value: "published" });
  assert.equal(probes, 1);
  assert.deepEqual(client.queries.map(query => query.split(" ")[0]), ["BEGIN", "SELECT", "SELECT", "COMMIT"]);
  assert.equal(client.ended, true);
});

test("una segona generació acaba correctament sense executar el scorer", async () => {
  const client = fakeClient(false);
  let ran = false;
  const result = await withPredictionGenerationLock(async () => { ran = true; }, { client });

  assert.deepEqual(result, { acquired: false });
  assert.equal(ran, false);
  assert.deepEqual(client.queries.map(query => query.split(" ")[0]), ["BEGIN", "SELECT", "ROLLBACK"]);
  assert.equal(client.ended, true);
});

test("un error allibera el lock transaccional i conserva l’error original", async () => {
  const client = fakeClient();
  await assert.rejects(
    withPredictionGenerationLock(async () => { throw new Error("weather unavailable"); }, { client }),
    /weather unavailable/,
  );
  assert.equal(client.queries.at(-1), "ROLLBACK");
  assert.equal(client.ended, true);
});
