import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authSource = await readFile(new URL("../src/auth.mjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("els comptes nous confirmen el correu amb un OTP emmagatzemat com a hash", () => {
  assert.match(authSource, /emailOTP\(\{/);
  assert.match(authSource, /overrideDefaultEmailVerification: true/);
  assert.match(authSource, /storeOTP: "hashed"/);
  assert.match(authSource, /type !== "email-verification"/);
  assert.doesNotMatch(authSource, /sendVerificationEmail:/);
  assert.doesNotMatch(authSource, /Confirma el teu correu obrint aquest enllaç/);
});

test("l'OTP conserva la caducitat i els intents predeterminats de Better Auth", () => {
  const pluginConfiguration = authSource.slice(
    authSource.indexOf("plugins: [emailOTP({"),
    authSource.indexOf("})],", authSource.indexOf("plugins: [emailOTP({")),
  );

  assert.doesNotMatch(pluginConfiguration, /expiresIn\s*:/);
  assert.doesNotMatch(pluginConfiguration, /allowedAttempts\s*:/);
  assert.doesNotMatch(pluginConfiguration, /otpLength\s*:/);
  assert.doesNotMatch(pluginConfiguration, /rateLimit\s*:/);
});

test("el gate permet verificar i reenviar el codi de sis xifres", () => {
  assert.match(appSource, /id="verificationView"/);
  assert.match(appSource, /autocomplete="one-time-code"/);
  assert.match(appSource, /pattern="\[0-9\]\{6\}"/);
  assert.match(appSource, /\/api\/auth\/email-otp\/verify-email/);
  assert.match(appSource, /\/api\/auth\/email-otp\/send-verification-otp/);
  assert.match(appSource, /type:'email-verification'/);
  assert.match(appSource, /errorCode\(error\.payload\)==='EMAIL_NOT_VERIFIED'/);
});
