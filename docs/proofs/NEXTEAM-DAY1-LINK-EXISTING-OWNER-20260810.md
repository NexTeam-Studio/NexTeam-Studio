# NexTeam Day 1 — link existing internal Owner proof

Job: `NEXTEAM-DAY1-LINK-EXISTING-OWNER-20260810`  
Worktree: `target-architecture-integration`

## Result

The existing staging Firebase Authentication identity for the authorized address
was linked to exactly one active, durable NexCommand `platformUsers` profile.
The profile is Chris Sears / Owner / internal and has no tenant membership or
tenant claims. No Firebase identity was created, and no email, password reset,
or action link was generated or sent. Production was not targeted.

## Sanitized staging readback

```text
{"environment":"staging","firebaseEmailMatches":true,"firebaseActive":true,"activeInternalProfileCount":1,"platformProfileEmailMatches":true,"platformProfileNameMatches":true,"platformRole":"Owner","accountClass":"internal","platformStatus":"ACTIVE","tenantMembershipAbsent":true,"tenantClaimsAbsent":true,"actionMaterialReturned":false,"emailOrResetSent":false,"productionChanged":false}
```

The readback intentionally reports only non-secret metadata. It contains no
Firebase UID, password, token, reset/action link, credential, or email body.

## Implementation and regression coverage

- `scripts/run-staging-internal-nexcommand-owner-onboarding.mjs` now requires
  explicit staging, authorized email/name/role, and job confirmation inputs.
  It resolves the existing Firebase user by email, refuses a missing or
  disabled identity, and never invokes user creation, password reset, or email
  APIs.
- The runner repairs the linked profile to `Owner`, `ACTIVE`, and
  `accountClass: internal`; it disables any duplicate linked profile so exactly
  one remains active. It refuses identities with durable tenant membership and
  clears stale tenant claims only when that membership is absent.
- `apps/server/src/platform/team.ts` records platform account class as the
  internal-only platform profile contract.
- `scripts/run-staging-internal-nexcommand-owner-onboarding.test.mjs` prevents
  the bootstrap runner from regressing to hardcoded/implicit input, identity
  creation, password-reset generation, or email dispatch.

## Commands and results

Raw command output and exact exit codes are retained in
`receipts/verification/NEXTEAM-DAY1-LINK-EXISTING-OWNER-20260810-VERIFY-2.raw.txt`.

```text
railway run --service NexTeam-Studio --environment staging -- node scripts/run-staging-internal-nexcommand-owner-onboarding.mjs --environment staging --authorized-email [authorized address] --first-name Chris --last-name Sears --role Owner --confirm-job NEXTEAM-DAY1-LINK-EXISTING-OWNER-20260810
EXIT_CODE=0

railway run --service NexTeam-Studio --environment staging -- node scripts/verify-staging-internal-nexcommand-owner-onboarding.mjs
EXIT_CODE=0

node --import ./tests/setup.mjs --import tsx --test apps/server/test/platform-team.test.mjs apps/server/test/platform-role-capabilities.test.mjs apps/server/test/nexcommand-session-security.test.mjs scripts/run-staging-internal-nexcommand-owner-onboarding.test.mjs
TYPECHECK=PASS
WORKTREE_SCOPE=PASS
WORKTREE_COVERAGE=PASS (536/536)
SECRETS=PASS
```

## Staging release status

The staging deployment upload was accepted by Railway as deployment
`a29f7e5c-6b32-4537-8d80-105ec941059a`. The local upload request timed out
after submission; Railway subsequently reported the deployment as
`INITIALIZING` with no associated build. This package therefore records the
durable Firebase/Auth repair as verified, but does not represent the staging
application-code rollout as successful until Railway reaches a terminal
successful state. No production deployment was requested or performed.
