import { config } from "./config.mjs";
import { alertOps } from "./alerts.mjs";
import { logger } from "./logger.mjs";

export async function sendTransactionalEmail({ to, subject, text, html }) {
  if (!config.email.apiKey) {
    if (config.isProduction) {
      const error = new Error("Falta EMAIL_PROVIDER_API_KEY per enviar correus en producció");
      logger.error({ event: "email_delivery_failed", err: error }, "El correu transaccional no està configurat");
      void alertOps({ event: "email_delivery_failed", message: error.message });
      throw error;
    }
    logger.info({ event: "email_local_preview", subject }, "Correu transaccional omès fora de producció");
    return;
  }

  let response;
  try {
    response = await fetch(config.email.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html }),
    });
  } catch (error) {
    logger.error({ event: "email_delivery_failed", err: error }, "El proveïdor de correu no està disponible");
    void alertOps({ event: "email_delivery_failed", message: error.message });
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`El proveïdor de correu ha respost ${response.status}`);
    logger.error({ event: "email_delivery_failed", err: error, providerStatus: response.status }, "El correu transaccional ha fallat");
    void alertOps({
      event: "email_delivery_failed",
      message: error.message,
      context: { providerStatus: response.status },
    });
    throw error;
  }
}
