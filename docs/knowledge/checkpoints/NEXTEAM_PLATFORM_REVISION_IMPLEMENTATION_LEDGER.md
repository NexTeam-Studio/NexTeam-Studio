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
| A Tenant core, onboarding, settings | platform-tenants; nexops-settings; target-architecture-integration | REPAIRING | bb92ba5 | `packages/core/src/types.ts`; `packages/core/src/schemas.ts`; `packages/providers/src/native/NativeAdapter.ts`; tenant settings route/schema/UI; CRM route test | Typecheck passed; full test suite: 466 passed, 0 failed, 3 skipped; lint, tenancy, worktree scope, and coverage passed; build must be rerun after the Settings UI change | Company profile, location, hours, module, and onboarding administration are not all exposed in the Settings UI yet | A |
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
| N NexPortal | nexportal | NOT STARTED | Pending | Pending | Pending | Authorization boundary requires tenant/client evidence | O |
| O Future enterprise readiness | target-architecture-integration | NOT STARTED | Pending | Pending | Pending | Documentation and extension contracts only unless existing owned implementation exists | P |
| P Cross-platform hardening | target-architecture-integration | NOT STARTED | Pending | Pending | Pending | Must include tenant, persistence, and ownership gates | Q |
| Q Automated acceptance preparation | target-architecture-integration | NOT STARTED | Pending | Pending | Pending | Non-production isolated test data only | R |
| R Chris test-ready package | target-architecture-integration | NOT STARTED | Pending | Pending | Pending | Requires all preceding phases green | Final handoff |

## Evidence rule

Each phase records targeted, contract, tenant-isolation, lint, typecheck, build, scope, documentation, and rollback evidence before it is marked GREEN. Automated evidence does not establish production readiness or replace Chris end-user acceptance.
