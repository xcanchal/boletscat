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

if node scripts/check-active-predictions.mjs; then
  echo "La generació activa ja és vàlida; el cron publicarà les actualitzacions diàries."
else
  echo "Sense cap generació activa vàlida; generant mapa i punts inicials…"
  node score_estacions.mjs --all || \
    echo "(avís: no s'ha pogut generar el mapa a l'arrencada; el cron ho reintentarà)"
fi
exec npm start
