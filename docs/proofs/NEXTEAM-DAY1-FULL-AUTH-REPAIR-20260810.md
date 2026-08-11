# NEXTEAM-DAY1-FULL-AUTH-REPAIR-20260810 proof package

Scope: staging-only authorization repair. Production was not targeted.

## Implemented

- Tenant API authorization now verifies the Firebase credential and then resolves the matching active `tenantUsers` membership from Firestore on every protected request. Firebase custom claims are not trusted for tenant, role, user id, or capabilities.
- Missing, inactive, foreign, and duplicate tenant memberships fail closed with HTTP 403. This prevents a stale token or an edited URL from crossing tenants.
- NexCommand remains session-only after Firebase authentication. Its existing durable active internal-profile check, capability resolution, explicit logout, immutable security audit, and 15-minute idle timeout remain the authority.
- `/nexcommand` has a dedicated sign-in product identity and does not offer a NexOps/Nexi product switch. A user denied a NexCommand session remains on an explicit denial screen; no tenant fallback or redirect loop is used.
- Password reset handoffs now return to the sign-in route for the product that initiated them: `/nexops/sign-in`, `/nexi/sign-in`, or `/nexcommand/sign-in`. The Firebase action link itself is never stored or logged.

## Verification

Re-verified on 2026-08-10 in the integration worktree. The authoritative repair
implementation remains commit `7b4a683`, principally
`apps/server/src/auth/accessContext.ts`; the focused proof is in
`apps/server/test/authoritative-tenant-membership.test.mjs`,
`apps/server/test/nexcommand-session-security.test.mjs`,
`apps/server/test/nexcommand-spa-route.test.mjs`, and
`apps/web/src/shared/auth/AuthGate.test.mjs`.

| Check | Result |
| --- | --- |
| TypeScript build | Passed |
| Focused auth tests | 9 passed |
| Tenant isolation static check | Passed (485 files) |
| Worktree scope and coverage | Passed (536/536 owned) |
| Secret scan | Passed (1,812 tracked non-doc files) |
| Production action | Not attempted |

Focused tests cover storage-authoritative role resolution; inactive, foreign, and duplicate membership denial; NexCommand tenant-owner denial, logout invalidation, browser-reopen denial, and 15-minute expiration; and branded reset routing.

## Raw verification transcript — 2026-08-10

```text
=== TYPECHECK ===

> typecheck
> tsc -b

EXIT_CODE=0
=== FOCUSED_AUTH ===
✔ tenant authorization resolves role and active membership from storage, not Firebase claims (1.6922ms)
✔ tenant authorization denies inactive, foreign, and duplicate memberships (1.0568ms)
✔ NexCommand sessions expire, cannot reopen without fresh authentication, sign out, and retain immutable redacted audit history (58.2726ms)
✔ the server sends NexCommand deep links to the web application (0.7299ms)
✔ the server sends the owner invitation handoff to the branded NexOps sign-in page (0.1454ms)
✔ both branded sign-in screens provide a password visibility control (0.8731ms)
✔ NexCommand uses the platform-admin sign-in framing instead of the Nexi sign-in screen (0.1442ms)
✔ password-reset handoffs return to the matching branded product route (0.1206ms)
✔ owner invite handoff confirms the password reset on the branded sign-in page (0.1042ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1133.4896
EXIT_CODE=0
=== TENANCY ===

> check:tenancy
> node scripts/check-tenancy.mjs

Tenancy check passed (485 files checked).
EXIT_CODE=0
=== WORKTREE_SCOPE ===

> check:worktree-scope
> node scripts/check-worktree-scope.mjs

Worktree scope check passed: nexteam-integration is the integration lane.
EXIT_CODE=0
=== WORKTREE_COVERAGE ===

> check:worktree-coverage
> node scripts/check-worktree-coverage.mjs

Worktree coverage check passed: 536/536 implementation files have exactly one owner.
Known migration debt: 0 legacy CRM file(s) under apps/server/src/crm/.
EXIT_CODE=0
=== SECRETS ===

> check:secrets
> node scripts/check-secrets.mjs

Secret scan passed (1812 tracked non-doc files checked).
EXIT_CODE=0
```

## Staging / user-proof status

The approved staging deployment wrapper stopped before invoking Railway because its local DPAPI token vault was unavailable (`%APPDATA%\\NexTeam-Studio\\secrets\\railway-staging.dpapi`). No direct CLI bypass was used. Therefore this package does not claim a staging deployment, a live verification, creation/verification of `nexteamai@gmail.com`, or delivery of an internal onboarding email. Those actions require the existing staging credential vault and the active internal-user onboarding rail; no password, reset link, token, or secret was requested or recorded.

Commit: `7b4a683` (`Enforce authoritative tenant auth resolution`).
