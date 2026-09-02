import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deleteRevenueCatCustomer } from "../src/revenuecat.mjs";

test("la baixa de RevenueCat usa el customer id i no falla si encara no existeix", async () => {
  const calls = [];
  const result = await deleteRevenueCatCustomer("usuari / 1", {
    apiUrl: "https://billing.example/v1",
    secretApiKey: "secret",
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(result, { deleted: true });
  assert.equal(calls[0][0], "https://billing.example/v1/subscribers/usuari%20%2F%201");
  assert.equal(calls[0][1].method, "DELETE");
  assert.equal(calls[0][1].headers.Authorization, "Bearer secret");

  const missing = await deleteRevenueCatCustomer("sense-customer", {
    secretApiKey: "secret",
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.deepEqual(missing, { deleted: false, missing: true });

  await assert.rejects(
    deleteRevenueCatCustomer("error-remot", {
      secretApiKey: "secret",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /RevenueCat \(503\)/,
  );
});

test("la baixa està protegida per una sessió recent i confirmació literal", async () => {
  const [authSource, appHtml, legalHtml] = await Promise.all([
    readFile(new URL("../src/auth.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app.html", import.meta.url), "utf8"),
    readFile(new URL("../legal.html", import.meta.url), "utf8"),
  ]);

  assert.match(authSource, /deleteUser:\s*\{\s*enabled:\s*true/s);
  assert.match(authSource, /beforeDelete:[\s\S]*deleteRevenueCatCustomer/);
  assert.match(authSource, /freshAge:\s*15 \* 60/);
  assert.match(authSource, /"\/delete-user": \{ window: 600, max: 3 \}/);
  assert.match(appHtml, /id="mapAccountToggle"/);
  assert.match(appHtml, /id="paywallAccountToggle"/);
  assert.match(appHtml, /id="accountDialog"/);
  assert.doesNotMatch(appHtml, /id="deleteAccountPassword"/);
  assert.doesNotMatch(appHtml, /\/api\/auth\/list-accounts/);
  assert.match(appHtml, /SESSION_EXPIRED/);
  assert.match(appHtml, /sessió iniciada recentment/);
  assert.match(appHtml, /Escriu ELIMINAR per confirmar/);
  assert.match(appHtml, /No es pot desfer ni tramita automàticament cap reemborsament/);
  assert.match(appHtml, /\/api\/auth\/delete-user/);
  assert.match(legalHtml, /Compte → Eliminar el compte/);
  assert.match(legalHtml, /hola@boletada\.cat/);
});

test("la projecció local d'accés s'elimina en cascada amb l'usuari", async () => {
  const migration = await readFile(new URL("../migrations/001_app.sql", import.meta.url), "utf8");
  assert.match(migration, /user_id TEXT PRIMARY KEY REFERENCES "user"\(id\) ON DELETE CASCADE/);
});
