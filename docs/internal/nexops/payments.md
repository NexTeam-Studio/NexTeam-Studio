# NexOps Payments

Last updated: 2026-07-13  
Build piece: Ledger domain foundation + close/invoice/payment flow

## Statuses

### Invoice lifecycle statuses

#### `draft`
- Default invoice state when an office-side invoice is first materialized.
- Used by:
  - job close/invoice flow
  - quote-to-invoice creation
  - direct native invoice writes
  - multi-job combined invoice compose

#### `sent`
- Explicit post-delivery invoice state.
- Stripe or PayPal/Venmo checkout can still be opened from an invoice that remains collectible.

#### `awaiting_payment`
- Open balance remains and no active deposit, credit, or net payment is currently applied.
- This is the only state that can carry the computed `overdue` indicator.

#### `partial_pay`
- Open balance remains and at least one of these exists:
  - applied deposit
  - applied credit
  - net collected payment
- Piece 5's office collection flow prompts staff to send the remaining balance immediately after this state is reached.

#### `paid`
- Balance due reached zero after ledger reconciliation.

#### `void`
- Invoice was voided instead of collected.
- Deposits and credits attached to that invoice are released back to the client balance.

#### `bad_debt`
- Invoice remains on the books but the remaining balance is written off deliberately.

### Payment statuses

#### `pending`
- Stripe or PayPal/Venmo checkout session/order exists but settlement has not happened yet.

#### `failed`
- Payment attempt failed.
- Failed attempts do not apply money to the invoice and do not create a receipt-review draft.
- Piece 5 now explicitly routes failed recovery into:
  - retry same card
  - switch saved card
  - switch manual method
  - send pay link for client self-pay

#### `succeeded`
- Money was successfully recorded or settled.

#### `partially_refunded`
- Some, but not all, of the original collected amount has been refunded.

#### `refunded`
- The full collected amount has been refunded.

### Deposit statuses

#### `available`
- Client deposit exists and can be auto-applied to the next invoice.

#### `partially_applied`
- Deposit has been applied to one invoice but still has remaining available balance.

#### `applied`
- Deposit has been fully consumed by invoice application.

#### `released`
- Reserved in the data model for explicit release tracking.
- Current behavior reopens released deposits back to `available` with released application history attached.

#### `refunded`
- Reserved in the data model for later refund-specific deposit handling.

### Credit statuses

#### `available`
- Client credit exists and can be auto-applied to the next invoice.

#### `partially_applied`
- Credit has been partially consumed by invoice application.

#### `applied`
- Credit has been fully consumed.

### Refund statuses

#### `pending`
- Reserved for asynchronous provider-backed refund flows.

#### `succeeded`
- Refund record has been executed successfully.

#### `failed`
- Reserved for provider failure handling.

### Receipt review statuses

#### `draft`
- Default state when a payment or refund creates a receipt review object.

#### `ready_to_send`
- Receipt review has been edited and is ready for the deliberate final send step.

#### `sent`
- Finalized receipt delivery history state.

## Transitions

### Quote deposit bridge -> formal payment + deposit ledger
- Triggered by:
  - `LedgerService.syncQuoteDepositBridge(...)`
  - portal quote approval route calling the ledger sync
- Result:
  - a first-class `Payment` record with `provider = "quote_bridge"`
  - a first-class `Deposit` record with `source = "quote_approval"`
  - a client billing-profile saved card when card-on-file authorization exists
  - a draft `ReceiptReview`
- The original `quote.deposit` snapshot remains untouched for audit reference.

### Open invoice -> `partial_pay` or `paid` through automatic application
- Triggered by `LedgerService.syncInvoiceAfterCreate(...)` and normal tenant reconciliation.
- Existing client deposits and credits are auto-applied to the next invoice without a separate confirm step.

### `pending` -> `succeeded`
- Triggered by:
  - `LedgerService.markStripeCheckoutPaid(...)`
  - PayPal/Venmo capture completion
  - manual office-side `recordInvoicePayment(...)` with successful status
- Result:
  - invoice ledger totals are recalculated
  - receipt review is created in `draft`
  - overpayment creates a separate `Credit`

### saved-card profile -> later invoice collection reuse
- Triggered by office-side `recordInvoicePayment(...)` with `savedCardId`.
- Default selection is the most recently updated saved card on the client billing profile.
- Staff can override that default and select any other saved card on the client profile instead.

### partial payment -> remaining-balance follow-up
- Triggered by a succeeded payment that does not clear `balanceDue`.
- Result:
  - invoice status becomes `partial_pay`
  - receipt review is created
  - chat flow immediately prompts staff to send the remaining balance

### `succeeded` -> `partially_refunded`
- Triggered by `performLedgerAction(... action = "refund_payment")` when refundable balance remains afterward.
- Result:
  - separate `Refund` record
  - invoice recalculation
  - refund receipt review paused in `draft`

### `succeeded|partially_refunded` -> `refunded`
- Triggered by a refund that fully exhausts the remaining refundable amount.
- Invoice returns to `awaiting_payment` when no net collected money remains.

### Open invoice -> `void`
- Triggered by `performLedgerAction(... action = "void_invoice")`.
- Hard-blocked when any net collected payment remains on the invoice.
- Applied deposits and credits are released back to client balance first.

### Open invoice -> `bad_debt`
- Triggered by `performLedgerAction(... action = "mark_bad_debt")`.
- Keeps the invoice record but zeros the collectable balance and records `writtenOffAmount`.

### `draft|ready_to_send` receipt review -> `sent`
- Triggered by `sendReceiptReview(...)`.
- Email carries the selected attachments directly.
- SMS carries the secure hosted link instead of file payloads.

## Triggers

### Ledger read routes
- `GET /api/crm/invoices`
- `GET /api/crm/invoices/:id`
- `GET /api/crm/payments`
- `GET /api/crm/payments/:id`
- `GET /api/crm/deposits`
- `GET /api/crm/refunds`
- `GET /api/crm/credits`
- `GET /api/crm/receipt-reviews`

### Ledger write routes
- `POST /api/crm/invoices/:id/payments`
- `POST /api/crm/invoices/:id/checkout`
- `POST /api/stripe/webhook`
- `POST /api/crm/payments/:id/refund`
- `POST /api/crm/invoices/:id/void`
- `POST /api/crm/invoices/:id/bad-debt`
- `PATCH /api/crm/receipt-reviews/:id`
- `POST /api/crm/receipt-reviews/:id/send`

### Nexi billing tools
- `listPayments`
- `getPaymentDetail`
- `listDeposits`
- `listRefunds`
- `listCredits`
- `queueInvoiceCompose`
- `queueInvoiceSend`
- `queueCollectPayment`
- `queueReceiptReviewSend`
- `queueLedgerAction`
- `revisePendingInvoiceComposeApproval`
- `revisePendingInvoiceSendApproval`
- `revisePendingCollectPaymentApproval`
- `revisePendingReceiptReviewApproval`
- `revisePendingLedgerActionApproval`
- `approvePendingApproval`

### Billing authority
- Billing routes and billing chat tools are owner/admin-only in this piece.
- Allowed roles:
  - `OWNER`
  - `OFFICE_ADMIN`
- `TECHNICIAN` is blocked from the billing chat tools and from the billing routes.

## Cascades

### Separate first-class ledger records
- Payment, Deposit, Refund, Credit, and ReceiptReview each persist as their own record with their own id and status history.
- This is not one generic ledger-entry document.

### Bridge reconciliation from Piece 2
- The earlier quote approval deposit/card bridge is now migrated into the ledger domain.
- Source of truth moving forward:
  - payments
  - deposits
  - credits
  - refunds
  - receipt reviews
- Historical source of truth for the quote snapshot itself remains the approved quote record.

### Payment schedule model
- Payment schedules are now first-class plan records that can travel with a quote, a job, and an invoice.
- Current shape:
  - `enabled`
  - `milestones[]`
  - per milestone `label`
  - per milestone `trigger` (`on_approval`, `on_job_close`, or `on_date`)
  - per milestone `amountKind` (`percent` or `amount`)
  - per milestone `amount`
  - optional per milestone `dueAt`
- In Piece 5, the schedule can originate from:
  - quote creation or quote-template default
  - manual job creation or later job editing
  - combined-invoice compose
  - later draft-invoice editing
- Current ledger behavior:
  - the schedule carries forward onto the invoice record itself
  - collection and receipt review still run against the invoice ledger objects, not a separate milestone ledger table
  - partial payments reduce invoice balance normally; milestone plans remain the billing plan metadata carried on the invoice
  - the Piece 3/5 close-without-invoice recurring nag remains the only repeating reminder object; milestone `dueAt` values do not spawn a second recurring reminder rail in this piece
- Known follow-up:
  - milestone `dueAt` dates should eventually trigger their own staff reminder path so scheduled payment checkpoints do not rely on manual follow-through alone

### Saved card scope
- Card-on-file authorization captured during quote approval is stored on the client billing profile broadly.
- Reuse is client-wide, not limited to the one quote that first captured the card.
- Piece 5 now actively reuses those saved cards during later invoice collection, not just stores them for future use.

### One payment -> one invoice
- Each payment record links to one invoice only in this piece.
- Split allocation across multiple invoices is deferred.

### Auto-application
- Client deposits and credits auto-apply to the next invoice on reconciliation.
- No manual office confirmation step is inserted before application.

### Stripe Connect pass-through
- Checkout requests use the tenant-scoped connected-account env lookup when present:
  - `STRIPE_CONNECTED_ACCOUNT_<TENANT_ID>`
  - fallback `STRIPE_CONNECTED_ACCOUNT`
- No `application_fee_amount` or `application_fee_percent` is added.
- Stripe billing collects the current `ledger.balanceDue`, not always the original invoice total.

### PayPal/Venmo checkout
- PayPal Checkout including Venmo is now wired as a first-class provider path in the ledger flow.
- Local Piece 5 verification covers order creation and capture through the PayPal helper rail.
- Live provider proof is still a separate external receipt step before field use.

### Receipt review defaults
- Successful payment and refund actions create `ReceiptReview` objects immediately.
- Default attachment inventory for invoice-backed receipts includes:
  - invoice PDF
  - field report
  - photos
  - other job files
- Quote-deposit bridge receipts currently attach the quote PDF and related job files when present.
- Piece 5 editing now allows staff to trim attachment selection, change channels, and edit recipient/body/subject before send.

### Receipt review send channels
- Email sends the selected attachments directly.
- SMS sends the hosted receipt link instead of file attachments.
- Both channels can be used from the same review when staff chooses both.

### Void vs bad debt stay separate
- `void` releases applied client value and treats the invoice as cancelled.
- `bad_debt` preserves the invoice record and writes off the remaining amount instead.

## Current deliberate limits

- Disputes and chargebacks are not modeled yet.
- Multi-invoice payment allocation is not built yet.
- Live third-party proof for email/SMS delivery and real external payment settlement still requires explicit field receipts beyond local verification.
- Tenant-manageable Products & Services catalog management still does not exist here; invoice lines inherit quote/job snapshots and custom lines for now.
