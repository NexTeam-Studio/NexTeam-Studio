DOCUMENT_ID: CODEMAP-NEXCOMMAND-FOUNDATION-PHASE-C-20260810
STATUS: GREEN_LOCAL_VALIDATED
PRODUCT_AREA: NexCommand Team

# NexCommand Foundation Phase C

Phase C adds a platform-owned personnel profile foundation in `apps/server/src/platform/team.ts`, `repository.ts`, and `routes.ts`, with a small Team surface in `apps/web/src/features/platformOverview/routes/NexCommandRoute.tsx`.

The implementation preserves the authoritative tenant user model: `tenantUsers` and its tenant roles/capabilities are untouched. Platform profiles contain no tenant ID. Sensitive telephone, address, and email values are omitted from lists and from reads by a non-managing viewer. The profile-add API records metadata for an existing `authUid`; it does not create Firebase users, invitations, or messages.

Focused proof: `apps/server/test/platform-team.test.mjs` proves tenant denial, persistence/reload, profile redaction, disable denial for a view-only operator, disable/reactivate persistence, and immutable audit ordering. `npm run typecheck`, `npm run lint`, `npm run check:worktree-scope`, `npm run check:worktree-coverage`, `npm run check:secrets`, and `npm run build` passed locally. No browser, production, tenant/customer data, or external send was used.
