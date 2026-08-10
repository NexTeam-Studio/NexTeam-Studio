# Today Goal 1 — staging Gmail preflight receipt

Job: `NEXTEAM-TODAY-GOAL1-STAGING-GMAIL-PREFLIGHT-20260810`
Date: 2026-08-10
Mode: containment-safe staging Gmail preflight

## Determination

**BLOCKED — leave the staging Gmail rail quarantined.** A separate invitation
send/delivery job is not safe to dispatch yet. No email was composed or sent.

## Sanitized proof

- Railway metadata identifies the linked environment as `staging`, service
  `NexTeam-Studio`, with a successful deployment and staging-only service and
  custom domains. No production environment was selected or changed.
- A 2026-08-10 staging variable-name inspection (values never emitted) found a complete
  `GMAIL_SEND_MAILBOX` sender configuration using the shared
  `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` names.
- `NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED` is present and enabled in the
  staging configuration. `createCommsRailFromEnv` consequently exposes no send
  adapter while quarantine is enabled.
- The allowed token-refresh-only health probe made no Gmail API request and did
  not send mail. It returned `unusable`, HTTP `400`, OAuth error kind
  `invalid_grant`.
- The local secret loading location is the gitignored `.env.local`; staging
  runtime configuration is held in Railway staging variables. No last-rotation
  metadata was available through the safe metadata interfaces.
- `redactSecrets` redacts credential-shaped assignments, bearer tokens, known
  credential formats, and sensitive object fields before logger diagnostics.
- The authoritative non-secret record is now
  `STAGING_OWNER_INVITATION_GMAIL_PROVIDER` in
  `apps/server/src/comms/gmailRegistry.ts`: sender `nexteamstudioai@gmail.com`,
  environment `staging`, purpose `owner invitation`, scope `gmail.send`, and
  secret destination `GMAIL_SEND_MAILBOX_REFRESH_TOKEN`. It is platform
  infrastructure, not tenant data.
- The authorized NexCommand read-only provider-status route now displays only
  the sender identity, environment, required scope, OAuth-client presence
  state, quarantine state, and secret present/missing health. It does not
  return a credential, OAuth client identifier, or secret value.
- The OAuth client/project cannot be tied to this new sender using authoritative
  non-secret records. The status therefore reports
  `SAFE_TO_REAUTHORIZE=false`; the account-identity requirement is recorded in
  NexCommand **Credentials & Provider Management**.
- Focused coverage passed: 52 tests, 0 failures (redaction, Gmail registry,
  Gmail containment/approval gating, platform route, and NexCommand status UI).
  `npm run typecheck`, `npm run lint`, `npm run check:provider-imports`,
  `npm run check:worktree-scope`, `npm run check:worktree-coverage`,
  `npm run check:secrets`, and `npm run check:secret-history` passed.

## Safe-to-reauthorize result

**SAFE_TO_REAUTHORIZE=false.** No human OAuth action is applicable yet. The
approved sender identity is known, but the existing OAuth client/project is not
proven by an authoritative non-secret record to be its intended staging sender
configuration. Do not open consent, select an account, or replace a token on
the basis of the current evidence.

## Next safe step

First record an authoritative non-secret label or identifier linking the
existing staging OAuth client/project to the registered sender. Only after a
separate authorized preflight proves that mapping may a human select
`nexteamstudioai@gmail.com`, grant `gmail.send` only through that client's
already-registered staging-local callback, and store the resulting refresh
credential only in Railway staging
`GMAIL_SEND_MAILBOX_REFRESH_TOKEN`. Rerun this non-sending preflight and keep
quarantine enabled until a separately authorized staging invitation
send/delivery verification job is approved.
