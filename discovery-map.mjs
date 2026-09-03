// Selecció de les zones que representen la descoberta multiespècie. El càlcul
// viu al costat de l'scorer: la graella diària ja té el score de cada cel·la i
// de cada espècie, de manera que el client només ha de dibuixar el resultat.

export const DISCOVERY_MIN_SCORE = 0.25;
export const DISCOVERY_MAX_POINTS = 18;
export const DISCOVERY_MAX_PER_SPECIES = 4;
export const DISCOVERY_MIN_DISTANCE_M = 16000;
export const DISCOVERY_ZONE_M = 6000;
// Una icona diu "vine aquí": ha de marcar una zona, no una cel·la solitària.
// El màxim d'una zona pot ser una clapa de 250 m envoltada de no-res —un bosquet
// perdut o un píxel mal classificat—, que al mapa per espècie no es veu i que a
// peu no és res. Exigim mig km² de terreny favorable de la mateixa espècie dins
// una finestra d'1,75 km de costat (uns 750 m al voltant de la candidata).
export const DISCOVERY_SUPPORT_RADIUS = 3;
export const DISCOVERY_MIN_SUPPORT = 8;

function hasSupport(best, grid, index, { minScore, supportRadius, minSupport }) {
  const species = best.species[index];
  const col = index % grid.width, row = (index / grid.width) | 0;
  const firstRow = Math.max(0, row - supportRadius), lastRow = Math.min(grid.height - 1, row + supportRadius);
  const firstCol = Math.max(0, col - supportRadius), lastCol = Math.min(grid.width - 1, col + supportRadius);
  let found = 0;
  for (let r = firstRow; r <= lastRow; r++) {
    for (let c = firstCol; c <= lastCol; c++) {
      const i = r * grid.width + c;
      if (best.species[i] === species && best.score[i] >= minScore && ++found >= minSupport) return true;
    }
  }
  return false;
}

// Redueix la graella a un candidat per zona: la cel·la amb més probabilitat
// dins de cada bloc. Evita ordenar centenars de milers de cel·les i dona un
// punt realment representatiu en comptes d'una mostra arbitrària.
export function zoneMaxima(best, grid, options = {}) {
  const {
    zoneMeters = DISCOVERY_ZONE_M,
    minScore = DISCOVERY_MIN_SCORE,
    supportRadius = DISCOVERY_SUPPORT_RADIUS,
    minSupport = DISCOVERY_MIN_SUPPORT,
  } = options;
  const step = Math.max(1, Math.round(zoneMeters / grid.cell));
  const zones = new Map();
  for (let index = 0; index < best.score.length; index++) {
    const score = best.score[index];
    if (!(score >= minScore)) continue;
    const col = index % grid.width, row = (index / grid.width) | 0;
    const key = `${(row / step) | 0}:${(col / step) | 0}`;
    const current = zones.get(key);
    if (current && current.score >= score) continue;
    // Només ho comprovem per a qui guanyaria la zona: si una cel·la aïllada no
    // passa, la zona conserva el millor candidat que sí que té suport.
    if (!hasSupport(best, grid, index, { minScore, supportRadius, minSupport })) continue;
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
