# Observabilitat mínima

La primera iteració escriu logs JSON a stdout perquè Coolify els reculli i envia a Telegram només errors operatius accionables. Les alertes internes tenen un cooldown fix de 5 minuts per `event`; totes les ocurrències continuen quedant registrades i una fallada de Telegram no pot fer fallar l’aplicació.

| Capa | Esdeveniments | Destinació |
| --- | --- | --- |
| Coolify | desplegament fallit, contenidor aturat, scheduled task fallida, servidor inaccessible, disc i backups | Telegram configurat a Coolify |
| API | peticions `/api/*`, `healthz`, `readyz` i respostes 5xx | JSON a stdout amb Pino |
| Aplicació | billing, correu, readiness, PostgreSQL i excepcions no controlades | JSON a stdout + Telegram |
| Scorer | generació diària fallida | JSON a stdout + Telegram |
| Better Auth | missatges interns, inclosos errors esperables d’usuari | JSON a stdout; sense Telegram directe |

## Variables de Coolify

Configura-les només en runtime. No exposis mai el token durant el build ni el desis al repositori.

```dotenv
LOG_LEVEL=info
APP_ENV=staging
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

A producció, usa `APP_ENV=production`. `LOG_LEVEL` és opcional i usa `info` per defecte. Les alertes de Telegram s’activen automàticament quan hi ha tant `TELEGRAM_BOT_TOKEN` com `TELEGRAM_CHAT_ID`; si només se’n configura un, l’aplicació ho adverteix al log d’arrencada.

Els logs locals de Coolify depenen del cicle de vida i la rotació dels contenidors. Si més endavant cal investigar incidències antigues, fer consultes agregades o conservar logs entre desplegaments, s’hi afegirà una destinació externa.

## Configuració externa de Coolify

A `Notifications → Telegram`, configura el mateix bot —o un grup diferent— i activa només:

- Deployment Failure
- Container Status Changes
- Scheduled Task Failure
- Server Unreachable
- Server Disk Usage
- Backup Failure

Envia una notificació de prova des de Coolify abans de donar la configuració per bona. Els avisos de Coolify són necessaris perquè una aplicació completament aturada no pot avisar per si mateixa.

## Contracte dels logs

Cada entrada de l’aplicació utilitza, quan aplica, aquesta forma:

```json
{
  "level": 50,
  "time": 1789040000000,
  "service": "boletada",
  "environment": "staging",
  "event": "billing_sync_failed",
  "requestId": "...",
  "method": "POST",
  "path": "/api/billing/sync",
  "status": 500,
  "durationMs": 123.4,
  "msg": "Error no controlat durant la petició"
}
```

No s’hi han d’afegir correus, contrasenyes, OTP, cookies, capçaleres d’autorització ni tokens. Pino també redueix aquests camps si s’intenten registrar accidentalment.
