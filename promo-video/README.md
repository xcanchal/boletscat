# Vídeo promocional · Boletada

Peça de 16 segons en català, creada amb Remotion a 1920×1080 i 30 fps.

La composició principal és `BoletsPromo`. El mapa utilitza MapLibre, una base
topogràfica d'Esri i la predicció real de rossinyol generada el 26 d'agost de 2026.
Les quatre escenes també estan registrades individualment a Remotion Studio per
facilitar-ne l'edició.

```bash
npm install
npm run dev
npx remotion render BoletsPromo out/boletada-promo.mp4 --gl=angle --concurrency=1
```

El vídeo exportat és a `out/boletada-promo.mp4`.
