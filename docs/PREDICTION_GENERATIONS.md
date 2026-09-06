# Prediction generation publication (OPS-01)

Core and expand compatibility adapter implemented on
`codex/prediction-generations`, synchronized with `main` at `df3d01e`.
**Ready for staging validation, not production.** Production is unchanged. This
change preserves the scoring formulas.
The owner confirmed that no native apps have been deployed; the migration must
support existing browser tabs and installed PWAs, not distributed native binaries.

## Storage and publication contract

```text
PREDICTION_DIR/                    default: private/predictions
  .generation-lock/owner.json      exclusive writer; PID, host, start time
  .staging/g-<uuid>/               unpublished run; never served
  generations/g-<uuid>/            immutable validated output
    manifest.json                 schemaVersion, generationId, referenceDate,
                                  generatedAt, modelVersion, terrainVersion, files
    bolets.*                      complete species + shared assets + discovery
  current.json                    atomic copy of the selected manifest
  experiments/g-<uuid>/            single-species output; never served
```

`node score_estacions.mjs --all` takes the writer lock, generates into staging,
validates all required files, finalizes the directory, then atomically replaces
`current.json`. Paths must share one filesystem supporting atomic rename.
The scorer and server both load `.env` and resolve `PREDICTION_DIR` identically.
`--out` explicitly overrides the scorer destination; the server must be configured
to use the same root. The scheduled command remains `node score_estacions.mjs --all`.

Every manifest records required filenames, byte lengths and SHA-256 hashes. PNG
dimensions/decodability, JSON metadata, scores, coordinates and discovery records
are validated before publication. Raster weather must be finite before encoding.
`sourceObservedThrough` is explicitly `null`: source freshness/coverage is OPS-02,
and the generation date is not proof of fresh upstream observations.

| Event | Result |
|---|---|
| Generation or validation fails | Current pointer unchanged; staging cleaned |
| Second scorer overlaps | Fails before generating; cannot publish out of order |
| Process is killed | Current remains valid; lock requires inspected recovery |
| New generation publishes during a browser load | All related files stay pinned to the acquired generation |
| A pinned generation no longer exists | HTTP 410; client retries the entire bundle once using current manifest |
| No valid active generation | Current endpoint 503; readiness fails |
| Active asset modified after publication | Asset hash check rejects delivery |

Readiness checks the database, finalized manifest and file presence/length.
It does not yet measure data freshness (OPS-03). Liveness remains separate.

## Client/API contract

- `GET /api/predictions/current.json` selects a generation.
- `GET /api/predictions/generations/:generation/:filename` reads only files
  listed in that generation's manifest.
- `GET /api/predictions/:filename` is the expand-phase adapter for existing
  clients; each request resolves through the current validated generation.
- All routes require session and entitlement authorization. Responses remain
  `private, no-store`; immutable filenames do not make paid files public.
- Species views load and decode the full bundle before installing it. Popups
  use the same in-memory terrain/weather/raster. Discovery drilldown carries its
  manifest into the species view. Normal refresh acquires a new manifest.
- A failed or obsolete load must not replace newer state. A 410 retry discards
  the old bundle rather than replacing individual assets with newer ones.

The compatibility adapter now preserves legacy flat endpoints with the same
authorization, allowlist, integrity checks and private cache policy. New clients
never fall back to flat URLs and retain full snapshot consistency.

## Expand/contract rollout — expand implemented, staging validation pending

This rollout separates additive API support from client adoption and eventual
removal. A new deployment cannot remotely install JavaScript into an old tab.
PWAs can remain suspended for a long time, so elapsed time or zero recent legacy
traffic alone cannot prove that every old client has upgraded.

| Phase | Status | Server and scorer | Browser/PWA | Exit gate |
|---|---|---|---|---|
| 0 — Prepare | In progress | Adapter complete; build-version endpoint and counters pending | Fixture tests complete; authenticated staging test pending | Volume, readiness and rollback checks pass |
| 1 — Expand | Ready for staging | Both flat and generation APIs serve complete generations | Existing tabs retain flat URLs without mandatory reload | Old client works across publication/redeploy; routes stay private |
| 2 — Migrate | Client implemented; operations pending | Keep both APIs and client assets | New client pins generations; update notice pending | Species/discovery, PWA resume and update handling observed |
| 3 — Observe | Pending | Monitor aggregate legacy/new requests and failures | Long-lived old clients remain supported | No unresolved regressions; explicit legacy-lifetime decision |
| 4 — Contract (optional) | Not planned | Remove legacy routes only under an approved policy | Supported clients use generation URLs | Owner accepts residual risk; recovery and rollback tested |

There is no automatic date-based retirement. Keeping the small legacy adapter is
the default if old-session safety cannot be established. No native migration gate
is required today; reassess before shipping native binaries.

### Legacy adapter contract

- Preserve existing flat filename URLs and response bodies/content types, including
  requests with existing cache-busting query strings. Resolve each request against
  the current validated generation and reuse the same private asset checks.
- Require the same session and paid entitlement as generation routes; retain
  `private, no-store` and `Vary: Cookie`. Do not expose a public static fallback.
- Serve only allowlisted, manifest-listed files. Never serve staging, arbitrary
  paths, or stale flat files left in the prediction root.
- No complete initial generation means not ready. Keep the old deployment serving
  until the new store is populated; do not send paying users to an empty server.
- Each flat request gets a complete file, but several requests may straddle a
  publication and mix generations. This is a temporary legacy limitation, not a
  claim of snapshot consistency. Upgraded clients retain full generation pinning.
- Count legacy versus generation requests and failures without recording account
  emails, precise locations, cookies or other unnecessary personal data.

### Browser/PWA update contract

Add a public, non-sensitive `GET /api/app-version` with `Cache-Control: no-store`.
Use a deployment build ID, not the prediction generation ID: daily scoring must
not trigger application reloads. The following response is the proposed contract:

```json
{ "schemaVersion": 1, "buildId": "deployment-build-id" }
```

The client embeds its own build ID. All serving replicas must agree on the
advertised release; configure version checks to avoid alternating notices during
rolling deploys. Retain supported old module URLs/assets across the transition.

| Client event | Required behavior |
|---|---|
| Initial load, focus, visible `visibilitychange`, or connection restored | Revalidate build ID; coalesce concurrent checks and throttle repeated events |
| Same build | No notice or reload; prediction refresh remains independent |
| New build | Show one accessible Catalan notice: “Hi ha una nova versió disponible.” with “Actualitza” |
| User chooses update | Reload current URL; preserve safe map preferences where supported, never persist credentials |
| Offline/version request fails | Keep the working map; retry on later eligible event, no forced logout/reload |
| Update reload still returns old build | Avoid loops; keep legacy access and offer retry later |
| Old pre-migration client resumes | Compatibility API keeps it usable; do not assume it has this notice code |

Do not force a reload during login, payment or account deletion. The initial
policy is automatic checking with a user-controlled reload, not an automatic
reload loop. Test notices, keyboard access and focus behavior on web and iPhone
PWA. This is an application-update affordance, not a permanent manual map-refresh
button. A notice added now does not notify already-open pre-migration clients.

### Release acceptance and rollback

- Test a saved pre-migration client against the expanded API: all species, shared
  rasters, popup data and discovery load before and after a scorer publication.
- Test the new client concurrently; verify every bundle stays pinned, including
  discovery drilldown, during publication and on whole-bundle retry.
- Repeat session/entitlement rejection, path/integrity rejection and cold-start
  readiness tests for both API shapes. The suite now expects compatibility; HTTP
  409 may return only in a separately approved future contract phase.
- Test browser focus/PWA resume, offline recovery, unchanged/new build IDs, repeat
  events and failed update reloads. Production auth and Coolify checks are still
  required; fixture auth is not an end-to-end release test.
- Before releasing the new client, retain an expanded-server release as the
  rollback target. Once generation clients exist, rolling back to a flat-only
  server would break those clients. Roll back frontend changes while retaining
  both API shapes and all referenced immutable data/assets.
- After release, verify a scheduled run actually publishes and compare failures
  across API versions. Pause migration on regressions; do not retire the adapter
  merely because the new UI appears to work.

## Deployment and recovery

1. Deploy the expanded build to staging, then verify both legacy and generation
   clients with an authenticated subscription. Do not promote it directly to
   production without the remaining acceptance checks.
2. Prefer a persistent prediction volume owned by the application user. This
   retains last-good output across redeployments/upstream outages. Without it,
   every new container must generate a complete dataset before readiness passes.
   During rolling deployments, all instances serving a client must share the
   same generation store (or deployment routing must provide equivalent affinity).
3. The existing entrypoint runs `--all`; confirm the publication log and readiness.
   Old flat prediction files are ignored; a complete new run is required on the
   first migration. Keep the prior deployment available if initial generation fails.
4. Reload an authenticated browser, check `current.json` and confirm every asset
   URL uses the same generation ID. Check species switching and discovery drilldown.
5. Test the next scheduled run and record its published ID. A process start alone
   is not successful publication.

No automatic generation deletion is implemented. Finalized generations are
retained for long-lived clients and rollback; monitor disk usage. A later cleanup
policy must keep current/rollback generations and define client lifetime/410
recovery. Do not delete active assets or overwrite immutable generations.

For a stale writer lock, inspect `owner.json` and verify the process/container is
no longer running before removing that exact lock directory. There is no automatic
timeout-based lock stealing. A live scorer may legitimately be slow. Abandoned
staging/finalized-but-unpublished directories can be inspected and cleaned only
after excluding an active writer. Never clear the entire prediction root.

For data rollback, select a retained validated generation and atomically replace
`current.json` with its `manifest.json` while holding the same writer lock; never
copy individual files over another generation. For code rollback to pre-generation
code, restore the matching previous deployment and regenerate its flat output
in a separate root. Old code cannot read the new directory layout automatically.
That flat-only code rollback is only safe before generation clients are released;
after phase 2, use the expanded-server rollback target described above.

## Verification

### Production stale-date diagnosis — 6 September 2026

Read-only inspection of Coolify confirmed a scheduled-command override, separate
from the pending generation rollout. No production configuration was changed.

| Evidence | Observed value |
|---|---|
| Scheduled command | `node score_estacions.mjs --all --out=public` |
| Latest execution | 2026-09-06 00:00:06 UTC, success |
| Log reference date / destination | `2026-09-06` / `/app/public` |
| Configured prediction directory | `private/predictions` |
| Effect | Scheduled output does not update the files read by the private prediction API |

Immediate remediation, pending authorization: change the scheduled command to
`node score_estacions.mjs --all`, run it once, confirm the private output directory
in its logs, then verify today's date via the authenticated API and both map
modes. This configuration correction does not require deploying OPS-01. Inspect
obsolete public prediction copies separately; do not delete broad directories.
An unauthenticated GET of `/bolets.rovello.geojson` returned HTTP 200 during this
inspection. The obsolete public output is therefore also an access-control
exposure to investigate and remediate, not merely unused disk space. Removing the
command override alone does not remove existing public files or cached copies.

Also confirmed in current main and public app source: foreground refresh explicitly
skips discovery mode. A VM test of the actual handler with data 24 hours old invoked
the species loader in species mode and no loader in discovery mode. This separate
client defect does not explain an old date that survives a full page reload.

`test/prediction-generations.test.mjs` exercises publication, failed validation,
interruption, lock exclusion and retained output. `test/prediction-delivery.test.mjs`
uses the real Hono routes and browser-safe loader with fixture authorization to
exercise protected delivery, traversal rejection, publication races, discovery
pinning and bounded whole-bundle recovery. It does not replace testing real
Better Auth sessions or Coolify volume/routing configuration in deployment.

`test/prediction-scorer.test.mjs` runs the actual scorer CLI with deterministic
weather fixtures, verifies complete output and confirms single-species experiments
cannot modify the active generation. Public and Capacitor packaging include the
new browser-only module; scoring code and server modules remain private.

Local verification completed: 107 tests passed, web and Capacitor builds passed,
and `git diff --check` passed. A full `--all` run using real upstream weather
successfully published all nine species and discovery in an isolated temporary
prediction directory (reference date `2026-09-05`). Production was not modified.
Authenticated browser smoke testing and deployment checks above remain pending.
The automated suite now validates the core and expand adapter. Build-version
handling, aggregate monitoring and authenticated staging checks remain pending;
do not treat local verification as production release approval.

### Rollout probe — 6 September 2026

The initial probe ran 98 tests and exposed the HTTP 409 blocker. After implementing
the adapter, the combined suite runs 107 tests and requests every legacy filename
(including cache-busting query strings) through the actual Hono routes with
fixture active authorization. Compatibility requires HTTP 200.

| Check | Observed result | Release implication |
|---|---|---|
| 23 legacy asset requests | All return HTTP 200 from the validated active generation | PASS locally; repeat with an authenticated saved client on staging |
| Combined generation suite | 107 passed | Core, compatibility, latest map and PWA behavior verified together |
| Web and Capacitor builds | Passed | Packaging verified, not browser compatibility |

The earlier HTTP 409 blocker is resolved locally. No real accounts or production
services were modified. Browser/PWA end-to-end testing remains outstanding and is
the purpose of the staging deployment.
