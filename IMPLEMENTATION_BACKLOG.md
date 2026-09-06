# Boletada: review and implementation backlog

Review date: 2026-09-06. Reviewed baseline: `main` at `df3d01e`.

This document is a handoff for an implementer agent. It separates operational
fixes from changes that require scientific validation or product decisions.
The review covered the scorer, map client, auth/billing, deployment, tests and
documentation. It did not establish predictive accuracy or audit production
configuration. At the baseline, all 85 tests and `npm run prepare:public` passed;
`npm audit --omit=dev` reported no known vulnerabilities.

## Instructions for the implementer

1. Read repository guidance and inspect the current branch, worktrees and diff.
   This document was written in a dirty `feat/content-directory` checkout, but
   its findings refer to the reviewed `main` baseline. Do not overwrite unrelated
   work or assume the current checkout matches production. Use an isolated
   checkout when needed, and revalidate findings against the implementation base.
2. Work on the requested item IDs in dependency order. Do not implement this
   entire backlog unless explicitly asked. Finish one coherent slice at a time.
3. Keep the existing backend, scorer and map engine. ENG-01 explicitly plans a
   React/TypeScript/Vite migration of the paid frontend; do not perform a separate
   substantial vanilla-JavaScript refactor first. Other items do not require it.
4. Preserve current scoring behavior during the reliability work. Handle model
   changes as explicit, separately evaluated work.
5. Use fixtures or temporary output directories for generation tests. Production
   configuration changes, deployment, commits and pushes need user authorization.
6. Report changed files, verification results, outstanding operational setup and
   remaining uncertainty. Mark an item complete only when its acceptance criteria
   are met; distinguish implemented code from verified production behavior.

Suggested assignment prompt:

> Read IMPLEMENTATION_BACKLOG.md and the repository guidance. Revalidate items
> OPS-01 through OPS-03 against current main, then implement them in dependency
> order in an isolated branch. Preserve unrelated work and scoring behavior.
> Test failure paths and update the status/evidence table. Do not push or deploy.

## Priority and dependency map

See the delivery status table for implementation progress. Priorities express recommended order, not a
claim that every item is a currently observed production incident.

| ID | Priority | Type | Outcome | Dependencies |
|---|---|---|---|---|
| OPS-01 | P1 | Reliability fix | Publish complete, versioned prediction generations | None |
| OPS-02 | P1 | Data integrity fix | Reject unusable weather inputs; preserve missingness | OPS-01 for publication integration |
| OPS-03 | P1 | Operations | Detect stale, missing or failed generations | OPS-01, OPS-02 |
| BILL-01 | P1 | Billing reliability | Keep local access synchronized with RevenueCat | None |
| QA-01 | P1 | Verification | Exercise critical browser and server behavior | Develop alongside fixes |
| MODEL-01 | P2 | Model correction | Remove month-boundary seasonality jumps | QA-01 fixtures |
| MODEL-02 | P2 | Design + model change | Separate suitability and data confidence | OPS-02; agree display contract |
| MODEL-03 | P2 | Evaluation infrastructure | Measure interpolation error | OPS-02 |
| MODEL-04 | P2 | Research experiment | Evaluate species responses, habitat and overlapping penalties | MODEL-03; validation data |
| MODEL-05 | P1 | Scoring experiment | Compare dynamic moisture reserve against fixed rainfall decay | OPS-02; MODEL-03 for spatial evaluation; OPS-01 before release |
| UX-01 | P2 | Spatial consistency | Clarify station rankings versus forest-area rankings | OPS-01 |
| ENG-01 | P2 | Frontend migration | React + TypeScript + Vite with TanStack Router/Query | OPS-01–03 and BILL-01 first; QA-01 alongside |
| DOC-01 | P2 | Documentation | Make feature state and model descriptions accurate | None |
| PRODUCT-01 | P3 | Product proposal | Private saved areas and historical comparisons | OPS-01, ENG-01; agree feature scope |
| PRODUCT-02 | P3 | Product + validation proposal | Collect useful, voluntary field feedback | Agree collection/privacy contract |
| PRODUCT-03 | Later | Product proposal | Alerts and native-app release | Reliability proven; user demand |

## OPS-01 — Publish coherent generations

**Rollout update:** the generation core and private legacy-URL adapter are
implemented and locally verified. OPS-01 is ready for staging validation, not
production. The owner confirmed no native apps are distributed. Existing
browser/PWA sessions retain their flat URLs while new clients pin immutable
generations. Build-version checks, aggregate compatibility monitoring and the
authenticated old/new-client staging run remain pending. Do not retire legacy
support on a timer or assume a new notice can reach already-open JavaScript.

Evidence: `score_estacions.mjs` overwrites shared weather/terrain files, then
species GeoJSON/PNG files, then discovery. `src/server.mjs` serves those filenames
directly. A reader can combine generations, and a failed run can leave partial
updates. Client query-string cache busting alone cannot prevent this.

Implement a staging directory per run. Validate the complete output, finalize
the generation, then atomically replace a small current-generation manifest.
The client must pin every related download to the same generation ID, including
lazy popup data and discovery. Keep retained generations immutable and private.
Do not delete a generation while clients can still legitimately request it;
document retention and the recovery path for an expired generation. Use a simple
single-writer lock or equivalent to prevent overlapping runs from publishing out
of order. Preserve at least the previous valid generation for rollback.

Illustrative manifest contract (adapt names to repository conventions):

```json
{
  "schemaVersion": 1,
  "generationId": "20260905T080000Z-example",
  "referenceDate": "2026-09-05",
  "generatedAt": "2026-09-05T08:00:00Z",
  "sourceObservedThrough": {
    "rain": "2026-09-05T07:30:00Z",
    "temperature": "2026-09-05T07:30:00Z"
  },
  "modelVersion": "example-model-version",
  "terrainVersion": "example-terrain-version",
  "files": [
    "bolets.rovello.geojson",
    "bolets.rovello.png",
    "bolets.weather.png",
    "bolets.discovery.json"
  ]
}
```

The example file list is abbreviated; validation must cover all required species
and assets, dimensions, parseability, finite values and consistent metadata.

Acceptance criteria:

- A failed run leaves the active generation unchanged.
- Concurrent reads during publication receive a coherent generation.
- Missing species/assets prevent publication; startup does not present an
  incomplete generation as ready.
- Auth and entitlement checks apply to generation-specific routes; generation
  IDs and filenames cannot escape the prediction directory.
- Tests cover interrupted generation, failed validation, overlapping jobs and
  successful publication. Document how the new client handles pre-migration data.
- Recheck scorer/server output configuration: the baseline shares a resolver,
  but the server loads `.env` and the scorer does not. Both entry points should
  honor the same configuration contract, including local development.

## OPS-02 — Weather quality and missing data

Evidence: absent rainfall defaults to zero; `trapezoid(null, ...)` returns `0.5`;
interpolated missing trend becomes zero. Queries aggregate readings without
tracking their coverage. `generated` records the requested reference date,
not the freshness of source observations.

Track valid observations, coverage and latest timestamps per variable/station.
Define documented publication thresholds based on expected source cadence;
avoid inventing thresholds solely to make the current dataset pass. Set bounded
request timeouts and retries for transient upstream failures. Do not discard
useful rainfall stations solely because they lack temperature observations.

Before implementing thresholds, inventory the provider's variable definitions,
units, aggregation semantics, timestamps and available quality flags. Derive
expected coverage from actual station operation and reporting cadence. Deduplicate
readings and exclude invalid values before aggregation; a partial day's rain
total must not be silently treated as a complete day or extrapolated without a
documented method. Retain separate eligible station sets for each variable.

Carry this minimum quality contract alongside each station/variable/day aggregate:

```text
value: number | null
unit: string
validObservationCount: integer
expectedObservationCount: integer | null
latestValidObservationAt: timestamp | null
quality: complete | partial | missing | stale | invalid
method: observed | estimated
```

Unknown expected cadence must remain unknown. Define how quality propagates
through interpolation and raster encoding so unsupported cells do not acquire
invented precision. Missing optional drying variables must trigger a documented
fallback, not a measured zero wind, zero radiation or zero humidity.

| Input condition | Required treatment |
|---|---|
| Valid zero rainfall with adequate coverage | Measured dry conditions |
| Missing rainfall readings | Unknown; never silently measured zero |
| Missing temperature/trend | Preserve missingness through output and popup |
| Empty or broadly stale input | Fail generation; retain last valid output |
| Isolated insufficient coverage | Exclude or flag with documented confidence behavior |

Acceptance: fixtures cover empty responses, partial days, missing variables,
stale sources, non-finite values and valid dry weather. No NaN-derived raster
values or misleading current-source timestamps are published. Source timezone
and partial-day handling are explicit and tested.
Also test duplicate readings, provider-invalid readings, independent rain/temperature
station availability and equivalent timestamps across timezone boundaries. Export
a compact quality report per run showing excluded stations and coverage by variable.

## OPS-03 — Freshness, failure visibility and runbook

Evidence: `/healthz` only confirms the process responds; `/readyz` only checks
PostgreSQL. The entrypoint continues after a failed initial scoring run.

Add a separate data-status check with last successful generation, reference
date, source freshness, completeness and last failure. Keep liveness distinct
from data freshness so stale inputs do not cause endless container restarts.
Store/report run ID, duration and publication result. Avoid exposing premium
data, filesystem paths or secrets in public diagnostics.

Acceptance: simulated stale/missing data is observable, the UI labels the last
available data honestly, and an actionable alert mechanism is documented and
verified in a controlled environment. Record required Coolify setup separately
from code completion. Describe how to inspect output paths, task target,
exit status and deployment generation.

Incident caveat: `c1f4ec6` fixed a real default-path mismatch, but the September 5
incident's actual task configuration/logs were not inspected. Do not document
that hypothesis as a conclusively verified root cause.

## BILL-01 — RevenueCat access projection

Evidence: `src/revenuecat.mjs` updates `user_access` via client-triggered
`/api/billing/sync`. No webhook handler was found in reviewed `main`.

Keep RevenueCat authoritative and `user_access` as a local projection. Implement
authenticated webhooks and bounded periodic reconciliation using RevenueCat's
documented behavior. Prefer retrieving current entitlement state when handling
events to avoid naively applying out-of-order payloads. Retain post-purchase sync.
Bound upstream calls and prevent excessive repeated sync requests per user.

Acceptance: tests cover duplicate/out-of-order events, renewal, expiry, refunds,
revocation, grace periods and provider failure. Cancellation of renewal alone
must not remove already-paid access prematurely. Test concurrent updates and
ensure a failed sync does not overwrite valid state with an invented result.
Never accept entitlement claims from client payloads. Do not exercise refunds
or purchases on real customers during implementation.

Reference: https://www.revenuecat.com/docs/integrations/webhooks

## QA-01 — Behavioral tests and CI

Many tests in `test/prediction-ui.test.mjs` assert source-code strings. Keep useful
static checks but add executable integration tests for the failure modes below.
The reviewed snapshot has no `.github` workflow directory; check for other CI
before adding a minimal workflow.

- Species → discovery → species, rapid toggling and out-of-order responses.
- Missing species, network failure, stale generation and focus refresh.
- Map/popup agreement at known coordinates and category boundaries.
- Anonymous, unsubscribed, active and expired access to prediction routes.
- Google/email gate behavior and subscription activation with mocked providers.
- Scorer output validation using reproducible fixtures.

Acceptance: tests run without production credentials or live purchases. CI runs
appropriate tests and the public build on the supported Node version. A passing
regex assertion must not stand in for an observed browser interaction.

## MODEL-01 — Continuous seasonal prior

Evidence: `seasonPrior` accepts integer months. For rovelló the factor jumps
from approximately `0.800737` on August 31 to `1` on September 1 with all other
inputs held constant. The mathematical curve is smooth over distance but the
input is not continuous over days.

Define a continuous day-of-year interpretation of seasonal windows, including
year wraparound and leap years. Preserve species-specific widths. Version the
change and compare representative dates before adoption.

Acceptance: adjacent dates around month/year boundaries have no artificial
step; typical-season behavior and narrow/broad seasonal priors remain coherent.
Do not use this change to inflate scores generally.

## MODEL-02 — Suitability versus confidence

Evidence: `capConditionScore` caps scores at `0.79` when environmental data is
incomplete. This mixes data completeness with suitability and flattens rankings.

Prepare a concrete output/display contract separating the underlying suitability
score, data quality and reasons for uncertainty. Agree how categories, discovery
and legacy fields behave before replacing the current cap. Do not imply that
a percentage is a calibrated probability of finding mushrooms.

Acceptance: tests distinguish identical conditions with different data coverage;
missing information cannot imply better confidence. Changes to rankings and
categories are quantified on fixed datasets and explained to the user.

## MODEL-03 / MODEL-04 — Evaluation before additional complexity

First build a repeatable leave-station-out evaluation of weather interpolation.
Report temperature/rainfall errors and coverage by region/elevation, comparing
against a simple nearest-station baseline. Save input snapshots and model/source
versions so results can be reproduced.

Then evaluate hypotheses separately: species-specific rainfall lags, drying
effects, host specificity, and overlapping temperature/altitude/season penalties.
A shared 700 m altitude fade is an implementation choice, not a validated
ecological constant. Ground observations are required to judge improvements in
mushroom prediction; interpolation accuracy alone does not establish that.

Acceptance: each experiment states its hypothesis, baseline, spatial/temporal
holdout and result. Do not ship a new factor merely because a map looks better.
Describe 250 m as terrain-grid resolution, not observed weather precision.

Scientific context: https://www.nature.com/articles/srep45824

## MODEL-05 — Dynamic moisture reserve (first substantive scoring experiment)

Goal: distinguish equal rainfall histories followed by different drying conditions.
The baseline reserve uses a fixed exponential decay, independent of humidity,
wind and radiation. Improve this component before adding standalone weather
penalties. Implement a candidate alongside the baseline; this is not authorization
to replace production scores or claim improved mushroom prediction accuracy.

### Implementation sequence

1. Freeze representative input datasets and record baseline outputs, model
   version and parameters. Include wet/dry periods and coastal/mountain settings.
2. Using OPS-02 contracts, assess relative-humidity coverage alongside temperature.
   Implement a documented atmospheric drying-demand estimate. Vapor-pressure
   deficit is a candidate: derive it from contemporaneous temperature/humidity
   samples when available, rather than treating separately averaged inputs as
   equivalent. VPD alone is not an evaporation rate in millimetres per day.
3. Implement a bounded daily reserve with explicit units, initialization, warm-up,
   effective rainfall, drying and drainage. If the result is normalized rather
   than physical soil water, label it an estimated moisture index. Record assumed
   capacities and coefficients as hypotheses, not measured soil properties.
4. Compare that candidate with the fixed-decay baseline. Add radiation/wind only
   as a separate candidate if coverage and documented units support it. Account
   for wind sensor height/exposure and avoid presenting open-station wind as a
   forest-floor measurement. Use established evaporation methods where inputs
   support them; do not invent an arbitrary wind multiplier.
5. Feed the candidate reserve into the existing moisture component while keeping
   the rainfall-trigger lag and all other scoring factors fixed for comparison.
   Do not count humidity/wind/radiation again as independent score penalties if
   they already contribute to drying. Keep configuration shared across species;
   species-specific responses require separately justified parameters.

Conceptual daily contract (all terms must use compatible units):

```text
reserve[t] = clamp(
  reserve[t-1] + effectiveRain[t] - drying[t] - drainage[t],
  0,
  capacity
)

output = { reserve, quality, methodVersion, fallbackReason }
```

Specify how missing periods affect state and recovery. Do not silently switch
between incompatible reserve units when falling back to the baseline. Report
fallback coverage so apparent improvements cannot hide missing inputs.

### Verification and release criteria

| Controlled scenario | Expected behavior |
|---|---|
| Same rain/initial reserve; higher drying demand | Reserve decreases faster, holding other inputs fixed |
| No new rain | Reserve cannot increase under nonnegative drying/drainage |
| Heavy rain | Reserve remains bounded; excess water is accounted for |
| Missing humidity or optional wind/radiation | Explicit fallback/quality outcome, not invented observations |
| Different initialization or warm-up lengths | Sensitivity measured and stabilization documented |
| Replay of identical inputs and parameters | Deterministic outputs |

Produce a comparison report with reserve trajectories, per-species score changes,
category transitions, top-area ranking changes and fallback rates. Evaluate
weather interpolation with held-out stations via MODEL-03; use independent soil
moisture observations if suitable ones are available, stating their scale and
coverage. Test sensitivity to uncertain drying/capacity parameters.

Physical consistency and better weather interpolation are engineering evidence,
not proof of improved mushroom predictions. Where field observations exist,
compare against baseline with spatial/temporal holdouts; otherwise explicitly
record predictive improvement as unverified. Keep candidate generations isolated
from the active manifest until the user reviews the evidence and authorizes
release. Publish any accepted change as a new model version with rollback.

Supporting references (verify methodology before choosing coefficients):

- https://www.sciencedirect.com/science/article/pii/S0168192317303441
- https://www.meteo.cat/wpweb/serveis/dades-obertes/
- https://www.meteo.cat/wpweb/divulgacio/equipaments-meteorologics/estacions-meteorologiques-automatiques/xarxa-destacions-meteorologiques-automatiques-xema/informacio-sobre-les-dades-meteorologiques-de-les-ema-que-es-mostren-al-web/

Suggested scoring assignment:

> Implement OPS-02 and the baseline-versus-candidate experiment in MODEL-05.
> Read the dependencies and verify current code first. Preserve the production
> scoring path, use frozen inputs and isolated outputs, and deliver the quality
> report and comparison evidence. Record limitations if ground observations are
> unavailable. Do not activate the candidate, push or deploy.

## UX-01 — Consistent geographical recommendations

Station scores use surrounding forest fraction/mixed-host rules, while raster
cells use different host factors. Discovery selects supported areas of modeled
suitability; it does not measure abundance or exhaustively list occurrences.

Define what “best places” represents. Prefer consistently scored forest areas
for destination recommendations, with weather stations clearly identified as
supporting observations. Do not mechanically force station and cell values to
match: their spatial context differs. Verify marker, selected species, coordinates,
score and popup against the same generation and terrain cell/area contract.

Acceptance: fixtures explain expected station/area differences; all displayed
discovery list entries correspond to selected markers. Broadly modeled species
must not be cosmetically downweighted merely to diversify icons.

## ENG-01 — React frontend migration

Decision: migrate the paid app to React + TypeScript + Vite, with TanStack Router
and TanStack Query. This replaces the earlier proposal to substantially refactor
the vanilla frontend. The owner is comfortable with React, and the growing map,
account and discovery UI benefits from explicit component/state boundaries.

Recommended delivery order: OPS-01–03, BILL-01, then ENG-01 with QA-01 developed
alongside it, then substantial new UI features. This is prioritization rather
than a claim that billing is a technical prerequisite for React. MODEL-03/05
experiments can proceed independently after input-quality work; they do not
depend on this migration. Keep scoring changes out of the migration release.

### Technology and ownership contract

| Responsibility | Choice / owner | Boundary |
|---|---|---|
| Paid app UI | React + TypeScript | Preserve current appearance and behavior |
| Bundling | Vite | Generated asset hashes; no hand-maintained import dates |
| Routes and shareable view settings | TanStack Router | Validate mode/species/location parameters; preserve map mount across overlays |
| Remote application data | TanStack Query | Explicit freshness/cancellation; prediction keys include generation and species |
| Session and auth actions | Better Auth React client | Single session owner; keep backend authorization authoritative |
| Map rendering and camera | Existing MapLibre engine | One persistent instance, explicit source/layer ownership |
| Projection and pixel lookup | Existing pure modules + map adapter | Preserve coordinate/score correspondence; buffers outside normal React state |
| API, auth, entitlement enforcement | Existing Hono/PostgreSQL/Better Auth/RevenueCat | Preserve routes and contracts except scoped build integration |
| Public landing, legal and species content | Existing generated HTML | Preserve public URLs, metadata and generated pages |
| Mobile packaging | Capacitor consuming built assets | Separate platform configuration/adapters where necessary |

Use `react-map-gl/maplibre` if its compatible version supports the existing
custom raster path cleanly. Otherwise start with direct MapLibre behind a React
adapter. Confirm peer dependencies against the installed map engine before
choosing versions; avoid an unrelated MapLibre major upgrade in the same change.
React and imperative map code must not independently own the same source/layer.

Retain the existing visual design and CSS, organizing it incrementally. Do not
introduce Next.js, TanStack Start, a backend rewrite or a broad component-library
redesign as part of this task. TanStack Router/Query work within a Vite SPA.

### Migration stages

1. Capture QA-01 baseline behavior with deterministic prediction fixtures and
   representative desktop/mobile screenshots. Include newly shipped features
   present on the implementation base, not just the old reviewed snapshot.
2. Add the Vite/React/TypeScript app on an isolated branch and reproduce the map
   with existing projection, raster loading and pixel lookup. Preserve one map
   instance across tab/sidebar/account transitions; clean up effects/listeners
   correctly, including React development Strict Mode mount/unmount cycles.
3. Move species selection, discovery, sidebar, popups and location controls to
   components. Keep URL state, transient UI state, map camera and remote data
   ownership explicit. Cancel obsolete requests and prevent stale completions
   from changing the selected mode/species or generation.
4. Move sign-in, sign-up, recovery, subscription and existing account flows.
   Use Better Auth's client for sessions. Adapt RevenueCat behind a small billing
   boundary; do not treat its web SDK as the completed native billing integration.
   Clear private query data and map resources on logout/account switch.
5. Integrate built assets with Hono/Coolify and existing public-page generation.
   Define `/app/` base paths and scoped SPA deep-link fallback without swallowing
   API errors or public routes. Proxy local API requests to preserve practical
   same-origin development. Cache hashed assets appropriately and revalidate
   HTML/manifests; cache busting does not replace generation consistency.
6. Verify web/PWA and Capacitor packaging, document API/base-path differences,
   auth redirects and platform boundaries, then prepare the route cutover and
   rollback procedure. Remove obsolete frontend/build paths after cutover parity
   is established; avoid indefinitely maintaining two product implementations.

### Acceptance criteria

- Type checking, production build and behavioral tests run in CI on the supported
  Node version. Public pages still build and their URLs remain intact.
- Fixtures verify species/discovery toggling, rapid changes, failed requests,
  generation refresh, popup/marker alignment and focus revalidation.
- Map position survives overlays and tabs; no duplicate map instances, handlers
  or location prompts appear. Geolocation remains user-triggered.
- Sessions and subscription gates behave as before; deep links, OAuth callbacks,
  recovery and refresh work. Server checks protect data regardless of client state.
- All related prediction downloads use one generation. Query keys, invalidation,
  account changes and optional persistence cannot expose another user's data or
  combine old weather with new species assets. Do not persist paid datasets in
  an offline cache without a separately defined feature contract.
- Compare interaction responsiveness, map startup, transferred assets and memory
  against the baseline with identical fixtures/devices. Investigate material
  regressions; React itself is not evidence of a performance improvement.
- Verify mobile layout and critical flows in a browser, and built-asset loading
  in available Capacitor environments. Record device-only OAuth/billing checks
  as outstanding when unavailable; packaging success is not native release readiness.
- No scoring/model changes or intentional redesign are bundled with the migration.
  Document exact rollout/rollback steps and remaining production verification.

Suggested assignment:

> Read ENG-01 and QA-01 in IMPLEMENTATION_BACKLOG.md. Verify the current base and
> prerequisite status, then migrate the paid frontend to React/TypeScript/Vite
> with TanStack Router/Query on an isolated branch. Preserve current visuals,
> map mathematics, backend contracts and shipped features. Demonstrate parity
> with deterministic browser tests and document build/deployment integration.
> Do not push or deploy.

## DOC-01 — Reconcile documentation with shipped features

- README says `/100`, while the baseline UI displays `%`. Document the actual
  contract and record proposed wording separately from shipped behavior.
- README references `PLA_CONTINGUT.md`, absent from reviewed `main` but present
  as untracked work in another checkout. Locate and reconcile; do not overwrite it.
- Earlier conversations discussed account deletion, but the reviewed `main`
  auth/server implementation does not contain that feature. Locate the feature
  work and document its status before promising availability or merging anything.
- Correct claims of continuous seasonality and keep model parameters, client
  descriptions and confidence language synchronized.

Acceptance: links resolve and a status table distinguishes shipped, implemented
elsewhere, proposed and verified-in-production features.

## Product proposals — require explicit feature scope

**PRODUCT-01:** private saved areas and recent comparisons. Compare historical
scores only with clear model-version handling. Preserve historical predictions
or the inputs needed to reproduce them; latest-only files cannot support trends.

**PRODUCT-02:** optional field reports: species, approximate area, date, search
duration and none/few/many found. Include negative observations and effort; avoid
treating unvisited locations as absence. Agree consent, visibility, retention and
deletion behavior before collecting location data. Hold out locations and dates
when evaluating predictive quality; self-selected reports have sampling bias.

**PRODUCT-03:** useful saved-area alerts and native apps later. Define a specific
user benefit and complete native auth/billing/offline requirements before release;
the presence of Capacitor projects alone does not establish release readiness.

## Completion record

Update this table as items are implemented. Add rows for additional completed
items and link to reproducible evidence rather than only stating “tests pass.”

| Item | Status | Commit / changed files | Verification | Operational setup remaining |
|---|---|---|---|---|
| OPS-01 | Core + expand adapter implemented; ready for staging, not production | `codex/prediction-generations`; phased contract in `docs/PREDICTION_GENERATIONS.md` | 107 tests; all 23 legacy assets return 200 in fixtures; generation race/integrity tests; web/mobile builds; deterministic scorer run | Validate authenticated old/new clients, persistent store, first generation, cron, readiness and rollback; implement build-update notice and aggregate monitoring before production |
| OPS-02 | Open | — | — | — |
| OPS-03 | Open | — | — | — |
| BILL-01 | Open | — | — | — |
| QA-01 | Open | — | — | — |
| MODEL-05 | Open | — | — | Candidate evaluation required before activation |
| ENG-01 | Open | — | — | Frontend parity and rollout verification required |
