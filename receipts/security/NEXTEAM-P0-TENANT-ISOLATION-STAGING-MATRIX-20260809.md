# P0 authenticated staging tenant-isolation matrix

Job: `NEXTEAM-P0-TENANT-ISOLATION-STAGING-MATRIX-20260809`  
Environment: staging only  
Status: **GREEN**  
Capture date: 2026-08-09

## Deployment evidence

- Railway staging deployment: `SUCCESS`, 2026-08-09 22:07:21 -04:00.
- The local-development sign-in route was probed without credentials and returned `404`.
- `/api/version` was deliberately excluded as deployment proof because its build identifier is known stale.

## Identity and safety method

Two temporary Firebase custom-token identities were minted with opposite tenant claims (`TENANT_A`, `TENANT_B`), used only for this run, and deleted in the harness `finally` block. No tokens, claims, customer data, or credential values were recorded. Every probe supplied the other tenant in a URL/query or request body; mutation probes use a synthetic foreign ID and are expected to fail before any persistence or provider action.

## Two-way evidence ledger

| Endpoint class | A -> B | B -> A | Proof |
| --- | --- | --- | --- |
| Clients: list/query, direct ID, denied delete | 403, 404, 403 | 403, 404, 403 | staging harness |
| Properties: list/query, direct-ID mutation | 403, 403 | 403, 403 | staging harness |
| Requests: list/search, direct ID, denied mutation | 403, 403, 403 | 403, 403, 403 | staging harness |
| Quotes: list, direct ID, denied mutation | 403, 403, 403 | 403, 403, 403 | staging harness |
| Jobs: list, direct ID, denied mutation | 403, 403, 403 | 403, 403, 403 | staging harness |
| Visits/schedule: calendar and direct-ID move | 403, 403 | 403, 403 | staging harness |
| Invoices: list, direct ID, denied mutation | 403, 403, 403 | 403, 403, 403 | staging harness |
| Payments: list, direct ID, denied checkout | 403, 403, 403 | 403, 403, 403 | staging harness |
| Receipts: unsupported list/direct routes | 404, 404 | 404, 404 | staging harness |
| Documents/photos: search, direct ID, denied folder delete | 403, 403, 403 | 403, 403, 403 | staging harness |
| Communications: unsupported list/direct routes | 404, 404 | 404, 404 | staging harness |
| Imports: unsupported mutation route | 404 | 404 | staging harness |
| Exports: tenant URL manipulation | 403 | 403 | staging harness |
| Global search: unsupported route | 404 | 404 | staging harness |
| Approval queue, content, reputation reads | 403, 403, 403 | 403, 403, 403 | staging harness |
| NexPortal: invalid foreign session and mutation | 404, 401 | 404, 401 | staging harness |

`403` is an authenticated tenant-claim mismatch denial. `401` is a portal-session authentication denial. `404` represents an unsupported route or a synthetic, non-existent portal/direct identifier and exposes no tenant record. The harness completed **74/74 safe outcomes; 0 failures**.

## Local proof package

- `npm run check:tenancy` -- PASS (481 files)
- `npm run check:admin-tenant-writes` -- PASS (337 source files; 18 transactional writes; 1 append-only generated-ID write)
- `npm --workspace @nexteam/server run build` -- PASS
- Auth and tenant guard suite -- PASS (11/11), including local-owner/local-development bearer denial when Firebase auth is required
- `npm run test:admin-tenant-isolation:emulator` -- PASS (5/5 real Firestore transaction tests)
- `npm run check:worktree-scope` -- PASS
- `npm run check:worktree-coverage` -- PASS (532/532)

## Regression and repeatability

The committed staging harness is `scripts/run-staging-tenant-isolation-matrix.mjs`. It creates only temporary identities and cleans them up even if a probe fails. Run it through the staging environment with tenant aliases supplied as process environment variables; do not persist identity names or credentials in a receipt.

## Authorized follow-on: NexCommand Live Build Status

- Staging deployment `165d54e5-9078-4ec6-a745-5df316aec238` completed successfully.
- The controller-backed `GET /api/platform/admin/live-build-status` was verified with a temporary platform-operator identity: `200`, `IDLE`, and no reported heartbeat.
- The dashboard panel renders that controller state and has no mutation controls.
