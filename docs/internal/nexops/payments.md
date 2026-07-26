# NexOps Payments

Last updated: 2026-07-18  
Build piece: Ledger domain foundation + close/invoice/payment flow + client hub/review follow-up + payments/signatures pass

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

### open invoice -> tipped payment
- Triggered by client-facing or office-side payment collection when tipping is enabled for the tenant.
- Result:
  - tip amount is stored as its own payment ledger line
  - invoice balance logic still reconciles against the invoice amount, not the invoice-plus-tip display total
  - receipt and statement surfaces can show the tip distinctly

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
- `POST /api/crm/jobs/:id/quick-payment-request`
- `POST /api/crm/clients/:id/quick-payment-request`
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
- `generateStatement`
- `sendStatement`

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

### Quick payment request fast-path
- Job-detail and client-detail now expose a lightweight payment-request shortcut for deposits, reimbursements, and change-order collection.
- Under the hood this does not create a parallel payment object.
- The shortcut materializes a real draft invoice with:
  - one line item
  - `code = "quick-request"`
  - the entered title as the line name
  - optional memo as the line description
  - normal invoice totals
  - normal invoice ledger balance
- When launched from a job, the created invoice also carries:
  - `jobId`
  - `jobIds[]`
  - `jobReferences[]`
- Once created, collection runs through the same invoice payment and receipt-review rail as any other invoice.

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

### Tap to Pay target rail
- The ledger domain is already shaped so a future in-person card-present collection path can land on the same:
  - `Payment`
  - `ReceiptReview`
  - invoice balance reconciliation
  - statement / history surfaces
- No separate "tap to pay payment" record type is needed or desired.

### Receipt review defaults
- Successful payment and refund actions create `ReceiptReview` objects immediately.
- Default attachment inventory for invoice-backed receipts includes:
  - invoice PDF
  - field report
  - photos
  - other job files
- Quote-deposit bridge receipts currently attach the quote PDF and related job files when present.
- Piece 5 editing now allows staff to trim attachment selection, change channels, and edit recipient/body/subject before send.
- Closeout currently does not require a field report to exist before receipt review can proceed.
- When a posted NexCam field report does exist for the job, the attachment path is now proven end to end:
  - receipt review picks up the real field-report attachment
  - outbound receipt email sends the actual generated PDF bytes
  - no placeholder/stub attachment is used in that path
- Receipt-review artifacts now surface through NexDocs `officeRecords`, so clients read them from the same unified document library as quote PDFs, invoice PDFs, and statements.

### Client hub statements
- Client statements now render from the same ledger source as invoice/payment detail.
- Date-range statement output includes:
  - invoices
  - payments
  - credits
  - running balance
  - tip amounts as distinct payment detail rather than invisible invoice inflation
- Staff can generate/send a statement from the client record and clients can download the PDF from the hub when permitted by scope.
- Statement PDFs now live on the same unified NexDocs `officeRecords` rail instead of a separate client-hub-only document surface.

### Receipt review send channels
- Email sends the selected attachments directly.
- SMS sends the hosted receipt link instead of file attachments.
- Both channels can be used from the same review when staff chooses both.

### Tap to Pay rail
- Tap to Pay now uses the real Stripe Terminal / React Native SDK lane rather than a placeholder enum-only shape.
- Server-side pieces now include:
  - `POST /api/mobile/tap-to-pay/connection-token`
  - `POST /api/mobile/tap-to-pay/payment-intent`
  - `POST /api/mobile/tap-to-pay/complete`
  - `POST /api/mobile/tap-to-pay/failure`
- Mobile flow now performs:
  - Terminal SDK initialize
  - Tap to Pay discovery
  - Tap to Pay connect on the phone itself (no separate external reader required for the Tap to Pay path)
  - payment-intent retrieve
  - card collection
  - confirmation
  - final ledger writeback
- Successful Tap to Pay collections land on the same existing ledger objects as every other payment rail:
  - `Payment`
  - invoice ledger reconciliation
  - `ReceiptReview`
  - invoice/client payment history
  - reporting surfaces
- Tap to Pay writes `Payment.provider = "stripe"`, `Payment.method = "card"`, and `Payment.methodDetails.collectionChannel = "tap_to_pay"` rather than inventing a parallel payment record type.
- Failed Tap to Pay attempts now reuse the shared failed-payment pattern:
  - the attempt can be logged as `Payment.status = "failed"`
  - no invoice money is applied
  - no receipt review is created
  - staff gets a field-facing failure message instead of a silent hang

### Void vs bad debt stay separate
- `void` releases applied client value and treats the invoice as cancelled.
- `bad_debt` preserves the invoice record and writes off the remaining amount instead.

## Current deliberate limits

- Disputes and chargebacks are not modeled yet.
- Multi-invoice payment allocation is not built yet.
- Tap to Pay is now implemented in code, but full field proof still depends on hardware/runtime constraints outside this Windows shell:
  - Expo Go is not enough; the mobile app must run as a native development build with `@stripe/stripe-terminal-react-native` linked through Expo prebuild/run.
  - Stripe Terminal React Native SDK itself requires Android API 26+ or iOS 15.1+.
  - Tap to Pay on iPhone additionally requires Apple's Tap to Pay entitlement on the iOS app.
  - Tap to Pay on Android has a narrower real-device gate than the base SDK:
    - Android 13+
    - integrated NFC + ARM
    - Google Mobile Services / Play Store
    - recent security patch
    - hardware keystore
    - developer options off
    - no rooted / custom-OS / emulator devices
- Because this workstation does not provide a supported physical Tap to Pay device, this piece is locally proven at the server/ledger route layer and mobile bundle layer, but still needs a real-device or Stripe-supported simulated-device collection receipt before it can be described as fully field-proven.
- Live third-party proof for email/SMS delivery and real external payment settlement still requires explicit field receipts beyond local verification.
- Tenant-manageable Products & Services catalog management now exists on the shared Settings surface; invoice lines still snapshot quote/job values when materialized, but staff can also work from shared catalog items or custom lines in the current invoice editor.
- Statement send currently uses the adapter-backed outbound path in local verification; live field proof still needs real Gmail/Twilio credentials before that part is considered externally proven.
