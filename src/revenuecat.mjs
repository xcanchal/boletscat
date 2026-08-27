import { config } from "./config.mjs";
import { pool } from "./db.mjs";

export async function syncRevenueCatCustomer(userId) {
  if (!config.revenueCat.secretApiKey) {
    throw new Error("Falta REVENUECAT_SECRET_API_KEY");
  }
  const response = await fetch(
    `${config.revenueCat.apiUrl}/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${config.revenueCat.secretApiKey}`, Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`RevenueCat ha respost ${response.status}`);

  const customer = await response.json();
  const entitlement = customer?.subscriber?.entitlements?.[config.revenueCat.entitlementId];
  const expiresAt = entitlement?.expires_date ? new Date(entitlement.expires_date) : null;
  const graceAt = entitlement?.grace_period_expires_date ? new Date(entitlement.grace_period_expires_date) : null;
  const now = Date.now();
  const inGrace = graceAt && graceAt.getTime() > now && expiresAt && expiresAt.getTime() <= now;
  const active = Boolean(entitlement) && (!expiresAt || expiresAt.getTime() > now || inGrace);
  const status = active ? (inGrace ? "grace_period" : "active") : "inactive";

  await pool.query(
    `INSERT INTO user_access(user_id, entitlement_id, status, expires_at, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       entitlement_id = EXCLUDED.entitlement_id,
       status = EXCLUDED.status,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [
      userId,
      config.revenueCat.entitlementId,
      status,
      inGrace ? graceAt : expiresAt,
    ],
  );

  return { status, active };
}
