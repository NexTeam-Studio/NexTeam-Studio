Last updated: 2026-07-15
Build piece: Mobile UI / intake expansion / catalog / templates combined pass

## Objects

### `QuoteTemplate`

- Tenant-scoped quote starter used to prefill compose defaults.
- Current fields:
  - `id`
  - `tenantId`
  - `name`
  - `description?`
  - `titlePrefix?`
  - `defaultLineItems?`
  - `defaultApprovalRules`
  - `defaultPaymentSchedule?`
  - `expiryDays?`
  - `terms?`
  - `createdAt`
  - `updatedAt`

### `CommunicationTemplateRecord`

- Tenant-scoped outbound email/text template stored on `CrmSettings.communicationTemplates`.
- Current fields:
  - `id`
  - `tenantId`
  - `category`
  - `label`
  - `description?`
  - `emailEnabled`
  - `smsEnabled`
  - `emailSubject?`
  - `emailBody?`
  - `smsBody?`
  - `createdAt`
  - `updatedAt`

## Triggers

### Quote template library
- `GET /api/crm/quote-templates`
- `POST /api/crm/quote-templates`
- `PATCH /api/crm/quote-templates/:id`
- Quote compose UI supports:
  - template library selection
  - applying defaults into the draft
  - falling back to manual creation

### Template manager
- `GET /api/crm/settings`
- `PATCH /api/crm/settings`
- Settings page exposes the outbound template manager for:
  - request confirmation
  - quote send / resend
  - quote approval confirmation
  - deposit paid confirmation
  - booking confirmation
  - invoice send
  - invoice reminder
  - payment receipt
  - statement send
  - review request initial
  - review request nudge

## Cascades

### Quote template hierarchy
- Quote creation resolves defaults in this order:
  - tenant defaults
  - selected quote template
  - per-quote overrides

### Communication template usage
- Outbound send surfaces resolve message content through the template registry.
- Footer branding stays outside the editable template body and remains driven by the shared tenant-branding resolver.
- Booking confirmation, quote send, quote approval confirmation, deposit-paid confirmation, invoice send, invoice reminder, receipt review, statement send, and review follow-up all now read from the same template store.
- The old standalone client-hub Documents surface is gone; quote/invoice/receipt/statement template outputs now land on the unified NexDocs rail when they produce client-visible artifacts.

## Nexi tools

- `listQuoteTemplates`
- `listCommunicationTemplates`
- `saveCommunicationTemplate`

Current behavior:
- Nexi can read quote template ids before drafting a quote.
- Nexi can read and update the same communication-template records used by the Settings page.
- `createQuote` now supports `templateId` directly, so template choice can stay conversational once the id is known.

## Current deliberate limits

- Quote-template delete/archive is not built yet.
- Communication templates do not yet expose reply-to routing or footer-block editing as separate first-class controls.
- Live send receipts proving a template edit changed real third-party outbound delivery are blocked in this local dev environment right now because `GMAIL_SEND_MAILBOX` / `GMAIL_NEXI` OAuth send credentials and Twilio delivery credentials are not loaded into `process.env`; local adapter-backed sends and UI wiring are what is proven right now.

## Categories currently live

- `request_confirmation`
- `quote_send`
- `quote_approval_confirmation`
- `deposit_paid_confirmation`
- `booking_confirmation`
- `invoice_send`
- `invoice_reminder`
- `payment_receipt`
- `statement_send`
- `review_request_initial`
- `review_request_nudge`
