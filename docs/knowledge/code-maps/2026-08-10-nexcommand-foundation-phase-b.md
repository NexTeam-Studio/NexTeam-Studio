DOCUMENT_ID: CODEMAP-NEXCOMMAND-FOUNDATION-PHASE-B-20260810
TITLE: NexCommand Foundation Phase B Authority and Relay Map
DOCUMENT_TYPE: CODE_MAP
STATUS: GREEN
CREATED_AT: 2026-08-10
UPDATED_AT: 2026-08-10
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Codex
PRODUCT_AREA: NexCommand Foundation
MODULES: platform, authorization, routing, module-registry, controller-status, relay
TENANTS: all
RELATED_TESTS: apps/server/test/nexcommand-foundation-registry.test.mjs; apps/server/test/live-build-status.test.mjs; apps/server/test/platform.test.mjs; apps/web/src/features/platformOverview/routes/NexCommandRoute.test.mjs
RELATED_DOCUMENTS: docs/knowledge/checkpoints/NEXCOMMAND_FOUNDATION_IMPLEMENTATION_LEDGER.md; docs/knowledge/operations/NEXCOMMAND_ADMIN_CONSOLE.md; docs/worktrees/lanes/platform-tenants.md
RELATED_LLM_ARTIFACTS: JOB-NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-B-20260810
TAGS: code-map, nexcommand, phase-b, ownership, routing, relay

# NexCommand Foundation Phase B Authority and Relay Map

## Authorized change

Phase B formalizes the existing authoritative platform boundary; it does not add a controller, a deployed executor, a role model, a new worktree, or Team/Users implementation. `worktree-lanes.json#componentRegistry` is the machine-readable NexCommand component registry.

| Concern | Authoritative owner | Permitted path / contract | Dependency and conflict | Focused proof | Rollback |
| --- | --- | --- | --- | --- | --- |
| NexCommand UI and status panel | `platform-tenants` | `apps/web/src/features/platformOverview/**` | Shared router remains `nexteam-global`; no second shell. | `NexCommandRoute.test.mjs` | Panel-only revert. |
| Platform services and controller projection | `platform-tenants` | `apps/server/src/platform/**`; read-only status route | Must retain platform-operator gate. | `live-build-status.test.mjs`, `platform.test.mjs` | Absent/stale local document returns `IDLE`. |
| Platform web surfaces | `platform-tenants` | `apps/web/src/features/platform/**` | No duplicate tenant role or module registry. | Registry test plus route coverage. | Independent surface revert. |
| Auth, router, module contracts | `nexteam-global` | existing shared paths in registry | Coordinated integration change only. | Existing platform-route regression coverage. | Global-contract rollback. |
| Local relay | local execution plane | `ops-bridge/to-codex.jsonl` outside deployed app | Schema-validated packet, no secrets; no HTTP dispatch endpoint. | Relay acknowledgement/receipt. | Remove queued packet only through relay recovery procedure; status stays `IDLE`. |
| Legacy Mission Control rails | integration legacy area | `src/features/missioncontrol/**`, `scripts/run-rail-local-api.mjs` | Explicit non-owner; do not adopt. | Registry test documents separation. | No NexCommand effect. |

## Phase C handoff contract

The queued Phase C job is discovery-and-contract only until its persistence and authorization prerequisites are verified. It may not write tenant/customer data, alter production, or weaken the platform-operator gate. Any later functional Team/Users work must have its own tenant-scoped model, server authorization/validation, UI error/save/reload proof, authorized and denied-write tests, and recorded commands/events.
