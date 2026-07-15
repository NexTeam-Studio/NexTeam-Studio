# Platform M13 Multi-user Lane

Last updated: 2026-07-10 by build/nightly-integration-20260709

## Scope

This lane owns the multi-user per tenant model: internal OWNER/OFFICE_ADMIN/TECHNICIAN roles, Firebase custom claims, `AccessContext`, role-aware tool and endpoint gates, and subcontractor job-scoped links.

## Always Read First

- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md` because NexOps, NexPortal, and NexReach actions must be role-aware.
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md` because NexCam technician and subcontractor access must be job/visit scoped.

## Allowed Touches

- `apps/server/src/platform/`
- `apps/server/src/access/`
- Module routes that need role gates: campaigns, mobile, website, reputation, SEO, intake, fielddocs, scheduling, CRM
- `packages/core/src/` for shared contracts
- `firestore.rules` when access rules change
- `receipts/m13/`
- `docs/internal/M13_MULTI_USER_ACCESS_DESIGN.md`
- `BUILDSTATE.md`, `DECISIONS.md`, and this lane file when verified state changes

## Do Not Touch

- Do not assume `tenantId` alone is enough for any new endpoint/tool.
- Do not give TECHNICIAN campaign, email, billing, pricing, or tenant-wide data access.
- Do not force subcontractors into internal roles; they use job-scoped links closer to client portal access.
- Do not expose raw job-link tokens in receipts, logs, or list responses.

## Current State

Core multi-user contracts and local server support exist. Aquatrace seed users are Chris as OWNER, Catherine as TECHNICIAN, and Logan as TECHNICIAN. The current blocker for done status is real Firebase custom-claim application and live role-gate proof through the browser.

Wave 3 code must be role-aware:

- M6 Campaigns: OWNER/OFFICE_ADMIN only.
- M11 Mobile: TECHNICIAN may see assigned jobs only.
- M8 Website/admin/UI customization: OWNER/OFFICE_ADMIN only.
- Approval actions must record the real actor, not `nexi` or `system`.

## Receipt Rules

- Local receipt: role contracts, AccessContext resolution, denied-role tests, and job-link token-hash behavior pass.
- Live receipt: real Firebase users have correct claims, UI/API gates match role, a TECHNICIAN cannot access campaigns, mobile assigned-job cache is scoped, and owner/admin can perform allowed actions.

## Related Files

- `docs/internal/M13_MULTI_USER_ACCESS_DESIGN.md`
- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- `apps/server/src/platform/accessContext.ts`
- `apps/server/src/platform/accessManagement.ts`
- `apps/server/src/platform/routes.ts`
- `apps/server/src/platform/repository.ts`
- `packages/core/src/schemas.ts`
- `receipts/wave3/access-context-calendar-overlay-20260708.md`
