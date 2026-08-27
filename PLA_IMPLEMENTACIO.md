# Pla d'implementació · Bolets.cat

## Objectiu

Convertir l'aplicació actual en un producte de pagament amb:

- landing pública;
- compte d'usuari únic per web, iOS i Android;
- cap accés al mapa ni a les prediccions sense una subscripció activa;
- pagaments natius amb App Store i Google Play;
- pagament web amb Stripe;
- un únic estat d'accés (`pro`) compartit entre plataformes;
- PNG, GeoJSON i JSON protegits pel servidor.

Aquest document és el full de ruta. Cada fase s'ha de completar i validar abans de
començar la següent.

---

## Decisions de producte inicials

| Decisió | Proposta inicial |
|---|---|
| Accés gratuït | Cap: la landing, el registre, el pagament i la restauració són públics; el mapa no |
| Pla | Un únic pla anual |
| Preu web | **24,99 € / any**, provisional fins a validar impostos i posicionament |
| Prova gratuïta | No |
| Entitlement de RevenueCat | `pro` |
| Identificador comú | `Better Auth user.id` = `RevenueCat App User ID` |
| Autenticació MVP | Correu + contrasenya, verificació de correu i recuperació de contrasenya |
| Social login | Fora de l'MVP; valorar Apple + Google conjuntament més endavant |
| Web billing | Stripe Billing connectat a RevenueCat Web |
| Billing natiu | StoreKit a iOS i Google Play Billing a Android, mitjançant RevenueCat |
| Ordre de lliurament | Nucli compartit → web → iOS → Android |

El preu final de cada botiga pot variar lleugerament segons els nivells de preus,
la moneda i els impostos de la plataforma.

---

## Situació actual

- Frontend: landing pública a `/` i client del predictor a `/app/`, amb HTML, CSS i JavaScript vanilla.
- Mapa: MapLibre GL.
- Servidor: Node.js 22 + Hono, amb Better Auth i rutes de billing.
- Dades: PNG, GeoJSON i JSON generats dins de `private/predictions/`.
- Mòbil: Capacitor 8, compartint la mateixa interfície web.
- Desplegament: Docker + Coolify.
- Base de dades: PostgreSQL local preparat; falta crear el recurs persistent de producció.
- Autenticació: Better Auth amb correu/contrasenya, verificació, recuperació i rate limiting.
- Subscripcions: model `pro` i RevenueCat Web implementats; falten claus i catàleg reals.
- Les URL públiques de predicció retornen `404`; l'API exigeix sessió i `pro`.

---

## Arquitectura objectiu

```text
Landing pública              App web / iOS / Android
      |                                 |
      |                       cookie web / token natiu
      +----------------------+----------+
                             |
                       Node.js + Hono
                      /       |         \
             Better Auth   autorització  fitxers privats
                  |          `pro`       PNG/GeoJSON/JSON
              PostgreSQL       |
                               |
                         RevenueCat
                      /      |       \
                 App Store  Play    Stripe
```

### Regla d'autorització

Una petició de predicció només s'accepta si es compleixen les dues condicions:

```text
sessió Better Auth vàlida AND entitlement RevenueCat `boletada_pro` actiu
```

- Sense sessió: `401 Unauthorized`.
- Amb sessió però sense `pro`: `402 Payment Required`.
- Amb sessió i `pro`: es retorna el recurs.

---

## Resum de fases

| Fase | Resultat | Estat |
|---|---|---|
| 0 | Baseline, decisions i entorns preparats | En curs: falten serveis externs de producció |
| 1 | Backend Hono + PostgreSQL + Better Auth | Web complet; token natiu pendent |
| 2 | PNG/GeoJSON fora de `public/` i API protegida | Web complet; clients natius pendents |
| 3 | Login i bloqueig complet al web i a Capacitor | Web complet; Capacitor pendent |
| 4 | RevenueCat + Stripe: web complet de punta a punta | Codi complet; configuració real pendent |
| 5A | iOS: compra nativa i restauració | Pendent |
| 5B | Android: compra nativa i restauració | Pendent |
| 6 | Landing, paywall i vídeo promocional definitius | Landing i paywall fets; vídeo i pàgines legals pendents |
| 7 | Seguretat, observabilitat, desplegament i llançament | Pendent |

---

## Fase 0 — Baseline i preparació

### Feina

- [ ] Confirmar domini públic i domini de l'API.
- [ ] Confirmar el nom comercial definitiu de l'app.
- [ ] Confirmar **24,99 € / any**, sense pla gratuït ni prova.
- [ ] Crear entorns separats de desenvolupament i producció.
- [ ] Crear PostgreSQL a Coolify amb volum persistent i còpies de seguretat.
- [ ] Crear/configurar comptes de RevenueCat, Stripe, App Store Connect i Google Play Console.
- [ ] Decidir el proveïdor de correu transaccional per verificar correus i recuperar
  contrasenyes.
- [ ] Documentar les variables d'entorn necessàries sense versionar cap secret.
- [ ] Fer una prova de fum de l'app web, iOS i Android actual abans de modificar-la.

### Variables previstes

```text
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
EMAIL_PROVIDER_API_KEY
REVENUECAT_SECRET_API_KEY
REVENUECAT_IOS_PUBLIC_API_KEY
REVENUECAT_ANDROID_PUBLIC_API_KEY
REVENUECAT_WEB_PUBLIC_API_KEY
```

### Criteri de sortida

- PostgreSQL és persistent i té backup.
- Els quatre comptes externs existeixen.
- Domini, nom i preu estan decidits.
- L'estat actual es pot executar i provar abans de començar la migració.

---

## Fase 1 — Backend i autenticació

### Implementació

- [ ] Introduir Hono com a router HTTP mantenint Node.js i Docker.
- [ ] Separar el servidor en mòduls (`server`, `auth`, `database`, `routes`).
- [ ] Connectar Better Auth a PostgreSQL.
- [ ] Generar i aplicar les migracions de Better Auth.
- [ ] Muntar Better Auth a `/api/auth/*`.
- [ ] Habilitar registre, login, logout, verificació de correu i recuperació de
  contrasenya.
- [ ] Usar cookies `HttpOnly`, `Secure` i `SameSite` adequades al web.
- [ ] Preparar autenticació amb token per a Capacitor i guardar-lo al magatzem segur
  del sistema, no en text pla ni dins dels fitxers de l'app.
- [ ] Configurar orígens explícits; eliminar CORS global amb `*`.
- [ ] Afegir rate limiting als endpoints sensibles d'autenticació.
- [ ] Crear una ruta autenticada mínima, per exemple `/api/me`.

### Decisions tècniques

- No es migrarà a Next.js, React ni un altre framework de frontend.
- Better Auth no substituirà RevenueCat: només identifica l'usuari i gestiona la
  sessió.
- El `user.id` creat per Better Auth serà l'identificador estable compartit amb
  RevenueCat.

### Proves

- [ ] Crear un compte, verificar-lo, iniciar i tancar sessió al web.
- [ ] Recuperar una contrasenya.
- [ ] Rebutjar una sessió caducada o manipulada.
- [ ] Autenticar una instal·lació iOS i una Android.
- [ ] Comprovar que no hi ha secrets dins del bundle web o natiu.

### Criteri de sortida

Un mateix usuari pot iniciar sessió al web, iOS i Android amb el mateix `user.id`.
Encara no hi ha pagaments, però la identitat és estable i persistent.

---

## Fase 2 — Protecció real de PNG, GeoJSON i JSON

### Implementació

- [ ] Crear una carpeta privada, per exemple `data/generated/`, fora de `public/`.
- [ ] Canviar el procés inicial i el scheduled task perquè el scorer escrigui a la
  carpeta privada.
- [ ] Deixar dins de `public/` només la landing i els recursos realment públics.
- [ ] Crear endpoints autenticats per obtenir:
  - metadades i graella;
  - PNG per espècie;
  - GeoJSON per espècie;
  - qualsevol altre fitxer de predicció.
- [ ] Validar espècie, data i nom de recurs contra una llista permesa; mai concatenar
  una ruta arbitrària enviada pel client.
- [ ] Enviar `Cache-Control: private` i evitar que un CDN desi respostes premium com
  a públiques.
- [ ] Adaptar MapLibre perquè carregui les dades autenticades.
- [ ] Evitar URL signades llargues o permanents. Si s'introdueix CDN, fer-les caducar
  al cap de pocs minuts.
- [ ] Eliminar les antigues URL públiques i comprovar que retornen `404`.

### Proves

- [ ] Una petició anònima a un PNG/GeoJSON retorna `401`.
- [ ] Una ruta amb `../` o codificacions equivalents no pot sortir de la carpeta.
- [ ] El mapa web carrega totes les espècies amb una sessió vàlida.
- [ ] iOS i Android carreguen els recursos amb el token natiu.
- [ ] Un reinici o redeploy regenera les dades sense fer-les públiques.

### Criteri de sortida

No queda cap predicció sota una URL pública. En aquesta fase es pot utilitzar un
usuari de prova autoritzat manualment; el control de subscripció arriba a la fase 4.

---

## Fase 3 — Flux d'accés i hard paywall

### Pantalles/estats

- [x] Landing pública.
- [x] Registre i login.
- [x] Verificació de correu i recuperació de contrasenya.
- [x] Paywall obligatori per a usuaris sense `pro`.
- [x] Estat de càrrega mentre es verifica la subscripció.
- [ ] Pantalla de compte amb estat del pla, tancament de sessió i ajuda.
- [x] Estat d'error o servei no disponible que no desbloquegi contingut per accident.

### Regla visual i tècnica

No n'hi ha prou amb ocultar el mapa amb CSS. El client no ha de demanar ni rebre cap
dada premium fins que el servidor hagi autoritzat la petició.

### Proves

- [ ] Usuari no autenticat: només veu landing/login.
- [ ] Usuari autenticat sense `pro`: només veu paywall/compte/restauració.
- [ ] Usuari `pro`: veu el mapa.
- [ ] Si s'elimina `pro` durant una sessió, el servidor deixa de servir dades.

### Criteri de sortida

El producte ja té un bloqueig complet, encara que els entitlements de prova es
concedeixin manualment.

---

## Fase 4 — RevenueCat, Stripe i web complet

### Model d'accés local

- [x] Crear l'entitlement únic `boletada_pro`.
- [ ] Crear una projecció local mínima de l'accés:

  ```sql
  CREATE TABLE user_access (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id),
    pro_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```

- [ ] Adaptar el tipus de `user_id` al tipus real generat per Better Auth.
- [ ] Considerar `pro` actiu només quan `pro_until > NOW()`.
- [x] Sincronitzar l’accés amb l’API de RevenueCat després de comprar i en obrir
  l’app quan l’accés local no sigui vigent.
- [ ] No exposar mai la clau secreta de RevenueCat al client.

### Stripe web

- [ ] Crear a Stripe un producte anual web de **24,99 €**, provisional.
- [ ] Connectar Stripe Billing amb RevenueCat Web.
- [ ] Importar el producte i associar-lo a `pro`.
- [ ] Crear una offering anual.
- [ ] Integrar RevenueCat Web SDK després del login amb `Better Auth user.id`.
- [ ] No permetre compres anònimes en l'MVP.
- [ ] Afegir compra des del paywall web.
- [ ] Afegir el portal de Stripe per gestionar targeta, factures i cancel·lació.
- [ ] Mostrar l'estat resultant de RevenueCat; no desbloquejar només perquè el
  navegador torna del checkout.
- [ ] Validar IVA, facturació i textos legals abans de producció.

### Proves

- [ ] Compra Stripe sandbox activa `pro` i desbloqueja el mapa web.
- [ ] Un segon navegador amb el mateix compte recupera l'accés.
- [ ] Una cancel·lació conserva accés fins a la data de venciment.
- [ ] Una renovació amplia `pro_until`.
- [ ] Una expiració o reemborsament bloqueja l'API quan correspon.
- [ ] Un webhook duplicat no corromp l'estat.
- [ ] Un usuari sense `pro` no pot obtenir cap predicció cridant directament l'API.

### Criteri de sortida

El web funciona de punta a punta: registre, pagament Stripe, webhook, accés al mapa,
cancel·lació i expiració. Aquest és el primer vertical complet abans d'entrar a les
botigues natives.

---

## Fase 5 — Apps natives, una plataforma cada vegada

El backend, el compte i `user_access` són compartits. Només se separa la feina
específica de cada botiga per poder provar i tancar una plataforma abans d'obrir
l'altra.

### Fase 5A — iOS

### Implementació

- [ ] Crear el producte anual a App Store Connect.
- [ ] Importar-lo a RevenueCat i associar-lo a `pro`.
- [ ] Instal·lar `@revenuecat/purchases-capacitor` i sincronitzar iOS.
- [ ] Inicialitzar RevenueCat després del login amb `Better Auth user.id`.
- [ ] Mostrar el preu real retornat per l'App Store.
- [ ] Implementar compra, cancel·lació i errors.
- [ ] Afegir el botó **Restaurar compres** iniciat explícitament per l'usuari.
- [ ] Tornar a consultar `CustomerInfo` quan l'app recupera el focus.
- [ ] Preparar sandbox, metadades i revisió d'App Store.

### Proves i criteri de sortida iOS

- [ ] Compra sandbox iOS desbloqueja iOS i també el web.
- [ ] Reinstal·lar l'app i restaurar compres recupera `pro`.
- [ ] Expiració i reemborsament tornen a bloquejar l'accés.
- [ ] iOS queda llest per enviar a revisió sense dependre d'Android.

### Fase 5B — Android

### Implementació

- [ ] Crear la subscripció anual a Google Play Console.
- [ ] Importar-la a RevenueCat i associar-la a `pro`.
- [ ] Sincronitzar el plugin de RevenueCat amb Android.
- [ ] Inicialitzar-lo amb el mateix `Better Auth user.id`.
- [ ] Mostrar el preu real retornat per Google Play.
- [ ] Implementar compra, operacions pendents, cancel·lació i errors.
- [ ] Afegir **Restaurar compres**.
- [ ] Validar el retorn des d'una app bancària durant la verificació del pagament.
- [ ] Preparar tracks de prova, metadades i revisió de Google Play.

### Proves i criteri de sortida Android

- [ ] Compra de prova Android desbloqueja Android, web i iOS.
- [ ] Reinstal·lar i restaurar recupera `pro`.
- [ ] Compres pendents no desbloquegen fins que siguin efectives.
- [ ] Expiració i reemborsament tornen a bloquejar l'accés.
- [ ] Android queda llest per publicar independentment d'iOS.

### Regla de botigues

El checkout Stripe és per al web. Les apps natives oferiran les compres de la seva
botiga. Qualsevol enllaç natiu cap a un checkout extern s'haurà de validar segons la
botiga i el país abans de publicar-lo.

---

## Fase 6 — Landing, paywall i vídeo

### Landing proposada

- [x] **Hero:** promesa clara i CTA d'accés; el vídeo curt queda pendent.
- [x] **Com funciona:** meteorologia, terreny, bosc i lectura del mapa.
- [ ] **Demostració:** vídeo actualitzat amb domini, nom, interfície i textos finals.
- [x] **Espècies:** resum visual de les espècies disponibles.
- [x] **Què obtens:** mapa actualitzat, filtre per espècie i lectura de condicions.
- [x] **Preu:** un sol pla anual, sense falsa complexitat ni pla gratuït.
- [ ] **Plataformes:** web, App Store i Google Play amb botons oficials quan estiguin
  publicades.
- [x] **Limitacions honestes:** és un índex de condicions, no una garantia de trobar
  bolets.
- [x] **FAQ:** actualització, cobertura, renovació i dispositius; restauració pendent d'apps natives.
- [ ] **Footer legal:** privacitat, termes, cookies, contacte i gestió de subscripció.

### Vídeo

- [ ] Revisar nom, domini, preu i CTA abans de tornar a renderitzar.
- [ ] Mostrar cel·les de 250 × 250 m i la variació del heatmap.
- [ ] Evitar afirmar que el valor és una probabilitat estadística calibrada.
- [ ] Exportar versió hero lleugera i versió promocional completa.
- [ ] Afegir poster estàtic i comportament correcte amb `prefers-reduced-motion`.

### Criteri de sortida

La landing explica el producte en menys d'un minut i porta un usuari des del CTA
fins a compte, pagament i accés al mapa.

---

## Fase 7 — Seguretat, operacions i llançament

### Seguretat i privacitat

- [ ] Revisar cookies, CORS, CSP, rate limits i headers HTTP.
- [ ] Rotació documentada de secrets.
- [ ] Política de privacitat i termes revisats.
- [ ] Exportació i eliminació del compte.
- [ ] Retenció mínima de dades personals.
- [ ] Logs sense contrasenyes, tokens, cookies ni dades de targeta.

### Operacions

- [ ] Healthcheck separat del mapa.
- [ ] Monitoratge de generació diària i antiguitat de les prediccions.
- [ ] Alertes per errors de webhooks i correu.
- [ ] Backups de PostgreSQL provats amb una restauració real.
- [ ] Migracions automàtiques o procediment de deploy documentat.
- [ ] Pla de rollback que no reobri accidentalment els fitxers públics.

### QA final

- [ ] Safari/Chrome/Firefox mòbil i escriptori.
- [ ] iPhone/iPad i diverses versions Android suportades.
- [ ] Connexió lenta, pèrdua de xarxa i canvi de dispositiu.
- [ ] Compra, cancel·lació, renovació, expiració, reemborsament i restauració.
- [ ] Revisió dels recursos públics per confirmar que no contenen prediccions.
- [ ] Checklist i captures per a App Store i Google Play.

### Criteri de sortida

El sistema és recuperable, observable i les tres plataformes han superat els fluxos
de compra i autorització abans d'acceptar pagaments reals.

---

## Ordre de treball recomanat

1. Executar la **fase 0** i congelar decisions bàsiques.
2. Implementar i desplegar la **fase 1** en un entorn de desenvolupament.
3. Fer privada tota la informació a la **fase 2** abans d'afegir pagaments.
4. Construir el hard paywall de la **fase 3**.
5. Completar el vertical web amb RevenueCat i Stripe (**fase 4**).
6. Integrar i tancar iOS (**fase 5A**).
7. Integrar i tancar Android (**fase 5B**).
8. Actualitzar landing i vídeo quan nom, domini, interfície i preu ja no canviïn
   (**fase 6**).
9. Completar QA, seguretat i llançament (**fase 7**).

No s'ha de publicar el checkout real fins que les fases 1–5 funcionin en sandbox.

---

## Definició global de “fet”

El projecte estarà complet quan:

- una persona sense subscripció no pugui obtenir cap PNG, GeoJSON o JSON premium;
- una persona pugui comprar en qualsevol plataforma i usar les altres amb el mateix
  compte;
- restaurar compres recuperi una subscripció nativa existent sense tornar a cobrar;
- cancel·lacions, expiracions i reemborsaments retirin l'accés quan correspongui;
- cap secret estigui dins del frontend ni de les apps;
- els backups, webhooks i regeneració diària estiguin monitorats;
- landing, vídeo, botigues i producte mostrin el mateix nom, domini, preu i promesa.

---

## Referències tècniques

- Better Auth: https://better-auth.com/docs/installation
- Better Auth + Hono: https://better-auth.com/docs/beta/integrations/hono
- Better Auth + PostgreSQL: https://better-auth.com/docs/adapters/postgresql
- Better Auth bearer tokens: https://better-auth.com/docs/plugins/bearer
- RevenueCat Capacitor: https://www.revenuecat.com/docs/getting-started/installation/capacitor
- RevenueCat entitlements: https://www.revenuecat.com/docs/getting-started/entitlements
- RevenueCat restauració: https://www.revenuecat.com/docs/getting-started/restoring-purchases
- RevenueCat Web SDK: https://www.revenuecat.com/docs/web/web-billing/web-sdk
- RevenueCat + Stripe Billing: https://www.revenuecat.com/docs/web/integrations/stripe
- RevenueCat webhooks: https://www.revenuecat.com/docs/integrations/webhooks
