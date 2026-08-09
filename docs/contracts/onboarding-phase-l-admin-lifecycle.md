# Onboarding Phase L internal lifecycle administration

NexTeam Admin is the only UI that administers internal onboarding lifecycle records. Every request includes the signed-in Firebase token and platform-operator authorization remains enforced on the server.

## Commands

- Staff can create, escalate, resolve, and reopen tenant blockers, and acknowledge or resolve linked support escalations.
- Staff can progress a migration through `PENDING`, `IN_PROGRESS`, `VALIDATION`, and `COMPLETED`; a deferred migration can be resumed. The existing server contract remains the authority for safe deferral details and timestamps.
- Manual Prospect/intake/Blueprint creation uses the existing authorized API rather than an unauthenticated browser write.

## Persistence and boundaries

Each lifecycle action reloads the server-persisted record after its write and presents the returned error without retaining credentials, provider tokens, payment data, or customer exports. Tenant users remain denied by the existing platform-operator route guards.
