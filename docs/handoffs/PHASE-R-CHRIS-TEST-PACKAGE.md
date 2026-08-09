# Phase R — Chris end-user test package

Status: **READY FOR CHRIS END-USER TESTING**

This is a local, isolated, non-production package. It never deploys, reads customer data, uses Firebase Admin persistence, or loads provider credentials. All data is memory-only and disappears when the package stops.

## Start and exact URLs

From the repository root, run:

```powershell
npm run test:chris-package
```

Open the sign-in screen: `http://127.0.0.1:4300/nexops/sign-in`

Health check: `http://127.0.0.1:4301/api/health`

The command deliberately fails if either fixed port is occupied. It does not select a different port, because these URLs are the test contract.

## Local identities

Enter the email only; password is ignored in this local-only package.

| Purpose | Email | Role | Expected display name |
| --- | --- | --- | --- |
| Full workflow / owner controls | `owner@local.dev` | OWNER | Local Owner |
| Office workflow | `office@local.dev` | OFFICE_ADMIN | Local Office |
| Field-permission denial checks | `technician@local.dev` | TECHNICIAN | Local Technician |
| Second technician isolation check | `technician2@local.dev` | TECHNICIAN | Local Technician 2 |

Only these four identities may sign in. They belong only to tenant `local-chris-test`; no personal or customer account is involved.

## Reset instructions

1. Press `Ctrl+C` in the package terminal.
2. Start it again with `npm run test:chris-package`. All package data resets because the server uses an isolated in-memory tenant.
3. If the previous local operator still appears in the browser, use Sign Out. If needed, clear this browser origin's site data for `127.0.0.1:4300`; this removes only the local session token.
4. Confirm the health URL reports `tenantId: "local-chris-test"`, `crmRepositoryDriver: "memory"`, and `isolatedMemoryMode: true` before testing.

## Acceptance checklist

- [ ] The fixed sign-in URL opens and identifies the local test package.
- [ ] Owner can sign in with `owner@local.dev` and sees Local Owner.
- [ ] Office admin can sign in with `office@local.dev` and sees Local Office.
- [ ] Technician can sign in with `technician@local.dev`; an owner/office-only control is denied rather than silently allowed.
- [ ] Refresh after signing in keeps the same local role for this running package.
- [ ] Sign out returns to the local sign-in screen.
- [ ] Restart follows the reset instructions and removes any test records created during the previous run.
- [ ] The health URL confirms the isolated memory runtime before and after the test.

Record each check as pass/fail with the observed screen or error text. Do not enter customer information, connect providers, or attempt delivery, publishing, payments, or production login.

## Proof package

Authoritative implementation:

- `scripts/run-chris-test-package.mjs` — fixed-port launcher; removes known persistence and provider credential variables before spawning both processes.
- `apps/server/src/app/runtimeIdentity.ts` — accepts memory storage only for the explicit `local-`/`test-` isolated runtime.
- `apps/server/src/auth/accessContext.ts` — defines the four local identities and their tenant roles.
- `apps/server/test/phase-r-chris-test-package.test.mjs` — executable package contract.
- `receipts/verification/NEXTEAM-REVISION-PHASE-R-CHRIS-PACKAGE-REPAIR-1.raw.txt` — raw verification output and exit codes for this job.

## Known limitations and handoff boundary

- This package is intentionally volatile: it cannot demonstrate cross-restart persistence, provider delivery, Firebase rules against a live backend, payments, remote/mobile reachability, or production authentication.
- It is loopback-only (`127.0.0.1`) and is not a staging or customer endpoint.
- The local identities are test roles, not Chris or any customer identity.
- The test finishes at **READY FOR CHRIS END-USER TESTING**. Chris's observed checklist results are required before any later acceptance or release decision.
