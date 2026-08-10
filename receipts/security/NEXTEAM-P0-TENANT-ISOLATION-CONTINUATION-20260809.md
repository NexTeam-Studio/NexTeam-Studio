# P0 tenant-isolation containment ledger

Job: `NEXTEAM-P0-TENANT-ISOLATION-CONTINUATION-20260809`  
Worktree: `target-architecture-integration`  
Status: **BLOCKED — P0 is not green**  
Captured: 2026-08-09

Tenant aliases are used below to avoid recording customer-identifying data:

- `TENANT_A`: primary staging tenant
- `TENANT_B`: secondary staging tenant

## Repaired authentication containment

| Route class | Direction | Result | Regression coverage | Staging verification |
| --- | --- | --- | --- | --- |
| All authenticated server routes: local-token bypass | A → B and B → A | PASS locally: a local development bearer token is rejected when Firebase authentication is required. | `apps/server/test/local-dev-auth.test.mjs` — `local development sessions cannot authenticate an auth-required runtime` | BLOCKED: staging SHA `e12a0a4` still exposes the local-auth endpoint (empty POST returns `400`, rather than `404`). Deployment is required. |
| Platform-admin routes: Firebase Admin unavailable | N/A; prevents an unauthenticated cross-tenant control-plane read/mutation | PASS locally: fails closed with `503`. | `apps/server/test/platform.test.mjs` — `platform-admin routes fail closed when Firebase auth is required but unavailable` | BLOCKED: staging has not received this commit. |

## Previously repaired two-way route coverage

| Route class | Direction | Result | Regression coverage | Staging verification |
| --- | --- | --- | --- | --- |
| Schedule reads | A → B and B → A | PASS locally (`403`) | `tenant-isolation-route-guards.test.mjs` | Pending authenticated staging matrix |
| Field documentation reads, direct IDs, generated report PDF, templates, folder delete | A → B and B → A | PASS locally (`403`) | `tenant-isolation-route-guards.test.mjs` | Pending authenticated staging matrix |
| Content reads | A → B and B → A | PASS locally (`403`) | `tenant-isolation-route-guards.test.mjs` | Pending authenticated staging matrix |
| Evaporation report PDF | A → B and B → A | PASS locally (`403`) | `tenant-isolation-route-guards.test.mjs` | Pending authenticated staging matrix |

## Required matrix — not yet verified

The following remain open until authenticated, two-way staging probes are captured after the containment deployment. Each must cover list/search, direct ID, query/URL tenant manipulation, and a safe denied mutation where applicable.

| Route class | A → B | B → A | Regression test | Staging |
| --- | --- | --- | --- | --- |
| Clients and properties | Open | Open | Open | Open |
| Requests | Open | Open | Open | Open |
| Quotes | Open | Open | Open | Open |
| Jobs | Open | Open | Open | Open |
| Visits / schedule | Partially covered locally | Partially covered locally | Partial | Open |
| Invoices | Open | Open | Open | Open |
| Payments | Open | Open | Open | Open |
| Receipts | Open | Open | Open | Open |
| Documents and photos | Partially covered locally | Partially covered locally | Partial | Open |
| Communications | Open | Open | Open | Open |
| Imports and exports | Open | Open | Open | Open |
| Global search and direct IDs | Partial | Partial | Partial | Open |
| Client portal | Open | Open | Open | Open |
| Remaining tenant-owned reads and mutations | Open | Open | Open | Open |

## Required gates executed

- `npm --workspace @nexteam/server run build` — PASS
- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm run check:admin-tenant-writes` — PASS (`337` source files; `18` transactional writes; `1` append-only generated-ID write)
- Focused P0 regressions — PASS: 3/3
  - local-auth staging denial
  - platform-admin fail-closed behavior
  - existing repaired two-way guard matrix
- `npm run check:worktree-scope` — PASS
- `npm run check:worktree-coverage` — PASS (`532/532`)

## Human blocker

Root cause: the current staging build (`e12a0a4`) predates the local-auth and platform-admin fail-closed containment changes. It keeps `/api/public/local-auth/sign-in` registered even though staging reports Firebase authentication as required. The active staging build therefore cannot supply valid P0 evidence for an authentication boundary that the local source has just repaired.

Job step blocked: authenticated two-way staging matrix.  
Attempted actions: local regression-first repair, focused build/test gates, public staging runtime inspection, and a non-mutating empty request to the local-auth route.  
Exact human action required: deploy the reviewed containment changes to staging, then provide or operate two separate authorized staging identities (one per tenant) so the read-only and safe-denied-mutation matrix can be executed without exposing credentials or changing customer data.

Do not begin the queued NexCommand panel while this ledger remains blocked.
