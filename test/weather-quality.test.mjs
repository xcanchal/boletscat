import assert from 'node:assert/strict';
import test from 'node:test';
import { indexDailyAggregates, latestObservation, missingDailyAggregate, normalizeDailyAggregate } from '../src/weather-quality.mjs';

test('daily aggregates retain coverage, units, freshness and measured zero', () => {
  const row = normalizeDailyAggregate({ value:'0', mean:'0', min:'0', max:'0', n:'48', latest:'2026-09-07T23:30:00.000' }, { unit:'mm' });
  assert.equal(row.value, 0);
  assert.equal(row.quality, 'complete');
  assert.equal(row.coverage, 1);
  assert.equal(row.latestValidObservationAt, '2026-09-07T23:30:00.000');
});

test('partial, invalid and missing observations remain distinguishable', () => {
  assert.equal(normalizeDailyAggregate({ value:'4', n:'20' }, { unit:'mm' }).quality, 'partial');
  assert.equal(normalizeDailyAggregate({ value:'nope', n:'48' }, { unit:'mm' }).quality, 'invalid');
  assert.equal(missingDailyAggregate('mm').quality, 'missing');
});

test('aggregates are indexed per station and date and expose latest source timestamp', () => {
  const rows = [
    { codi_estacio:'A', dia:'2026-09-06T00:00:00.000', value:'2', mean:'2', min:'0', max:'2', n:'48', latest:'2026-09-06T23:30:00.000' },
    { codi_estacio:'B', dia:'2026-09-07T00:00:00.000', value:'3', mean:'3', min:'0', max:'3', n:'48', latest:'2026-09-07T23:30:00.000' },
  ];
  assert.equal(indexDailyAggregates(rows, { unit:'mm' }).get('A').get('2026-09-06').value, 2);
  assert.equal(latestObservation(rows), '2026-09-07T23:30:00.000');
});
