#!/bin/sh
set -e
mkdir -p public
echo "Generant geojson inicial…"
node score_estacions.mjs --all --out=public || \
  echo "(avís: no s'han pogut generar els geojson a l'arrencada; el cron ho reintentarà)"
exec node serve.mjs
