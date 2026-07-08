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

### Hoste (`hostFactor`) — ✅ implementat via MCSC
Es precalcula un cop (`buildHost.mjs`): per a cada estació, mostrejant una **graella de
~4 km** al voltant (perquè l'estació sol ser en clariana), el **tipus de bosc dominant**
del Mapa de Cobertes del Sòl (WMS de l'ICGC) → `estacions_host.json`. El scorer compara
el bosc de l'estació amb el que vol l'espècie:
- bosc dominant correcte → alt (escalat per la fracció forestal de l'entorn),
- el bo hi és però no domina → mig (0.45),
- un altre bosc → baix (0.25, *suau a propòsit*: boscos mixtos),
- entorn no forestal → molt baix (0.15).

*Categories MCSC: `conifer` (pins) · `deciduous` (roure/faig/castanyer) · `sclerophyll` (alzina/surera) · `ribera`.*

---

## Decisions de disseny (per què així)

| Decisió | Raó |
|---|---|
| **PWA, no nativa** | Només cal mapa + geolocalització. |
| **Per estació, sense graella** | Evita interpolar pluja; l'usuari tria zona, no metre quadrat. |
| **Stateless (meteo)** | Suma ponderada ≡ índex recursiu; res d'estat diari ni backfill. |
| **Hoste precalculat** | El bosc no canvia; es mostreja un cop i es cacheja a un JSON. |
| **JS/TS, no Python** | Amb estacions vam eliminar interpolació i balanç hídric (els motius per Python). |

---

## Fonts de dades

| Font | On | Contingut |
|---|---|---|
| Mesures XEMA | Socrata `nzvn-apee` | Semihorària. `codi_estacio`/`codi_variable`/`data_lectura`/`valor_lectura` |
| Estacions | Socrata `yqwd-vj5e` | nom, lat, lon, altitud |
| Variables | Socrata `4fb2-n3yi` | `35`=pluja · `32`=temp · `40`/`42`=Tx/Tn · `30`=vent · `33`=HR |
| **MCSC** | WMS ICGC `cobertes-sol` (capa `cobertes_2009`) | Tipus de bosc per coordenada (GetFeatureInfo, `text/plain`) |

**Pendents (futur):** DEM i sòls (ICGC) → orientació del vessant i retenció d'aigua ·
CatDrought (CREAF) → humitat de sòl alternativa · MCSC amb espècie fina (descàrrega) si cal.

---

## Com executar

Node 18+ (`fetch` de sèrie, cap `npm install`).

```bash
# 1) Un sol cop: precalcular el bosc de cada estació (~2-4 min)
node buildHost.mjs

# 2) Puntuar (regenera els geojson)
node score_estacions.mjs --all                       # totes les espècies, avui
node score_estacions.mjs --species=cep --date=2025-10-20   # una espècie, backtest
node score_estacions.mjs --list

# 3) Mapa (cal servir la carpeta; no file://)
npx serve            # o: python3 -m http.server 8000
```

Escriu `bolets.<espècie>.geojson` per espècie; el mapa (`index.html`) té selector d'espècie.

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

1. **Desplegament**: cron (Coolify) que corre `score_estacions.mjs --all` diari i serveix
   els geojson estàtics + `index.html`. Stateless → si un dia falla, l'endemà recalcula sol.
   (`buildHost.mjs` es corre a part, molt de tant en tant.)
2. **Calibrar** paràmetres i la duresa de l'hoste contra floracions recordades.
3. Considerar **Tn (glaçades)**, orientació del vessant (DEM), o espècie fina si cal.

---

## Fitxers

- **`score_estacions.mjs`** — scorer multi-espècie (llegeix `estacions_host.json`).
- **`buildHost.mjs`** — precompute de l'hoste (MCSC) → `estacions_host.json` (córrer un cop).
- **`index.html`** — mapa MapLibre amb selector d'espècie.
- **`estacions_host.json`** — bosc dominant per estació (generat; es pot versionar, canvia poc).
- **`bolets.<espècie>.geojson`** — sortides diàries (generades; no cal versionar).
- **`spike_xema.mjs` / `spike_mcsc.mjs`** — diagnòstics d'un sol ús (jubilats).

---

## Paràmetres afinables

`score_estacions.mjs`: `CAP`, `H0`, `LAG_RISE`/`LAG_FALL` (humitat) · el bloc `SPECIES`
(temporada, altitud, temperatura, bosc per espècie) · els factors dins `hostFactor` (duresa de l'hoste).
`buildHost.mjs`: `GRID`/`STEP` (radi i densitat del mostreig).
