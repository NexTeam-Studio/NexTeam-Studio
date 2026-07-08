# AccessContext + Jobber Calendar Overlay Receipt

Captured: 2026-07-08

## Current Staging Proof

- Staging URL: https://nexteam-studio-staging.up.railway.app
- Deployed code SHA: `4af13ec7bcfca519d3f2728f13643e6948c6e866`
- `/api/version`: matched `4af13ec7bcfca519d3f2728f13643e6948c6e866`
- `/api/health`: green for Jobber, CompanyCam, Anthropic
- Live regression wall after deploy: `174/174`
- Wall receipt: `receipts/m1/nexi-regression-wall-live-20260708-integrated.json`

## AccessContext Retrofit

Before:

- M6 campaigns accepted tenant identity directly from request body/query and could queue approval artifacts without a real actor.
- M8 site admin actions used request-provided tenant IDs for generate/model/leads admin operations.
- M11 offline mobile cache keyed by tenant only and did not enforce assigned technician access before local writes.
- Web operator paths hardcoded Aquatrace in chat, TTS, and schedule calls.

After:

- Added `apps/server/src/auth/accessContext.ts` with `tenantId`, `tenantUserId`, `role`, and `accessKind`.
- M6 campaign admin routes now require `OWNER` or `OFFICE_ADMIN`; `TECHNICIAN` and `job_link` contexts are blocked.
- M6 Nexi campaign tools are added per request only after `AccessContext` passes role gates.
- Campaign approvals now record a real actor ID in `execute.args.actorId` instead of relying on `nexi` or `system`.
- M8 site admin generate/model/leads routes now require `OWNER` or `OFFICE_ADMIN`.
- M11 mobile offline cache preloads only assigned jobs and blocks checklist/photo/close-out writes for unassigned jobs.
- Web chat/TTS/schedule calls use the signed-in operator's tenant claims with Aquatrace OWNER fallback for current staging.

Verification:

- `npm run verify`: passed on the reconciled branch.
- Local integrated tests: `138/138`.
- AccessContext unit coverage includes campaign technician and job-link negative tests plus mobile unassigned-job write rejection.

## Remaining Raw TenantId Surfaces

- `apps/server/src/server.ts`: `loadTenant` still accepts the chat request `tenantId` before loading tenant config. Nexi auth still checks the Firebase operator, but this should be moved behind `AccessContext` next.
- `apps/server/src/server.ts`: `/api/approval-queue` lists by query `tenantId`; needs owner/admin AccessContext gating before broader multi-user rollout.
- `apps/server/src/sites/routes.ts`: public site render and lead-submit routes intentionally use request/body tenant/slug because they are public tenant entrypoints, not operator admin surfaces.
- Repository/schema files still accept `tenantId` as storage keys by design; these are not request auth boundaries.
- `apps/mobile/src/offline/*`: local storage methods still take `tenantId` for cache partitioning; native login/custom claims are pending, but assigned-job actor gates are now enforced for write paths.

## M3 Jobber Calendar Overlay

Live API proof:

```json
{
  "path": "/api/scheduling/calendar?tenantId=aquatrace&from=2026-07-08T00%3A00%3A00.000Z&to=2026-07-09T00%3A00%3A00.000Z",
  "ok": true,
  "sourceCounts": {
    "native": 0,
    "jobber": 1
  },
  "visit": {
    "title": "Swimming Pool Leak Detection Service",
    "location": "290 River Oaks Drive, Hartwell, Georgia",
    "source": "jobber",
    "readOnly": true,
    "status": "scheduled"
  }
}
```

Screenshot status:

- Blocked for current UI screenshot only: the operator UI requires an authenticated Aquatrace OWNER browser session.
- Local worktree has no Firebase admin credential or operator password available to mint/sign in the browser without exposing a token.
- The live API overlay is proven; the actual board screenshot should be captured once an approved non-secret browser-auth path is available.
