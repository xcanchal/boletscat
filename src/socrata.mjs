const DAY_MS = 86_400_000;

const parseUtc = value => {
  const text = String(value);
  const timestamp = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return timestamp;
};

const isoSeconds = timestamp => new Date(timestamp).toISOString().slice(0, 19);

export function splitUtcDailyWindows(fromISO, toISO, chunkDays = 8) {
  if (!Number.isInteger(chunkDays) || chunkDays < 1) throw new Error('chunkDays must be a positive integer');
  const from = parseUtc(`${String(fromISO).slice(0, 10)}T00:00:00`);
  const to = parseUtc(toISO);
  if (from > to) throw new Error('fromISO must not be after toISO');

  const windows = [];
  for (let start = from; start <= to;) {
    const boundary = Math.min(start + chunkDays * DAY_MS, to);
    const final = boundary === to;
    windows.push({
      fromISO: isoSeconds(start),
      toISO: isoSeconds(boundary),
      endOperator: final ? '<=' : '<',
    });
    if (final) break;
    start = boundary;
  }
  return windows;
}

export async function fetchJsonWithRetry(target, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  attempts = 3,
  retryDelayMs = 500,
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(target, { headers:{ Accept:'application/json' }, signal:controller.signal });
      if (response.ok) return response.json();
      const error = new Error(`HTTP ${response.status} — ${await response.text()}`);
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (/^HTTP 4(?!29)/.test(String(error.message))) throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts) await sleep(retryDelayMs * 2 ** (attempt - 1));
  }
  throw new Error(`Meteocat unavailable after ${attempts} attempts: ${lastError?.message ?? 'unknown error'}`);
}
