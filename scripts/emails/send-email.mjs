#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config } from "../../src/config.mjs";

const usage = `Envia un correu puntual a un client via Resend.

Ús:
  node scripts/emails/send-email.mjs --to client@example.com --subject "Hola" --html "<p>Va bé!</p>"

Opcions:
  --to <adreça>         Destinatari. Repetible o separat per comes. Obligatori.
  --subject <text>      Assumpte. Obligatori.
  --html <html>         Cos HTML.
  --html-file <ruta>    Cos HTML llegit d'un fitxer.
  --text <text>         Cos en text pla.
  --text-file <ruta>    Cos en text pla llegit d'un fitxer.
  --from <adreça>       Remitent. Per defecte EMAIL_FROM (${config.email.from}).
  --cc <adreça>         Còpia. Repetible o separat per comes.
  --bcc <adreça>        Còpia oculta. Repetible o separat per comes.
  --reply-to <adreça>   Adreça de resposta.
  --dry-run             Mostra el que s'enviaria i surt sense enviar res.
  --help                Mostra aquesta ajuda.

Cal indicar com a mínim --html, --html-file, --text o --text-file.
Llegeix EMAIL_PROVIDER_API_KEY, EMAIL_FROM i EMAIL_PROVIDER_URL de l'entorn (.env).`;

const { values } = parseArgs({
  options: {
    to: { type: "string", multiple: true },
    subject: { type: "string" },
    html: { type: "string" },
    "html-file": { type: "string" },
    text: { type: "string" },
    "text-file": { type: "string" },
    from: { type: "string" },
    cc: { type: "string", multiple: true },
    bcc: { type: "string", multiple: true },
    "reply-to": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

function fail(message) {
  console.error(`Error: ${message}\n\n${usage}`);
  process.exit(1);
}

function addresses(list = []) {
  return list.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

function assertAddresses(list, label) {
  for (const address of list) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.replace(/^.*<|>$/g, ""))) {
      fail(`${label} no és una adreça vàlida: ${address}`);
    }
  }
  return list;
}

const to = assertAddresses(addresses(values.to), "--to");
if (!to.length) fail("cal com a mínim un --to");

const subject = values.subject?.trim();
if (!subject) fail("cal un --subject");

if (values.html && values["html-file"]) fail("--html i --html-file són excloents");
if (values.text && values["text-file"]) fail("--text i --text-file són excloents");

const html = values["html-file"] ? await readFile(values["html-file"], "utf8") : values.html;
const text = values["text-file"] ? await readFile(values["text-file"], "utf8") : values.text;
if (!html && !text) fail("cal un cos: --html, --html-file, --text o --text-file");

const payload = {
  from: values.from?.trim() || config.email.from,
  to,
  subject,
  ...(html ? { html } : {}),
  ...(text ? { text } : {}),
  ...(values.cc?.length ? { cc: assertAddresses(addresses(values.cc), "--cc") } : {}),
  ...(values.bcc?.length ? { bcc: assertAddresses(addresses(values.bcc), "--bcc") } : {}),
  ...(values["reply-to"] ? { reply_to: assertAddresses([values["reply-to"]], "--reply-to")[0] } : {}),
};

if (values["dry-run"]) {
  console.log(`[dry-run] POST ${config.email.apiUrl}`);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (!config.email.apiKey) {
  fail("falta EMAIL_PROVIDER_API_KEY a l'entorn; afegeix-la al .env o usa --dry-run");
}

const response = await fetch(config.email.apiUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.email.apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const detail = await response.text();
if (!response.ok) {
  console.error(`El proveïdor de correu ha respost ${response.status}: ${detail}`);
  process.exit(1);
}

let id;
try {
  id = JSON.parse(detail).id;
} catch {
  id = null;
}
console.log(`Correu enviat a ${to.join(", ")}${id ? ` (id ${id})` : ""}`);
