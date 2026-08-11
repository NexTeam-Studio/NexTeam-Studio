# Tenant lifecycle staging-resume proof

Job ID: `NEXTEAM-DAY1-SETTINGS-TENANT-LIFECYCLE-STAGING-RESUME-20260811`  
Continuation: `NEXTEAM-DAY1-SETTINGS-TENANT-LIFECYCLE-20260811`  
Environment: staging only; production unchanged.

## Promotion

- Started from requested feature commit `67551a6`; the final verified candidate is `583f579c2501fb182622e1d73488b6222775fe34`.
- Pushed only `codex/staging-current`. The remote branch resolved to that exact SHA.
- Railway staging `/api/version` initially served `5d47ea75d286b806ac5937ba8cfa1fa1416a8c38`, then served the expected SHA at `2026-08-11T20:35:09Z`.

## Controller repair

`scripts/reliability/globalControl.mjs` now resumes a failed/incomplete job when the same ID is queued again and records a new linked job through `continuationOf`. The focused reliability suite passed 3/3, including same-job resume and linked-continuation coverage.

## Verification

- `npm run verify`: passed.
- `npm run test:staging-auth:readonly` against `https://nexteam-studio-staging.up.railway.app`: passed, returned HTTP 200 browser/mobile route guards, and matched `583f579c2501fb182622e1d73488b6222775fe34`.
- The live harness is explicitly read-only. No Railway production command, endpoint, variable, or deployment action was issued.

Machine-readable receipt: `receipts/verification/NEXTEAM-DAY1-SETTINGS-TENANT-LIFECYCLE-STAGING-RESUME-20260811.json`.

## Verify-3 recheck

- `npm run verify` completed with exit code `0`. Full raw output: `receipts/verification/NEXTEAM-DAY1-SETTINGS-TENANT-LIFECYCLE-STAGING-RESUME-20260811-VERIFY-3.verify.raw.txt`.
- With `NEXTEAM_STAGING_URL=https://nexteam-studio-staging.up.railway.app` and `NEXTEAM_EXPECTED_LIVE_SHA=583f579c2501fb182622e1d73488b6222775fe34`, `npm run test:staging-auth:readonly` completed with exit code `0`. It returned HTTP `200` browser and mobile route guards and the expected live SHA. Full raw output: `receipts/verification/NEXTEAM-DAY1-SETTINGS-TENANT-LIFECYCLE-STAGING-RESUME-20260811-VERIFY-3.staging.raw.txt`.
- The authoritative lifecycle continuation behavior is documented in `docs/contracts/day1-reliability-control-plane.md` and implemented in `scripts/reliability/globalControl.mjs` at commit `583f579c2501fb182622e1d73488b6222775fe34`.
