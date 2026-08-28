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

Per publicar-lo al web, normalitza l'export a un perfil compatible amb iOS i
posa el `moov` al principi de l'MP4:

```bash
ffmpeg -i out/boletada-promo.mp4 \
  -vf "scale=w=1280:h=720:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p" \
  -an -c:v libx264 -profile:v main -level:v 3.1 -preset slow -crf 18 \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off" \
  -movflags +faststart ../media/boletada-promo.mp4
```
