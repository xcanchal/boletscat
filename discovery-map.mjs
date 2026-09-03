import { projectedPixelAtLngLat } from "./raster-projection.mjs";

export const DISCOVERY_MIN_SCORE = 0.25;

export function predictionScoreFromAlpha(alpha) {
  return alpha <= 35 ? 0 : Math.max(0, Math.min(1, (alpha - 105) / 125));
}

export function predictionScoreAt(raster, lngLat) {
  if (!raster?.pixels || !raster?.projection) return null;
  const displayed = projectedPixelAtLngLat(raster.projection, lngLat.lng, lngLat.lat);
  if (!displayed) return null;
  const sourceIndex = raster.projection.sourceIndices[displayed.index];
  if (sourceIndex < 0) return null;
  const alpha = raster.pixels[sourceIndex * 4 + 3];
  if (!alpha) return null;
  return predictionScoreFromAlpha(alpha);
}

export function maximumPredictionScore(raster) {
  if (!raster?.pixels) return 0;
  let maximum = 0;
  for (let index = 3; index < raster.pixels.length; index += 4) {
    maximum = Math.max(maximum, predictionScoreFromAlpha(raster.pixels[index]));
  }
  return maximum;
}

export function dominantPredictionAt(entries, lngLat) {
  let dominant = null;
  for (const entry of entries) {
    const score = predictionScoreAt(entry.raster, lngLat);
    if (score == null || dominant && score <= dominant.score) continue;
    dominant = { ...entry, score, lngLat };
  }
  return dominant;
}

function distanceKm(a, b) {
  const radians = Math.PI / 180;
  const lat1 = a.lat * radians;
  const lat2 = b.lat * radians;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function selectDiscoveryPoints(entries, grid, options = {}) {
  if (!entries?.length || !grid?.coordinates?.length) return [];
  const {
    minScore = DISCOVERY_MIN_SCORE,
    maxPoints = 18,
    maxPerSpecies = 4,
    minDistanceKm = 16,
    stepLat = 0.055,
    stepLng = 0.075,
  } = options;
  const lngs = grid.coordinates.map(([lng]) => lng);
  const lats = grid.coordinates.map(([, lat]) => lat);
  const bounds = {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
  const candidates = [];
  for (let lat = bounds.south + stepLat / 2; lat < bounds.north; lat += stepLat) {
    for (let lng = bounds.west + stepLng / 2; lng < bounds.east; lng += stepLng) {
      const dominant = dominantPredictionAt(entries, { lng, lat });
      if (dominant?.score >= minScore) candidates.push(dominant);
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const selected = [];
  const perSpecies = new Map();
  for (const candidate of candidates) {
    if (selected.length >= maxPoints) break;
    const count = perSpecies.get(candidate.species) ?? 0;
    if (count >= maxPerSpecies) continue;
    if (selected.some((point) => distanceKm(point.lngLat, candidate.lngLat) < minDistanceKm)) continue;
    selected.push(candidate);
    perSpecies.set(candidate.species, count + 1);
  }
  return selected;
}

export function summarizeDiscoverySpecies(entries, points, options = {}) {
  const { limit = 7 } = options;
  const bestVisibleScore = new Map();
  for (const point of points ?? []) {
    const previous = bestVisibleScore.get(point.species) ?? 0;
    if (point.score > previous) bestVisibleScore.set(point.species, point.score);
  }
  return (entries ?? [])
    .filter((entry) => bestVisibleScore.has(entry.species))
    .map((entry) => ({ ...entry, visibleScore:bestVisibleScore.get(entry.species) }))
    .sort((a, b) => b.visibleScore - a.visibleScore)
    .slice(0, limit);
}
