export const XEMA_EXPECTED_DAILY_OBSERVATIONS = 48;

const finite = value => typeof value === 'number' && Number.isFinite(value);

export function normalizeDailyAggregate(row, { unit, expectedObservationCount = XEMA_EXPECTED_DAILY_OBSERVATIONS } = {}) {
  const value = Number(row.value ?? row.v);
  const mean = Number(row.mean ?? row.value ?? row.v);
  const min = Number(row.min ?? row.value ?? row.v);
  const max = Number(row.max ?? row.value ?? row.v);
  const validObservationCount = Number.parseInt(row.n ?? '0', 10);
  const coverage = expectedObservationCount ? validObservationCount / expectedObservationCount : null;
  const valid = [value, mean, min, max].every(finite) && Number.isInteger(validObservationCount) && validObservationCount > 0;
  return {
    value: valid ? value : null,
    mean: valid ? mean : null,
    min: valid ? min : null,
    max: valid ? max : null,
    unit,
    validObservationCount: valid ? validObservationCount : 0,
    expectedObservationCount,
    coverage,
    latestValidObservationAt: valid && row.latest ? String(row.latest) : null,
    quality: !valid ? 'invalid' : coverage >= 0.9 ? 'complete' : 'partial',
    method: 'observed',
  };
}

export function indexDailyAggregates(rows, options) {
  const result = new Map();
  for (const row of rows) {
    const station = String(row.codi_estacio ?? '');
    const date = String(row.dia ?? '').slice(0, 10);
    if (!station || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!result.has(station)) result.set(station, new Map());
    result.get(station).set(date, normalizeDailyAggregate(row, options));
  }
  return result;
}

export function missingDailyAggregate(unit, expectedObservationCount = XEMA_EXPECTED_DAILY_OBSERVATIONS) {
  return {
    value:null, mean:null, min:null, max:null, unit,
    validObservationCount:0, expectedObservationCount, coverage:0,
    latestValidObservationAt:null, quality:'missing', method:'observed',
  };
}

export function latestObservation(rows) {
  const timestamps = rows.map(row => row.latest).filter(Boolean).map(String).sort();
  return timestamps.at(-1) ?? null;
}
