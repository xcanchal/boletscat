import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SPECIES } from "../src/species-model.mjs";

const catalog = JSON.parse(
  await readFile(new URL("../content/catalog.json", import.meta.url), "utf8"),
);
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");
const speciesBySlug = new Map(catalog.species.map((species) => [species.slug, species]));

const lookalikeImageFor = (lookalike) => lookalike.media
  || (lookalike.slug ? speciesBySlug.get(lookalike.slug)?.media?.card : null);

const MODEL_SPECIES = new Set([
  "rovello",
  "cep",
  "llenega",
  "trompeta",
  "rossinyol",
  "camagroc",
  "murgola",
  "ou_de_reig",
  "fredolic",
]);

test("el catàleg editorial té identificadors i referències consistents", () => {
  assert.equal(catalog.schemaVersion, 3);

  const speciesSlugs = catalog.species.map((species) => species.slug);
  const habitatSlugs = new Set(catalog.habitats.map((habitat) => habitat.slug));
  const sourceIds = new Set(catalog.sources.map((source) => source.id));

  assert.equal(new Set(speciesSlugs).size, speciesSlugs.length, "slugs d'espècie duplicats");
  assert.equal(habitatSlugs.size, catalog.habitats.length, "slugs d'hàbitat duplicats");
  assert.equal(sourceIds.size, catalog.sources.length, "fonts duplicades");

  for (const species of catalog.species) {
    assert.match(species.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(species.names.ca);
    assert.ok(species.names.scientific);
    if (species.grammar) assert.ok(["feminine", "masculine"].includes(species.grammar.gender));
    assert.ok(["species", "group"].includes(species.kind));
    assert.ok(["edible", "conditional", "not-edible", "toxic", "deadly"].includes(species.edibility.category));
    assert.ok(species.edibility.label);
    if (["edible", "conditional"].includes(species.edibility.category)) {
      assert.ok(["excellent", "good", "low"].includes(species.culinary?.rating));
      assert.ok(species.culinary?.label);
      assert.ok(species.culinary?.preparation);
    }
    for (const lookalike of species.lookalikes || []) {
      assert.ok(lookalike.name);
      assert.ok(lookalike.scientific);
      assert.ok(lookalike.risk);
      assert.ok(lookalike.note);
      if (lookalike.slug) assert.ok(speciesSlugs.includes(lookalike.slug), `${species.slug}: confusió inexistent ${lookalike.slug}`);
      const image = lookalikeImageFor(lookalike);
      assert.ok(image, `${species.slug}: falta la imatge de ${lookalike.scientific}`);
      assert.match(image.src, /^\/media\/bolets\/.+\.webp$/);
      assert.ok(image.alt);
    }
    assert.match(species.updatedAt || "", /^\d{4}-\d{2}-\d{2}$/, `${species.slug}: falta la data d'actualització`);
    assert.equal(species.publication, undefined, `${species.slug}: l'estat editorial no forma part del catàleg públic`);
    if (species.identification) {
      assert.ok(species.identification.traits.length >= 4, `${species.slug}: falten trets d'identificació`);
      for (const trait of species.identification.traits) {
        assert.ok(trait.part);
        assert.ok(trait.description);
      }
    }

    for (const month of species.season.typicalMonths) {
      assert.ok(Number.isInteger(month) && month >= 1 && month <= 12);
    }
    for (const habitatSlug of species.ecology.habitatSlugs) {
      assert.ok(habitatSlugs.has(habitatSlug), `${species.slug}: hàbitat inexistent ${habitatSlug}`);
    }
    for (const sourceId of species.sourceIds) {
      assert.ok(sourceIds.has(sourceId), `${species.slug}: font inexistent ${sourceId}`);
    }
    for (const image of [species.media?.card, species.media?.hero].filter(Boolean)) {
      assert.match(image.src, /^\/media\/bolets\/.+\.webp$/);
      assert.ok(image.alt);
      assert.equal(typeof image.speciesVerified, "boolean");
    }

    if (species.prediction.available) {
      assert.ok(MODEL_SPECIES.has(species.prediction.key));
    } else {
      assert.equal(species.prediction.key, null);
    }
  }
});

test("totes les imatges de confusions existeixen al projecte", async () => {
  for (const species of catalog.species) {
    for (const lookalike of species.lookalikes || []) {
      const image = lookalikeImageFor(lookalike);
      await assert.doesNotReject(
        readFile(new URL(`..${image.src}`, import.meta.url)),
        `${species.slug}: no existeix ${image.src}`,
      );
    }
  }
});

test("el catàleg inicial cobreix totes les espècies disponibles al predictor", () => {
  const predictionKeys = new Set(
    catalog.species
      .filter((species) => species.prediction.available)
      .map((species) => species.prediction.key),
  );

  assert.deepEqual(predictionKeys, MODEL_SPECIES);
});

test("el motor i el selector cobreixen totes les espècies predictives del catàleg", () => {
  for (const key of MODEL_SPECIES) {
    assert.ok(key in SPECIES, `${key}: falta al motor`);
    assert.match(appSource, new RegExp(`<option value="${key}">`), `${key}: falta al selector`);
  }
});

test("el directori també cobreix espècies informatives fora del predictor", () => {
  assert.ok(catalog.species.length >= 27);
  assert.ok(catalog.species.some((species) => species.edibility.category === "toxic"));
  assert.ok(catalog.species.some((species) => species.edibility.category === "deadly"));
  assert.ok(catalog.species.some((species) => species.edibility.category === "not-edible"));
  assert.ok(catalog.species.some((species) => species.culinary?.rating === "low"));
  assert.ok(catalog.species.some((species) => !species.prediction.available));
});

test("el primer lot d’ampliació incorpora les quatre fitxes completes", () => {
  for (const slug of ["llora-aspra", "cama-sec", "molleric", "fals-rossinyol"]) {
    const species = catalog.species.find((entry) => entry.slug === slug);
    assert.ok(species, `${slug}: falta al catàleg`);
    assert.equal(species.identification.traits.length, 4, `${slug}: la fitxa no té quatre trets de camp`);
    assert.ok(species.media.card, `${slug}: falta la imatge de la fitxa`);
    assert.ok(species.sourceIds.length >= 3, `${slug}: falten fonts contrastades`);
  }
});

test("les fitxes prioritàries incorporen trets de camp contrastats", () => {
  for (const slug of ["rovello", "cep", "rossinyol", "ou-de-reig", "farinera-borda"]) {
    const species = catalog.species.find((entry) => entry.slug === slug);
    assert.equal(species.identification.traits.length, 4, `${slug}: la fitxa encara no és completa`);
  }
});
