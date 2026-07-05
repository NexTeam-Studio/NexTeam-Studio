# Gmail Provider

This directory contains the Gmail adapters for the M6-LITE Email Rail.

`GmailReadOnlyAdapter` supports `searchEmail` and `getEmailThread` only. It intentionally has no `sendEmail` method, so the two existing Aquatrace read mailboxes are structurally send-incapable even if a token were mis-scoped.

`GmailSendAdapter` supports `sendEmail` and is only intended for the third dedicated Nexi mailbox. Server code calls it from the ApprovalQueue executor after a pending email artifact is approved. If the dedicated Nexi mailbox should also be searchable, register the same mailbox with `GmailReadOnlyAdapter` via the server registry; do not add read methods to `GmailSendAdapter`.

The server comms rail is bound to one `tenantId` at construction time. Nexi email tools and the ApprovalQueue executor must reject any tenant context that does not match the rail's bound tenant before touching an adapter.

Railway staging env contract:

- `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET`: shared OAuth client, if reused.
- `TENANT_ID`: tenant that owns the Gmail rail; staging currently binds this rail to `aquatrace`.
- `GMAIL_READONLY_MAILBOX_1_EMAIL`, `_ALIAS`, `_REFRESH_TOKEN`: first existing mailbox, consented with `gmail.readonly`.
- `GMAIL_READONLY_MAILBOX_2_EMAIL`, `_ALIAS`, `_REFRESH_TOKEN`: second existing mailbox, consented with `gmail.readonly`.
- `GMAIL_SEND_MAILBOX_EMAIL`, `_ALIAS`, `_REFRESH_TOKEN`: dedicated Nexi sender mailbox, consented with `gmail.send` and, when read is enabled, `gmail.readonly`.
- `GMAIL_SEND_MAILBOX_READ_ENABLED=true`: also exposes the dedicated Nexi mailbox to read/search tools while keeping sends approval-gated.

Per-mailbox `_CLIENT_ID` and `_CLIENT_SECRET` can override the shared OAuth client if a fresh client is needed.
