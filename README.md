# 🍄 Predictor de bolets · Catalunya

Eina personal que, a partir de **dades obertes de Meteocat**, puntua on és més
probable trobar bolets aquesta setmana — **per espècie**. Privada, d'un sol usuari,
barata de mantenir i honesta amb les seves limitacions.

---

## Com funciona, en una frase

Per a cada estació de la XEMA i per a **una espècie concreta**, calculem un
**score de 0 a 1** que combina pluja útil (amb retard de fructificació),
temperatura, altitud, i si toca temporada. Sense base de dades ni interpolació:
tot es recalcula a cada execució demanant a l'API una finestra de dies.

```
score = humitat × temperatura × altitud × estació × hoste     (cada factor 0..1)
```

---

## Espècies i la seva ecologia

Cada espècie té la seva config (temporada, altitud, temperatura, arbre hoste).
Els paràmetres són **priors ecològics raonables, no òptims** — sense ground truth
de "on he trobat X" no es poden calibrar fi.

| Espècie | Arbre hoste | Temporada | Altitud | Notes |
|---|---|---|---|---|
| **Rovelló** (*Lactarius*) | Pins | Set–Nov | Baixa–1600 m | Cas base |
| **Cep** (*Boletus edulis* grp) | Faig, roure, castanyer, alzina, coníferes | Set–Nov (+estiu) | 600–1800 m | Vol humitat sostinguda, fresc |
| **Llenega** (*Hygrophorus*) | Pins calcaris | Oct–Des | Mitja | Tardà, aguanta el fred |
| **Trompeta de la mort** (*Craterellus*) | Planifolis, obagues | Set–Nov | 300–1400 m | Fullaraca humida i ombrívola |
| **Rossinyol** (*C. cibarius*) | Ample | Jun–Oct | 300–1600 m | Llarg, tolera calor |
| **Camagroc** (*C. lutescens*) | Pinedes molsoses | Oct–Gen | 400–1600 m | Molt tardà, fred, molla constant |
| **Múrgola** (*Morchella*) | Freixe, ribera, cremats | **Mar–Maig** | 200–1400 m | **Primavera!** Sapròfit |

---

## El model, factor a factor

### Humitat (`hScore`) — compartida per totes les espècies
Pluja acumulada dels últims **30 dies**, amb dos matisos descoberts validant amb dades reals:
- **Sostre diari (`CAP`, 30 mm):** una tromba de 90 mm/h se'n va barranc avall (escorrentia),
  no s'infiltra. Per sobre del sostre no compta. Evita que una DANA surti com a "gran setmana".
- **Lag de fructificació (`lagWeight`):** el bolet triga ~1-2 setmanes a sortir. La pluja d'ahir
  compta poc, el pic de pes és cap als **6-9 dies**, i s'esvaeix cap a les 3 setmanes.

Es passa per una corba que **satura** (`1 − e^(−H/H0)`): més pluja ja no fa més bolets.

### Temperatura, Altitud, Estació — per espècie
- **Temperatura:** finestra ideal segons l'espècie (el cep vol fresc, el rossinyol tolera calor).
- **Altitud:** banda segons l'espècie. ⚠️ **PROXY** de "hi ha bosc?" fins que entri el MCSC.
- **Estació:** PORTA temporal — fora dels mesos de l'espècie, score ~0 (múrgola a l'octubre = 0).

### Hoste (`hostFactor`) — 🔜 pendent, i ara **imprescindible**
L'arbre micoríxic és el factor clau. Encara és 1 per a tothom. Sense el MCSC, un
predictor de ceps i un de rovellons miren gairebé el mateix (només els separa temporada
i altitud). L'hoste és el que diu "aquí pineda → rovelló, aquí fageda → cep".

---

## Decisions de disseny (per què així)

| Decisió | Raó |
|---|---|
| **PWA, no nativa** | Només cal mapa + geolocalització; funcionen al navegador. |
| **Per estació, sense graella** | Evita interpolar pluja amb ~180 punts. L'usuari tria zona, no metre quadrat. |
| **Stateless** | La suma ponderada equival a l'índex recursiu; res d'estat diari ni backfill. |
| **Hard way (sense CatDrought)** | CatDrought (CREAF) dona humitat de sòl per píxel però l'accés és via app; queda com a alternativa. |
| **JS/TS, no Python** | En simplificar a estacions vam eliminar interpolació i balanç hídric, els únics motius per Python. |

---

## Fonts de dades

Portal de Dades Obertes de la Generalitat (Socrata / SODA API, obert i sense clau).

| Dataset | ID | Contingut |
|---|---|---|
| Mesures XEMA | `nzvn-apee` | Semihorària (UTC). `codi_estacio`, `codi_variable`, `data_lectura`, `valor_lectura` |
| Metadades variables | `4fb2-n3yi` | Codis de variable ↓ |
| Metadades estacions | `yqwd-vj5e` | `codi_estacio`, nom, latitud, longitud, altitud |

**Codis de variable:** `35`=PPT (pluja) · `32`=T · `40`=Tx · `42`=Tn (glaçades) · `30`=VV10 (vent) · `33`=HR · `36`=RS.

**Pendents (capes futures):** **MCSC** (CREAF) → hoste/tipus de bosc · **DEM i sòls** (ICGC) →
orientació del vessant i retenció d'aigua · **CatDrought** (CREAF) → humitat de sòl alternativa.

---

## Com executar

Requereix només **Node 18+** (`fetch` de sèrie, cap `npm install`).

```bash
node score_estacions.mjs                            # rovelló, avui
node score_estacions.mjs --species=cep --date=2025-10-20
node score_estacions.mjs --all                      # totes les espècies
node score_estacions.mjs --all --date=2025-10-20    # totes, backtest
node score_estacions.mjs --list                     # espècies disponibles
```

Escriu un `bolets.<espècie>.geojson` per espècie. Per veure el **mapa**, serveix la
carpeta (no `file://`, el navegador no deixa carregar el geojson):

```bash
node score_estacions.mjs --all
python3 -m http.server 8000      # o: npx serve
# obre http://localhost:8000  → selector d'espècie a dalt a l'esquerra
```

---

## Validació

No hi ha dataset obert de "on he trobat bolets" (ground truth). Validem així:
1. **Backtest** (`--date`) a una tardor bona i mirar si s'encenen les zones esperades.
2. **Coherència amb episodis reals.** Exemple: el backtest del 20-10-2025 posava els Ports #1;
   resulta que el 12-13/10 la **DANA Alice** hi va descarregar de manera històrica (Ports 92 mm,
   Tivissa 190 mm). Va confirmar que les dades són bones, però va destapar que el model mesurava
   "on ha caigut més aigua" → d'aquí van sortir el sostre de pluja i el lag.

*En juliol, o fora de temporada, tot surt sec/zero: és correcte, no un bug.*

---

## Limitacions conegudes

- **Hoste = proxy d'altitud** fins que entri el MCSC (pot recomanar zones sense l'arbre bo).
- **L'estació és un proxy del bosc** (pot ser a la vall i el bosc al vessant).
- **Sense ground truth**, els paràmetres són raonables, no òptims.
- **Intensitat de pluja** només mitigada pel sostre, no modelada per hora.

---

## Següents passos

1. **Capa hoste (MCSC)** — el gran desbloqueig. Resoldre el tipus de bosc a l'entorn de cada
   estació (compte: l'estació sol ser en clariana, cal mirar un radi, no el píxel) i omplir
   `hostFactor` per espècie. Substitueix el proxy d'altitud pel real.
2. **Calibrar** paràmetres contra floracions recordades.
3. Considerar **Tn (glaçades)** i, si cal precisió espacial, graella + orientació del vessant.

---

## Fitxers

- **`score_estacions.mjs`** — el scorer multi-espècie (el que evoluciona).
- **`index.html`** — el mapa (MapLibre) amb selector d'espècie.
- **`spike_xema.mjs`** — diagnòstic d'un sol ús (jubilat; validava l'accés a Socrata).
- **`bolets.<espècie>.geojson`** — sortides generades (no es versionen; es regeneren).

---

## Paràmetres afinables

Capçalera de `score_estacions.mjs`: `DIES`, `CAP`, `H0`, `LAG_RISE`/`LAG_FALL` (humitat, compartits),
i el bloc **`SPECIES`** (temporada, banda d'altitud, finestra de temperatura i hoste per espècie).
