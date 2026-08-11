# NEXTEAM-DAY1-NEXCOMMAND-FRESH-AUTH-UX-REPAIR-20260810 verification 3

Job ID: `NEXTEAM-DAY1-NEXCOMMAND-FRESH-AUTH-UX-REPAIR-20260810-VERIFY-3`  
Worktree: `target-architecture-integration`

## Authoritative implementation

The fresh-auth UX repair is implemented and committed in `c6196b6` (`Fix
NexCommand fresh auth re-entry`):

- `apps/web/src/shared/auth/nexCommandFreshAuth.ts` requires a fresh NexCommand
  authentication when a persisted Firebase user has neither the browser-session
  NexCommand credential nor a just-completed fresh-auth marker.
- `apps/web/src/shared/auth/AuthGate.tsx` keeps the sign-in UI available in that
  state instead of rendering the protected children.
- `apps/web/src/shared/router/AppRouter.tsx` does not display profile denial
  until the server session endpoint has actually been attempted.

The verification run initially found three unused private helpers in
`apps/server/src/auth/accessContext.ts`; they were removed without altering any
authorization flow and committed in `9a9ae3e` (`Fix verification lint gate`).

## Required gates

Raw command outcome:

```text
$ npm run verify
Exit code: 0

lint: PASS
typecheck: PASS
test: PASS
check:tenancy: PASS
check:admin-tenant-writes: PASS
check:indexes: PASS
check:collisions: PASS
check:worktree-scope: PASS
check:worktree-coverage: PASS
check:secrets: PASS
check:secret-history: PASS
check:provider-imports: PASS
check:blueprints: PASS
```

Focused raw command output:

```text
$ node --import ./tests/setup.mjs --import tsx --test apps/web/src/shared/auth/nexCommandFreshAuth.test.mjs apps/web/src/shared/auth/AuthGate.test.mjs apps/web/src/shared/router/AppRouter.test.mjs apps/server/test/nexcommand-session-security.test.mjs
✔ NexCommand sessions expire, cannot reopen without fresh authentication, sign out, and retain immutable redacted audit history
✔ both branded sign-in screens provide a password visibility control
✔ NexCommand uses the platform-admin sign-in framing instead of the Nexi sign-in screen
✔ password-reset handoffs return to the matching branded product route
✔ owner invite handoff confirms the password reset on the branded sign-in page
✔ a persisted Firebase user without fresh NexCommand state is sent to NexCommand sign-in
✔ a fresh NexCommand sign-in or short-lived session may continue to session establishment
✔ NexCommand only presents profile denial after the server session endpoint is attempted
ℹ tests 8
ℹ pass 8
ℹ fail 0
FOCUSED_TEST_EXIT_CODE=0

$ git status --porcelain
(no output)
GIT_STATUS_EXIT_CODE=0
```

No browser automation, deployment, push, merge, production-rule change,
customer-data change, or external service action was performed.

`REQUIRED_GATES_GREEN: YES`
