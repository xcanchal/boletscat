// Selecció de les zones que representen la descoberta multiespècie. El càlcul
// viu al costat de l'scorer: la graella diària ja té el score de cada cel·la i
// de cada espècie, de manera que el client només ha de dibuixar el resultat.

export const DISCOVERY_MIN_SCORE = 0.25;
export const DISCOVERY_MAX_POINTS = 18;
export const DISCOVERY_MAX_PER_SPECIES = 4;
export const DISCOVERY_MIN_DISTANCE_M = 16000;
export const DISCOVERY_ZONE_M = 6000;

// Redueix la graella a un candidat per zona: la cel·la amb més probabilitat
// dins de cada bloc. Evita ordenar centenars de milers de cel·les i dona un
// punt realment representatiu en comptes d'una mostra arbitrària.
export function zoneMaxima(best, grid, options = {}) {
  const { zoneMeters = DISCOVERY_ZONE_M, minScore = DISCOVERY_MIN_SCORE } = options;
  const step = Math.max(1, Math.round(zoneMeters / grid.cell));
  const zones = new Map();
  for (let index = 0; index < best.score.length; index++) {
    const score = best.score[index];
    if (!(score >= minScore)) continue;
    const col = index % grid.width, row = (index / grid.width) | 0;
    const key = `${(row / step) | 0}:${(col / step) | 0}`;
    const current = zones.get(key);
    if (current && current.score >= score) continue;
    zones.set(key, {
      species: best.species[index],
      score,
      x: grid.x0 + (col + 0.5) * grid.cell,
      y: grid.y1 - (row + 0.5) * grid.cell,
    });
  }
  return [...zones.values()];
}

// Tria les zones amb més probabilitat mantenint-les separades i sense que una
// sola espècie ocupi tot el mapa. Les distàncies són en metres UTM: a l'escala
// de Catalunya la diferència amb la distància geodèsica és irrellevant.
export function selectDiscoveryPoints(candidates, options = {}) {
  const {
    maxPoints = DISCOVERY_MAX_POINTS,
    maxPerSpecies = DISCOVERY_MAX_PER_SPECIES,
    minDistanceMeters = DISCOVERY_MIN_DISTANCE_M,
  } = options;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected = [];
  const perSpecies = new Map();
  for (const candidate of sorted) {
    if (selected.length >= maxPoints) break;
    const count = perSpecies.get(candidate.species) ?? 0;
    if (count >= maxPerSpecies) continue;
    if (selected.some((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < minDistanceMeters)) continue;
    selected.push(candidate);
    perSpecies.set(candidate.species, count + 1);
  }
  return selected;
}

// La llista lateral només ha de mostrar espècies que tinguin icona al mapa,
// ordenades per la millor zona visible.
export function summarizeDiscoverySpecies(points, options = {}) {
  const { limit = 7 } = options;
  const best = new Map();
  for (const point of points ?? []) {
    const previous = best.get(point.species) ?? 0;
    if (point.score > previous) best.set(point.species, point.score);
  }
  return [...best.entries()]
    .map(([species, visibleScore]) => ({ species, visibleScore }))
    .sort((a, b) => b.visibleScore - a.visibleScore)
    .slice(0, limit);
}
