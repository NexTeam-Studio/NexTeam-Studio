# Onboarding Phase M isolated end-to-end acceptance

Phase M verifies the supported internal onboarding path with an isolated in-memory repository and fake Firebase owner-activation seam. It does not contact Firebase, providers, customer data, or production systems.

## Verified sequence

1. A platform operator creates a non-sensitive Prospect, records intake, creates a Blueprint, and accepts its immutable draft revision.
2. The operator assigns the required `all-access-test` package and activates a tenant plus passwordless Firebase owner profile. Existing non-tenant Firebase claims are preserved when tenant claims are merged.
3. The operator records a safely deferred migration, resumes it, records a configuration blocker, resolves it, and reloads every durable record.
4. A non-operator is denied before Prospect creation.

## Boundary

This contract uses only supported HTTP routes, an in-memory platform repository, and a fake Firebase seam. It does not provision external systems, set a password, send messages, migrate customer data, or store credentials, exports, tokens, or payment data. Tenant post-subscription task and launch-readiness persistence remain governed by `docs/contracts/secure-post-subscription-onboarding.md` and its server-route coverage.

## Authoritative test

`apps/server/test/platform.test.mjs` — `Phase M runs isolated onboarding from prospect through activation and persisted operator follow-up`.
