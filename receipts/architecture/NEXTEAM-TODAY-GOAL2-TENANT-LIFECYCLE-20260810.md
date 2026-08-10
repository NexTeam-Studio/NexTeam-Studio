# Today Goal 2 — Tenant lifecycle receipt

Job: `NEXTEAM-TODAY-GOAL2-TENANT-LIFECYCLE-20260810`  
Worktree: `target-architecture-integration`  
Scope: persistent tenant subscription lifecycle only; no browser, deployment, production data, email, or payment action.

## Result

- Cancellation requires two distinct, server-validated owner confirmations and archives instead of deleting the tenant.
- Tenant access is denied server-side after archive, while platform-operator administration remains separate.
- Resubscription restores the same tenant and owner linkage but appends a new immutable subscription record/ID.
- Existing tenant users, branding/configuration, usage/data exports, and audits remain tenant-scoped and retained.

## Evidence

- Contract: `docs/contracts/tenant-subscription-lifecycle.md`.
- Focused regression: `apps/server/test/platform.test.mjs`.
- Focused platform test: 22 pass, 0 fail.
- Full non-browser suite: 515 pass, 0 fail, 3 skipped.
- Typecheck, lint, server/web build, tenancy, Firestore indexes, worktree scope/coverage, secret scan, secret-history scan, and diff check passed.
