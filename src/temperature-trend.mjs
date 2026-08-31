const VALID_PREFERENCES = new Set(["cooling", "warming", "neutral"]);

/**
 * Ajust tèrmic deliberadament petit: la tendència pot reforçar o afeblir unes
 * condicions favorables, però mai actuar com una porta temporal.
 */
export function temperatureTrendFactor(deltaCelsius, preference = "neutral") {
  if (!VALID_PREFERENCES.has(preference)) {
    throw new TypeError(`Preferència tèrmica desconeguda: ${preference}`);
  }
  if (preference === "neutral" || deltaCelsius == null || Number.isNaN(deltaCelsius)) return 1;

  const alignedDelta = preference === "cooling" ? -deltaCelsius : deltaCelsius;
  const alignment = Math.max(-1, Math.min(1, alignedDelta / 3));
  return 0.95 + 0.05 * alignment;
}
