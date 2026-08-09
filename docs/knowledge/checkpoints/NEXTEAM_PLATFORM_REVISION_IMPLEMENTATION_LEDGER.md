DOCUMENT_ID: PLATFORM-REVISION-LEDGER-20260808
TITLE: NexTeam Platform Revision Implementation Ledger
DOCUMENT_TYPE: ARCHITECTURE_RECORD
STATUS: ACTIVE
CREATED_AT: 2026-08-08
AUTHOR: NexTeam Global Control
PRODUCT_AREA: Platform Revision
TENANTS: all
RELATED_COMMITS: bb92ba59b14c7667967ea6b8e3975fcee3c14b85
TAGS: platform, implementation, ledger, evidence

# NexTeam Platform Revision Implementation Ledger

## Baseline

- Integration worktree: `target-architecture-integration`
- Branch: `codex/target-architecture-integration`
- Starting SHA: `bb92ba59b14c7667967ea6b8e3975fcee3c14b85`
- Starting Git status: clean
- Controller state at authorization: human-decision boundary with no active job.
- Preservation rule: existing dirty lane work is not part of this revision unless its owning lane verifies and commits it independently.
- Production changes: prohibited.

## Ownership matrix for tenant settings

| Setting domain | UI owner | Domain owner | Schema owner | Persistence owner | API owner | Test owner |
| --- | --- | --- | --- | --- | --- | --- |
| Company profile, branding, locations, time zone, industry | NexOps Settings | Tenant Core | Core contracts | Tenant configuration repository | Tenant configuration routes | Settings and tenant integration tests |
| Plan and enabled modules | Platform administration | Platform tenancy | Core contracts | Platform tenancy repository | Platform routes | Platform tenancy tests |
| Business hours, tax, communication identity, security/audit preferences | NexOps Settings | Respective business domain | Core contracts | Tenant configuration repository | Tenant configuration routes | Settings and domain tests |
| Integrations | NexOps Settings | Provider integrations | Provider contracts | Provider configuration boundary | Provider integration routes | Provider integration tests |
| Team, roles, capabilities | Team settings | Users and authorization | Core contracts | Tenant user repository | User routes | User and authorization tests |
| Catalog | NexOps Settings | Catalog | Core contracts | Catalog repository | Catalog routes | Catalog tests |

## Phase status

| Phase | Owner worktree(s) | Status | Starting SHA | Files changed | Gate evidence | Residual risk | Next phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A Tenant core, onboarding, settings | platform-tenants; nexops-settings; target-architecture-integration | GREEN | bb92ba5 | `packages/core/src/types.ts`; `packages/core/src/schemas.ts`; `packages/providers/src/native/NativeAdapter.ts`; tenant settings route/schema/UI; CRM route test | 2026-08-08: `node --import ./tests/setup.mjs --import tsx --test apps/server/test/crm-read-side.test.mjs` — 21 pass, exit 0. `npm run verify` — lint, typecheck, 466 pass / 0 fail / 3 skipped, tenancy, admin writes, indexes, collisions, scope, coverage, secrets, secret history, provider imports, blueprints all passed, exit 0. `npm run build` — server and web builds passed, exit 0. | Module selection and ordered guided onboarding persist on the existing `crmSettings/{tenantId}` record; no separate tenant configuration collection was introduced. | B |
| B Team, roles, permissions | nexops-users; nexteam-global | NOT STARTED | Pending | Pending | Pending | Capability contract may require coordinated core change | C |
| C Catalog | nexops-settings | NOT STARTED | Pending | Pending | Pending | Existing lifecycle references must remain stable | D |
| D Clients, properties, assets | nexops-clients; nexops-client-details; shared-address-location | NOT STARTED | Pending | Pending | Pending | Existing client lanes include preserved uncommitted work elsewhere | E |
| E Agreements | target-architecture-integration | NOT STARTED | Pending | Pending | Pending | Contract ownership must be established before implementation | F |
| F Job costing | nexops-jobs; nexops-invoices | NOT STARTED | Pending | Pending | Pending | Cost facts require audit-safe lifecycle links | G |
| G Time and pay foundation | nexops-jobs; nexops-users | NOT STARTED | Pending | Pending | Pending | External payroll remains an integration boundary | H |
| H NexForms | nexdocs; nexcam | NOT STARTED | Pending | Pending | Pending | Existing form/checklist ownership must be reused | I |
| I NexComms | nexcomms | NOT STARTED | Pending | Pending | Pending | Provider credentials and consent remain external boundaries | J |
| J Core operating flow alignment | target-architecture-integration plus owning lanes | NOT STARTED | Pending | Pending | Pending | Requires proven durable tenant data path | K |
| K Nexi operating-agent integration | nexi-runtime; nexi-chat | NOT STARTED | Pending | Pending | Pending | Existing runtime lane has preserved dirty changes | L |
| L NexCam and NexDocs integration | nexcam; nexdocs | NOT STARTED | Pending | Pending | Pending | Attachment work must not be duplicated | M |
| M NexReach and Bragi | nexreach | NOT STARTED | Pending | Pending | Pending | Existing lane has preserved dirty changes and publishing remains non-production | N |
| N NexPortal | nexportal; target-architecture-integration | GREEN | bb92ba5 | `apps/server/src/modules/nexportal/components/portalCore/server/portalHubService.ts`; `apps/server/test/client-hub-review-followup.test.mjs` | 2026-08-09: `node --import ./tests/setup.mjs --import tsx --test apps/server/test/client-hub-review-followup.test.mjs` — 8 pass / 0 fail, exit 0. `npm run verify` — lint, typecheck, 466 pass / 0 fail / 3 skipped, tenancy, admin writes, indexes, collisions, scope, coverage, secrets, secret history, provider imports, blueprints all passed, exit 0. `npm run build` — server and web builds passed, exit 0. | Portal snapshots admit only customer-delivered quote/invoice lifecycle states with a portal token and sent receipt reviews. Tenant-bound magic-link cookies, client ownership, property scope, hidden-document controls, and re-verification fence every portal read/write route. | O |
| O Future enterprise readiness | target-architecture-integration | GREEN | 0ed1498 | `docs/contracts/enterprise-future-readiness.md`; `apps/server/test/enterprise-future-readiness-contract.test.mjs`; `receipts/architecture/phase-o-*.raw.txt` | 2026-08-09: enterprise contract guard — 3 pass / 0 fail, exit 0. `npm run verify` — lint, typecheck, 483 pass / 0 fail / 3 skipped, tenancy, Admin tenant-write, indexes, collisions, scope, coverage, secrets, secret history, provider imports, and blueprints passed, exit 0. `npm run build` — server TypeScript and web production build passed, exit 0. | Documentation and executable extension-contract guard only; SSO, SCIM, organization hierarchy, custom roles, immutable audit, retention/legal hold, residency/CMK, public API/webhooks, and support delegation remain explicitly not implemented. | P |
| P Cross-platform hardening | target-architecture-integration | GREEN | 7a7d4e6 | Shared product implementations; public HTTP error boundary repair; `receipts/architecture/phase-p-repair-1-*.raw.txt` | 2026-08-09: `npm run verify` — lint, typecheck, default non-browser tests, tenancy, Admin tenant-write, indexes, collisions, scope, coverage (520/520), secrets, secret-history, provider-import, and blueprint gates passed, exit 0. `npm run build` — server TypeScript and web production build passed, exit 0. Firestore rules emulator — 21 pass / 0 fail, exit 0. Firebase Auth/Admin emulator — 6 pass / 0 fail, exit 0. Admin tenant-isolation emulator — 5 pass / 0 fail, exit 0. Focused health, persistence, mobile, accessibility, and public-error suite — 39 pass / 0 fail, exit 0. Contamination audit — 0 direct imports of `tenantPacks/aquatrace`, exit 0. Raw outputs: `receipts/architecture/phase-p-repair-1-*.raw.txt`. | Automated local/emulator evidence only; no deployment, production-rule change, customer-data access, browser automation, or live endpoint verification was performed. | P |
| Q Automated acceptance preparation | target-architecture-integration | GREEN | edad752 | `apps/server/test/phase-q-automated-acceptance.test.mjs`; `docs/contracts/phase-q-automated-acceptance.md`; `receipts/architecture/phase-q-*.raw.txt`; `receipts/verification/NEXTEAM-REVISION-PHASE-Q-ACCEPTANCE-REPAIR-1-VERIFY-2.raw.txt` | 2026-08-09 re-verification: isolated acceptance â€” 1 pass / 0 fail, exit 0. `npm run verify` â€” 486 pass / 0 fail / 3 skipped plus all repository guardrails, exit 0. `npm run build` â€” server and web build passed, exit 0. Firestore rules emulator â€” 21 pass, exit 0. Firebase Auth/Admin emulator â€” 6 pass, exit 0. Admin tenant-isolation emulator â€” 5 pass, exit 0. Shared-runtime contamination audit â€” 0 direct imports, exit 0. | Automated local/emulator evidence only; no deployment, production-rule change, customer-data access, browser automation, or live endpoint verification was performed. | R |
| R Chris test-ready package | target-architecture-integration | READY FOR CHRIS END-USER TESTING | caf276e; 7b44b1f | `scripts/run-chris-test-package.mjs`; `docs/handoffs/PHASE-R-CHRIS-TEST-PACKAGE.md`; `apps/server/test/phase-r-chris-test-package.test.mjs`; `receipts/verification/NEXTEAM-REVISION-PHASE-R-CHRIS-PACKAGE-REPAIR-1.raw.txt` | Fixed loopback test URLs, explicit local-only identities, reset instructions, end-user checklist, proof sources, and known limitations are included. Phase R targeted contract, `npm run verify`, `npm run build`, Firestore rules emulator, Firebase Auth/Admin emulator, and Admin tenant-isolation emulator all exited 0; raw output is retained in the Phase R receipt. | Local isolated memory runtime only; it cannot prove durable persistence, external providers, deployment, customer data, or production auth. Chris's observed acceptance checklist is still required. | Final handoff |

## Evidence rule

Each phase records targeted, contract, tenant-isolation, lint, typecheck, build, scope, documentation, and rollback evidence before it is marked GREEN. Automated evidence does not establish production readiness or replace Chris end-user acceptance.
