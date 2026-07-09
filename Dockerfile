# Predictor de bolets — imatge única: serveix estàtic + el cron hi corre el scorer.
FROM node:20-slim
WORKDIR /app

# Cap dependència: tot va amb la llibreria estàndard de Node.
COPY . .

# public/ conté l'index.html i s'hi escriuen els geojson generats.
RUN mkdir -p public && cp index.html favicon.svg public/

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
