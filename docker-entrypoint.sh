#!/bin/sh
set -e
mkdir -p public
echo "Generant mapa i punts inicials…"
node score_estacions.mjs --all --out=public || \
  echo "(avís: no s'ha pogut generar el mapa a l'arrencada; el cron ho reintentarà)"
exec node serve.mjs
