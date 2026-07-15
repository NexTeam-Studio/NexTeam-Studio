# Aquatrace M7 Reputation GBP Lane

Last updated: 2026-07-10 by build/nightly-integration-20260709

## Scope

This lane owns Aquatrace's Google Business Profile and NexReach reputation work: review polling, review reply drafts, review-request drafts, GBP profile sync drafts, and the M7 Reviews panel.

## Always Read First

- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md` for NexReach naming, review follow-up dependency, ApprovalQueue boundary, and lifecycle context.
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md` when review requests depend on NexCam closeouts, reports, or job photos.

## Allowed Touches

- `apps/server/src/reputation/`
- `apps/server/test/reputation.test.mjs`
- `apps/web/src/main.tsx` and `apps/web/src/styles.css` only for reputation panel display
- `packages/nexi/src/gateway.ts` only for reputation-related routing
- `receipts/m7/`
- `ACCOUNTS.md`, `BUILDSTATE.md`, `DECISIONS.md`, and this lane file when verified state changes

## Do Not Touch

- No direct GBP publishing without explicit owner approval.
- No live outbound review requests outside ApprovalQueue.
- No WordPress, Meta, or campaign-send execution from this lane.
- No Railway variable value printing; only presence/status booleans may be emitted.

## Current State

M7 is locally implemented to the ApprovalQueue boundary, but the live GBP receipt is blocked until Aquatrace GBP OAuth credentials and location identifiers are confirmed. Staging currently has no GBP variable names configured for `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`, or the legacy `GBP_GOOGLE_*`/`GBP_TOKEN_VAULT_KEY` names.

The older canonical handoff records a legacy GBP "Layer 1" rail with OAuth/token/account inventory, but it also explicitly says GBP posting is not built. Treat that as historical evidence, not current M7 connectivity.

Production Railway variable inspection is currently blocked because the available vaulted Railway token is staging-scoped and returns unauthorized when pointed at production.

## Receipt Rules

- M7 local receipt: tests prove review import boundary, ApprovalQueue-only replies, review requests, profile sync drafts, and honest blocker behavior.
- M7 live receipt: real Aquatrace GBP OAuth works, reviews poll from GBP, one reply is drafted into ApprovalQueue, approval state is visible, and no publish occurs without explicit approval.
- If OAuth app remains in Testing mode, the refresh token may expire after 7 days for non-basic scopes; do not call a stale token a code failure until OAuth status is checked.

## Related Files

- `apps/server/src/reputation/gbpProvider.ts`
- `apps/server/src/reputation/service.ts`
- `apps/server/src/reputation/nexiTools.ts`
- `apps/server/src/reputation/routes.ts`
- `apps/server/test/reputation.test.mjs`
- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- `docs/internal/NEXTEAM_CANONICAL_HANDOFF.md`
- `ACCOUNTS.md`
- `BUILDSTATE.md`
- `DECISIONS.md`
