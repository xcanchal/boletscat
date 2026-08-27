import "dotenv/config";
import { resolve } from "node:path";

const isProduction = process.env.NODE_ENV === "production";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable d'entorn ${name}`);
  return value;
}

function csv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const authUrl = process.env.BETTER_AUTH_URL?.trim() || "http://localhost:8080";
const developmentSecret = "boletada-local-only-secret-change-me";

export const config = {
  isProduction,
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL?.trim()
    || "postgresql://boletada:boletada_local@localhost:5432/boletada",
  authUrl,
  authSecret: isProduction ? required("BETTER_AUTH_SECRET") : (process.env.BETTER_AUTH_SECRET || developmentSecret),
  trustedOrigins: csv(process.env.TRUSTED_ORIGINS || authUrl),
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION
    ? process.env.REQUIRE_EMAIL_VERIFICATION === "true"
    : isProduction,
  email: {
    apiKey: process.env.EMAIL_PROVIDER_API_KEY?.trim() || "",
    from: process.env.EMAIL_FROM?.trim() || "Boletada <hola@boletada.cat>",
    apiUrl: process.env.EMAIL_PROVIDER_URL?.trim() || "https://api.resend.com/emails",
  },
  publicDir: resolve(process.env.PUBLIC_DIR || "public"),
  predictionDir: resolve(process.env.PREDICTION_DIR || "private/predictions"),
  revenueCat: {
    secretApiKey: process.env.REVENUECAT_SECRET_API_KEY?.trim() || "",
    apiUrl: process.env.REVENUECAT_API_URL?.trim() || "https://api.revenuecat.com/v1",
    entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "boletada_pro",
    webPublicApiKey: process.env.REVENUECAT_WEB_PUBLIC_API_KEY?.trim() || "",
    webProductId: process.env.REVENUECAT_WEB_PRODUCT_ID?.trim() || "",
  },
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("PORT ha de ser un port TCP vàlid");
}

if (config.authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET ha de tenir com a mínim 32 caràcters");
}
