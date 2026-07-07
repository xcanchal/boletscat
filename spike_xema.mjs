#!/usr/bin/env node
/**
 * Spike XEMA / Socrata — verifica que podem xuclar pluja de la XEMA i sumar-la a diari.
 *
 * No necessita cap 'npm install': Node 18+ ja porta fetch de sèrie.
 * Executa:  node spike_xema.mjs
 *           node spike_xema.mjs C6      (per forçar una estació concreta)
 *
 * Què fa, i què has de mirar:
 *   ① Descobreix el codi de la variable de PRECIPITACIÓ (no l'endevinem).
 *   ② Baixa una fila de mostra i IMPRIMEIX els noms reals de columnes.
 *   ③ Baixa 30 dies de pluja d'UNA estació, ho suma a diari, i calcula
 *      l'índex de humitat ponderat (API = Σ k^i · pluja_fa_i_dies).
 *
 * Si ③ imprimeix totals diaris i un índex → llum verda. Si peta, el missatge
 * et diu quin camp ajustar.
 */

const BASE = "https://analisi.transparenciacatalunya.cat/resource";
const DS_MESURES   = `${BASE}/nzvn-apee.json`; // mesures semihoràries de la XEMA
const DS_VARIABLES = `${BASE}/4fb2-n3yi.json`; // metadades de variables
const DS_ESTACIONS = `${BASE}/yqwd-vj5e.json`; // metadades d'estacions (lat/lon/altitud)

const DIES = 30;   // finestra que baixem
const K = 0.9;     // decaïment diari de l'índex de humitat

/** GET a la SODA API amb paràmetres $ (SoQL). Torna un array d'objectes. */
async function soda(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} a ${url}`);
  return res.json();
}

/** Troba el nom real d'una columna provant candidats i, si no, per substring. */
function findKey(row, ...candidates) {
  for (const c of candidates) if (c in row) return c;
  for (const k of Object.keys(row))
    for (const c of candidates)
      if (k.replace(/_/g, "").toLowerCase().includes(c.replace(/_/g, "")))
        return k;
  return null;
}

async function main() {
  // ── ① codi de la variable de precipitació ──────────────────────────────
  console.log("① Buscant el codi de la variable de precipitació...");
  const variables = await soda(DS_VARIABLES, { $limit: 200 });
  const vNom  = findKey(variables[0], "nom", "acronim");
  const vCodi = findKey(variables[0], "codi_variable", "codi");
  // Aquest dataset guarda acrònims (PPT) i noms llargs en columnes diferents,
  // així que busquem a TOTS els camps: acrònim 'PPT' o nom que contingui 'precipitaci'.
  const precip = variables.filter((v) =>
    Object.values(v).some((val) => {
      const s = String(val);
      return s.toUpperCase() === "PPT" || s.toLowerCase().includes("precipitaci");
    })
  );
  if (precip.length === 0) {
    console.log("  ⚠ Cap variable amb 'precipitaci' al nom. Mostra:");
    variables.slice(0, 15).forEach((v) => console.log("   ", v[vCodi], "→", v[vNom]));
    process.exit(1);
  }
  const codiPrecip = precip[0][vCodi];
  console.log(`  ✓ Precipitació = codi ${codiPrecip} (${precip[0][vNom]})\n`);

  // ── ② mostra de dades + noms reals de columnes ─────────────────────────
  console.log("② Mostra de la taula de mesures (mira els noms de columnes):");
  const sample = await soda(DS_MESURES, { $limit: 1 });
  if (sample.length === 0) { console.log("  ⚠ La taula no ha tornat res."); process.exit(1); }
  const row = sample[0];
  for (const [k, v] of Object.entries(row)) console.log(`    ${k.padEnd(20)} = ${v}`);
  const kEstacio  = findKey(row, "codi_estacio", "codi_esta");
  const kVariable = findKey(row, "codi_variable", "codi_var");
  const kData     = findKey(row, "data_lectura", "data");
  const kValor    = findKey(row, "valor", "valor_lectura");
  console.log(`\n  Columnes detectades → estació=${kEstacio}  variable=${kVariable}  ` +
              `data=${kData}  valor=${kValor}\n`);
  if (![kEstacio, kVariable, kData, kValor].every(Boolean)) {
    console.log("  ⚠ No he detectat totes les columnes. Ajusta findKey() amb els noms de dalt.");
    process.exit(1);
  }

  // ── ③ 30 dies de pluja d'una estació → suma diària + índex ─────────────
  // Si no passes cap codi, buscem sola l'estació amb més pluja recent
  // (i t'imprimim codis reals que pots reutilitzar).
  let estacio = process.argv[2];
  if (!estacio) {
    const desde4 = new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 19);
    const recents = await soda(DS_MESURES, {
      $where: `${kVariable}='${codiPrecip}' AND ${kData} >= '${desde4}'`,
      $limit: 8000,
      $order: `${kData} DESC`,
    });
    const suma = new Map();
    for (const r of recents) {
      const mm = parseFloat(r[kValor]);
      if (!Number.isNaN(mm)) suma.set(r[kEstacio], (suma.get(r[kEstacio]) ?? 0) + mm);
    }
    const ranking = [...suma.entries()].sort((a, b) => b[1] - a[1]);
    if (ranking.length) {
      console.log("  Estacions amb més pluja aquests últims dies (codi → mm):");
      ranking.slice(0, 8).forEach(([c, mm]) => console.log(`    ${c}  ${mm.toFixed(1)}`));
      estacio = ranking[0][0];
    } else {
      estacio = row[kEstacio]; // cap pluja enlloc: faig servir la de mostra
    }
    console.log(`  → faig servir l'estació ${estacio}\n`);
  }
  const desde = new Date(Date.now() - DIES * 864e5).toISOString().slice(0, 19);
  console.log(`③ Baixant ${DIES} dies de pluja de l'estació ${estacio} (des de ${desde})...`);

  const files = await soda(DS_MESURES, {
    $where: `${kEstacio}='${estacio}' AND ${kVariable}='${codiPrecip}' AND ${kData} >= '${desde}'`,
    $limit: 5000,
    $order: kData,
  });
  if (files.length === 0) {
    console.log("  ⚠ Cap fila. Prova una altra estació: node spike_xema.mjs <codi>");
    console.log("  (o potser la pluja viu en un dataset diari germà — caldria comprovar-ho)");
    process.exit(1);
  }

  // sumar semihoràries → diari
  const perDia = new Map();
  for (const f of files) {
    const dia = String(f[kData]).slice(0, 10);
    const mm = parseFloat(f[kValor]);
    if (!Number.isNaN(mm)) perDia.set(dia, (perDia.get(dia) ?? 0) + mm);
  }

  console.log(`  ✓ ${files.length} lectures → ${perDia.size} dies amb dada\n`);
  console.log("  Pluja diària (mm):");
  for (const dia of [...perDia.keys()].sort())
    console.log(`    ${dia}  ${perDia.get(dia).toFixed(1).padStart(6)}`);

  // índex de humitat ponderat: la pluja recent pesa més
  const avui = new Date();
  let api = 0;
  for (const [dia, mm] of perDia) {
    const d = Math.round((avui - new Date(dia)) / 864e5);
    if (d >= 0 && d < DIES) api += K ** d * mm;
  }
  console.log(`\n  ★ Índex de humitat ponderat (k=${K}): ${api.toFixed(1)}`);
  console.log("    (aquest és, literalment, el número que alimentarà el score)\n");
  console.log("LLUM VERDA si has arribat fins aquí amb totals diaris i un índex.");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
