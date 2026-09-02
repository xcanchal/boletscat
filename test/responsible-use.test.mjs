import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la landing i els termes enllacen una pàgina dedicada de bones pràctiques", async () => {
  const [landing, app, legal, page] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("app.html"),
    readProjectFile("legal.html"),
    readProjectFile("bones-practiques.html"),
  ]);

  assert.match(landing, /href="\/bones-practiques\/"/);
  assert.match(legal, /el mapa no autoritza l’entrada a cap terreny/);
  assert.match(legal, /href="\/bones-practiques\/"/);
  assert.doesNotMatch(app, /Ús responsable del bosc/);
  assert.match(page, /El mapa de Boletada no autoritza l’accés a cap terreny/);
  assert.match(page, /mailto:hola@boletada\.cat/);
  assert.doesNotMatch(page, /xaviercanchal@gmail\.com|suport@boletada\.cat/);
});

test("la pàgina cita fonts oficials i es publica com una ruta indexable", async () => {
  const [page, preparation, server] = await Promise.all([
    readProjectFile("bones-practiques.html"),
    readProjectFile("scripts/prepare-public.mjs"),
    readProjectFile("src/server.mjs"),
  ]);

  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /Agents Rurals/);
  assert.match(page, /agricultura\.gencat\.cat/);
  assert.match(page, /parcsnaturals\.gencat\.cat/);
  assert.match(preparation, /bones-practiques\/index\.html/);
  assert.match(server, /app\.get\("\/bones-practiques\/"/);
});
