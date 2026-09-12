#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { alertOps, reportAlertConfiguration } from "./alerts.mjs";
import { auth } from "./auth.mjs";
import { getAccessForUser, hasPredictionAccess } from "./access.mjs";
import { config } from "./config.mjs";
import { pool } from "./db.mjs";
import { syncRevenueCatCustomer } from "./revenuecat.mjs";
import { registerPredictionRoutes } from './prediction-routes.mjs';
import { readCurrentGeneration } from './prediction-generations.mjs';
import { errorFrom, logger } from "./logger.mjs";

export const app = new Hono();

app.use("*", requestId());
app.use("*", async (c, next) => {
  const startedAt = performance.now();
  await next();

  const status = c.res.status;
  if (c.req.path.startsWith("/api/") || c.req.path === "/healthz" || c.req.path === "/readyz" || status >= 500) {
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    logger[level]({
      event: "http_request",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    }, "Petició HTTP completada");
  }
});

// Els clients de missatgeria i xarxes carreguen la imatge OG des d'un altre
// origen: amb `same-origin` el navegador la bloqueja i la previsualització surt
// trencada. Les prediccions de pagament ja queden protegides per la cookie de
// sessió (SameSite=Lax), que no viatja en peticions cross-site.
app.use("*", secureHeaders({
  crossOriginResourcePolicy: "cross-origin",
  crossOriginOpenerPolicy: "same-origin-allow-popups",
}));

app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/readyz", async (c) => {
  try {
    await pool.query("SELECT 1");
    await readCurrentGeneration(config.predictionDir);
    return c.json({ ok: true });
  } catch (error) {
    logger.error({ event: "readiness_failed", err: errorFrom(error) }, "La comprovació de disponibilitat ha fallat");
    void alertOps({
      event: "readiness_failed",
      message: errorFrom(error).message,
      context: { requestId: c.get("requestId") },
    });
    return c.json({ ok: false }, 503);
  }
});

app.get("/api/config", (c) => c.json({
  googleAuthEnabled: config.google.enabled,
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
  if (!config.revenueCat.secretApiKey) {
    void alertOps({ event: "billing_not_configured", message: "Falta REVENUECAT_SECRET_API_KEY" });
    return c.json({ error: "billing_not_configured" }, 503);
  }

  const access = await syncRevenueCatCustomer(session.user.id);
  return c.json({ access });
});

const parseSingleByteRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!match || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }

  return { start, end };
};

// Servim el vídeo de forma explícita i bufferitzada perquè el proxy conservi
// Content-Length. Això permet que Safari i Cloudflare facin peticions Range i
// comencin la reproducció sense haver d'esperar tot l'MP4.
const servePromoVideo = async (c) => {
  const data = await readFile(join(config.publicDir, "media/boletada-promo-v2.mp4"));
  const rangeHeader = c.req.header("Range");
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable, no-transform",
    "Content-Type": "video/mp4",
  };

  if (!rangeHeader) {
    return c.body(data, 200, {
      ...commonHeaders,
      "Content-Length": String(data.byteLength),
    });
  }

  const range = parseSingleByteRange(rangeHeader, data.byteLength);
  if (!range) {
    return c.body(null, 416, {
      ...commonHeaders,
      "Content-Range": `bytes */${data.byteLength}`,
    });
  }

  const chunk = data.subarray(range.start, range.end + 1);
  return c.body(chunk, 206, {
    ...commonHeaders,
    "Content-Length": String(chunk.byteLength),
    "Content-Range": `bytes ${range.start}-${range.end}/${data.byteLength}`,
  });
};

app.get("/media/boletada-promo.mp4", servePromoVideo);
// URL nou i immutable: evita reutilitzar l'objecte antic que Cloudflare havia
// cachejat sense suport correcte per a peticions Range d'iOS.
app.get("/media/boletada-promo-v2.mp4", servePromoVideo);

registerPredictionRoutes(app, {
  root: config.predictionDir,
  authorize: async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const access = await getAccessForUser(session.user.id);
    if (!hasPredictionAccess(access)) return c.json({ error: "subscription_required" }, 402);
  },
  onUnavailable: ({ error, path }) => {
    const failure = errorFrom(error);
    logger.error({ event: "predictions_unavailable", err: failure, path }, "No s’ha pogut servir la predicció activa");
    void alertOps({ event: "predictions_unavailable", message: failure.message, context: { path } });
  },
});

app.use("*", async (c, next) => {
  await next();
  if (c.res.status === 200 && !c.req.path.startsWith("/api/")) {
    if (c.req.path === "/app" || c.req.path === "/app/") {
      // L'HTML conté un gate d'autenticació: no reutilitzem una vista anterior
      // (per exemple, el formulari de login) mentre es resol la sessió actual.
      c.header("Cache-Control", "no-store");
    } else if (c.req.path === "/sw.js" || c.req.path.endsWith(".mjs")) {
      // El service worker ha de poder-se actualitzar (o desactivar) de seguida:
      // amb `max-age` el CDN el serviria antic durant una hora. Els mòduls ES
      // tenen el mateix problema per un altre motiu: l'HTML que els importa no
      // es cacheja mai, així que una versió nova podria demanar-li a un mòdul
      // vell un export que encara no té i quedar-se penjada.
      c.header("Cache-Control", "no-cache");
    } else {
      c.header("Cache-Control", c.req.path === "/" || c.req.path.endsWith(".html") ? "no-cache" : "public, max-age=3600");
    }
  }
});

app.get("/app", (c) => c.redirect("/app/", 308));
app.get("/app/", serveStatic({ path: `${config.publicDir}/app/index.html` }));
app.get("/legal", (c) => c.redirect("/legal/", 308));
app.get("/legal/", serveStatic({ path: `${config.publicDir}/legal/index.html` }));
app.get("/bones-practiques", (c) => c.redirect("/bones-practiques/", 308));
app.get("/bones-practiques/", serveStatic({ path: `${config.publicDir}/bones-practiques/index.html` }));
app.use("*", serveStatic({ root: config.publicDir }));
app.get("/", serveStatic({ path: `${config.publicDir}/index.html` }));
app.notFound((c) => c.req.path.startsWith("/api/")
  ? c.json({ error: "not_found" }, 404)
  : c.text("not found", 404));

app.onError((value, c) => {
  const error = errorFrom(value);
  const event = c.req.path === "/api/billing/sync"
    ? "billing_sync_failed"
    : c.req.path.startsWith("/api/predictions/")
      ? "prediction_request_failed"
      : c.req.path.startsWith("/api/auth/")
        ? "auth_request_failed"
        : "http_unhandled_error";
  const context = {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
  };

  logger.error({ event, err: error, ...context }, "Error no controlat durant la petició");
  void alertOps({ event, message: error.message, context });

  return c.req.path.startsWith("/api/")
    ? c.json({ error: "internal_server_error" }, 500)
    : c.text("internal server error", 500);
});

export function startServer() {
  const server = serve({ fetch: app.fetch, port: config.port });
  logger.info({ event: "server_started", port: config.port }, "Boletada escoltant");
  reportAlertConfiguration();

  let terminating = false;
  const fatal = (event, value) => {
    if (terminating) return;
    terminating = true;
    const error = errorFrom(value);
    logger.fatal({ event, err: error }, "El procés s’aturarà per un error fatal");
    server.close();
    const forceExit = setTimeout(() => process.exit(1), 6_000);
    void alertOps({ event, severity: "fatal", message: error.message })
      .finally(async () => {
        clearTimeout(forceExit);
        await pool.end().catch((poolError) => {
          logger.error({ event: "database_shutdown_failed", err: poolError }, "No s’ha pogut tancar PostgreSQL");
        });
        process.exit(1);
      });
  };
  process.once("uncaughtException", (error) => fatal("uncaught_exception", error));
  process.once("unhandledRejection", (reason) => fatal("unhandled_rejection", reason));

  const shutdown = (signal) => server.close(async () => {
    logger.info({ event: "server_stopped", signal }, "Boletada s’ha aturat correctament");
    await pool.end();
    process.exit(0);
  });
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
