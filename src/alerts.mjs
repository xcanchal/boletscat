import "dotenv/config";
import { logger as defaultLogger } from "./logger.mjs";

export const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60 * 1_000;
const TELEGRAM_TIMEOUT_MS = 5_000;

function clean(value, maximum = 500) {
  return String(value ?? "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .replace(/\b(authorization|cookie|otp|password|state|token)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function alertText({ event, message, severity = "error", context = {} }, environment) {
  const icon = severity === "fatal" ? "🔥" : severity === "warn" ? "⚠️" : "🚨";
  const lines = [
    `${icon} Boletada · ${environment}`,
    clean(event, 100),
    clean(message),
  ];
  for (const [key, value] of Object.entries(context)) {
    const sensitive = /authorization|cookie|email|otp|password|state|token/i.test(key);
    if (!sensitive && value !== undefined && value !== null && value !== "") {
      lines.push(`${clean(key, 40)}: ${clean(value, 160)}`);
    }
  }
  return lines.join("\n").slice(0, 4_000);
}

export function createTelegramAlerter({
  token = process.env.TELEGRAM_BOT_TOKEN?.trim(),
  chatId = process.env.TELEGRAM_CHAT_ID?.trim(),
  environment = process.env.APP_ENV?.trim() || process.env.NODE_ENV?.trim() || "development",
  cooldownMs = DEFAULT_ALERT_COOLDOWN_MS,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  logger = defaultLogger,
} = {}) {
  const enabled = Boolean(token && chatId);
  const lastAttempt = new Map();

  return {
    enabled,
    async send(alert) {
      if (!enabled) return { sent: false, reason: "disabled" };

      const key = clean(alert.event, 100) || "unknown_error";
      const previous = lastAttempt.get(key);
      const current = now();
      if (previous !== undefined && current - previous < cooldownMs) {
        return { sent: false, reason: "cooldown" };
      }
      lastAttempt.set(key, current);

      try {
        const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: alertText(alert, environment),
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`Telegram ha respost ${response.status}`);
        return { sent: true };
      } catch (error) {
        logger.warn({ event: "telegram_alert_failed", err: error }, "No s’ha pogut enviar l’avís operatiu");
        return { sent: false, reason: "delivery_failed" };
      }
    },
  };
}

export const telegramAlerter = createTelegramAlerter();

export function alertOps(alert) {
  return telegramAlerter.send(alert);
}

export function reportAlertConfiguration() {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  const hasChatId = Boolean(process.env.TELEGRAM_CHAT_ID?.trim());
  if (hasToken !== hasChatId) {
    defaultLogger.warn({
      event: "ops_alerts_misconfigured",
      hasToken,
      hasChatId,
    }, "Configuració incompleta: Telegram necessita TELEGRAM_BOT_TOKEN i TELEGRAM_CHAT_ID");
    return;
  }
  defaultLogger.info({ event: "ops_alerts_ready", enabled: telegramAlerter.enabled }, "Configuració d’alertes operatives carregada");
}
