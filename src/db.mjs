import pg from "pg";
import { alertOps } from "./alerts.mjs";
import { config } from "./config.mjs";
import { logger } from "./logger.mjs";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (error) => {
  logger.error({ event: "database_pool_error", err: error }, "Error inesperat al pool de PostgreSQL");
  void alertOps({ event: "database_pool_error", message: error.message });
});
