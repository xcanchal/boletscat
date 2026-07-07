# 🍄 Predictor de bolets · Catalunya

Eina personal que, a partir de **dades obertes de Meteocat**, puntua on és més
probable trobar bolets aquesta setmana. Privada, d'un sol usuari, pensada per
ser barata de mantenir i honesta amb les seves limitacions.

---

## Com funciona, en una frase

Per a cada estació meteorològica de la XEMA calculem un **score de 0 a 1** que
combina quanta pluja útil ha caigut (amb el retard de fructificació), si la
temperatura és bona, i si l'entorn és bosc. No hi ha base de dades ni interpolació:
tot es recalcula a cada execució demanant a l'API una finestra de dies.

```
score = humitat × temperatura × altitud × hoste        (cada factor 0..1)
```

---

## El model, factor a factor

### 1. Humitat (`hScore`)
Pluja acumulada dels últims **30 dies**, però amb dos matisos que no són òbvis i
que vam descobrir validant amb dades reals:

- **Sostre diari (`CAP`, 30 mm).** Una tromba de 90 mm en una hora no s'infiltra:
  se'n va barranc avall (escorrentia). Per sobre del sostre, els mm de més no
  compten com a humitat de sòl. Això evita que una DANA catastròfica surti com a
  "gran setmana de bolets".
- **Lag de fructificació (`lagWeight`).** El bolet triga ~1-2 setmanes a sortir
  després de la pluja. Per tant la pluja d'ahir compta poc, el pic de pes és cap
  als **6-9 dies**, i després s'esvaeix a mesura que el sòl s'asseca (~3 setmanes).
  És una diferència de dues exponencials (paràmetres `LAG_RISE` / `LAG_FALL`).

Després es passa per una corba que **satura** (`1 − e^(−H/H0)`): a partir de cert
reg acumulat, més pluja ja no fa més bolets.

### 2. Temperatura (`tempFactor`)
Finestra ideal **10-20 °C**. Baixa a 0 amb glaçada (<2 °C) o massa calor (>28 °C).
Fem servir la mitjana dels últims 5 dies.

### 3. Altitud (`altFactor`) — ⚠️ PROXY provisional
Mentre no tinguem el mapa de boscos, l'altitud fa de tapaforats de "hi ha bosc?".
Banda òptima de pins/bolets ~**400-1600 m**; per sobre de ~2000 m no hi ha bosc
(roca/gespa alpina) → 0. **No és la veritat**: un punt a 1200 m pot ser alzinar o
pastura, no pineda. Ho substituirà l'hoste real (veure Següents passos).

### 4. Hoste (`hostFactor`) — 🔜 pendent
L'arbre micoríxic és el factor **clau** per a bolets (els rovellons volen pins).
Ara mateix és 1 per a tothom. S'omplirà creuant la coordenada de cada estació amb
el **MCSC** (tipus de bosc dominant).

---

## Decisions de disseny (per què així)

| Decisió | Raó |
|---|---|
| **PWA, no app nativa** | Només cal mapa + geolocalització; funcionen al navegador. Un sol codebase; Capacitor si algun dia cal store. |
| **Per estació, sense graella** | Evita interpolar pluja amb ~180 punts (el pas feble i car). L'usuari tria *zona* on anar, no un metre quadrat, així que puntuar a les estacions encaixa. |
| **Stateless** | La suma ponderada dels últims 30 dies equival a l'índex recursiu `api = k·api + pluja`. Res d'estat diari a persistir, ni backfill, ni cron que no pugui fallar. |
| **Hard way (sense CatDrought)** | CatDrought (CREAF) ja dona humitat de sòl diària per píxel, però l'accés és via app (Shiny), sense API neta. El fem servir com a *alternativa* de referència, no com a dependència. |
| **JS/TS, no Python** | En simplificar a estacions vam eliminar la interpolació (scipy) i el balanç hídric (R/medfate), que eren els únics motius per Python. Node fa tota la feina. |

**Capes deliberadament ajornades:** hoste (MCSC), orientació del vessant (obagues,
del DEM), capacitat de retenció del sòl (mapa de sòls ICGC). S'afegeixen *només*
si, un cop validat, es justifiquen contra el mapa — no per intuïció.

---

## Fonts de dades

Tot del **portal de Dades Obertes de la Generalitat** (Socrata / SODA API,
`analisi.transparenciacatalunya.cat`), obert i sense clau.

| Dataset | ID | Contingut |
|---|---|---|
| Mesures XEMA | `nzvn-apee` | Mesures semihoràries (UTC). Columnes: `codi_estacio`, `codi_variable`, `data_lectura`, `valor_lectura` |
| Metadades variables | `4fb2-n3yi` | Codis de variable ↓ |
| Metadades estacions | `yqwd-vj5e` | `codi_estacio`, nom, latitud, longitud, altitud |

**Codis de variable útils:** `35`=PPT (pluja) · `32`=T (temperatura) ·
`40`=Tx (T màx) · `42`=Tn (T mín, per glaçades) · `30`=VV10 (vent) ·
`31`=DV10 (direcció vent) · `33`=HR (humitat relativa) · `36`=RS (radiació).

**Pendents (per a les capes futures):**
- **MCSC** — Mapa de Cobertes del Sòl de Catalunya (CREAF) → tipus de bosc / hoste.
- **DEM i mapa de sòls** — ICGC → orientació del vessant i retenció d'aigua.
- **CatDrought** (CREAF, laboratoriforestal) → humitat de sòl ja calculada; alternativa.
- Motor propi possible: paquets R `meteoland` + `medfate` (el que fa servir CatDrought).

---

## Com executar

Requereix només **Node 18+** (porta `fetch` de sèrie; cap `npm install`).

```bash
# Condicions d'avui
node score_estacions.mjs

# Backtest: "com si fos" un dia passat (clau per validar)
node score_estacions.mjs --date=2025-10-20
```

Sortida: un rànquing a consola (top 20) + un fitxer **`bolets.geojson`** amb totes
les estacions puntuades, llest per pintar amb MapLibre.

---

## Validació

El problema de fons: **no hi ha dataset obert de "on he trobat bolets"** (ground
truth). Per tant validem de dues maneres:

1. **Backtest contra setmanes conegudes.** `--date` a una tardor bona que recordis
   i mirar si s'encenen les zones on saps que en surten.
2. **Coherència amb episodis reals de pluja.** Exemple real que ens va ensenyar molt:
   el backtest del **20-10-2025** posava els Ports #1. Investigant, resulta que el
   12-13/10/2025 la **DANA Alice** va descarregar de manera històrica justament allà
   (Mas de Barberans 92 mm, Ports 92 mm, Tivissa 190 mm). Conclusió doble:
   - ✅ el pipeline reflecteix la realitat amb fidelitat (les dades són bones);
   - ⚠️ però destapava que el model mesurava "on ha caigut més aigua", no "on hi
     haurà bolets" → d'aquí van sortir el **sostre de pluja** i el **lag**.

*En juliol tot surt sec i pla: és correcte, no un bug.*

---

## Limitacions conegudes

- **Hoste = proxy d'altitud** fins que entri el MCSC (pot recomanar zones sense pins).
- **L'estació és un proxy del bosc**: pot ser a la vall i el bosc al vessant, a més
  altura → la seva pluja/temperatura és aproximada, no exacta.
- **Sense ground truth** no es pot ajustar fi de veritat; els paràmetres són raonables,
  no òptims.
- **Pluja torrencial vs suau**: el sostre ho mitiga, però la intensitat real per
  hora no la modelem.

---

## Següents passos

1. **Capa hoste (MCSC).** Resoldre l'espècie de bosc a la coordenada de cada estació
   (un cop, offline: QGIS o consulta a WMS/WFS) i omplir la taula `HOST`. Substitueix
   el proxy d'altitud pel factor real.
2. **Mapa MapLibre.** Un HTML que carrega `bolets.geojson` i pinta les estacions per
   color de score. Amb això ja és "app".
3. **Calibrar** `CAP`, `H0`, `LAG_RISE/FALL` i la finestra de temperatura contra
   floracions reals recordades.
4. Considerar **Tn (glaçades)** a banda de la T mitjana; i, si es vol precisió
   espacial, tornar a valorar graella + orientació del vessant.

---

## Fitxers

- **`score_estacions.mjs`** — el scorer (aquest és el que evoluciona).
- **`spike_xema.mjs`** — diagnòstic d'un sol ús per validar l'accés a Socrata. Ja
  ha fet la seva feina; es pot jubilar.
- **`bolets.geojson`** — sortida generada (no es versiona; es regenera a cada run).

---

## Paràmetres afinables (mapa ràpid d'on tocar)

Tots a la capçalera de `score_estacions.mjs`:

| Paràmetre | Què controla |
|---|---|
| `DIES` | quants dies enrere de pluja mirem |
| `CAP` | sostre mm/dia (llindar d'escorrentia) |
| `H0` | on satura la humitat |
| `LAG_RISE` / `LAG_FALL` | forma del retard de fructificació |
| `tempFactor()` | finestra de temperatura ideal |
| `altFactor()` | banda d'altitud "forestal" (proxy) |
| `HOST{}` | factor d'hoste per estació (del MCSC) |
