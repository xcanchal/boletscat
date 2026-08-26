# 🍄 Predictor de bolets · Catalunya

Eina personal que, a partir de **dades obertes** (Meteocat + MCSC), puntua on és més
probable trobar bolets aquesta setmana, **per espècie**. Privada, d'un sol usuari,
barata de mantenir i honesta amb les seves limitacions.

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
De lluny, el mapa interpola visualment el ràster perquè es llegeixi com un mapa de
calor; en apropar-se mostra nítidament les cel·les originals de 250 m.

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

Node 18+ (`fetch` de sèrie, cap `npm install`).

```bash
# 1) Un sol cop: terreny detallat + bosc al voltant de les estacions
node buildGrid.mjs
node buildHost.mjs

# 2) Puntuar (regenera els geojson)
node score_estacions.mjs --all                         # totes les espècies, avui
node score_estacions.mjs --species=cep --date=2025-10-20  # una espècie, backtest
node score_estacions.mjs --list

# 3) Mapa (cal servir la carpeta; no file://)
npx serve            # o: python3 -m http.server 8000
```

El scorer accepta `--out=<dir>` (per escriure els geojson on el servidor els serveix, p.ex. `public`).

---

## Desplegament (Docker + Coolify)

Una sola imatge que **serveix estàtic** (`./public`: `index.html` + PNG + GeoJSON) i, a
l'arrencada, genera les sortides. El **scheduled task** de Coolify les regenera cada dia
dins el mateix contenidor. La part meteo és stateless → si es reinicia o redesplega, es
reconstrueix sol.

**Provar en local:**
```bash
docker build -t boletscat .
docker run -p 8080:8080 boletscat     # http://localhost:8080
```

**A Coolify:**
1. Nou recurs → desplega des del repo. Detecta el `Dockerfile` sol.
2. Port **8080**; assigna-li un domini.
3. Desplega (l'entrypoint genera els geojson i aixeca el servidor).
4. **Scheduled Task**: comanda `node score_estacions.mjs --all --out=public`, freqüència `0 6 * * *`.

**Notes honestes:**
- El cron de Coolify va en **UTC** (`0 6 * * *` ≈ 7-8 h a casa). Diari a qualsevol hora ja va bé.
- **No cal volum**: es regenera a l'arrencada i cada dia. Un volum per `public/` només estalviaria la crida a Socrata de l'arrencada.
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
| `index.html` | Mapa MapLibre amb selector d'espècie. |
| `serve.mjs` | Servidor estàtic sense dependències (serveix `./public`). |
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
