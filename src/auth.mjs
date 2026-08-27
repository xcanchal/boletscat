import { betterAuth } from "better-auth";
import { config } from "./config.mjs";
import { pool } from "./db.mjs";
import { sendTransactionalEmail } from "./email.mjs";

export const auth = betterAuth({
  appName: "Boletada",
  database: pool,
  baseURL: config.authUrl,
  secret: config.authSecret,
  trustedOrigins: config.trustedOrigins,
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 10, max: 3 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: config.requireEmailVerification,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendTransactionalEmail({
        to: user.email,
        subject: "Restableix la contrasenya de Boletada",
        text: `Obre aquest enllaç per crear una contrasenya nova: ${url}`,
        html: `<p>Obre aquest enllaç per crear una contrasenya nova:</p><p><a href="${url}">Restablir la contrasenya</a></p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendTransactionalEmail({
        to: user.email,
        subject: "Confirma el teu correu de Boletada",
        text: `Confirma el teu correu obrint aquest enllaç: ${url}`,
        html: `<p>Confirma el teu correu per entrar a Boletada:</p><p><a href="${url}">Confirmar el correu</a></p>`,
      });
    },
  },
});
