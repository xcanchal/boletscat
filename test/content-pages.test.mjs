import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderDirectoryPage, renderRobots, renderSeasonPage, renderSitemap, renderSpeciesPage } from "../scripts/generate-content.mjs";

const catalog = JSON.parse(await readFile(new URL("../content/catalog.json", import.meta.url), "utf8"));
const landing = await readFile(new URL("../index.html", import.meta.url), "utf8");
const contentCss = await readFile(new URL("../content/content.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("una predicció absent no conserva les dades ni la capa de l’espècie anterior", () => {
  assert.match(app, /async function load\(species,\{preserveView=false\}=\{\}\) \{[\s\S]*?renderSpeciesInfo\(species\);/);
  assert.match(app, /catch\(error\) \{[\s\S]*?hidePredictionLayers\(\);[\s\S]*?speciesLabel\(species\)/);
  assert.match(app, /function hidePredictionLayers\(\) \{[\s\S]*?\['prediccio','cobertura'\]/);
});

test("la PWA actualitza les prediccions quan torna a primer pla", () => {
  assert.match(app, /fetch\(dataUrl\(`bolets\.\$\{species\}\.geojson`\), \{ cache:'no-store', credentials:'include' \}\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', refreshPredictionOnReturn\)/);
  assert.match(app, /window\.addEventListener\('focus', refreshPredictionOnReturn\)/);
  assert.match(app, /window\.addEventListener\('pageshow'/);
  assert.match(app, /geo\.generated \?\? 'latest'\}-\$\{Date\.now\(\)\}/);
});

test("el header mòbil manté el mapa com a acció principal", () => {
  const guide = renderDirectoryPage(catalog);
  for (const html of [landing, guide]) {
    assert.match(html, /nav-label-short">Guia/);
    assert.match(html, /nav-label-short">Mapa/);
  }
  assert.match(landing, /header \.button\{display:inline-flex/);
  assert.match(contentCss, /\.site-header \.button\{display:inline-flex/);
  assert.doesNotMatch(landing, /header \.button\{display:none/);
  assert.doesNotMatch(contentCss, /\.site-header \.button\{display:none/);
});

test("el directori agrupa les espècies i enllaça totes les fitxes", () => {
  const html = renderDirectoryPage(catalog);
  assert.equal(catalog.species.length, 23);
  for (const species of catalog.species) {
    assert.ok(html.includes(species.names.ca));
    assert.ok(html.includes(`href="/bolets/${species.slug}/"`));
  }
  assert.match(html, />Comestibles</);
  assert.match(html, />No comestibles i tòxics</);
  assert.doesNotMatch(html, /Guia de bolets · Catalunya/);
  assert.doesNotMatch(html, /Espècies apreciades a la cuina/);
  assert.match(html, />Mortal</);
  assert.match(html, /id="speciesSearch"/);
  assert.match(html, /id="qualityFilter"/);
  assert.match(html, /id="monthFilter"/);
  assert.match(html, /data-quality="excellent"/);
  assert.match(html, /class="card-season"/);
  const seasonalDirectorySpecies = catalog.species.filter((species) => ["edible", "conditional"].includes(species.edibility.category));
  assert.equal((html.match(/class="mini-months"/g) || []).length, seasonalDirectorySpecies.length);
  const toxicCard = html.match(/href="\/bolets\/girgola-olivera\/"[\s\S]*?<\/a>/)?.[0] || "";
  assert.doesNotMatch(toxicCard, /card-season/);
  assert.match(html, /rossinyol-ai\.webp/);
  assert.match(html, /cep-ai\.webp/);
  assert.match(html, /rovello-ai\.webp/);
  assert.match(html, /llenega-ai\.webp/);
  assert.match(html, /llenega-blanca-ai\.webp/);
  assert.match(html, /Llenega negra/);
  assert.match(html, /Llenega blanca/);
  assert.doesNotMatch(html, />Pebràs</);
  assert.match(html, /trompeta-de-la-mort-ai\.webp/);
  assert.match(html, /camagroc-ai\.webp/);
  assert.match(html, /murgola-ai\.webp/);
  assert.match(html, /ou-de-reig-ai\.webp/);
  assert.match(html, /fredolic-ai\.webp/);
  assert.match(html, /apagallums-ai\.webp/);
  assert.match(html, /reig-bord-ai\.webp/);
  assert.match(html, /farinera-borda-ai\.webp/);
  assert.match(html, /moixerno-ai\.webp/);
  assert.match(html, /xampinyo-silvestre-ai\.webp/);
  assert.match(html, /mataparent-ai\.webp/);
  assert.match(html, /carlet-ai\.webp/);
  assert.match(html, /girgola-olivera-ai\.webp/);
  assert.match(html, /xampinyo-groguenc-ai\.webp/);
  assert.match(html, /directory\.js/);
  assert.match(html, /name="robots" content="index,follow"/);
});

test("el calendari mostra dotze mesos només per a espècies comestibles o condicionals", () => {
  const html = renderSeasonPage(catalog);
  const seasonalSpecies = catalog.species.filter((species) => ["edible", "conditional"].includes(species.edibility.category));
  for (const species of seasonalSpecies) {
    assert.ok(html.includes(species.names.ca));
    assert.ok(html.includes(`href="/bolets/${species.slug}/"`));
  }
  for (const species of catalog.species.filter((species) => !seasonalSpecies.includes(species))) {
    assert.doesNotMatch(html, new RegExp(`href="/bolets/${species.slug}/"`));
  }
  assert.equal((html.match(/class="month-cell(?: on)?"/g) || []).length, seasonalSpecies.length * 12);
  assert.match(html, /aria-current="page">Calendari/);
  assert.doesNotMatch(html, /Calendari orientatiu · Catalunya/);
  assert.doesNotMatch(html, /Tot l’any/);
  assert.match(html, /Calendari informatiu/);
  assert.match(html, /name="robots" content="index,follow"/);
});

test("la fitxa inclou temporada, fonts, avís i CTA premium", () => {
  const rossinyol = catalog.species.find((species) => species.slug === "rossinyol");
  const html = renderSpeciesPage(rossinyol, catalog);
  assert.match(html, /Cantharellus cibarius/);
  assert.doesNotMatch(html, /class="breadcrumb"/);
  assert.match(html, /Mesos habituals/);
  assert.match(html, /No consumeixis cap bolet/);
  assert.match(html, /Consulta el mapa d’avui/);
  assert.match(html, /Societat Catalana de Micologia/);
  assert.match(html, /class="species-hero has-photo"/);
  assert.match(html, /No el confonguis amb/);
  assert.match(html, /Gírgola d’olivera/);
  assert.match(html, /class="lookalike-photo"><img src="\/media\/bolets\/girgola-olivera-ai\.webp"/);
  assert.match(html, /Com preparar-lo/);
  assert.match(html, /Valoració culinària/);
  assert.match(html, /name="robots" content="index,follow"/);
  assert.match(html, /datePublished/);
  assert.doesNotMatch(html, /Fitxa pilot|generada amb IA/);
});

test("les fitxes publicades apareixen al sitemap i robots el declara", () => {
  const sitemap = renderSitemap(catalog);
  const publishedSpecies = catalog.species.filter((species) => species.publication.status === "published");
  assert.match(renderRobots(), /Sitemap: https:\/\/boletada\.cat\/sitemap\.xml/);
  assert.match(renderRobots(), /Disallow: \/app\//);
  assert.equal((sitemap.match(/<loc>/g) || []).length, publishedSpecies.length + 4);
  assert.match(sitemap, /<loc>https:\/\/boletada\.cat\/bones-practiques\/<\/loc><lastmod>2026-09-02<\/lastmod>/);
  for (const species of publishedSpecies) {
    assert.match(sitemap, new RegExp(`<loc>https://boletada\\.cat/bolets/${species.slug}/</loc>`));
    assert.match(sitemap, new RegExp(`<lastmod>${species.publication.reviewedAt}</lastmod>`));
  }
});

test("una espècie fora del predictor conserva la fitxa però no promet predicció pròpia", () => {
  const apagallums = catalog.species.find((species) => species.slug === "apagallums");
  const html = renderSpeciesPage(apagallums, catalog);
  assert.match(html, /Macrolepiota procera/);
  assert.match(html, /Mapa de predicció/);
  assert.match(html, /espècies disponibles al predictor/);
  assert.doesNotMatch(html, /condicions actuals de l’apagallums/);
});

test("l’ou de reig i el fredolic tenen predicció pròpia", () => {
  for (const slug of ["ou-de-reig", "fredolic"]) {
    const species = catalog.species.find((entry) => entry.slug === slug);
    const html = renderSpeciesPage(species, catalog);
    assert.match(html, /Predicció d’avui/);
    assert.match(html, new RegExp(`condicions actuals (?:de l’|del )${species.names.ca.toLowerCase()}`));
  }
});

test("la fitxa de l’ou de reig contrau correctament l’article", () => {
  const ouDeReig = catalog.species.find((species) => species.slug === "ou-de-reig");
  const html = renderSpeciesPage(ouDeReig, catalog);
  assert.match(html, /L’ou de reig creix/);
  assert.match(html, /condicions actuals de l’ou de reig/);
});

test("les fitxes femenines utilitzen l’article català correcte", () => {
  const llenega = catalog.species.find((species) => species.slug === "llenega-negra");
  const html = renderSpeciesPage(llenega, catalog);
  assert.match(html, /La llenega negra creix/);
  assert.match(html, /condicions actuals de la llenega negra/);
});

test("les fitxes tòxiques mostren el nivell de risc i un avís específic", () => {
  const farinera = catalog.species.find((species) => species.slug === "farinera-borda");
  const html = renderSpeciesPage(farinera, catalog);
  assert.match(html, />Mortal</);
  assert.match(html, /És una espècie mortal/);
  assert.match(html, /Canal Salut/);
});
