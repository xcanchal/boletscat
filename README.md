# 🍄 Predictor de bolets · Catalunya

Producte web de pagament que, a partir de **dades obertes** (Meteocat + MCSC), puntua
on hi ha millors condicions per trobar bolets, **per espècie**. El mapa requereix
compte i entitlement `boletada_pro`; les prediccions no són fitxers públics.

---

## Com funciona, en una frase

Per a **una espècie concreta**, calculem un **índex de 0 a 1** que combina humitat,
temperatura, altitud, temporada i **tipus de bosc**. La meteorologia de la XEMA
s'interpola sobre una graella forestal de 250 m; el terreny es precalcula un cop.

```
score = humitat × temperatura × altitud × estació × hoste     (cada factor 0..1)
```

---

## Espècies i la seva ecologia

Paràmetres = **priors ecològics raonables, no òptims** (sense ground truth no es calibren fi).

| Espècie | Bosc (MCSC) | Temporada | Altitud | Notes |
|---|---|---|---|---|
| **Rovelló** (*Lactarius*) | conifer | Set–Nov | Baixa–1600 m | Cas base |
| **Cep** (*Boletus edulis* grp) | conifer/deciduous/sclerophyll | Set–Nov (+estiu) | 600–1800 m | Vol humitat sostinguda, fresc |
| **Llenega** (*Hygrophorus*) | conifer | Oct–Des | Mitja | Tardà, aguanta el fred |
| **Trompeta** (*Craterellus*) | deciduous/sclerophyll | Set–Nov | 300–1400 m | Planifolis, obagues |
| **Rossinyol** (*C. cibarius*) | conifer/deciduous/sclerophyll | Jun–Oct | 300–1600 m | Generalista, tolera calor |
| **Camagroc** (*C. lutescens*) | conifer | Oct–Gen | 400–1600 m | Molt tardà, fred |
| **Múrgola** (*Morchella*) | ribera/deciduous | **Mar–Maig** | 200–1400 m | **Primavera!** Sapròfit |

---

## El model, factor a factor

### Humitat (`hScore`) — compartida
Combina dos senyals de la pluja dels últims 30 dies, sempre amb **sostre diari**
(`CAP`: per sobre compta menys perquè hi ha escorrentia):

- **Impuls de fructificació**: la pluja no encén bolets immediatament; el pes puja
  durant els primers dies, té el màxim cap al dia 8 i després decau.
- **Reserva hídrica**: decau gradualment però inclou la pluja d'avui, que ajuda a
  conservar la humitat del sòl i els carpòfors que ja creixien.

Cada senyal arriba exactament a `1` quan assoleix el seu llindar ideal provisional
(`TRIGGER_IDEAL` / `RESERVE_IDEAL`). Així un lloc realment ideal pot puntuar `1`,
però el millor lloc d'un dia dolent no es normalitza artificialment.

### Temperatura · Altitud · Estació — per espècie
Trapezis de finestra ideal (temperatura, altitud) i **porta temporal** (fora de mesos → ~0).

### Hoste (`hostFactor`) — via MCSC
Es precalcula un cop (`buildHost.mjs`): per a cada estació, mostrejant una **graella de
~4 km** al voltant (perquè l'estació sol ser en clariana), el **tipus de bosc dominant**
del Mapa de Cobertes del Sòl (WMS de l'ICGC) → `estacions_host.json`. El scorer compara
el bosc de l'estació amb el que vol l'espècie: dominant correcte → alt · el bo hi és però
no domina → mig (0.45) · un altre bosc → baix (0.25, *suau a propòsit*) · no forestal → 0.15.

*Categories MCSC: `conifer` (pins) · `deciduous` (roure/faig/castanyer) · `sclerophyll` (alzina/surera) · `ribera`.*

### Graella de 250 m

`buildGrid.mjs` descarrega una sola vegada la coberta del sòl 2024 i el model
d'elevacions de l'ICGC. En desa una representació compacta a `graella.bin` (bosc +
altitud per cel·la). El procés diari interpola la meteorologia, corregeix la
temperatura amb l'altitud local i genera un PNG transparent per espècie. El
navegador rep una sola imatge d'uns centenars de KB, no 1,2 milions de geometries.
La dada manté la resolució de 250 m, però el client la suavitza a qualsevol zoom
perquè es llegeixi sempre com un mapa de calor. Si el punt tocat no té dades però
el color prové d'una cel·la pròxima, el popup usa la cel·la forestal més propera
dins d'1,5 km i n'indica la distància. El fons fosc i les etiquetes són vectorials
(CARTO + OpenStreetMap); relleu i satèl·lit es mantenen com a capes Esri sota les
mateixes etiquetes vectorials.

---

## Fonts de dades

| Font | On | Contingut |
|---|---|---|
| Mesures XEMA | Socrata `nzvn-apee` | Semihorària. `codi_estacio`/`codi_variable`/`data_lectura`/`valor_lectura` |
| Estacions | Socrata `yqwd-vj5e` | nom, lat, lon, altitud |
| Variables | Socrata `4fb2-n3yi` | `35`=pluja · `32`=temp · `40`/`42`=Tx/Tn · `30`=vent · `33`=HR |
| **MCSC** | WMS ICGC `cobertes-sol` (`cobertes_2009`) | Tipus de bosc per coordenada (GetFeatureInfo, `text/plain`) |
| **MCSC 2024** | WMS ICGC `cobertes_2024` | Coberta forestal de la graella de 250 m |
| **MET 5 m** | WCS ICGC `icc_mdt` | Altitud agregada a la graella de 250 m |
| **Geocodificador ICGC** | API REST `geocodificador/invers` | Topònim més proper quan es clica el mapa |

---

## Com executar (local)

Node 22+. Docker només és necessari si vols PostgreSQL local; amb Neon no cal.

```bash
# Configuració local (substitueix els secrets d'exemple si cal)
cp .env.example .env
npm install

# Esquema Better Auth/Boletada sobre la DATABASE_URL configurada
npm run db:migrate

# Prediccions privades + servidor web
node score_estacions.mjs --all --out=private/predictions
npm run dev            # http://localhost:8080
```

`npm run prepare:public` genera només el client i els vendors públics. El scorer ha
d'escriure sempre a `private/predictions`, mai a `public`.

La landing pública es publica a `/`; el registre, el paywall i el predictor viuen
a `/app/`. `npm run build:mobile` continua empaquetant directament el predictor.

---

## Desplegament (Docker + Coolify)

La imatge executa Hono, aplica les migracions, genera les prediccions dins
`private/predictions` i serveix la landing, el client de `/app/` i els vendors des
de `public/`.
PostgreSQL ha de ser persistent; pot ser Neon o un recurs separat a Coolify.

**Provar en local:**
```bash
docker compose up -d db
docker build -t boletada .
docker run --env-file .env -p 8080:8080 boletada
```

**A Coolify:**
1. Configurar la `DATABASE_URL` de producció de Neon o d’un PostgreSQL persistent.
2. Desplegar el repo amb el `Dockerfile`, port **8080**, domini `boletada.cat`.
3. Configurar les variables de `.env.example` amb secrets reals.
4. **Scheduled Task**: `node score_estacions.mjs --all --out=private/predictions`, freqüència `0 6 * * *`.

**Notes honestes:**
- El cron de Coolify va en **UTC** (`0 6 * * *` ≈ 7-8 h a casa). Diari a qualsevol hora ja va bé.
- PostgreSQL necessita persistència i backups. Les prediccions es poden regenerar i
  no necessiten persistència si l'scheduled task corre dins del mateix contenidor.
- `buildHost.mjs` **no** va al cron. Per refrescar el bosc (un cop l'any, o mai), el corres en local i committeges el `estacions_host.json` nou.

---

## App mòbil (Capacitor)

La mateixa interfície web s'empaqueta localment per a iOS i Android. Les prediccions
diàries no queden incloses a l'app: es carreguen de `boletada.cat`, de
manera que s'actualitzen sense haver de publicar una versió nova a les botigues.

```bash
npm install
npm run cap:sync          # genera www/ i sincronitza iOS + Android
npm run cap:open:ios      # obre el projecte amb Xcode
npm run cap:open:android  # obre el projecte amb Android Studio
```

`build-mobile.mjs` empaqueta MapLibre dins l'app i prepara el client natiu. Els
projectes `ios/` i `android/` contenen les metadades, icones, permisos i configuració
de publicació pròpies de cada botiga.

---

## Validació

No hi ha ground truth ("on he trobat X"). Validem per:
1. **Backtest** (`--date`) a una tardor bona → mirar si s'encenen les zones esperades.
2. **Divergència entre espècies**: rovelló → pinedes, trompeta → planifolis, etc.
3. **Coherència amb episodis reals** (ex.: DANA d'octubre 2025 a l'Ebre → d'aquí sostre+lag).

*Fora de temporada o en sec, tot surt zero: és correcte.*

El mapa tradueix l'índex tècnic a cinc nivells ordenats: **Molt baixa · Baixa ·
Mitjana · Alta · Molt alta**. Al detall també dona una recomanació breu (`No hi vagis`,
`Pots provar`, `Ves-hi`...). El valor `0..1` es manté per poder auditar el model;
és un índex de condicions, no una probabilitat estadística de trobar bolets.

---

## Limitacions conegudes

- **MCSC dominant** pot ignorar un arbre minoritari (per això la penalització d'hoste és suau).
- La meteorologia entre estacions continua sent una estimació; la graella afina
  l'hàbitat i l'altitud, no crea observacions meteorològiques noves.
- **Sense ground truth**, els paràmetres són raonables, no òptims.
- **Espècie fina** de pi/roure no distingida (categoria ampla del MCSC simplificat).

---

## Següents passos

1. **Calibrar** paràmetres i la duresa de l'hoste contra floracions recordades.
2. Considerar **Tn (glaçades)**, orientació del vessant (DEM), o espècie fina (MCSC complet) si cal.
3. PWA: instal·lable + geolocalització "on soc ara".

---

## Fitxers

| Fitxer | Què és |
|---|---|
| `score_estacions.mjs` | Scorer multi-espècie: punts GeoJSON + mapa PNG per espècie. |
| `buildGrid.mjs` | Precompute de coberta forestal i altitud a 250 m → `graella.bin`. |
| `raster.mjs` | Codificador/descodificador PNG sense dependències. |
| `buildHost.mjs` | Precompute de l'hoste (MCSC) → `estacions_host.json` (córrer un cop). |
| `index.html` | Landing pública de Boletada. |
| `app.html` | Mapa MapLibre, accés i selector d'espècie. |
| `src/server.mjs` | Servidor Hono: auth, billing i fitxers privats. |
| `src/auth.mjs` · `src/db.mjs` | Better Auth i PostgreSQL. |
| `src/revenuecat.mjs` | Sincronització de l’entitlement amb RevenueCat. |
| `migrations/001_app.sql` | Projecció local mínima de l’accés `boletada_pro`. |
| `Dockerfile` · `docker-entrypoint.sh` · `.dockerignore` | Imatge de desplegament. |
| `estacions_host.json` | Bosc dominant per estació (generat; **es versiona**, canvia poc). |
| `bolets.<espècie>.geojson` | Sortides diàries (generades; **no** es versionen). |
| `bolets.<espècie>.png` · `bolets.grid.json` | Ràsters diaris i georeferenciació (generats). |
| `spike_xema.mjs` · `spike_mcsc.mjs` | Diagnòstics d'un sol ús (jubilats). |

---

## Paràmetres afinables

`score_estacions.mjs`: `CAP`, `LAG_RISE`/`LAG_FALL`, `RESERVE_FALL`,
`TRIGGER_IDEAL`/`RESERVE_IDEAL` (humitat) · el bloc `SPECIES`
(temporada, altitud, temperatura, bosc per espècie) · els factors dins `hostFactor` (duresa de l'hoste).
`buildHost.mjs`: `GRID`/`STEP` (radi i densitat del mostreig).
