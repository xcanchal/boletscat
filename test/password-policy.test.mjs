import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isPasswordValid,
  passwordRequirements,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../src/password-policy.mjs";

test("la política exigeix 8–20 caràcters, una lletra, un número i un símbol", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(PASSWORD_MAX_LENGTH, 20);
  assert.equal(isPasswordValid("Boletada1!"), true);
  assert.equal(isPasswordValid("Ànecs2026?"), true);
  assert.equal(isPasswordValid("Curt1!"), false);
  assert.equal(isPasswordValid("MassaLlarga123456789!"), false);
  assert.equal(isPasswordValid("SenseNumero!"), false);
  assert.equal(isPasswordValid("SenseSimbol1"), false);
  assert.equal(isPasswordValid("12345678!"), false);
});

test("la política exposa cada requisit per alimentar la validació visual", () => {
  assert.deepEqual(passwordRequirements("Boletada"), {
    length: true,
    letter: true,
    number: false,
    symbol: false,
  });
});

test("registre i restabliment mostren requisits, confirmació i controls de visibilitat", async () => {
  const html = await readFile(new URL("../app.html", import.meta.url), "utf8");
  assert.match(html, /id="authPasswordConfirm"/);
  assert.match(html, /id="newPasswordConfirm"/);
  assert.match(html, /Entre 8 i 20 caràcters/);
  assert.match(html, /Una lletra, un número i un símbol/);
  assert.equal((html.match(/<button class="password-toggle"[^>]+data-password-toggle=/g) || []).length, 4);
  assert.match(html, /PASSWORD_REQUIREMENTS_NOT_MET/);
});
