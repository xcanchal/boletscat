const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const CONDITION_RATINGS = [
  { min:0.8, key:"very-high", nivell:"Molt alta", recomanacio:"Ves-hi" },
  { min:0.4, key:"high",      nivell:"Alta",      recomanacio:"Bona opció" },
  { min:0.25,key:"medium",    nivell:"Mitjana",   recomanacio:"Pots provar" },
  { min:0.1, key:"low",       nivell:"Baixa",     recomanacio:"No compensa" },
  { min:0,   key:"very-low",  nivell:"Molt baixa",recomanacio:"No hi vagis" },
];

const isKnown = (value) => value !== null && value !== undefined && value !== "" && value !== 0;

export function hasCompleteEnvironmentalData(data = {}) {
  const forestKnown = isKnown(data.forestStructure) || Number.isFinite(data.forestFrac);
  return isKnown(data.host) && isKnown(data.substrate) && forestKnown;
}

// Un índex alt amb una dada ambiental crítica absent continua sent útil per
// ordenar zones, però no justifica la màxima categoria de confiança.
export function capConditionScore(score, data = {}) {
  const normalized = clamp01(score);
  return hasCompleteEnvironmentalData(data) ? normalized : Math.min(normalized, 0.79);
}

// Categoria d'un score que ja és definitiu, és a dir que ja ha passat per
// capConditionScore. Tornar a aplicar-hi el límit de confiança el degradaria
// dues vegades i faria inabastable la categoria màxima.
export function scoreRating(score) {
  const value = clamp01(score);
  return CONDITION_RATINGS.find((item) => value >= item.min) ?? CONDITION_RATINGS.at(-1);
}

export function conditionRating(dataOrScore) {
  const data = typeof dataOrScore === "object" && dataOrScore !== null
    ? dataOrScore
    : { score:dataOrScore };
  const rating = scoreRating(data.score);
  if (rating.key !== "very-high" || hasCompleteEnvironmentalData(data)) return rating;
  return CONDITION_RATINGS.find((item) => item.key === "high");
}
