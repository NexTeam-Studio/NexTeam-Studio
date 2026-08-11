# NEXTEAM-DAY1-FULL-AUTH-REPAIR-20260810 proof package

Scope: staging-only authorization repair. Production was not targeted.

## Implemented

- Tenant API authorization now verifies the Firebase credential and then resolves the matching active `tenantUsers` membership from Firestore on every protected request. Firebase custom claims are not trusted for tenant, role, user id, or capabilities.
- Missing, inactive, foreign, and duplicate tenant memberships fail closed with HTTP 403. This prevents a stale token or an edited URL from crossing tenants.
- NexCommand remains session-only after Firebase authentication. Its existing durable active internal-profile check, capability resolution, explicit logout, immutable security audit, and 15-minute idle timeout remain the authority.
- `/nexcommand` has a dedicated sign-in product identity and does not offer a NexOps/Nexi product switch. A user denied a NexCommand session remains on an explicit denial screen; no tenant fallback or redirect loop is used.
- Password reset handoffs now return to the sign-in route for the product that initiated them: `/nexops/sign-in`, `/nexi/sign-in`, or `/nexcommand/sign-in`. The Firebase action link itself is never stored or logged.

## Verification

Run on 2026-08-10 in the integration worktree:

| Check | Result |
| --- | --- |
| TypeScript build | Passed |
| Focused auth tests | 7 passed |
| Tenant isolation static check | Passed (485 files) |
| Worktree scope and coverage | Passed (536/536 owned) |
| Secret scan | Passed (1,812 tracked non-doc files) |
| Production action | Not attempted |

Focused tests cover storage-authoritative role resolution; inactive, foreign, and duplicate membership denial; NexCommand tenant-owner denial, logout invalidation, browser-reopen denial, and 15-minute expiration; and branded reset routing.

## Staging / user-proof status

The approved staging deployment wrapper stopped before invoking Railway because its local DPAPI token vault was unavailable (`%APPDATA%\\NexTeam-Studio\\secrets\\railway-staging.dpapi`). No direct CLI bypass was used. Therefore this package does not claim a staging deployment, a live verification, creation/verification of `nexteamai@gmail.com`, or delivery of an internal onboarding email. Those actions require the existing staging credential vault and the active internal-user onboarding rail; no password, reset link, token, or secret was requested or recorded.

Commit: `7b4a683` (`Enforce authoritative tenant auth resolution`).
