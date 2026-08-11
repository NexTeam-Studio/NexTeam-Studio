# NexTeam Day 1 — staging internal NexCommand Owner onboarding proof

Job: `NEXTEAM-DAY1-CREATE-INTERNAL-OWNER-ONBOARDING-20260810`  
Worktree: `target-architecture-integration`

## Result

The requested staging-only internal NexCommand account was created for the
authorized address. Its Firebase identity is active and the durable
`platformUsers` profile is an active `Owner`. The profile is platform-owned;
no tenant membership or tenant claim was created.

Exactly one internal password-setup/onboarding email was accepted by the
configured staging Gmail provider. The setup material was generated only for
the provider call and was not persisted, logged, printed, or included here.

## Sanitized evidence

| Check | Result |
| --- | --- |
| Environment selected | staging only |
| Firebase identity email matches authorized recipient | yes |
| Firebase identity active | yes |
| Platform profile email matches authorized recipient | yes |
| NexCommand role / status | Owner / ACTIVE |
| Tenant membership | absent |
| Tenant claims | absent |
| Staging sender credential health | accepted refresh verification, `gmail.send` scope |
| Provider acceptance | Gmail accepted one onboarding dispatch |
| Durable dispatch-start audit count | 1 |
| Durable provider-accepted audit count | 1 |
| Password, reset link, token, secret, or mail body output | none |
| Production change | none |

## Commands used

- Read-only staging mail-rail health verification through the existing owner
  invitation credential wrapper.
- Staging-only one-shot internal Owner provisioning/onboarding operation.
- Independent staging readback of Firebase Auth, `platformUsers`,
  `platformUserAudits`, and `tenantUsers`.

The mail provider accepted the message; inbox delivery and password creation
remain the recipient's next step.

## Authoritative implementation

- `apps/server/src/platform/team.ts` defines the validated active `Owner`
  profile and immutable platform-user audit contract.
- `apps/server/src/platform/repository.ts` durably stores profiles in the
  platform-owned `platformUsers` collection and audits in
  `platformUserAudits`.
- `apps/server/src/platform/routes.ts` refuses NexCommand access without a
  durable active internal profile and does not allow tenant claims to act as
  NexCommand credentials.

## Raw staging readback — 2026-08-10

```text
Command: railway run --service NexTeam-Studio --environment staging -- node scripts/verify-staging-internal-nexcommand-owner-onboarding.mjs
{"environment":"staging","firebaseEmailMatches":true,"firebaseActive":true,"platformProfileEmailMatches":true,"platformRole":"Owner","platformStatus":"ACTIVE","tenantMembershipAbsent":true,"tenantClaimsAbsent":true,"onboardingDispatchStartedCount":1,"onboardingProviderAcceptedCount":1,"actionMaterialReturned":false,"productionChanged":false}
EXIT_CODE=0
```

## Raw local verification gates — 2026-08-10

```text
=== FOCUSED_OWNER_ONBOARDING_TESTS ===
Command: node --import ./tests/setup.mjs --import tsx --test apps/server/test/platform-team.test.mjs apps/server/test/platform-role-capabilities.test.mjs apps/server/test/nexcommand-session-security.test.mjs scripts/security/authorize-staging-owner-invitation-gmail.test.mjs
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1297.7113
EXIT_CODE=0

=== TYPECHECK ===
Command: npm run typecheck
EXIT_CODE=0

=== WORKTREE_SCOPE ===
Command: npm run check:worktree-scope
Worktree scope check passed: nexteam-integration is the integration lane.
EXIT_CODE=0

=== WORKTREE_COVERAGE ===
Command: npm run check:worktree-coverage
Worktree coverage check passed: 536/536 implementation files have exactly one owner.
Known migration debt: 0 legacy CRM file(s) under apps/server/src/crm/.
EXIT_CODE=0

=== SECRETS ===
Command: npm run check:secrets
Secret scan passed (1814 tracked non-doc files checked).
EXIT_CODE=0
```
