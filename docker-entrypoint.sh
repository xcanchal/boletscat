#!/bin/sh
set -e
mkdir -p public private/predictions

attempt=1
until npm run db:migrate; do
  if [ "$attempt" -ge 15 ]; then
    echo "No s'han pogut aplicar les migracions després de $attempt intents" >&2
    exit 1
  fi
  echo "PostgreSQL encara no està disponible; reintent $attempt/15…"
  attempt=$((attempt + 1))
  sleep 2
done

echo "Generant mapa i punts inicials…"
node score_estacions.mjs --all --out=private/predictions || \
  echo "(avís: no s'ha pogut generar el mapa a l'arrencada; el cron ho reintentarà)"
exec npm start
