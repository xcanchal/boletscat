import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../content/catalog.json", import.meta.url), "utf8"),
);
const predictorSource = await readFile(
  new URL("../score_estacions.mjs", import.meta.url),
  "utf8",
);
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

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
  assert.equal(catalog.schemaVersion, 2);

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
    }
    assert.ok(["draft", "published", "archived"].includes(species.publication.status));
    if (species.publication.status === "published") {
      assert.ok(species.publication.reviewedBy, `${species.slug}: falta qui ha revisat la fitxa`);
      assert.match(species.publication.reviewedAt || "", /^\d{4}-\d{2}-\d{2}$/);
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
    assert.match(predictorSource, new RegExp(`\\b${key}\\s*:`), `${key}: falta al motor`);
    assert.match(appSource, new RegExp(`<option value="${key}">`), `${key}: falta al selector`);
  }
});

test("el directori també cobreix espècies informatives fora del predictor", () => {
  assert.ok(catalog.species.length >= 23);
  assert.ok(catalog.species.some((species) => species.edibility.category === "toxic"));
  assert.ok(catalog.species.some((species) => species.edibility.category === "deadly"));
  assert.ok(catalog.species.some((species) => species.edibility.category === "not-edible"));
  assert.ok(catalog.species.some((species) => species.culinary?.rating === "low"));
  assert.ok(catalog.species.some((species) => !species.prediction.available));
});

test("les fitxes de la guia publicable han passat la revisió editorial", () => {
  assert.equal(catalog.species.every((species) => species.publication.status === "published"), true);
});
