import "dotenv/config";
import pino from "pino";

const environment = process.env.APP_ENV?.trim()
  || process.env.NODE_ENV?.trim()
  || "development";
const release = process.env.RELEASE_SHA?.trim()
  || process.env.SOURCE_COMMIT?.trim()
  || process.env.COMMIT_SHA?.trim()
  || undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
  base: {
    service: "boletada",
    environment,
    ...(release ? { release } : {}),
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      "password",
      "token",
      "otp",
      "email",
      "user.email",
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "err.details.state",
      "err.state",
      "err.token",
      "err.email",
      "*.password",
      "*.token",
      "*.otp",
    ],
    censor: "[REDACTED]",
  },
});

export function errorFrom(value) {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : "Error no identificat");
}

export function betterAuthLog(level, message, ...args) {
  const method = level === "error" ? "error" : level === "warn" ? "warn" : level === "debug" ? "debug" : "info";
  const error = args.find((value) => value instanceof Error);
  logger[method]({
    event: "better_auth",
    ...(error ? { err: errorFrom(error) } : {}),
  }, message);
}
