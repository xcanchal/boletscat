# Correus puntuals

CLI per enviar un correu concret a un client des del terminal, fent servir la mateixa
API de Resend i les mateixes variables d'entorn que `src/email.mjs` del servidor.
No afegeix cap dependència nova: parla directament amb `EMAIL_PROVIDER_URL`.

```bash
npm run email:send -- --to client@example.com --subject "Benvingut a Boletada" --html "<p>Gràcies!</p>"
```

## Opcions

| Opció | Obligatòria | Descripció |
| --- | --- | --- |
| `--to <adreça>` | sí | Destinatari. Repetible o separat per comes. |
| `--subject <text>` | sí | Assumpte del correu. |
| `--html <html>` | una de les 4 | Cos HTML inline. |
| `--html-file <ruta>` | una de les 4 | Cos HTML llegit d'un fitxer (p. ex. `scripts/emails/templates/exemple.html`). |
| `--text <text>` | una de les 4 | Cos en text pla. |
| `--text-file <ruta>` | una de les 4 | Cos en text pla llegit d'un fitxer. |
| `--from <adreça>` | no | Remitent. Per defecte `EMAIL_FROM`. Ha de ser un domini verificat a Resend. |
| `--cc <adreça>` | no | Còpia. Repetible o separat per comes. |
| `--bcc <adreça>` | no | Còpia oculta. Repetible o separat per comes. |
| `--reply-to <adreça>` | no | Adreça de resposta. |
| `--dry-run` | no | Mostra la petició que s'enviaria i surt sense enviar res. |
| `--help` | no | Mostra l'ajuda. |

## Variables d'entorn

Es llegeixen del `.env` a través de `src/config.mjs`:

| Variable | Per defecte | Ús |
| --- | --- | --- |
| `EMAIL_PROVIDER_API_KEY` | — | Clau `re_…` de Resend. Sense clau el script falla (fora de `--dry-run`). |
| `EMAIL_FROM` | `Boletada <hola@boletada.cat>` | Remitent per defecte. |
| `EMAIL_PROVIDER_URL` | `https://api.resend.com/emails` | Endpoint de Resend. |

## Petició i resposta

El script fa exactament la mateixa crida que el SDK de Resend:

```http
POST https://api.resend.com/emails
Authorization: Bearer re_xxxxxxxxx
Content-Type: application/json

{
  "from": "Boletada <hola@boletada.cat>",
  "to": ["client@example.com"],
  "subject": "Benvingut a Boletada",
  "html": "<p>Gràcies!</p>",
  "reply_to": "hola@boletada.cat"
}
```

Resposta correcta: `200` amb `{ "id": "…" }` — el script imprimeix l'id.
Qualsevol altre codi imprimeix el cos de l'error i surt amb codi 1.

## Exemples

```bash
# Provar sense enviar
npm run email:send -- --to client@example.com --subject "Prova" --text "Hola" --dry-run

# Plantilla HTML + alternativa en text pla
npm run email:send -- \
  --to client@example.com \
  --subject "Benvingut a Boletada" \
  --html-file scripts/emails/templates/exemple.html \
  --text "Hola! Obre el mapa a https://boletada.cat/app/"

# Diversos destinataris amb resposta a hola@
npm run email:send -- --to un@example.com,dos@example.com --subject "Novetats" \
  --html "<p>Ja tenim la temporada activa.</p>" --reply-to hola@boletada.cat
```

## Plantilles

`templates/` guarda els cossos HTML reutilitzables. `exemple.html` és el punt de
partida: copia'l, canvia el text i passa'l amb `--html-file`.
