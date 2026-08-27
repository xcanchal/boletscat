#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/auth.mjs";
import { pool } from "../src/db.mjs";

const here = dirname(fileURLToPath(import.meta.url));

try {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();

  const appMigration = await readFile(join(here, "../migrations/001_app.sql"), "utf8");
  await pool.query(appMigration);
  console.log("Migracions de Better Auth i Boletada aplicades");
} finally {
  await pool.end();
}
