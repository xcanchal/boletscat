import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { config } from "./config.mjs";
import { pool } from "./db.mjs";
import { sendTransactionalEmail } from "./email.mjs";
import { betterAuthLog } from "./logger.mjs";
import {
  isPasswordValid,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./password-policy.mjs";

export const auth = betterAuth({
  appName: "Boletada",
  database: pool,
  baseURL: config.authUrl,
  secret: config.authSecret,
  trustedOrigins: config.trustedOrigins,
  logger: {
    level: "info",
    log: betterAuthLog,
  },
  socialProviders: config.google.enabled ? {
    google: {
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
    },
  } : {},
  plugins: [emailOTP({
    overrideDefaultEmailVerification: true,
    storeOTP: "hashed",
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (type !== "email-verification") {
        throw new Error(`Tipus de codi no habilitat: ${type}`);
      }
      await sendTransactionalEmail({
        to: email,
        subject: "Codi de confirmació de Boletada",
        text: `El teu codi de confirmació és: ${otp}`,
        html: `<p>Introdueix aquest codi per confirmar el teu correu a Boletada:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>`,
      });
    },
  })],
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 10, max: 3 },
      "/sign-in/social": { window: 10, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: config.requireEmailVerification,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => {
      void sendTransactionalEmail({
        to: user.email,
        subject: "Restableix la contrasenya de Boletada",
        text: `Obre aquest enllaç per crear una contrasenya nova: ${url}`,
        html: `<p>Obre aquest enllaç per crear una contrasenya nova:</p><p><a href="${url}">Restablir la contrasenya</a></p>`,
      }).catch((error) => console.error("No s’ha pogut enviar el correu de recuperació", error));
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const password = ctx.path === "/sign-up/email"
        ? ctx.body?.password
        : ["/reset-password", "/change-password", "/set-password"].includes(ctx.path)
          ? ctx.body?.newPassword
          : undefined;

      if (password !== undefined && !isPasswordValid(password)) {
        throw new APIError("BAD_REQUEST", {
          code: "PASSWORD_REQUIREMENTS_NOT_MET",
          message: "La contrasenya no compleix els requisits de seguretat.",
        });
      }
    }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
});
