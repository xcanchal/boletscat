// Browser-safe: no server config, filesystem or credentials embedded here.
const generationPattern = /^g-[a-f0-9-]{36}$/;
const apiUrl = (base, path) => base === '.' ? `/api/predictions/${path}` : new URL(`api/predictions/${path}`, base).href;

async function response(fetchImpl, url) {
  const result = await fetchImpl(url, { cache: 'no-store', credentials: 'include' });
  if (!result.ok) {
    const error = new Error(`Prediction request failed (${result.status})`);
    error.status = result.status;
    throw error;
  }
  return result;
}

export async function openPredictionSnapshot(base = '.', fetchImpl = fetch) {
  const manifest = await (await response(fetchImpl, apiUrl(base, 'current.json'))).json();
  if (manifest.schemaVersion !== 1 || !generationPattern.test(manifest.generationId) || !manifest.files) {
    throw new Error('Invalid prediction manifest');
  }
  return manifest;
}

async function loadSnapshot(base, snapshot, fetchImpl, load) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const manifest = snapshot ?? await openPredictionSnapshot(base, fetchImpl);
    const read = async (name, kind) => {
      if (!Object.hasOwn(manifest.files, name)) throw new Error(`Asset missing from manifest: ${name}`);
      const result = await response(fetchImpl, apiUrl(base, `generations/${manifest.generationId}/${encodeURIComponent(name)}`));
      return kind === 'blob' ? result.blob() : result.json();
    };
    try { return { snapshot: manifest, ...await load(read, manifest) }; }
    catch (error) {
      // A deployment without retained storage may remove the previous generation.
      // Retry the ENTIRE bundle once, never a single asset against a new manifest.
      if (error.status !== 410 || attempt) throw error;
      snapshot = null;
    }
  }
}

export function loadSpeciesFiles(base, species, { snapshot = null, fetchImpl = fetch } = {}) {
  if (!/^[a-z0-9_-]+$/.test(species)) throw new Error('Invalid species');
  return loadSnapshot(base, snapshot, fetchImpl, async (read, manifest) => {
    const [geo, grid, pixels, terrain, weather, forest] = await Promise.all([
      read(`bolets.${species}.geojson`), read('bolets.grid.json'),
      ...[`bolets.${species}.png`, 'bolets.terrain.png', 'bolets.weather.png', 'bolets.forest.png'].map(name => read(name, 'blob')),
    ]);
    if (geo.generationId !== manifest.generationId || geo.generated !== manifest.referenceDate || geo.species !== species) {
      throw new Error('Inconsistent prediction generation');
    }
    return { geo, grid, images: { pixels, terrain, weather, forest } };
  });
}

export function loadDiscoveryFiles(base, { snapshot = null, fetchImpl = fetch } = {}) {
  return loadSnapshot(base, snapshot, fetchImpl, async (read, manifest) => {
    const discovery = await read('bolets.discovery.json');
    if (discovery.generationId !== manifest.generationId || discovery.generated !== manifest.referenceDate) {
      throw new Error('Inconsistent discovery generation');
    }
    return { discovery };
  });
}
