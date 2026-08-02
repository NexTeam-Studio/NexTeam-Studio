# NexOps Clients

Last updated: 2026-07-12
Build piece: Request foundation follow-up client gates

## Statuses

## Imported history

- A client imported from an earlier system remains a real tenant record and may be used when new NexTeam work is created.
- Imported history is marked with the source-neutral field `customFields.recordClassification = "imported_history"`.
- The client roster shows an **Imported history** label so office staff can distinguish historical records from records created directly in NexTeam.
- The label is descriptive only. It does not block editing the client or creating a new request, quote, job, visit, invoice, or payment for that client.
- Import provenance belongs in tenant data or a controlled migration receipt, never in reusable product code or customer-facing copy.

### `active`
- The client exists as a saved native NexOps client record.
- Current local UI lists only saved clients in the active client roster.

### `pending_approval`
- This is not a saved client row yet.
- It exists as an ApprovalQueue draft for a chat-authored create-client action that has passed validation and is waiting on explicit owner approval.

### `rejected`
- The create-client draft was declined in ApprovalQueue and never became a saved client.

### `executed`
- The chat-authored create-client draft was explicitly approved and then executed into a saved native client record.

## Transitions

### `draft_validation -> pending_approval`
- Triggered by Nexi `createClient` after the draft includes:
  - name
  - address
  - telephone
- Email is optional and does not block the draft from reaching approval.

### `pending_approval -> rejected`
- Triggered by explicit chat rejection through `rejectPendingApproval`.
- The underlying ApprovalQueue item remains in audit history.

### `pending_approval -> executed`
- Triggered by explicit chat approval through `approvePendingApproval`.
- The ApprovalQueue item records both the decision and the execution actor/timestamps before the native client write is committed.

### `office_draft -> active`
- Triggered by the NexOps office-side new-client form submit.
- The Save action is unavailable until name, address, and telephone are present.

## Triggers

### Nexi chat create path
- `createClient`
- Current behavior:
  - missing required fields do not queue approval
  - Nexi asks for the missing required field directly
  - once complete, Nexi reads the client back in chat and asks:
    - `Approve this? yes / no / make changes.`

### Nexi chat approval path
- `approvePendingApproval`
- `rejectPendingApproval`
- `revisePendingClientCreateApproval`
- Dedicated approval pages still exist as a secondary surface, but the primary day-to-day approval interaction is now chat-native for queued writes.

### Office create path
- NexOps `New client` drawer in `/nexops/clients`
- Current hard gate:
  - Save disabled until name, address, and telephone exist
- Current soft nudge:
  - email is recommended for downstream quote/invoice/follow-up delivery, but optional

### Unsupported saved-write actions from chat
- Delete/edit saved clients is not built yet.
- Delete saved requests is not built yet.
- Delete saved work or billing records is not built yet.
- These reply as capability gaps, not missing-data gaps.

## Cascades

### Explicit approval audit trail
- Every approved chat-native client write keeps the ApprovalQueue artifact.
- Audit fields now include:
  - `decidedAt`
  - `decidedBy`
  - `executedAt`
  - `executedBy`

### Save prevention before approval
- Incomplete client drafts never become savable or approvable.
- Required-field blocking applies to:
  - Nexi chat create flow
  - office UI create flow

### Read-back before execution
- Nexi formats the queued client clearly in chat before execution.
- A plain `yes` executes the write.
- A `no` or change request keeps the gate active instead of auto-creating the client.

## Current deliberate limits

- Saved client delete/edit from chat is still not built.
- Email stays optional at create time even though the UI nudges for it.
- Multi-user role/permission editing remains a separate later scope from client creation.
