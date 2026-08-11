# NEXTEAM-DAY1-RELIABILITY-HARDENING-20260811 verification 2

Job ID: `NEXTEAM-DAY1-RELIABILITY-HARDENING-20260811-VERIFY-2`  
Worktree: `target-architecture-integration`

## Authoritative implementation

The reliability capability is implemented in commit `f508353`
(`Fix NexCommand dashboard session routing`):

- `apps/web/src/shared/auth/authBootstrap.ts` routes every internal
  `/api/platform/` request, except session establishment, through the
  short-lived NexCommand session token rather than a persisted Firebase browser
  token.
- `apps/server/src/platform/repository.ts` returns only persisted tenant roots
  and normalizes legacy persisted tenant documents without fabricating a default
  dashboard tenant.
- `apps/server/test/nexcommand-session-security.test.mjs`,
  `apps/server/test/platform.test.mjs`, and
  `apps/web/src/shared/router/AppRouter.test.mjs` cover the session route,
  persistence, and browser request-bridge regressions.

## Raw required-check output

```text
$ npm run verify
No-browser test guard passed (121 default test files checked).
Worktree scope check passed: nexteam-integration is the integration lane.
Worktree coverage check passed: 537/537 implementation files have exactly one owner.
Known migration debt: 0 legacy CRM file(s) under apps/server/src/crm/.
Secret scan passed (1820 tracked non-doc files checked).
Secret history scan passed (876 reachable commits, 13748 reachable objects checked).
Provider boundary check passed (620 files checked).
Blueprint naming check passed (486 files checked).
VERIFY_EXIT_CODE=0

$ npm run build
vite v5.4.11 building for production...
✓ 191 modules transformed.
✓ built in 1.62s
BUILD_EXIT_CODE=0

$ node --import ./tests/setup.mjs --import tsx --test apps/server/test/nexcommand-session-security.test.mjs apps/server/test/platform.test.mjs apps/web/src/shared/auth/nexCommandFreshAuth.test.mjs apps/web/src/shared/auth/AuthGate.test.mjs apps/web/src/shared/router/AppRouter.test.mjs
ℹ tests 33
ℹ pass 33
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
NEXCOMMAND_FOCUSED_TEST_EXIT_CODE=0
```

The full unmodified command transcripts were captured by the verification run;
the repository verification gate includes lint, TypeScript, the default
non-browser suite, tenancy and authorization checks, indexes, collisions,
worktree scope/coverage, current/history secret scans, provider boundaries,
and blueprint identifiers.

No browser automation, deployment, push, merge, Firebase production-rule
change, Railway action, billing action, or customer-data access was performed.

`REQUIRED_GATES_GREEN: YES`
