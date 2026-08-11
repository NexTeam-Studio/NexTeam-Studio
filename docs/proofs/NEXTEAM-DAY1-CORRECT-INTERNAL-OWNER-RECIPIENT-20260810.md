# NexTeam Day 1 — Correct internal Owner recipient proof

Job: `NEXTEAM-DAY1-CORRECT-INTERNAL-OWNER-RECIPIENT-20260810`  
Source: authorized Global Control bridge packet `msg-bc881155-00a5-44bd-9ca9-1ba0044f665e`

## Scope and containment

- Target: Railway service `NexTeam-Studio`, environment `staging` only.
- Production/main was not queried, modified, deployed, or sent mail.
- The staging owner-invitation provider sender is locked to `nexteamstudioai@gmail.com`.
- The prior recipient identity `nexteamai@gmail.com` was treated as blocked and was never selected as a mail recipient.
- No password, secret, token, reset/action link, or email body was printed, saved, or returned.

## Non-mutating staging preflight

The existing staging credential-vault wrapper was available and used only to run a read-only preflight with Railway staging variables. It checked the durable NexCommand `platformUsers` Owner record, the existing tenant Owner-invitation records, Firebase Authentication presence for the two explicitly authorized identities, and the configured staging mail-rail state.

| Check | Result |
| --- | --- |
| Staging rail selected | Passed |
| Active NexCommand Owner profile matching either supplied identity | 0 |
| Active owner-invitation profile matching either supplied identity | 0 |
| Prior Firebase account present | No |
| Corrected Firebase account present | No |
| Account/profile mutation | Not performed |
| Onboarding email send | Not performed |
| Provider acceptance | Not applicable — no authorized recipient account/profile exists |
| Production change | None |

## Result

The requested recipient correction cannot be applied safely because there is no
existing staging internal Owner account/profile to verify or update. Creating a
new account/profile, generating a setup link, or sending to an identity with no
linked Owner record would exceed the authorized “verify or update only” scope.

No tenant account, invitation, provider record, or production system was
modified. No secret-bearing material was exposed.

## Authoritative implementation

- `apps/server/src/platform/tenantOwnerInvite.ts` sends only to the linked
  Owner profile email supplied by the protected resend route; it never derives
  a recipient from the configured sender identity.
- `apps/server/src/comms/gmailRegistry.ts` is the non-secret source of truth
  that locks the staging sender to `nexteamstudioai@gmail.com` and requires
  the `gmail.send` scope.
- `apps/server/src/platform/routes.ts` protects owner-invitation resend,
  persists one delivery-metadata-only invitation record, and appends an
  immutable audit event. Reset links are deliberately neither persisted nor
  logged.

## Raw required-check transcript — 2026-08-10

```text
=== FOCUSED_RECIPIENT_PROVIDER_TESTS ===
Command: node --import ./tests/setup.mjs --import tsx --test apps/server/test/tenant-owner-invite-handoff.test.mjs apps/server/test/platform.test.mjs apps/server/src/comms/gmailRegistry.test.mjs scripts/security/authorize-staging-owner-invitation-gmail.test.mjs

✔ Nexi sender accepts existing Google OAuth environment names (0.911ms)
✔ staging owner invitation identity is non-secret, locked, and reports verified metadata (0.6972ms)
✔ platform entitlement registry removes tools outside the tenant plan (7.7717ms)
✔ suite tenant keeps scheduling and marketing tools (0.1866ms)
✔ firestore platform repository falls back when legacy Aquatrace tenant docs are partial (1.4846ms)
✔ platform repository summarizes cost, records backup, and exports per tenant (2.1565ms)
✔ platform repository stores tenant branding with text fallback and actor attribution (0.3912ms)
✔ tenant users are provisioned explicitly and produce Firebase custom claims (3.2645ms)
✔ job access links verify only one linked job and fail closed after revoke (1.4093ms)
✔ owner-invite resend uses the protected send path, writes one invite record, and records an immutable audit (54.9725ms)
✔ platform billing refuses live Stripe keys and supports fake test-mode receipt runs (0.5757ms)
✔ platform routes expose tenants, test subscription, backup, and export (41.0623ms)
✔ tenant Stripe Connect onboarding persists one account and protects refresh and return callbacks (9.824ms)
Tenancy check failed:
- tests/fixtures/tenancy/unscoped-query.fixture.ts: Firestore collection "jobs" lacks tenantId evidence
✔ platform routes manage tenant users and job links without leaking token hashes by default (10.3397ms)
✔ tenancy scanner catches the planted unscoped query fixture (41.4605ms)
✔ runtime defaults to durable persistence and refuses an empty customer tenant runtime (1.2946ms)
✔ tenant subscription lifecycle archives without loss, restores the same tenant and owner, and remains tenant-isolated (1.5425ms)
✔ platform prospect intake excludes sensitive pre-subscription fields (0.3486ms)
✔ platform Blueprint revisions are append-only snapshots (0.7947ms)
✔ onboarding-plan insights and revision acceptance require a platform operator (7.9046ms)
✔ platform-admin routes fail closed when Firebase auth is required but unavailable (3.4274ms)
✔ live build status is read-only, operator-guarded, and IDLE without a controller heartbeat (3.7935ms)
✔ tenant blockers persist by tenant and platform support escalation denies non-operators (8.8076ms)
✔ tenant migration records persist status and require an operator plus a safe deferral reason (9.223ms)
✔ Phase M runs isolated onboarding from prospect through activation and persisted operator follow-up (13.7224ms)
✔ owner invite continuation targets the branded NexOps sign-in handoff (0.6135ms)
✔ staging owner invitation uses only the approved sender and gmail.send (1.4686ms)
✔ staging owner invitation rejects a mismatched sender without legacy fallback (1.595ms)
✔ staging owner invitation preflight returns only safe metadata (0.3882ms)
✔ staging mailbox verification refreshes the dedicated sender credential without emitting credentials (0.7225ms)
ℹ tests 30
ℹ suites 0
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1330.8945
EXIT_CODE=0

=== TYPECHECK ===
Command: npm run typecheck

> typecheck
> tsc -b

EXIT_CODE=0

=== WORKTREE_SCOPE ===
Command: npm run check:worktree-scope

> check:worktree-scope
> node scripts/check-worktree-scope.mjs

Worktree scope check passed: nexteam-integration is the integration lane.
EXIT_CODE=0

=== WORKTREE_COVERAGE ===
Command: npm run check:worktree-coverage

> check:worktree-coverage
> node scripts/check-worktree-coverage.mjs

Worktree coverage check passed: 536/536 implementation files have exactly one owner.
Known migration debt: 0 legacy CRM file(s) under apps/server/src/crm/.
EXIT_CODE=0

=== SECRETS ===
Command: npm run check:secrets

> check:secrets
> node scripts/check-secrets.mjs

Secret scan passed (1812 tracked non-doc files checked).
EXIT_CODE=0
```

The intentional `Tenancy check failed` line above is the output from the
planted negative fixture; the immediately following passing assertion verifies
that the scanner fails closed. The test process itself completed with
`EXIT_CODE=0`.

## Required Chris-only next step

Create or identify the intended staging internal NexCommand Owner profile for
`nexteamstudioai@gmail.com`; once it exists and is linked to the authorized
staging onboarding rail, open the resulting email and create the password.
