# Staging owner-invitation Gmail provider

`apps/server/src/comms/gmailRegistry.ts` is the authoritative non-secret
registry for the staging owner-invitation sender. It is platform infrastructure,
not tenant-scoped data and never contains a credential.

## Registered fields

- Provider: `gmail`
- Sender identity: `nexteamstudioai@gmail.com`
- Environment: `staging`
- Purpose: `owner invitation`
- OAuth project: `NexTeam Gmail Sender`
- OAuth client: `NexTeam Gmail Sender Local`
- Required OAuth scope: `gmail.send`
- Refresh-secret destination: `GMAIL_SEND_MAILBOX_REFRESH_TOKEN`

## Status command and event

`GET /api/platform/admin/providers/gmail/staging-owner-invitation` is limited
to authorized NexCommand operators. It returns only the registered identity,
required scope, client-presence state, quarantine state, and secret
present/missing health. It never returns an OAuth client value, refresh token,
client secret, authorization code, or password.

The command is read-only and creates no durable event. It must report
The provider status reports the approved non-secret OAuth project/client labels,
connection health, and last successful verification timestamp. It never returns
an OAuth client value, refresh token, client secret, authorization code, or
password. Quarantine remains controlled by
`NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED` and no status read changes it.

## Reauthorization boundary

No browser consent, callback handling, token creation, or email delivery is
part of this provider-status contract. The current staging sender is locked.
It may not be replaced, revoked, or silently reauthorized for another account
without an explicitly authorized sender-migration job. Preflight refreshes the
stored staging credential and the send path performs a provider acceptance
check before recording an invitation receipt. Production remains out of scope.
