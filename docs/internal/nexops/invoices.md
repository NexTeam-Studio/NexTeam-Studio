# NexOps Invoices

Last updated: 2026-07-13  
Build piece: Close / invoice / collect-payment / receipt-review flow

## Statuses

### `draft`
- Default invoice state when staff creates an invoice from:
  - one job
  - multiple selected jobs
  - an approved quote
- Full draft editing is allowed for:
  - title
  - line items
  - discount
  - tax rate
  - due date
  - terms
  - payment schedule
  - delivery defaults

### `sent`
- Client-facing delivery state after the first send or mark-sent action.
- A portal token hash is issued or rotated at send time.

### `awaiting_payment`
- Open-balance state after delivery when money is still due and no partial payment currently defines the rail.
- Can still be sent again, paid in office, or moved through refund/void/bad-debt actions later.

### `partial_pay`
- At least some value has been applied, but balance due remains.
- This can be caused by:
  - deposit auto-application
  - credit auto-application
  - collected payment less than full balance

### `paid`
- Balance due has reached zero after reconciliation.

### `void`
- Invoice was deliberately voided instead of collected.
- Applied deposits and credits are released first.

### `bad_debt`
- Invoice remains on the books, but remaining balance is written off deliberately.

## Transitions

### compose -> `draft`
- Triggered by:
  - job `invoice`
  - job `close_and_invoice`
  - `POST /api/crm/quotes/:id/invoice`
  - `POST /api/crm/invoices/compose`
  - Nexi `queueInvoiceCompose` approval execution
- Combined invoices can use any selected subset of jobs for the same client.

### `draft` -> updated `draft`
- Triggered by `PATCH /api/crm/invoices/:id`.
- Line-item edits are only allowed while still `draft`.
- Totals are recalculated from edited lines, discount, and tax.

### `draft` -> `sent`
- Triggered by:
  - `POST /api/crm/invoices/:id/send`
  - Nexi `queueInvoiceSend` approval execution
- Delivery modes:
  - `email`
  - `sms`
  - `mark_sent`

### `draft|sent|awaiting_payment|partial_pay` -> current open collection state
- Triggered by payments, deposit application, credit application, refunds, voids, and write-offs.
- Reconciliation recalculates:
  - `depositApplied`
  - `creditApplied`
  - `paymentApplied`
  - `refundedAmount`
  - `balanceDue`
  - `overdue`

### open invoice -> `awaiting_payment|partial_pay|paid`
- Triggered by:
  - `POST /api/crm/invoices/:id/payments`
  - `POST /api/crm/invoices/:id/checkout`
  - Stripe completion webhook
  - PayPal/Venmo capture path
- Partial collection leaves the invoice in `partial_pay`.
- Full collection lands it in `paid`.

### open invoice -> `void`
- Triggered by `POST /api/crm/invoices/:id/void`.
- Blocked when net collected payment still remains on the invoice.

### open invoice -> `bad_debt`
- Triggered by `POST /api/crm/invoices/:id/bad-debt`.
- Keeps the invoice record while zeroing the collectable balance.

## Triggers

### Invoice routes
- `GET /api/crm/invoices`
- `GET /api/crm/invoices/:id`
- `POST /api/crm/quotes/:id/invoice`
- `POST /api/crm/invoices/compose`
- `PATCH /api/crm/invoices/:id`
- `POST /api/crm/invoices/:id/send`
- `POST /api/crm/invoices/:id/checkout`
- `GET /api/crm/invoices/:id/pdf`

### Receipt review routes
- `GET /api/crm/receipt-reviews`
- `GET /api/crm/receipt-reviews/:id`
- `PATCH /api/crm/receipt-reviews/:id`
- `POST /api/crm/receipt-reviews/:id/send`

### Payment and exception routes
- `POST /api/crm/invoices/:id/payments`
- `POST /api/crm/payments/:id/refund`
- `POST /api/crm/invoices/:id/void`
- `POST /api/crm/invoices/:id/bad-debt`

### Nexi tools
- `queueInvoiceCompose`
- `revisePendingInvoiceComposeApproval`
- `queueInvoiceSend`
- `revisePendingInvoiceSendApproval`
- `queueCollectPayment`
- `revisePendingCollectPaymentApproval`
- `queueReceiptReviewSend`
- `revisePendingReceiptReviewApproval`
- `approvePendingApproval`

### UI surfaces
- `apps/web/src/nexopsInvoices.tsx`
- Current office flow includes:
  - combine selected jobs
  - edit draft
  - send invoice
  - collect payment
  - refund/void/bad-debt
  - review and send receipt

## Cascades

### Quote/job carry-forward
- Invoice creation preserves upstream links when available:
  - `quoteId`
  - `requestId`
  - `jobId`
  - `jobIds`
  - `jobReferences`
  - `intake`
  - `paymentSchedule`

### Multi-job combine
- Any subset of one client's jobs can be combined now.
- Resulting invoices store:
  - `jobIds`
  - `jobReferences[]`
- Receipt and later audit can still trace which jobs were covered by the combined invoice.

### Payment schedules
- Invoices can now carry a `paymentSchedule`.
- Source can be:
  - inherited from one job
  - inherited from an approved quote
  - supplied directly during combined compose
  - edited later on the draft invoice

### Delivery hierarchy
- Delivery payload resolves from:
  - tenant/account invoice defaults
  - invoice-level `deliveryDefaults`
  - per-send overrides
- Current global default pattern is:
  - pay link + summary by default
  - PDF attachment on email
  - no PDF attachment on SMS
  - hosted link available for SMS

### Portal access
- Sending an invoice generates a portal token hash and client URL.
- Receipt review SMS uses a secure hosted link because files do not travel over SMS.

### Receipt review pause
- Successful payment/refund flows create a paused `ReceiptReview` object instead of auto-sending.
- Staff can edit:
  - attachment selection
  - subject/body
  - recipients
  - channels
- Send happens only after explicit office confirmation.

### Invoice send event quirk
- Current code emits the existing `quote.sent` event type with invoice payload when an invoice is delivered.
- This is actual current behavior, not the ideal final event taxonomy.

## Current deliberate limits

- Local Piece 5 verification exercises real local flows, but live third-party email/SMS and production payment rails still need explicit external receipt before field use.
- Split allocation of one payment across multiple invoices is still not built.
- Mark-sent records delivery history and portal issuance but does not transport a message itself.
