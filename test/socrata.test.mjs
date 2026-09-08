import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchJsonWithRetry, splitUtcDailyWindows } from '../src/socrata.mjs';

test('daily windows are aligned, bounded and do not overlap', () => {
  assert.deepEqual(splitUtcDailyWindows('2026-07-10T12:34:56','2026-07-28T18:00:00',8),[
    {fromISO:'2026-07-10T00:00:00',toISO:'2026-07-18T00:00:00',endOperator:'<'},
    {fromISO:'2026-07-18T00:00:00',toISO:'2026-07-26T00:00:00',endOperator:'<'},
    {fromISO:'2026-07-26T00:00:00',toISO:'2026-07-28T18:00:00',endOperator:'<='},
  ]);
});

test('JSON fetch retries transient failures with exponential delays', async () => {
  let calls=0;
  const delays=[];
  const result=await fetchJsonWithRetry('https://example.test/data',{
    fetchImpl:async()=>++calls<3?new Response('busy',{status:503}):Response.json({ok:true}),
    attempts:3,
    sleep:async delay=>delays.push(delay),
  });
  assert.deepEqual(result,{ok:true});
  assert.equal(calls,3);
  assert.deepEqual(delays,[500,1000]);
});

test('JSON fetch does not retry non-retriable client errors', async () => {
  let calls=0;
  await assert.rejects(fetchJsonWithRetry('https://example.test/data',{
    fetchImpl:async()=>{calls++;return new Response('bad query',{status:400})},
    sleep:async()=>{},
  }),/HTTP 400/);
  assert.equal(calls,1);
});
