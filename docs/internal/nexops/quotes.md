# NexOps Quotes

Last updated: 2026-07-18
Build piece: Quote lifecycle foundation + payment-schedule carry-forward

## Statuses

### `draft`
- Default office-side working state.
- Created by:
  - `POST /api/crm/quotes`
  - `NativeAdapter.draftQuote(...)`
  - request-to-quote conversion when the quote is first materialized from intake
- Editable until the quote is sent, approved, declined, or archived.

### `pending_approval`
- ApprovalQueue-only staging state used by Nexi's chat-native quote creation flow.
- The real quote record is not written yet when Nexi is still reading the draft back in chat.
- Lives in the approval payload as `pendingQuote.status = "pending_approval"` until Chris says yes.

### `sent`
- Client-facing delivery state.
- Reached after:
  - `POST /api/crm/quotes/:id/send`
  - create route delivery mode `email`, `sms`, or `mark_sent`
  - renewal of an expired quote
- A portal token is issued or rotated here.

### `change_requested`
- Client used the quote portal's change-request path before approval.
- Stores per-line comments and a freeform note.
- Still pre-approval; staff can revise and resend.

### `approved`
- Client self-approved through the portal.
- Signature, deposit, and card-on-file requirements are enforced server-side here.
- Fully immutable once reached.

### `approved_internal`
- OWNER or OFFICE_ADMIN manually approved on the client's behalf.
- Used for internal/manual approval where client-side gates may be bypassed.
- Fully immutable once reached.

### `declined`
- Reserved in the data model, but no dedicated decline route is built yet in this piece.

### `expired`
- Derived/maintained when:
  - the quote is in a pre-approval state
  - `expiresAt` is in the past
- Approval is hard-blocked server-side in this state.

### `archived`
- Used for quote versions that should no longer be approvable.
- Also represented inside `versions[]` on the live quote record when a prior version is preserved.

## Transitions

### `draft -> sent`
- Triggered by:
  - `POST /api/crm/quotes/:id/send`
  - create route delivery mode other than `draft`
- Adds a delivery record.
- Creates a fresh portal token hash.

### `draft -> approved_internal`
- Triggered by `POST /api/crm/quotes/:id/manual-approve`.
- Allowed roles:
  - `OWNER`
  - `OFFICE_ADMIN`
- Writes `approvedAt`, `approvedBy`, and `approvedByRole`.

### `sent -> approved`
- Triggered by `POST /api/portal/quotes/:id/approve`.
- Hard-blocked if:
  - quote is expired
  - quote is archived
  - quote is already approved
  - quote is declined
- Enforces:
  - signature when `requireSignature`
  - deposit details when `requireDeposit`
  - card-on-file authorization when `requireCardOnFile`

### `sent -> change_requested`
- Triggered by `POST /api/portal/quotes/:id/change-request`.
- Requires at least one line comment or a note.

### `sent` or `change_requested` -> `expired`
- Triggered by time passing beyond `expiresAt`.
- Enforced through:
  - `syncExpiredQuote(...)`
  - `derivedQuoteStatus(...)`
  - approval checks in the portal and manual approval routes

### `expired -> sent`
- Triggered by `POST /api/crm/quotes/:id/renew`.
- Rotates the client approval token.
- Archives the pre-renewal version into `versions[]`.
- Increments `version`.

### editable pre-approval state -> `draft` with archived prior version
- Triggered by `PATCH /api/crm/quotes/:id`.
- Allowed only when the quote is not approved, archived, declined, or expired.
- Archives the prior version into `versions[]` with reason `edited_before_send`.
- Clears prior approval/sent/signature state and reverts to a new draft.

## Triggers

### Office-side create and edit
- `POST /api/crm/quotes`
- `PATCH /api/crm/quotes/:id`
- Current web surface supports:
  - client selection
  - minimal quote templates
  - catalog lines plus manual custom lines
  - quote-level discount (`$` or `%`)
  - flat tax-rate override
  - approval toggles
  - payment schedule
  - expiry override
  - terms override
  - delivery choice at save time

### Quote templates
- `GET /api/crm/quote-templates`
- `POST /api/crm/quote-templates`
- `PATCH /api/crm/quote-templates/:id`
- Template fields currently built:
  - `name`
  - `description`
  - `titlePrefix`
  - optional `defaultLineItems`
  - `defaultApprovalRules`
  - `defaultPaymentSchedule`
  - `expiryDays`
  - `terms`

### Shared document numbering
- `GET /api/crm/settings`
- `PATCH /api/crm/settings`
- Independent sequences are built for:
  - requests
  - quotes
  - jobs
  - invoices
- Numbering is tenant-configurable for:
  - prefix
  - separator
  - pad width
- Continuation uses the stored `nextValue` and never resets implicitly.

### Client delivery and portal
- `POST /api/crm/quotes/:id/send`
- `GET /portal/quotes/:id`
- `GET /portal/quotes/:id/pdf`
- Delivery modes built now:
  - email
  - sms
  - mark sent
- Local verification for `email` and `sms` used adapter-backed delivery receipts.
- A real third-party live send check is still required before the first real client-facing quote send goes out, so Gmail/Twilio production delivery cannot be treated as field-proven yet.
- Portal surface built now:
  - thin NexPortal-branded pre-approval review view
  - drawn signature default
  - typed signature fallback
  - line-by-line change comments
  - freeform change note
  - token-safe PDF download path
  - post-approval proof view that replaces the approval form with:
    - sent and approved timestamps
    - signature evidence
    - deposit/card-on-file evidence
    - collapsed receipt-review history sourced from ledger records

### Manual office approval
- `POST /api/crm/quotes/:id/manual-approve`
- Internal-only role gate:
  - `OWNER`
  - `OFFICE_ADMIN`
- `TECHNICIAN` is excluded by the server-side access check and by the broader pricing fence policy.

### Conversion and downstream creation
- `POST /api/crm/quotes/:id/convert-to-job`
- `POST /api/crm/quotes/:id/invoice`
- One quote can create one job in this piece.
- Invoice creation requires the quote to be approved first.

### Nexi tools
- `createQuote`
- `listQuotes`
- `getQuoteDetail`
- `listQuoteTemplates`
- `listTeamMembers`
- `revisePendingQuoteCreateApproval`
- `approvePendingApproval`
- Current conversation behavior:
  - Nexi drafts a quote, reads it back in chat, and waits for explicit yes/no/make-changes
  - Nexi can read template ids before drafting and read tenant users before setting `salespersonUserId`
  - the real quote write stays behind ApprovalQueue until approval
  - quote revisions from chat replace the pending approval item and restate the revised quote before execution

## Cascades

### Shared numbering cascade
- Quote create reserves the next quote number immediately.
- Quote-to-job conversion reserves a separate job number.
- Quote-to-invoice conversion reserves a separate invoice number.
- Existing quote records without numbers are backfilled by `ensureDocumentNumbers(...)` on read.

### Template and settings hierarchy
- Approval rules resolve as:
  - tenant default
  - template override
  - quote override
- Terms resolve as:
  - tenant default
  - template override
  - quote override
- Expiry resolves as:
  - explicit `expiresAt`
  - explicit `expiryDays`
  - template `expiryDays`
  - tenant default `expiryDays`

### Approval and immutability
- Client approval writes:
  - `approvedAt`
  - `approvedBy`
  - `approvedByRole = "client"`
  - `signature`
  - deposit bridge capture details when applicable
- Internal approval writes:
  - `approvedAt`
  - `approvedBy`
  - `approvedByRole = "OWNER"` or `"OFFICE_ADMIN"`
- Both approval paths lock the quote against future edits.
- Portal re-open after approval now renders proof state instead of a disabled approval form.

### Renewal and version history
- Renewal keeps the same quote id and number.
- Renewal archives the prior live version into `versions[]`.
- Renewal rotates the portal token hash so the old link stops working.
- Pre-send edits also archive the previous version into `versions[]`.

### Payment schedule hierarchy
- Quotes can now carry a first-class `paymentSchedule`.
- Current sources are:
  - tenant/staff manual quote setup
  - template default payment schedule
  - per-quote override

### Quote-to-job snapshot
- Quote conversion is a one-time snapshot for this piece.
- The created job gets:
  - quote title
  - line items
  - totals
  - `paymentSchedule`
  - `requestId` when present
  - `intake` when present
- The quote then records `convertedJobId` and `jobId`.
- The resulting job is editable later; only the quote is immutable after approval.

### Quote-to-invoice carry-forward
- Invoice creation carries forward:
  - line items
  - totals
  - `paymentSchedule`
  - `quoteId`
  - `jobId` when already linked
  - `requestId` when present
  - `intake` when present
- Quote-level discount is already baked into the stored quote totals and therefore carries forward automatically.
- Quote PDFs now surface through NexDocs `officeRecords` in NexOps and NexPortal, replacing the older split document surface from C5.

### Historical deposit/card bridge snapshot
- The approved quote still preserves the original `quote.deposit` snapshot for audit history:
  - deposit required flag
  - percent vs amount
  - computed amount
  - cardholder name
  - card brand
  - last four
  - card-on-file authorization flag
  - optional auto-saved card marker
  - capture timestamp from approval time
- Piece 4 migrated that bridge into formal ledger objects:
  - `Payment`
  - `Deposit`
  - `ClientBillingProfile.savedCards`
  - `ReceiptReview`
- Piece 5 now proves the stored saved-card profile is actively reusable later during invoice collection, not only captured and stored.
- Source of truth moving forward is the ledger domain described in `docs/internal/nexops/payments.md`, while the quote snapshot remains untouched for historical reference.

## Current deliberate limits

- 2026-07-18: Removed the V2 `CompanyCam Project` carry-through from quote overview/intake propagation so native quote surfaces no longer reference external media-project linkage.
- D1's atomic approval contract is currently proven in the lifecycle map / policy layer, but NOT YET proven end-to-end on the real quote payment execution path. Add an execution-suite test that proves a failed deposit attempt leaves the quote in `sent`, creates no `QuoteAcceptance`, and requires the client to re-approve on retry before D1 is treated as fully field-verified.
- Client decline is not fully wired yet as a first-class route, even though `declined` exists in the model.
- Portal approval now syncs the minimal deposit/card bridge into formal ledger objects, but the quote still keeps the historical bridge snapshot instead of mutating old approvals in place.
- One quote converts to one job only in this piece.
- Client-selectable add-ons are not yet exposed in the portal, but the line-item model already carries `clientSelectable` and `defaultSelected` for that future tier.
- Portal links are only emitted at send/renew time; the hash is stored, not the raw link token.
- Quote approval is chat-native for staff-side Nexi flows, but the client approval surface remains the dedicated quote portal page.
- Email and SMS quote delivery have only been verified through local adapter-backed receipts so far; a live third-party send proof remains required before real client traffic should rely on them.
