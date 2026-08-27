import { config } from "./config.mjs";
import { pool } from "./db.mjs";

export async function getAccessForUser(userId) {
  const result = await pool.query(
    `SELECT entitlement_id, status, expires_at, updated_at
       FROM user_access
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || {
    entitlement_id: config.revenueCat.entitlementId,
    status: "inactive",
  };
}

export function hasPredictionAccess(access) {
  if (!access) return false;
  return ["active", "grace_period"].includes(access.status)
    && (!access.expires_at || new Date(access.expires_at).getTime() > Date.now());
}
