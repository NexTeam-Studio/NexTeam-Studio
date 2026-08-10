# Staging owner-invitation Gmail provider

`apps/server/src/comms/gmailRegistry.ts` is the authoritative non-secret
registry for the staging owner-invitation sender. It is platform infrastructure,
not tenant-scoped data and never contains a credential.

## Registered fields

- Provider: `gmail`
- Sender identity: `nexteamstudioai@gmail.com`
- Environment: `staging`
- Purpose: `owner invitation`
- Required OAuth scope: `gmail.send`
- Refresh-secret destination: `GMAIL_SEND_MAILBOX_REFRESH_TOKEN`

## Status command and event

`GET /api/platform/admin/providers/gmail/staging-owner-invitation` is limited
to authorized NexCommand operators. It returns only the registered identity,
required scope, client-presence state, quarantine state, and secret
present/missing health. It never returns an OAuth client value, refresh token,
client secret, authorization code, or password.

The command is read-only and creates no durable event. It must report
`safeToReauthorize: false` until an authoritative non-secret OAuth
client/project label or identifier proves the configured client is the intended
NexTeam staging sender configuration. Quarantine remains controlled by
`NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED` and no status read changes it.

## Reauthorization boundary

No browser consent, callback handling, token creation, or email delivery is
part of this provider-status contract. Once a later authorized preflight proves
the non-secret OAuth client/project mapping, the human-only procedure is to
select the registered sender, grant `gmail.send` only through that client's
already-registered staging-local callback, and store the resulting refresh
credential only in Railway staging under the registered destination name.
Production remains out of scope; quarantine remains enabled until a separate
authorized send/delivery job.
