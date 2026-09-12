import assert from "node:assert/strict";
import test from "node:test";
import { createTelegramAlerter, DEFAULT_ALERT_COOLDOWN_MS } from "../src/alerts.mjs";

const silentLogger = { warn() {} };

test("Telegram envia un avís operatiu sense dades sensibles", async () => {
  const requests = [];
  const alerter = createTelegramAlerter({
    token: "bot-token",
    chatId: "123",
    environment: "staging",
    cooldownMs: 1_000,
    now: () => 5_000,
    logger: silentLogger,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(null, { status: 200 });
    },
  });

  const result = await alerter.send({
    event: "billing_sync_failed",
    message: "RevenueCat timeout",
    context: {
      requestId: "req-1",
      email: "persona@example.com",
      token: "secret",
    },
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /sendMessage$/);
  const payload = JSON.parse(requests[0].options.body);
  assert.match(payload.text, /Boletada · staging/);
  assert.match(payload.text, /billing_sync_failed/);
  assert.match(payload.text, /requestId: req-1/);
  assert.doesNotMatch(payload.text, /persona@example\.com|secret/);
});

test("Telegram deduplica el mateix tipus d’error durant cinc minuts", async () => {
  let calls = 0;
  let current = 1_000;
  const alerter = createTelegramAlerter({
    token: "bot-token",
    chatId: "123",
    cooldownMs: DEFAULT_ALERT_COOLDOWN_MS,
    now: () => current,
    logger: silentLogger,
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    },
  });

  assert.deepEqual(await alerter.send({ event: "readiness_failed", message: "DB" }), { sent: true });
  assert.deepEqual(await alerter.send({ event: "readiness_failed", message: "DB" }), { sent: false, reason: "cooldown" });
  current += DEFAULT_ALERT_COOLDOWN_MS;
  assert.deepEqual(await alerter.send({ event: "readiness_failed", message: "DB" }), { sent: true });
  assert.equal(calls, 2);
});

test("una fallada de Telegram no es propaga a l’aplicació", async () => {
  let warnings = 0;
  const alerter = createTelegramAlerter({
    token: "bot-token",
    chatId: "123",
    logger: { warn() { warnings += 1; } },
    fetchImpl: async () => { throw new Error("network down"); },
  });

  const result = await alerter.send({ event: "email_delivery_failed", message: "Resend unavailable" });
  assert.deepEqual(result, { sent: false, reason: "delivery_failed" });
  assert.equal(warnings, 1);
});

test("sense credencials les alertes no fan cap petició", async () => {
  const alerter = createTelegramAlerter({
    token: "",
    chatId: "",
    fetchImpl: async () => { throw new Error("no s’hauria de cridar"); },
  });

  assert.deepEqual(await alerter.send({ event: "fatal", message: "boom" }), { sent: false, reason: "disabled" });
});
