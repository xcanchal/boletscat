import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("el healthcheck del contenidor no manté PostgreSQL despert", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

  assert.match(dockerfile, /HEALTHCHECK[\s\S]*127\.0\.0\.1:8080\/healthz/);
  assert.doesNotMatch(dockerfile, /HEALTHCHECK[\s\S]*127\.0\.0\.1:8080\/readyz/);
});
