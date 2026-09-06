// CLI preload for deterministic scoring tests. Unexpected network access fails.
globalThis.fetch = async url => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'analisi.transparenciacatalunya.cat') throw new Error('Unexpected test network request');
  if (parsed.pathname.endsWith('/yqwd-vj5e.json')) {
    return Response.json([{ codi_estacio: 'UI', nom_estacio: 'Fixture', latitud: 41.55, longitud: 1.8, altitud: 1000 }]);
  }
  if (!parsed.pathname.endsWith('/nzvn-apee.json')) throw new Error('Unexpected weather dataset');
  const rain = parsed.searchParams.get('$where').includes("codi_variable='35'");
  return Response.json(Array.from({ length: 14 }, (_, index) => ({
    codi_estacio: 'UI', dia: new Date(Date.UTC(2026, 8, 5 - index)).toISOString().slice(0, 10), v: rain ? 12 : 16,
  })));
};
