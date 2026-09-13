import "dotenv/config";
import pg from "pg";

const { Client } = pg;

// Two stable int32 keys keep this lock isolated from any other advisory lock.
export const PREDICTION_LOCK_KEYS = [0x424f4c45, 0x53434f52]; // BOLE / SCOR

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL?.trim()
      || "postgresql://boletada:boletada_local@localhost:5432/boletada",
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

export async function withPredictionGenerationLock(run, { client = createClient() } = {}) {
  await client.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const result = await client.query(
      "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired",
      PREDICTION_LOCK_KEYS,
    );
    const acquired = result.rows[0]?.acquired === true;

    if (!acquired) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { acquired: false };
    }

    // PostgreSQL releases this lock automatically if the process or connection dies.
    // The publication callback uses this probe immediately before swapping current.json.
    const assertHeld = async () => {
      await client.query("SELECT 1");
    };
    const value = await run(assertHeld);
    await client.query("COMMIT");
    transactionOpen = false;
    return { acquired: true, value };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
