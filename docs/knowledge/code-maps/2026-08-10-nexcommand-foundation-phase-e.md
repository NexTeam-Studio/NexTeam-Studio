# NexCommand Foundation Phase E — Session Security and Audit Contract

`JOB_ID: NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-E-RECOVERY-20260810`

## Contract

- `POST /api/platform/admin/session` verifies Firebase platform access once and returns an opaque NexCommand bearer token. Failed attempts append a redacted `platform_session.failed_sign_in` audit event.
- All deployed `/api/platform/admin/**` routes require the opaque token. Tokens are hashed at rest in the platform-owned `platformSessions` collection; no raw token is persisted or audited.
- A session is invalidated at exactly 15 minutes idle (`NEXCOMMAND_IDLE_TIMEOUT_MS = 900000`). The next request records `platform_session.idle_expired` and returns 401.
- `POST /api/platform/admin/session/sign-out` invalidates the session and records `platform_session.signed_out`; the browser also signs out Firebase and clears its session-only token.
- The browser keeps the NexCommand token in `sessionStorage`, never `localStorage`. A reopen without it signs out the restored Firebase browser state and requires credentials again.
- `GET /api/platform/admin/audit` is capability-gated. Mutation methods return 405. Audit append uses Firestore `create`, making history append-only.
- Platform profile/permission changes append redacted `platform_user.profile_or_permission_changed` events. Tenant authentication, tenant roles, and tenant capabilities are unchanged.

## Events

`platform_session.created`, `platform_session.failed_sign_in`, `platform_session.signed_out`, `platform_session.idle_expired`, and `platform_user.profile_or_permission_changed`.

## Test contract

`apps/server/test/nexcommand-session-security.test.mjs` covers failed tenant sign-in, close/reopen session absence, explicit sign-out, timeout, immutable audit denial, audit event order, and bearer-token redaction. Existing platform role, team, and tenant-isolation tests remain the regression contract.
