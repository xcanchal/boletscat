import { config } from "./config.mjs";

export async function sendTransactionalEmail({ to, subject, text, html }) {
  if (!config.email.apiKey) {
    if (config.isProduction) {
      throw new Error("Falta EMAIL_PROVIDER_API_KEY per enviar correus en producció");
    }
    console.info(`[email local] ${subject} -> ${to}\n${text}`);
    return;
  }

  const response = await fetch(config.email.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`El proveïdor de correu ha respost ${response.status}: ${detail}`);
  }
}
