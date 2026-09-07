const DAY_SECONDS = 86_400;
const SOLAR_MJ_PER_WATT_DAY = DAY_SECONDS / 1_000_000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const radians = degrees => degrees * Math.PI / 180;

export const DEFAULT_MOISTURE_PARAMETERS = Object.freeze({
  capacityMm: 100,
  initialReserveMm: 50,
  maxEffectiveRainMmPerDay: 30,
  forestEtCoefficient: 0.65,
  minimumCoverage: 0.8,
});

export function saturationVapourPressure(temperatureC) {
  return 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
}

export function extraterrestrialRadiation(latitude, dayOfYear) {
  const phi = radians(latitude);
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI / 365) * dayOfYear);
  const declination = 0.409 * Math.sin((2 * Math.PI / 365) * dayOfYear - 1.39);
  const sunset = Math.acos(clamp(-Math.tan(phi) * Math.tan(declination), -1, 1));
  return (24 * 60 / Math.PI) * 0.0820 * dr * (
    sunset * Math.sin(phi) * Math.sin(declination)
    + Math.cos(phi) * Math.cos(declination) * Math.sin(sunset)
  );
}

export function windAtTwoMetres(windAtTenMetres) {
  return windAtTenMetres * 4.87 / Math.log(67.8 * 10 - 5.42);
}

export function hargreavesEt0({ latitude, dayOfYear, tMean, tMin, tMax }) {
  if (![latitude, dayOfYear, tMean, tMin, tMax].every(finite) || tMax < tMin) return null;
  const ra = extraterrestrialRadiation(latitude, dayOfYear);
  return Math.max(0, 0.0023 * (tMean + 17.8) * Math.sqrt(tMax - tMin) * ra);
}

export function fao56Et0({ latitude, altitude = 0, dayOfYear, tMean, tMin, tMax,
  rhMin, rhMax, wind10m, solarMeanWm2 }) {
  if (![latitude, altitude, dayOfYear, tMean, tMin, tMax, rhMin, rhMax, wind10m, solarMeanWm2].every(finite)
    || tMax < tMin || rhMin < 0 || rhMax > 100 || rhMax < rhMin || wind10m < 0 || solarMeanWm2 < 0) return null;

  const esMin = saturationVapourPressure(tMin);
  const esMax = saturationVapourPressure(tMax);
  const es = (esMin + esMax) / 2;
  const ea = (esMin * rhMax / 100 + esMax * rhMin / 100) / 2;
  const delta = 4098 * saturationVapourPressure(tMean) / (tMean + 237.3) ** 2;
  const pressure = 101.3 * ((293 - 0.0065 * altitude) / 293) ** 5.26;
  const gamma = 0.000665 * pressure;
  const ra = extraterrestrialRadiation(latitude, dayOfYear);
  const rso = Math.max(0.001, (0.75 + 2e-5 * altitude) * ra);
  const rs = solarMeanWm2 * SOLAR_MJ_PER_WATT_DAY;
  const rns = 0.77 * rs;
  const sigma = 4.903e-9;
  const cloudiness = clamp(1.35 * Math.min(rs / rso, 1) - 0.35, 0.05, 1);
  const humidityTerm = Math.max(0.05, 0.34 - 0.14 * Math.sqrt(Math.max(0, ea)));
  const rnl = sigma * (((tMax + 273.16) ** 4 + (tMin + 273.16) ** 4) / 2) * humidityTerm * cloudiness;
  const rn = rns - rnl;
  const u2 = windAtTwoMetres(wind10m);
  const numerator = 0.408 * delta * rn + gamma * (900 / (tMean + 273)) * u2 * Math.max(0, es - ea);
  const denominator = delta + gamma * (1 + 0.34 * u2);
  return Math.max(0, numerator / denominator);
}

function usable(input, minimumCoverage) {
  return input && finite(input.value) && input.quality !== 'missing' && input.quality !== 'invalid'
    && (input.coverage == null || input.coverage >= minimumCoverage);
}

export function estimateDailyEt0(day, station, parameters = {}) {
  const config = { ...DEFAULT_MOISTURE_PARAMETERS, ...parameters };
  const common = {
    latitude: station.lat,
    altitude: station.alt ?? 0,
    dayOfYear: day.dayOfYear,
    tMean: day.temperature?.mean,
    tMin: day.temperature?.min,
    tMax: day.temperature?.max,
  };
  const completeTemperature = usable(day.temperature, config.minimumCoverage)
    && [common.tMean, common.tMin, common.tMax].every(finite);
  if (!completeTemperature) return { et0Mm: null, method: 'unavailable', fallbackReason: 'temperature_coverage' };

  if (usable(day.humidity, config.minimumCoverage) && usable(day.wind, config.minimumCoverage)
    && usable(day.radiation, config.minimumCoverage)) {
    const et0Mm = fao56Et0({
      ...common,
      rhMin: day.humidity.min,
      rhMax: day.humidity.max,
      wind10m: day.wind.value,
      solarMeanWm2: day.radiation.value,
    });
    if (finite(et0Mm)) return { et0Mm, method: 'fao56-pm', fallbackReason: null };
  }

  const et0Mm = hargreavesEt0(common);
  return finite(et0Mm)
    ? { et0Mm, method: 'hargreaves', fallbackReason: 'optional_inputs_coverage' }
    : { et0Mm: null, method: 'unavailable', fallbackReason: 'temperature_values' };
}

export function calculateMoistureReserve(days, station, parameters = {}) {
  const config = { ...DEFAULT_MOISTURE_PARAMETERS, ...parameters };
  let reserveMm = config.initialReserveMm;
  let overflowMm = 0;
  const methods = { 'fao56-pm': 0, hargreaves: 0, unavailable: 0 };
  const trajectory = [];

  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const drying = estimateDailyEt0(day, station, config);
    methods[drying.method]++;
    const rainUsable = usable(day.rain, config.minimumCoverage);
    if (!rainUsable || !finite(drying.et0Mm)) {
      trajectory.push({ date: day.date, reserveMm, effectiveRainMm: null, dryingMm: null,
        method: drying.method, quality: 'insufficient', fallbackReason: rainUsable ? drying.fallbackReason : 'rain_coverage' });
      continue;
    }
    const effectiveRainMm = clamp(day.rain.value, 0, config.maxEffectiveRainMmPerDay);
    const dryingMm = drying.et0Mm * config.forestEtCoefficient;
    const uncapped = reserveMm + effectiveRainMm - dryingMm;
    overflowMm += Math.max(0, uncapped - config.capacityMm);
    reserveMm = clamp(uncapped, 0, config.capacityMm);
    trajectory.push({ date: day.date, reserveMm, effectiveRainMm, dryingMm,
      method: drying.method, quality: drying.method === 'fao56-pm' ? 'complete' : 'estimated', fallbackReason: drying.fallbackReason });
  }

  const usableDays = trajectory.filter(day => day.quality !== 'insufficient').length;
  const coverage = trajectory.length ? usableDays / trajectory.length : 0;
  return {
    reserveMm,
    reserveIndex: reserveMm / config.capacityMm * 100,
    overflowMm,
    coverage,
    quality: coverage >= config.minimumCoverage ? 'usable' : 'insufficient',
    methods,
    trajectory,
    parameters: config,
  };
}
