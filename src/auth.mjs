import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { config } from "./config.mjs";
import { pool } from "./db.mjs";
import { sendTransactionalEmail } from "./email.mjs";
import { deleteRevenueCatCustomer } from "./revenuecat.mjs";
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
  socialProviders: config.google.enabled ? {
    google: {
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
    },
  } : {},
  // Les operacions destructives de Better Auth, com eliminar el compte,
  // exigeixen haver iniciat sessió fa menys de quinze minuts.
  session: {
    freshAge: 15 * 60,
  },
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
      "/delete-user": { window: 600, max: 3 },
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
  user: {
    deleteUser: {
      enabled: true,
      // El producte web actual usa RevenueCat Billing: eliminar-ne el customer
      // cancel·la la renovació immediatament. Si Billing no confirma la supressió,
      // conservem la identitat local per no deixar cap cobrament sense compte.
      // Abans d'afegir Apple/Google caldrà adaptar aquest flux a les seves botigues.
      beforeDelete: async (user) => {
        await deleteRevenueCatCustomer(user.id);
      },
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
