import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMoistureReserve, estimateDailyEt0, fao56Et0, hargreavesEt0, windAtTwoMetres } from '../src/moisture-model.mjs';

const station = { lat: 42, alt: 900 };
const observed = (value, extra = {}) => ({ value, coverage: 1, quality: 'complete', ...extra });
const weatherDay = (date, overrides = {}) => ({
  date,
  dayOfYear: 220,
  rain: observed(0),
  temperature: observed(18, { mean: 18, min: 11, max: 25 }),
  humidity: observed(60, { min: 35, max: 85 }),
  wind: observed(2),
  radiation: observed(210),
  ...overrides,
});

test('FAO-56 and Hargreaves estimates are finite and wind is normalized from 10 m to 2 m', () => {
  assert.ok(windAtTwoMetres(3) > 2 && windAtTwoMetres(3) < 3);
  assert.ok(fao56Et0({ latitude:42, altitude:900, dayOfYear:220, tMean:18, tMin:11, tMax:25,
    rhMin:35, rhMax:85, wind10m:2, solarMeanWm2:210 }) > 0);
  assert.ok(hargreavesEt0({ latitude:42, dayOfYear:220, tMean:18, tMin:11, tMax:25 }) > 0);
});

test('higher atmospheric drying demand depletes the same initial reserve faster', () => {
  const mild = Array.from({ length:10 }, (_, i) => weatherDay(`2026-08-${String(i + 1).padStart(2, '0')}`, {
    humidity: observed(85, { min:70, max:98 }), wind:observed(.5), radiation:observed(100),
  }));
  const dry = mild.map(day => ({ ...day,
    humidity:observed(35, { min:15, max:55 }), wind:observed(5), radiation:observed(300),
  }));
  assert.ok(calculateMoistureReserve(dry, station).reserveMm < calculateMoistureReserve(mild, station).reserveMm);
});

test('reserve is bounded, deterministic and cannot rise without rain', () => {
  const days = Array.from({ length:8 }, (_, i) => weatherDay(`2026-08-${String(i + 1).padStart(2, '0')}`));
  const dry = calculateMoistureReserve(days, station);
  assert.ok(dry.reserveMm <= 50);
  assert.deepEqual(calculateMoistureReserve(days, station), dry);
  const storm = calculateMoistureReserve(days.map(day => ({ ...day, rain:observed(200) })), station);
  assert.ok(storm.reserveMm <= 100);
  assert.ok(storm.overflowMm > 0);
});

test('missing optional inputs use documented Hargreaves fallback; missing rain stays insufficient', () => {
  const fallback = weatherDay('2026-08-01', { humidity:null, wind:null, radiation:null });
  assert.equal(estimateDailyEt0(fallback, station).method, 'hargreaves');
  const missingRain = weatherDay('2026-08-02', { rain:{ value:null, coverage:0, quality:'missing' } });
  const result = calculateMoistureReserve([fallback, missingRain], station);
  assert.equal(result.methods.hargreaves,1);
  assert.equal(result.methods['fao56-pm'],1);
  assert.equal(result.trajectory[1].quality, 'insufficient');
  assert.equal(result.trajectory[1].fallbackReason, 'rain_coverage');
});

test('a measured zero rainfall day is usable rather than mistaken for missing data', () => {
  const result = calculateMoistureReserve([weatherDay('2026-08-01')], station);
  assert.equal(result.trajectory[0].effectiveRainMm, 0);
  assert.notEqual(result.trajectory[0].quality, 'insufficient');
});
