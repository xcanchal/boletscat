# 🍄 Predictor de bolets · Catalunya

Producte web de pagament que, a partir de **dades obertes** (Meteocat + ICGC), puntua
on hi ha millors condicions per trobar bolets, **per espècie**. El mapa requereix
compte i entitlement `boletada_pro`; les prediccions no són fitxers públics.

El pla del directori públic d'espècies, temporada i hàbitats viu a
[`PLA_CONTINGUT.md`](PLA_CONTINGUT.md). El contingut editorial canònic es manté
separat del model predictiu a [`content/catalog.json`](content/catalog.json).

---

## Com funciona, en una frase

Per a **una espècie concreta**, calculem un **índex de 0 a 1** que combina humitat,
temperatura recent i la seva tendència, altitud, **tipus de bosc** i, quan està ben documentat,
**substrat geològic**. La meteorologia de la XEMA
s'interpola sobre una graella forestal de 250 m; el terreny es precalcula un cop.

```
score = humitat × temperatura × tendència × altitud × hoste × substrat
                                                                (cada factor 0..1)
```

---

## Espècies i la seva ecologia

Paràmetres = **priors ecològics raonables, no òptims** (sense ground truth no es calibren fi).

| Espècie | Bosc (MCSC) | Substrat | Temporada | Altitud | Notes |
|---|---|---|---|---|---|
| **Rovelló** (*Lactarius*) | conifer | neutre | Set–Nov | Òptim 200–1500 m; cua 2200 m | Cas base; falta separar espècies de rovelló |
| **Cep** (*Boletus edulis* grp) | conifer/deciduous/sclerophyll | silícic | Set–Nov (+estiu) | Òptim 800–1600 m; cua 2300 m | Vol humitat sostinguda, fresc |
| **Llenega negra** (*H. latitabundus*) | conifer | calcari | Oct–Des | Òptim 300–1300 m; cua 2000 m | Tardà, aguanta el fred |
| **Trompeta** (*Craterellus*) | deciduous/sclerophyll | neutre | Set–Nov | Òptim 400–1300 m; cua 2000 m | Fonts edàfiques contradictòries |
| **Rossinyol** (*C. cibarius*) | conifer/deciduous/sclerophyll | silícic | Jun–Oct | Òptim 400–1500 m; cua 2200 m | Generalista forestal, preferència àcida |
| **Camagroc** (*C. lutescens*) | conifer | calcari | Oct–Gen | Òptim 500–1500 m; cua 2200 m | Molt tardà, fred |
| **Múrgola** (*Morchella*) | ribera/deciduous | neutre | **Mar–Maig** | Òptim 300–1200 m; cua 1900 m | **Primavera!** Sapròfit |
| **Ou de reig** (*A. caesarea*) | deciduous/sclerophyll | silícic | Jul–Oct | Òptim 100–1400 m; cua 2100 m | Mediterrani, termòfil |
| **Fredolic** (*T. terreum*) | conifer | calcari | Oct–Gen | Òptim 100–1500 m; cua 2200 m | Tardà i associat sobretot a pins |

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

### Temperatura · Tendència · Altitud — per espècie
La temperatura recent i l'altitud utilitzen finestres trapezoidals per espècie.
Totes les espècies comparteixen una cua d'altitud de 700 m per sobre del seu
límit òptim. Aquesta regla evita excloure de cop els boscos de muntanya: el rang
òptim continua sent propi de cada espècie i, per damunt, l'altitud penalitza
progressivament fins a zero mentre la resta de factors continuen comptant.
La tendència compara els últims 5 dies amb els 9 anteriors i només pot ajustar el
resultat un màxim del 10%. Els mesos habituals es conserven per al calendari i les
fitxes, però no participen en el score.

### Hoste (`hostFactor`) — via MCSC
Es precalcula un cop (`buildHost.mjs`): per a cada estació, mostrejant una **graella de
~4 km** al voltant (perquè l'estació sol ser en clariana), el **tipus de bosc dominant**
del Mapa de Cobertes del Sòl (WMS de l'ICGC) → `estacions_host.json`. El scorer compara
el bosc de l'estació amb el que vol l'espècie: dominant correcte → alt · el bo hi és però
no domina → mig (0.45) · un altre bosc → baix (0.25, *suau a propòsit*) · no forestal → 0.15.

*Categories MCSC: `conifer` (pins) · `deciduous` (roure/faig/castanyer) · `sclerophyll` (alzina/surera) · `ribera`.*

### Substrat (`substrateFactor`) — proxy geològic ICGC

La geologia territorial 1:250.000 de l'ICGC es classifica de manera conservadora
en `siliceous`, `calcareous`, `mixed` o `unknown`. No és una mesura directa del pH
ni substitueix un mapa edafològic: és un **proxy del material geològic de base**.
Només s'aplica a espècies amb una preferència prou clara; la resta tenen factor `1`.

| Cas | Factor |
|---|---:|
| Sense preferència configurada | `1.00` |
| Geologia desconeguda | `1.00` |
| Substrat compatible | `1.00` |
| Unitat geològica mixta | `0.85` |
| Substrat contrari | `0.55` |

Això fa que la geologia **penalitzi incompatibilitats evidents** sense excloure
completament cap zona ni convertir una cartografia 1:250.000 en una falsa certesa local.

### Graella de 250 m

`buildGrid.mjs` descarrega una sola vegada la coberta del sòl 2024, el model
d'elevacions i la geologia territorial 1:250.000 de l'ICGC. En desa una
representació compacta `BGR3` a `graella.bin` (5 bytes per cel·la: tipus de bosc +
altitud + substrat + estructura forestal densa/clara). La coberta es mostreja en
una matriu 3×3 dins de cada cel·la de 250 m: només es considera bosc quan hi ha
majoria forestal, i se n'assignen el tipus i l'estructura dominants. Això evita
que una clariana o un arbre aïllat al centre decideixin tota la cel·la sense
omplir zones on predominen roca, prat o matollar. El lector manté
compatibilitat amb les graelles `BGR1` i `BGR2` antigues. El procés diari interpola la meteorologia, corregeix la
temperatura amb l'altitud local i genera un PNG transparent per espècie. El
navegador rep una sola imatge d'uns centenars de KB, no 1,2 milions de geometries.
La dada manté la resolució de 250 m. Abans de lliurar-la a MapLibre, el client
reprojecta el canvas UTM 31N a un rectangle Web Mercator i després hi aplica un
suavitzat lleu. El popup consulta l'índex de cel·les d'aquesta mateixa reprojecció,
de manera que el valor numèric i el color visible sempre provenen del mateix píxel.
Si el punt tocat no té dades, el popup usa la cel·la forestal més propera dins
d'1,5 km i n'indica la distància. El contracte espacial és:

| Fase | Referència espacial | Garantia |
|---|---|---|
| Càlcul diari | Graella UTM 31N de 250 m | Manté terreny, meteorologia i score sense alterar |
| Visualització | Canvas reproyectat a Web Mercator | MapLibre no deforma tota Catalunya com un únic quadrilàter |
| Clic i popup | Índex Web Mercator → píxel UTM original | El detall correspon exactament a la cel·la pintada |

El fons fosc i les etiquetes són vectorials
(CARTO + OpenStreetMap); relleu i satèl·lit es mantenen com a capes Esri sota les
mateixes etiquetes vectorials.

---

## Fonts de dades

| Font | On | Contingut |
|---|---|---|
| Mesures XEMA | Socrata `nzvn-apee` | Semihorària. `codi_estacio`/`codi_variable`/`data_lectura`/`valor_lectura` |
| Estacions | Socrata `yqwd-vj5e` | nom, lat, lon, altitud |
| Variables | Socrata `4fb2-n3yi` | `35`=pluja · `32`=temp · `40`/`42`=Tx/Tn · `30`=vent · `33`=HR |
| **MCSC 2024** | WMS ICGC `cobertes_2024` | Tipus de bosc per estació i coberta/estructura forestal de la graella de 250 m |
| **MET 5 m** | WCS ICGC `icc_mdt` | Altitud agregada a la graella de 250 m |
| **Geologia territorial 1:250.000** | [GeoPackage ICGC](https://www.icgc.cat/ca/Geoinformacio-i-mapes/Dades-i-productes/Geoinformacio-geologica-i-geofisica/Cartografia-geologica/Mapa-geologic-de-Catalunya-1250000) | Proxy conservador de substrat silícic/calcari/mixt |
| **Geocodificador ICGC** | API REST `geocodificador/invers` | Topònim més proper quan es clica el mapa |

### Fonts del directori públic

Les fitxes d'espècies i d'hàbitats són contingut editorial: no es copien de
Boletaires.cat ni es dedueixen automàticament del score. La dada canònica i les
referències concretes de cada fitxa viuen a [`content/catalog.json`](content/catalog.json).

| Font | Ús editorial | Precaució |
|---|---|---|
| [Societat Catalana de Micologia](https://ichn.iec.cat/societats/societat-catalana-de-micologia/) | Noms, taxonomia, descripció i revisió micològica | Una fitxa no es publica fins que el nom i la descripció s'han revisat |
| [Generalitat · Productes del bosc](https://agricultura.gencat.cat/ca/ambits/medi-natural/gestio-forestal/dar_funcions_boscos/dar_funcio_productiva/dar_productes_bosc/) | Context ecològic, recol·lecció i seguretat | Informació general; no determina una predicció local |
| [Generalitat · Guia de l'Alt Pallars](https://agricultura.gencat.cat/web/.content/06-medi-natural/caca/terrenys-cinegetics/reserves-nacionals-caca/alt-pallars/Guia_completa_RNC_Alt_Pallars.pdf) | Espècies i hàbitats documentats en boscos de muntanya | És una font territorial, no un calendari universal per a tot Catalunya |
| [Generalitat · Guia de pràctiques per a bolets i tòfones](https://agricultura.gencat.cat/web/.content/de_departament/de10_publicacions_dar/de10_a02_02_guies_de_practiques_correctes/documents/fitxers_estatics/gpch_bolet_tofones.pdf) | Nomenclatura i espècies comercialitzables | No substitueix la identificació experta d'un exemplar |
| [Canal Salut · Intoxicacions per bolets](https://canalsalut.gencat.cat/ca/detalls/article/Intoxicacions_per_bolets) | Toxicitat i prevenció d'intoxicacions | Font sanitària per als avisos de seguretat |
| [UPC · Visor web dels bolets de Catalunya](https://upcommons.upc.edu/bitstreams/52167ef6-4eb6-4f3b-b1d1-04842fec7a2b/download) | Hàbitat i temporada del moixernó | Font acadèmica de suport; la fitxa continua pendent de revisió micològica |
| [Enciclopèdia Catalana · Les agaricàcies](https://www.enciclopedia.cat/historia-natural-dels-paisos-catalans/les-agaricacies-camperols-xampinyons-pentinelles-i-afins) | Nomenclatura i hàbitat del xampinyó silvestre | Cal remarcar les possibles confusions dins del gènere `Agaricus` |
| [bolets.info · Mataparent](https://bolets.info/fitxa-bolet/mataparentboletus-satanas/) | Hàbitat, temporada i toxicitat del mataparent | Font secundària; es contrasta amb Canal Salut i revisió micològica |
| [ICGC · Cobertes del sòl](https://www.icgc.cat/ca/Geoinformacio-i-mapes/Mapes/Cobertes-del-sol) | Definició dels grans tipus de bosc i hàbitat | La coberta del sòl no identifica per si sola una espècie de bolet |
| [MycoBank](https://www.mycobank.org/) / [Index Fungorum](https://www.indexfungorum.org/) | Comprovar noms científics i sinònims | La taxonomia pot canviar; cal registrar la data de revisió |
| [GBIF](https://www.gbif.org/) | Contrastar presència documentada a Catalunya | Una observació no equival a abundància ni revela una zona recomanada |
| Fotografies pròpies o [Wikimedia Commons](https://commons.wikimedia.org/) | Imatges de les fitxes | Cal guardar autoria, llicència i URL d'origen per a cada imatge |

Les vint-i-tres entrades inicials del catàleg estan publicades amb la data i l’equip
de revisió registrats. Els mesos, hàbitats, altituds i categories de comestibilitat
parteixen dels paràmetres actuals i de les fonts anteriors; una actualització de la
fitxa ha de renovar també la seva revisió editorial. Boletaires.cat només serveix
com a referència d'arquitectura de contingut —catàleg, temporada i hàbitat—, mai com
a font de textos, dades o fotografies.

---

## Com executar (local)

Node 22+. Docker només és necessari si vols PostgreSQL local; amb Neon no cal.

```bash
# Configuració local (substitueix els secrets d'exemple si cal)
cp .env.example .env
npm install

# Opcional: login web/PWA amb Google
# GOOGLE_CLIENT_ID=…
# GOOGLE_CLIENT_SECRET=…

# Esquema Better Auth/Boletada sobre la DATABASE_URL configurada
npm run db:migrate

# Només quan canvien les capes de terreny (requereix `unzip`)
node buildGrid.mjs

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
   Per activar Google, crear un client OAuth web i autoritzar
   `https://boletada.cat/api/auth/callback/google` com a URI de redirecció.
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
4. **Comparació abans/després del substrat**: el nou factor ha de retallar terreny
   incompatible, no inventar noves zones favorables.

*En sec o fora de les finestres de temperatura, el resultat ha de ser molt baix.
El calendari no substitueix les condicions observades.*

El mapa tradueix l'índex tècnic a cinc nivells ordenats: **Molt baixa · Baixa ·
Mitjana · Alta · Molt alta**. `Molt alta` exigeix com a mínim `0,80` i que siguin
coneguts el tipus i l'estructura del bosc i el substrat. Si falta alguna d'aquestes
dades, l'índex queda limitat a `0,79` i el popup ho identifica com a `Desconegut`.
Al detall també dona una recomanació breu (`No hi vagis`, `Pots provar`, `Ves-hi`...).
El valor `0..1` es manté per poder auditar el model; és un índex de condicions, no
una probabilitat estadística de trobar bolets.

---

## Limitacions conegudes

- **MCSC dominant** pot ignorar un arbre minoritari (per això la penalització d'hoste és suau).
- La geologia 1:250.000 és un **proxy del substrat**, no una anàlisi del sòl ni del
  pH a cada cel·la. Les unitats amb litologia ambigua queden `unknown` i són neutres.
- Aproximadament la meitat de les cel·les forestals tenen una classificació
  silícica, calcària o mixta prou clara; la resta no reben cap penalització edàfica.
- La meteorologia entre estacions continua sent una estimació; la graella afina
  l'hàbitat i l'altitud, no crea observacions meteorològiques noves.
- **Sense ground truth**, els paràmetres són raonables, no òptims.
- **Espècie fina** de pi/roure no distingida (categoria ampla del MCSC simplificat).

---

## Següents passos

1. **Calibrar** paràmetres i la duresa de l'hoste contra floracions recordades.
2. Contrastar el proxy geològic amb cartografia edafològica local o observacions
   de camp abans d'endurir-ne el pes.
3. Considerar **Tn (glaçades)**, orientació del vessant (DEM), o espècie fina (MCSC complet) si cal.
4. PWA: instal·lable + geolocalització "on soc ara".

---

## Fitxers

| Fitxer | Què és |
|---|---|
| `score_estacions.mjs` | Scorer multi-espècie: punts GeoJSON + mapa PNG per espècie. |
| `buildGrid.mjs` | Precompute de coberta forestal, altitud i substrat a 250 m → `graella.bin`. |
| `forest-cover.mjs` | Agregació 3×3 de la coberta ICGC per majoria forestal i bosc dominant. |
| `substrate.mjs` | Classificació litològica, lectura GeoPackage i rasterització del substrat. |
| `raster.mjs` | Codificador/descodificador PNG sense dependències. |
| `raster-projection.mjs` | Reprojecció visual Web Mercator i correspondència entre el píxel pintat i la cel·la UTM. |
| `buildHost.mjs` | Precompute de l'hoste (MCSC) → `estacions_host.json` (córrer un cop). |
| `index.html` | Landing pública de Boletada. |
| `app.html` | Mapa MapLibre, accés i selector d'espècie. |
| `bones-practiques.html` | Guia pública d’accés, cura del bosc, seguretat i identificació. |
| `manifest.webmanifest` · `sw.js` | PWA instal·lable de `/app/`. El service worker és buit a propòsit: no fa cache. |
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
(mesos informatius, altitud, temperatura, tendència tèrmica, bosc i substrat per espècie) · els factors dins
`hostFactor` i `substrateFactor` (duresa de cada penalització).
`buildGrid.mjs`: `COVER_SAMPLES_PER_CELL` (resolució senar del mostreig d'àrea forestal).
`buildHost.mjs`: `GRID`/`STEP` (radi i densitat del mostreig).
