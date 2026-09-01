import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { betterAuth } from "better-auth";

process.env.NODE_ENV = "development";
process.env.BETTER_AUTH_URL = "http://localhost:8080";
process.env.BETTER_AUTH_SECRET = "google-auth-test-secret-at-least-32-characters";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.TRUSTED_ORIGINS = "http://localhost:8080";

const { app } = await import("../src/server.mjs");
const { auth } = await import("../src/auth.mjs");
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("la configuració pública només exposa si Google està disponible", async () => {
  const response = await app.request("/api/config");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.googleAuthEnabled, true);
  assert.equal("googleClientId" in payload, false);
  assert.equal("googleClientSecret" in payload, false);
});

test("Better Auth construeix el redirect OAuth de Google amb el callback correcte", async () => {
  assert.equal(
    auth.options.socialProviders.google.clientId,
    process.env.GOOGLE_CLIENT_ID,
  );

  // Instància sense adaptador persistent: valida el contracte OAuth sense
  // exigir PostgreSQL a la suite unitària.
  const oauthHarness = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
  });
  const payload = await oauthHarness.api.signInSocial({
    headers: new Headers({ Origin: "http://localhost:8080" }),
    body: {
      provider: "google",
      callbackURL: "http://localhost:8080/app/",
      errorCallbackURL: "http://localhost:8080/app/?oauth=google",
      disableRedirect: true,
    },
  });
  const authorizationURL = new URL(payload.url);

  assert.equal(payload.redirect, false);
  assert.equal(authorizationURL.hostname, "accounts.google.com");
  assert.equal(authorizationURL.searchParams.get("client_id"), process.env.GOOGLE_CLIENT_ID);
  assert.equal(
    authorizationURL.searchParams.get("redirect_uri"),
    "http://localhost:8080/api/auth/callback/google",
  );
});

test("el gate ofereix Google sense exposar-lo al client natiu incomplet", () => {
  assert.match(appSource, /id="googleSignIn"/);
  assert.match(appSource, /Continua amb Google/);
  assert.match(appSource, /provider:'google'/);
  assert.match(appSource, /disableRedirect:true/);
  assert.match(appSource, /billingConfig\.googleAuthEnabled&&DATA_BASE==='\.'/);
  assert.match(appSource, /location\.assign\(authorizationURL\.href\)/);
});

test("els termes apareixen una sola vegada al final del formulari d'accés", () => {
  assert.equal((appSource.match(/id="authLegal"/g) || []).length, 1);
  assert.equal((appSource.match(/En continuar acceptes els/g) || []).length, 1);
  assert.doesNotMatch(appSource, /id="authLegal" hidden/);
  assert.ok(appSource.indexOf('id="authLegal"') > appSource.indexOf('id="authMessage"'));
});
