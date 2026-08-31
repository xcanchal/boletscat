#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MONTHS = ["Gen", "Feb", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Des"];
const SOILS = { siliceous: "silícic o àcid", calcareous: "calcari", mixed: "mixt" };
const SITE_URL = "https://boletada.cat";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const logo = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 32C9.5 19 18 11 32 11s22.5 8 24 21H8Z" fill="#ec6c2c"/><path d="M25 31h14l3 21H22l3-21Z" fill="#e8e3d6"/><circle cx="23" cy="23" r="2" fill="#fac28c"/><circle cx="39" cy="19" r="2.5" fill="#fac28c"/></svg>`;

const nav = (current = "guide") => `<header class="site-header"><nav class="wrap site-nav" aria-label="Navegació principal"><a class="brand" href="/" aria-label="Boletada, inici">${logo}Boletada</a><div class="nav-links"><a href="/bolets/"${current === "guide" ? ' aria-current="page"' : ""}>Guia de bolets</a><a class="button" href="/app/">Accedeix al mapa <span aria-hidden="true">→</span></a></div></nav></header>`;

const guideSectionNav = (current) => `<nav class="guide-section-nav" aria-label="Seccions de la guia"><span>Explora</span><a href="/bolets/"${current === "species" ? ' aria-current="page"' : ""}>Espècies</a><a href="/temporada-de-bolets/"${current === "season" ? ' aria-current="page"' : ""}>Calendari</a></nav>`;

const footer = () => `<footer class="site-footer"><div class="wrap footer-row"><span>© 2026 Boletada</span><div class="footer-links"><a href="/legal/#avis-legal">Avís legal</a><a href="/legal/#privacitat">Privacitat</a><a href="/legal/#termes">Termes</a><a href="mailto:hola@boletada.cat">Contacte</a></div></div></footer>`;

const documentShell = ({ title, description, canonical, body, indexable = false, structuredData, ogImage = "https://boletada.cat/assets/brand/boletada-og-1200x630.png", navCurrent = "guide", scripts = [] }) => `<!doctype html>
<html lang="ca"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"/><meta name="theme-color" content="#10150f"/>
<meta name="robots" content="${indexable ? "index,follow" : "noindex,nofollow"}"/><link rel="canonical" href="${escapeHtml(canonical)}"/>
<meta property="og:type" content="website"/><meta property="og:locale" content="ca_ES"/><meta property="og:site_name" content="Boletada"/><meta property="og:title" content="${escapeHtml(title)}"/><meta property="og:description" content="${escapeHtml(description)}"/><meta property="og:url" content="${escapeHtml(canonical)}"/><meta property="og:image" content="${escapeHtml(ogImage)}"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600;700&family=Spectral:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet"/><link rel="stylesheet" href="/content/content.css?v=20260831-3"/>
${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll("<", "\\u003c")}</script>` : ""}${scripts.map((src) => `<script defer src="${escapeHtml(src)}"></script>`).join("")}</head><body><a class="skip" href="#contingut">Salta al contingut</a>${nav(navCurrent)}${body}${footer()}</body></html>`;

const habitatNamesFor = (species, catalog) => species.ecology.habitatSlugs
  .map((slug) => catalog.habitats.find((habitat) => habitat.slug === slug)?.name)
  .filter(Boolean);

const joinNatural = (items) => {
  if (items.length < 2) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} i ${items.at(-1)}`;
};

const startsWithVowelSound = (value) => /^[aeiouàèéíïòóúüh]/i.test(value);

const speciesReference = (species, preposition = "") => {
  const name = species.names.ca.toLocaleLowerCase("ca");
  if (startsWithVowelSound(name)) return `${preposition ? "de " : ""}l’${name}`;
  return `${preposition ? "del" : "el"} ${name}`;
};

const sentenceCase = (value) => `${value.charAt(0).toLocaleUpperCase("ca")}${value.slice(1)}`;

export const renderRobots = () => `User-agent: *
Allow: /
Disallow: /api/
Disallow: /app/

Sitemap: ${SITE_URL}/sitemap.xml
`;

export const renderSitemap = (catalog) => {
  const publishedSpecies = catalog.species.filter((species) => species.publication.status === "published");
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: "2026-08-31" },
    { loc: `${SITE_URL}/bolets/`, lastmod: "2026-08-31" },
    { loc: `${SITE_URL}/temporada-de-bolets/`, lastmod: "2026-08-31" },
    ...publishedSpecies.map((species) => ({
      loc: `${SITE_URL}/bolets/${species.slug}/`,
      lastmod: species.publication.reviewedAt,
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
};

export function renderDirectoryPage(catalog) {
  const qualityFor = (species) => ["toxic", "deadly", "not-edible"].includes(species.edibility.category)
    ? { key: species.edibility.category, label: species.edibility.label }
    : { key: species.culinary?.rating || "unrated", label: species.culinary?.label || species.edibility.label };
  const monthBand = (species) => MONTHS.map((month, index) => `<span class="${species.season.typicalMonths.includes(index + 1) ? "on" : ""}" title="${escapeHtml(month)}"><span class="sr-only">${escapeHtml(month)}: ${species.season.typicalMonths.includes(index + 1) ? "mes habitual" : "fora del període habitual"}</span></span>`).join("");
  const renderCard = (species) => {
    const cardImage = species.media?.card;
    const quality = qualityFor(species);
    const groupKey = ["edible", "conditional"].includes(species.edibility.category) ? "edible" : "unsafe";
    const qualityBadge = groupKey === "edible"
      ? `<span class="quality-badge ${escapeHtml(quality.key)}">${escapeHtml(quality.label)}</span>`
      : "";
    const searchText = [species.names.ca, species.names.scientific, ...(species.names.aliases || [])].join(" ").toLocaleLowerCase("ca");
    const media = cardImage
      ? `<figure class="card-visual"><img src="${escapeHtml(cardImage.src)}" alt="" width="1536" height="1024" loading="lazy" decoding="async"/></figure>`
      : "";
    const seasonBand = groupKey === "edible"
      ? `<div class="card-season" aria-label="Mesos habituals"><div class="mini-months">${monthBand(species)}</div><div class="mini-month-labels" aria-hidden="true"><span>Gen</span><span>Des</span></div></div>`
      : "";
    return `<a class="species-card available${cardImage ? " has-image" : ""}" href="/bolets/${escapeHtml(species.slug)}/" data-species-card data-group="${groupKey}" data-quality="${escapeHtml(quality.key)}" data-months="${species.season.typicalMonths.join(",")}" data-search="${escapeHtml(searchText)}">${media}<div class="card-copy"><div class="card-topline"><div class="card-badges"><span class="edibility-badge ${escapeHtml(species.edibility.category)}">${escapeHtml(species.edibility.label)}</span>${qualityBadge}</div><span class="card-arrow" aria-hidden="true">↗</span></div><h3>${escapeHtml(species.names.ca)}</h3><span class="scientific">${escapeHtml(species.names.scientific)}</span><p>${escapeHtml(species.summary)}</p></div>${seasonBand}</a>`;
  };

  const edibleSpecies = catalog.species.filter((species) => ["edible", "conditional"].includes(species.edibility.category));
  const unsafeSpecies = catalog.species.filter((species) => ["toxic", "deadly", "not-edible"].includes(species.edibility.category));
  const group = ({ key, title, species, tone = "" }) => `<section class="directory-group ${tone}" data-species-group="${key}"><div class="directory-group-head"><h2>${escapeHtml(title)}</h2><span class="sr-only" data-group-count>${species.length}</span></div><div class="species-grid">${species.map(renderCard).join("")}</div></section>`;

  const body = `<main id="contingut"><section class="guide-hero"><div class="wrap"><h1><em>Coneix el bolet</em> abans de buscar-lo.</h1><p>Temporada, boscos i sòls preferents de les espècies més conegudes de Catalunya.</p>${guideSectionNav("species")}</div></section><section class="directory"><div class="wrap"><form class="directory-toolbar" id="speciesFilters" role="search"><label class="search-field"><span class="sr-only">Cerca un bolet</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input type="search" id="speciesSearch" placeholder="Cerca per nom…" autocomplete="off"/></label><fieldset class="filter-chips"><legend>Comestibilitat</legend><label><input type="radio" name="group" value="all" checked/><span>Tots</span></label><label><input type="radio" name="group" value="edible"/><span>Comestibles</span></label><label><input type="radio" name="group" value="unsafe"/><span>No comestibles</span></label></fieldset><label class="select-filter"><span>Valoració</span><select id="qualityFilter"><option value="all">Totes</option><option value="excellent">Excel·lent</option><option value="good">Bo</option><option value="low">Interès baix</option><option value="not-edible">No comestible</option><option value="toxic">Tòxic</option><option value="deadly">Mortal</option></select></label><label class="select-filter"><span>Mes</span><select id="monthFilter"><option value="all">Tot l’any</option>${MONTHS.map((month, index) => `<option value="${index + 1}">${month}</option>`).join("")}</select></label><button class="clear-filters" id="clearFilters" type="button" hidden>Neteja</button><output class="result-count" id="resultCount" aria-live="polite">${catalog.species.length} fitxes</output></form>${group({ key: "edible", title: "Comestibles", species: edibleSpecies })}${group({ key: "unsafe", title: "No comestibles i tòxics", species: unsafeSpecies, tone: "risk-group" })}<div class="empty-directory" id="emptyDirectory" hidden><h2>Cap bolet coincideix amb els filtres.</h2><p>Prova un altre mes o una cerca més general.</p></div><p class="directory-safety">Aquesta guia és informativa i no permet identificar un bolet amb prou certesa per consumir-lo.</p></div></section></main>`;

  return documentShell({
    title: "Guia de bolets de Catalunya · Boletada",
    description: "Temporada, hàbitats i sòls dels bolets més buscats a Catalunya.",
    canonical: "https://boletada.cat/bolets/",
    body,
    indexable: catalog.species.some((species) => species.publication.status === "published"),
    structuredData: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Guia de bolets de Catalunya", url: "https://boletada.cat/bolets/", inLanguage: "ca", mainEntity: { "@type": "ItemList", numberOfItems: catalog.species.length, itemListElement: catalog.species.map((species, index) => ({ "@type": "ListItem", position: index + 1, name: species.names.ca, url: `${SITE_URL}/bolets/${species.slug}/` })) } },
    scripts: ["/content/directory.js?v=20260830-1"],
  });
}

export function renderSeasonPage(catalog) {
  const seasonalSpecies = catalog.species.filter((species) => ["edible", "conditional"].includes(species.edibility.category));
  const monthHeaders = MONTHS.map((month) => `<th scope="col"><abbr title="${escapeHtml({ Gen: "Gener", Feb: "Febrer", Mar: "Març", Abr: "Abril", Mai: "Maig", Jun: "Juny", Jul: "Juliol", Ago: "Agost", Set: "Setembre", Oct: "Octubre", Nov: "Novembre", Des: "Desembre" }[month])}">${month}</abbr></th>`).join("");
  const rows = seasonalSpecies.map((species) => {
    const months = MONTHS.map((_, index) => {
      const active = species.season.typicalMonths.includes(index + 1);
      return `<td class="month-cell${active ? " on" : ""}"><span aria-hidden="true"></span><span class="sr-only">${active ? "Mes habitual" : "Fora del període habitual"}</span></td>`;
    }).join("");
    return `<tr><th scope="row"><a href="/bolets/${escapeHtml(species.slug)}/"><strong>${escapeHtml(species.names.ca)}</strong><em>${escapeHtml(species.names.scientific)}</em></a></th>${months}</tr>`;
  }).join("");

  const body = `<main id="contingut"><section class="guide-hero season-hero"><div class="wrap"><h1>Temporada de <em>bolets.</em></h1><p>Consulta en quins mesos apareixen habitualment les espècies comestibles de la guia. El calendari és orientatiu: les pluges, la temperatura i l’altitud poden avançar o endarrerir la fructificació.</p>${guideSectionNav("season")}</div></section><section class="season-directory"><div class="wrap"><div class="season-intro"><div><h2>Mes a mes</h2></div><p>Les caselles taronges indiquen el període habitual. Per saber on coincideixen les condicions favorables avui, consulta el mapa.</p></div><div class="calendar-shell"><div class="calendar-scroll" tabindex="0" role="region" aria-label="Calendari de temporada de bolets comestibles"><table class="season-calendar"><thead><tr><th scope="col">Bolet</th>${monthHeaders}</tr></thead><tbody>${rows}</tbody></table></div></div><p class="directory-safety">Calendari informatiu. La temporada no confirma la presència de bolets ni permet identificar-los per al consum.</p><section class="map-cta season-cta"><span class="kicker">Condicions actuals</span><h2>La temporada només és el principi.</h2><p>Compara les zones on avui coincideixen millor les condicions de cada espècie.</p><a class="button" href="/app/">Consulta el mapa d’avui <span aria-hidden="true">→</span></a></section></div></section></main>`;

  return documentShell({
    title: "Temporada de bolets a Catalunya: calendari mensual · Boletada",
    description: "Calendari orientatiu dels mesos habituals del rovelló, cep, rossinyol, camagroc, fredolic i altres bolets de Catalunya.",
    canonical: "https://boletada.cat/temporada-de-bolets/",
    body,
    navCurrent: "guide",
    indexable: catalog.species.some((species) => species.publication.status === "published"),
    structuredData: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Calendari de temporada de bolets a Catalunya", url: "https://boletada.cat/temporada-de-bolets/", inLanguage: "ca" },
  });
}

export function renderSpeciesPage(species, catalog) {
  const habitats = habitatNamesFor(species, catalog);
  const sources = species.sourceIds.map((sourceId) => catalog.sources.find((source) => source.id === sourceId)).filter(Boolean);
  const soils = species.ecology.soilPreferences.map((soil) => SOILS[soil] || soil);
  const monthNames = MONTHS.map((month, index) => `<span class="${species.season.typicalMonths.includes(index + 1) ? "on" : ""}">${month}</span>`).join("");
  const seasonText = joinNatural(species.season.typicalMonths.map((month) => MONTHS[month - 1].toLowerCase()));
  const soilText = soils.length ? joinNatural(soils) : "sense preferència editorial confirmada";
  const heroImage = species.media?.hero || species.media?.card;
  const heroMedia = heroImage
    ? `<figure class="species-hero-media"><img src="${escapeHtml(heroImage.src)}" alt="${escapeHtml(heroImage.alt)}" width="1536" height="1024" fetchpriority="high" decoding="async"/></figure>`
    : "";
  const riskNote = species.edibility.category === "deadly"
    ? "És una espècie mortal. No la consumeixis ni confiïs en una fotografia per identificar-la."
    : species.edibility.category === "toxic"
      ? "És una espècie tòxica. No la consumeixis ni confiïs en una fotografia per identificar-la."
      : species.edibility.category === "conditional"
        ? "Requereix una preparació correcta. No la consumeixis sense una identificació experta i informació específica sobre la cocció."
        : "No consumeixis cap bolet que no hagis identificat amb certesa. En cas de dubte, consulta una societat micològica o una persona experta.";
  const mapCopy = species.prediction.available
    ? `Compara les condicions actuals ${speciesReference(species, "de")} sobre el mapa de Catalunya.`
    : "Consulta les espècies disponibles al predictor i compara les condicions actuals sobre el mapa de Catalunya.";
  const confusionSection = species.lookalikes?.length
    ? `<section class="prose-section confusion-section"><span class="kicker">Confusions</span><h2>No el confonguis amb…</h2><div class="lookalike-list">${species.lookalikes.map((lookalike) => { const relatedSpecies = lookalike.slug ? catalog.species.find((entry) => entry.slug === lookalike.slug) : null; const photo = relatedSpecies?.media?.card; const media = photo ? `<figure class="lookalike-photo"><img src="${escapeHtml(photo.src)}" alt="" width="1536" height="1024" loading="lazy" decoding="async"/></figure>` : ""; const content = `${media}<div><strong>${escapeHtml(lookalike.name)}</strong><em>${escapeHtml(lookalike.scientific)}</em></div><span class="risk-label">${escapeHtml(lookalike.risk)}</span><p>${escapeHtml(lookalike.note)}</p>`; return lookalike.slug ? `<a class="lookalike${photo ? " has-photo" : ""}" href="/bolets/${escapeHtml(lookalike.slug)}/">${content}<span class="lookalike-arrow" aria-hidden="true">→</span></a>` : `<article class="lookalike">${content}</article>`; }).join("")}</div></section>`
    : "";
  const kitchenSection = species.culinary?.preparation && ["edible", "conditional"].includes(species.edibility.category)
    ? `<section class="prose-section kitchen-section"><span class="kicker">A la cuina</span><h2>Com preparar-lo</h2><div class="culinary-rating"><span>Valoració culinària</span><strong>${escapeHtml(species.culinary.label)}</strong></div><p>${escapeHtml(species.culinary.preparation)}</p><p class="kitchen-caution">Consumeix només bolets identificats amb certesa, en bon estat i cuinats. La fitxa no substitueix el criteri d’una persona experta.</p></section>`
    : "";
  const body = `<main id="contingut"><section class="species-hero${heroImage ? " has-photo" : ""}">${heroMedia}<div class="wrap species-hero-content"><div class="hero-labels"><span class="kicker">${species.kind === "species" ? "Espècie" : "Grup"}</span><span class="edibility-badge ${escapeHtml(species.edibility.category)}">${escapeHtml(species.edibility.label)}</span>${species.culinary ? `<span class="quality-badge ${escapeHtml(species.culinary.rating)}">${escapeHtml(species.culinary.label)}</span>` : ""}</div><h1>${escapeHtml(species.names.ca)}</h1><span class="latin">${escapeHtml(species.names.scientific)}</span><p class="lead">${escapeHtml(species.summary)}</p></div></section><section class="detail-body"><div class="wrap detail-stack"><div class="detail-row"><section class="prose-section"><span class="kicker">Hàbitat</span><h2>On acostuma a créixer</h2><p>${escapeHtml(sentenceCase(speciesReference(species)))} creix habitualment en ${escapeHtml(joinNatural(habitats).toLowerCase())}, entre ${species.ecology.altitudeM.min} i ${species.ecology.altitudeM.max} metres i sobre sòl ${escapeHtml(soilText)}. Dins d’un mateix bosc, el microclima i l’estat del terreny poden canviar molt.</p></section><aside class="field-card habitat-card" aria-label="Dades d’hàbitat"><dl class="field-facts"><div><dt>Bosc</dt><dd>${escapeHtml(joinNatural(habitats))}</dd></div><div><dt>Altitud</dt><dd>${species.ecology.altitudeM.min}–${species.ecology.altitudeM.max} m</dd></div><div><dt>Sòl</dt><dd>${escapeHtml(soilText)}</dd></div></dl></aside></div><div class="detail-row"><section class="prose-section"><span class="kicker">Temporada</span><h2>Quan sol sortir</h2><p>Els mesos habituals són ${escapeHtml(seasonText)}. Les pluges, la temperatura i les condicions acumulades en determinen la fructificació.</p></section><aside class="season-panel"><h2>Mesos habituals</h2><div class="month-names">${monthNames}</div></aside></div><div class="detail-main">${confusionSection}${kitchenSection}<section class="prose-section"><span class="kicker">Abans de collir</span><h2>Identifica’l amb certesa</h2><p>El mapa indica condicions favorables, no la presència de bolets.</p><p class="safety ${escapeHtml(species.edibility.category)}">${escapeHtml(riskNote)}</p></section><section class="prose-section" id="fonts"><h2>Fonts d’aquesta fitxa</h2><ul class="sources">${sources.map((source) => `<li><a href="${escapeHtml(source.url)}" rel="noopener" target="_blank">${escapeHtml(source.name)} ↗</a><small>${escapeHtml(source.role)}</small></li>`).join("")}</ul></section><section class="map-cta"><span class="kicker">${species.prediction.available ? "Predicció d’avui" : "Mapa de predicció"}</span><h2>Vols saber on val la pena mirar?</h2><p>${escapeHtml(mapCopy)}</p><a class="button" href="/app/">Consulta el mapa d’avui <span aria-hidden="true">→</span></a></section></div></div></section></main>`;

  return documentShell({
    title: `${species.names.ca}: temporada i hàbitat · Boletada`,
    description: `${species.names.ca} (${species.names.scientific}): temporada habitual, boscos, altitud i sòls preferents a Catalunya.`,
    canonical: `https://boletada.cat/bolets/${species.slug}/`,
    body,
    indexable: species.publication.status === "published",
    ogImage: heroImage ? `https://boletada.cat${heroImage.src}` : undefined,
    structuredData: { "@context": "https://schema.org", "@type": "Article", headline: `${species.names.ca}: temporada i hàbitat`, mainEntityOfPage: `https://boletada.cat/bolets/${species.slug}/`, about: { "@type": "Thing", name: species.names.ca, alternateName: species.names.scientific }, inLanguage: "ca", datePublished: species.publication.reviewedAt, dateModified: species.publication.reviewedAt, author: { "@type": "Organization", name: species.publication.reviewedBy }, publisher: { "@type": "Organization", name: "Boletada", url: SITE_URL }, image: heroImage ? `https://boletada.cat${heroImage.src}` : undefined, isPartOf: { "@type": "WebSite", name: "Boletada", url: `${SITE_URL}/` } },
  });
}

export async function buildContentPages({ root, out }) {
  const catalog = JSON.parse(await readFile(join(root, "content/catalog.json"), "utf8"));
  const guideDir = join(out, "bolets");
  const seasonDir = join(out, "temporada-de-bolets");
  await mkdir(guideDir, { recursive: true });
  await mkdir(seasonDir, { recursive: true });
  await mkdir(join(out, "content"), { recursive: true });
  await Promise.all([
    cp(join(root, "content/content.css"), join(out, "content/content.css")),
    cp(join(root, "content/directory.js"), join(out, "content/directory.js")),
    writeFile(join(out, "robots.txt"), renderRobots()),
    writeFile(join(out, "sitemap.xml"), renderSitemap(catalog)),
    writeFile(join(guideDir, "index.html"), renderDirectoryPage(catalog)),
    writeFile(join(seasonDir, "index.html"), renderSeasonPage(catalog)),
    ...catalog.species.map(async (species) => {
      const speciesDir = join(guideDir, species.slug);
      await mkdir(speciesDir, { recursive: true });
      await writeFile(join(speciesDir, "index.html"), renderSpeciesPage(species, catalog));
    }),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  await buildContentPages({ root, out: join(root, "public") });
}
