# NexOps Customer Document Packages

Last updated: 2026-07-14  
Build piece: Canonical source foundation (Track 2)

## Statuses

### `draft`
- Assembly has started but the immutable manifest is not final yet.

### `finalized`
- Manifest is locked.
- Only approved report versions, invoice versions, and receipt versions listed in the manifest can send.

### `superseded`
- A newer package version replaced this one.

## Transitions

### closeout paid path -> `draft`
- Triggered by `job.close_and_invoice`.
- Package is created after report approval and payment settlement are satisfied.

### `draft` -> `finalized`
- Triggered when staff completes the review-gated send preparation.
- Recipient, approved report versions, invoice versions, and receipt versions become immutable for that version.

### `finalized` -> sent attempt history
- Delivery attempts append to `delivery_attempt_ids`.
- Failed delivery creates attention work; it does not reopen field work.

## Triggers

### Commands
- `job.close_and_invoice`
- `report.approve_and_send`

### Communication templates
- `customer_document_package`
- `delivery_failure`

## Cascades

### D11 final bundle rule
- OWNER or OFFICE_ADMIN approves the report and controls final outbound delivery.
- Technician-submitted field docs are not customer-final until office approval.

### D14 attachment rule
- Invoice sending is not gated by report approval.
- But only approved documents may attach to any outbound send, including document packages.
