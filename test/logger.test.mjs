import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Pino produeix JSON i redueix credencials i estat d’autenticació", async () => {
  const loggerUrl = new URL("../src/logger.mjs", import.meta.url).href;
  const script = `
    const { logger } = await import(${JSON.stringify(loggerUrl)});
    const err = new Error("state mismatch");
    err.details = { state: "oauth-state-secret" };
    logger.error({
      event: "test_error",
      password: "password-secret",
      email: "persona@example.com",
      err,
    }, "prova");
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", script], {
    env: { ...process.env, LOG_LEVEL: "info", APP_ENV: "test" },
  });
  const entry = JSON.parse(stdout.trim());

  assert.equal(entry.service, "boletada");
  assert.equal(entry.environment, "test");
  assert.equal(entry.event, "test_error");
  assert.equal(entry.password, "[REDACTED]");
  assert.equal(entry.email, "[REDACTED]");
  assert.equal(entry.err.details.state, "[REDACTED]");
  assert.doesNotMatch(stdout, /password-secret|persona@example\.com|oauth-state-secret/);
});
