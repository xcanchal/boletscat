# PWA prediction refresh hotfix

Developed on `codex/pwa-foreground-refresh`, based on `origin/main` at `c1f4ec6`,
for release on `main`. Separate from the unfinished prediction-generation rollout.
Production deployment and real iPhone resume verification must be checked after release.
This changes prediction refresh, not application-code update handling or scoring.

| Event/state | Behavior |
|---|---|
| Visible, authenticated, unlocked and initialized map returns via focus/visibility/pageshow | Refresh active species or discovery, preserving camera position |
| Connection returns | Request current predictions again |
| Map stays visible | Check every 60 seconds, skipping recently loaded data |
| Hidden, locked or uninitialized map | No background refresh |
| Several resume events / load in progress | Coalesce; one-second event guard, one foreground load at a time |
| Refresh rejects | Release guard and allow a later retry; no unhandled rejection |

The prior handler skipped discovery entirely. Discovery now records its load time
and accepts `preserveView`, like the species view. HTTP requests continue using
the existing private prediction API; no new server contract is needed.

This does not correct stale server output: Coolify must run
`node score_estacions.mjs --all` without `--out=public`. The user confirmed that
correcting this command restored current data. Old public output cleanup remains
a separate issue. New refresh code reaches an existing PWA only after it loads
the updated application once; it cannot modify already-running old JavaScript.

Local verification: all 90 tests, web/Capacitor builds and `git diff --check` pass.
Tests execute the actual inline handler in a VM with browser-event mocks for both
modes, event bursts, hidden/locked states, slow requests, periodic checks and
recovery from rejection. Actual iPhone suspension/resume remains a manual release
check: leave each mode open, background it, publish new server data, return and
verify date/data update without camera movement. Also test network restoration.
