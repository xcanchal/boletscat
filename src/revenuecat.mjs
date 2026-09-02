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

export async function deleteRevenueCatCustomer(userId, {
  apiUrl = config.revenueCat.apiUrl,
  secretApiKey = config.revenueCat.secretApiKey,
  fetchImpl = fetch,
} = {}) {
  // En local encara podem provar la baixa del compte sense un projecte de
  // Billing configurat. A producció fallem tancat: no deixem una subscripció
  // facturable sense identitat local per un error de configuració.
  if (!secretApiKey) {
    if (config.isProduction) throw new Error("Falta REVENUECAT_SECRET_API_KEY per eliminar el customer");
    return { deleted: false, skipped: true };
  }

  const response = await fetchImpl(
    `${apiUrl}/subscribers/${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${secretApiKey}`, Accept: "application/json" } },
  );

  // No tots els comptes han arribat a crear un customer a RevenueCat.
  if (response.status === 404) return { deleted: false, missing: true };
  if (!response.ok) throw new Error(`No s’ha pogut eliminar el customer de RevenueCat (${response.status})`);

  return { deleted: true };
}
