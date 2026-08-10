# P0 independent validation and NexCommand live-build status

Job: `NEXTEAM-P0-INDEPENDENT-VALIDATION-20260810`  
Environment: staging only  
Status: **GREEN**  
Capture date: 2026-08-10

## Independent P0 staging matrix

The authenticated matrix was run fresh against staging after inspecting (but not trusting) the prior receipt. It used two new synthetic tenant aliases and three temporary Firebase custom-token identities (two tenant owners plus one platform operator). The aliases do not name a customer or existing tenant. The harness makes only foreign-tenant, synthetic-ID requests; every mutation is expected to be rejected before persistence or provider work.

- Matrix result: **74 / 74 safe outcomes**, 0 failures.
- Direction coverage: `TENANT_A -> TENANT_B` and `TENANT_B -> TENANT_A`.
- Tenant mismatch denials: `403` across supported CRM, scheduling, FieldDocs/NexDocs, approval, content, reputation, and export routes.
- Safe non-disclosure paths: `404` only for unsupported/synthetic direct routes; portal mutation remained `401` for its invalid portal session.
- Identity cleanup: all three temporary identities were deleted and then independently queried; each query returned Firebase `auth/user-not-found`.

The harness now records cleanup only after that post-delete verification, rather than asserting it before the `finally` cleanup runs.

## Local corroboration

- `npm --workspace @nexteam/server run build` — PASS.
- Focused tenant/auth tests — PASS: 7 passed, 1 expected emulator-only skip.
- `npm run test:admin-tenant-isolation:emulator` — PASS: 5 / 5 real Firestore transaction tests.
- `npm run check:tenancy` — PASS (481 files).
- `npm run check:admin-tenant-writes` — PASS (337 source files; 18 transactional writes; 1 append-only generated-ID write).

## Read-only NexCommand live-build status

Staging deployment: `6c8e36f5-9d3a-4866-b1c8-5f69d7b64d9c` — `SUCCESS`.

`GET /api/platform/admin/live-build-status` is platform-operator guarded and reads a controller status document at request time. It returns `IDLE` with null/empty run fields when no document, no valid run ID/PID, or no fresh heartbeat exists. It never derives status from chat text or static status environment values.

The controller payload exposes: Current Build, Current Task, Actual State, Run ID, PID, Last Heartbeat, Progress, Completed Tasks, Remaining Tasks, Blocker, and Last Activity. The NexCommand panel is read-only and re-fetches every 30 seconds.

Fresh staging verification with a temporary platform-operator identity returned `200`, the full field set, and `actualState: IDLE`; no controller file/heartbeat existed. The same final run also completed the 74 / 74 P0 matrix and cleanup proof above.

## Panel-focused proof

- Controller unit tests — PASS: missing and stale documents fail closed to `IDLE`; a fresh document is projected faithfully.
- Controller route test — PASS: tenant user receives `403`; authorized operator receives an `IDLE` response with no run data.
- NexCommand panel source test — PASS: controller endpoint, 30-second refresh, all required fields, and no legacy heartbeat environment fallback.
- `npm --workspace @nexteam/web run build` — PASS.
- `npm run check:worktree-scope` — PASS.
- `npm run check:worktree-coverage` — PASS (532 / 532).
- `npm run check:secrets` — PASS (1786 tracked non-document files).

Production was not deployed or changed.
