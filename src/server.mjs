#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth.mjs";
import { getAccessForUser, hasPredictionAccess } from "./access.mjs";
import { config } from "./config.mjs";
import { pool } from "./db.mjs";
import { syncRevenueCatCustomer } from "./revenuecat.mjs";

export const app = new Hono();

app.use("*", secureHeaders({
  crossOriginResourcePolicy: "same-origin",
  crossOriginOpenerPolicy: "same-origin-allow-popups",
}));

app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/readyz", async (c) => {
  try {
    await pool.query("SELECT 1");
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

app.get("/api/config", (c) => c.json({
  revenueCatWebPublicApiKey: config.revenueCat.webPublicApiKey,
  entitlementId: config.revenueCat.entitlementId,
}));

app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/me", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  // Consultar l'estat de la sessió és una operació normal en carregar l'app.
  // Reservem el 401 per a rutes que realment exigeixen autenticació.
  if (!session) return c.json({ user: null, access: { active: false } });

  const access = await getAccessForUser(session.user.id);

  return c.json({
    user: session.user,
    access: { ...access, active: hasPredictionAccess(access) },
  });
});

app.post("/api/billing/sync", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  if (!config.revenueCat.secretApiKey) return c.json({ error: "billing_not_configured" }, 503);

  const access = await syncRevenueCatCustomer(session.user.id);
  return c.json({ access });
});

const predictionName = /^bolets\.(?:grid\.json|terrain\.png|weather\.png|[a-z0-9-]+\.(?:geojson|png))$/;
const predictionTypes = {
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
};

app.get("/api/predictions/:filename", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const access = await getAccessForUser(session.user.id);
  if (!hasPredictionAccess(access)) return c.json({ error: "subscription_required" }, 402);

  const filename = c.req.param("filename");
  if (!predictionName.test(filename)) return c.json({ error: "not_found" }, 404);

  try {
    const data = await readFile(join(config.predictionDir, filename));
    return c.body(data, 200, {
      "Content-Type": predictionTypes[extname(filename)] || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      Vary: "Cookie",
    });
  } catch (error) {
    if (error?.code === "ENOENT") return c.json({ error: "not_found" }, 404);
    throw error;
  }
});

app.use("*", async (c, next) => {
  await next();
  if (c.res.status === 200 && !c.req.path.startsWith("/api/")) {
    if (c.req.path === "/app" || c.req.path === "/app/") {
      // L'HTML conté un gate d'autenticació: no reutilitzem una vista anterior
      // (per exemple, el formulari de login) mentre es resol la sessió actual.
      c.header("Cache-Control", "no-store");
    } else {
      c.header("Cache-Control", c.req.path === "/" || c.req.path.endsWith(".html") ? "no-cache" : "public, max-age=3600");
    }
  }
});

app.get("/app", (c) => c.redirect("/app/", 308));
app.get("/app/", serveStatic({ path: `${config.publicDir}/app/index.html` }));
app.get("/legal", (c) => c.redirect("/legal/", 308));
app.get("/legal/", serveStatic({ path: `${config.publicDir}/legal/index.html` }));
app.use("*", serveStatic({ root: config.publicDir }));
app.get("/", serveStatic({ path: `${config.publicDir}/index.html` }));
app.notFound((c) => c.req.path.startsWith("/api/")
  ? c.json({ error: "not_found" }, 404)
  : c.text("not found", 404));

export function startServer() {
  const server = serve({ fetch: app.fetch, port: config.port });
  console.log(`Boletada escoltant a :${config.port}`);

  const shutdown = () => server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
