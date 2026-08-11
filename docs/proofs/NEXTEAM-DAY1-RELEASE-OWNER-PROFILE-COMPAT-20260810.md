# NexTeam Day 1 — release Owner profile compatibility proof

Job: `NEXTEAM-DAY1-RELEASE-OWNER-PROFILE-COMPAT-20260810`  
Worktree: `target-architecture-integration`

## Result

The staging-only readback is now a fail-closed compatibility gate. It requires
the existing Firebase identity to be active and match exactly one active
internal NexCommand Owner profile, including Firebase UID, email, name, role,
account class, and account status. It also requires no tenant membership or
tenant claims, and confirms that no action material, email/reset action, or
production change was made.

The authoritative persisted profile contract is
`apps/server/src/platform/team.ts`; the platform-only boundary is recorded in
`docs/knowledge/contracts/2026-08-10-nexcommand-platform-team.md`.

## Verification

`scripts/verify-staging-internal-nexcommand-owner-onboarding.mjs` writes a
sanitized result and exits nonzero if any compatibility condition fails. The
staging readback and local regression suite passed. The verifier is read-only:
it creates no Firebase identity, sends no email, and changes neither a Railway
configuration nor production.

Raw command output and exact exit codes are recorded in
`receipts/verification/NEXTEAM-DAY1-RELEASE-OWNER-PROFILE-COMPAT-20260810-VERIFY-2.raw.txt`.
