# 🍄 Predictor de bolets · Catalunya

Eina personal que, a partir de **dades obertes** (Meteocat + MCSC), puntua on és més
probable trobar bolets aquesta setmana, **per espècie**. Privada, d'un sol usuari,
barata de mantenir i honesta amb les seves limitacions.

---

## Com funciona, en una frase

Per a cada estació de la XEMA i per a **una espècie concreta**, calculem un
**score de 0 a 1** que combina pluja útil (amb retard de fructificació),
temperatura, altitud, temporada i **tipus de bosc**. Sense estat ni interpolació:
tot es recalcula demanant a l'API una finestra de dies (l'hoste es precalcula un cop).

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
Pluja acumulada 30 dies, amb **sostre diari** (`CAP`: per sobre és escorrentia, no
humitat) i **lag de fructificació** (`lagWeight`: pic de pes cap als 6-9 dies, no ahir).
Es satura amb `1 − e^(−H/H0)`.

### Temperatura · Altitud · Estació — per espècie
Trapezis de finestra ideal (temperatura, altitud) i **porta temporal** (fora de mesos → ~0).

### Hoste (`hostFactor`) — via MCSC
Es precalcula un cop (`buildHost.mjs`): per a cada estació, mostrejant una **graella de
~4 km** al voltant (perquè l'estació sol ser en clariana), el **tipus de bosc dominant**
del Mapa de Cobertes del Sòl (WMS de l'ICGC) → `estacions_host.json`. El scorer compara
el bosc de l'estació amb el que vol l'espècie: dominant correcte → alt · el bo hi és però
no domina → mig (0.45) · un altre bosc → baix (0.25, *suau a propòsit*) · no forestal → 0.15.

*Categories MCSC: `conifer` (pins) · `deciduous` (roure/faig/castanyer) · `sclerophyll` (alzina/surera) · `ribera`.*

---

## Fonts de dades

| Font | On | Contingut |
|---|---|---|
| Mesures XEMA | Socrata `nzvn-apee` | Semihorària. `codi_estacio`/`codi_variable`/`data_lectura`/`valor_lectura` |
| Estacions | Socrata `yqwd-vj5e` | nom, lat, lon, altitud |
| Variables | Socrata `4fb2-n3yi` | `35`=pluja · `32`=temp · `40`/`42`=Tx/Tn · `30`=vent · `33`=HR |
| **MCSC** | WMS ICGC `cobertes-sol` (`cobertes_2009`) | Tipus de bosc per coordenada (GetFeatureInfo, `text/plain`) |

---

## Com executar (local)

Node 18+ (`fetch` de sèrie, cap `npm install`).

```bash
# 1) Un sol cop: precalcular el bosc de cada estació (~2-4 min)
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

Una sola imatge que **serveix estàtic** (`./public`: `index.html` + geojson) i, a
l'arrencada, genera els geojson. El **scheduled task** de Coolify els regenera cada dia
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

## Validació

No hi ha ground truth ("on he trobat X"). Validem per:
1. **Backtest** (`--date`) a una tardor bona → mirar si s'encenen les zones esperades.
2. **Divergència entre espècies**: rovelló → pinedes, trompeta → planifolis, etc.
3. **Coherència amb episodis reals** (ex.: DANA d'octubre 2025 a l'Ebre → d'aquí sostre+lag).

*Fora de temporada o en sec, tot surt zero: és correcte.*

---

## Limitacions conegudes

- **MCSC dominant** pot ignorar un arbre minoritari (per això la penalització d'hoste és suau).
- **L'estació és un proxy del bosc** (pot ser a la vall i el bosc al vessant).
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
| `score_estacions.mjs` | Scorer multi-espècie (llegeix `estacions_host.json`, `--out` per la carpeta de sortida). |
| `buildHost.mjs` | Precompute de l'hoste (MCSC) → `estacions_host.json` (córrer un cop). |
| `index.html` | Mapa MapLibre amb selector d'espècie. |
| `serve.mjs` | Servidor estàtic sense dependències (serveix `./public`). |
| `Dockerfile` · `docker-entrypoint.sh` · `.dockerignore` | Imatge de desplegament. |
| `estacions_host.json` | Bosc dominant per estació (generat; **es versiona**, canvia poc). |
| `bolets.<espècie>.geojson` | Sortides diàries (generades; **no** es versionen). |
| `spike_xema.mjs` · `spike_mcsc.mjs` | Diagnòstics d'un sol ús (jubilats). |

---

## Paràmetres afinables

`score_estacions.mjs`: `CAP`, `H0`, `LAG_RISE`/`LAG_FALL` (humitat) · el bloc `SPECIES`
(temporada, altitud, temperatura, bosc per espècie) · els factors dins `hostFactor` (duresa de l'hoste).
`buildHost.mjs`: `GRID`/`STEP` (radi i densitat del mostreig).
