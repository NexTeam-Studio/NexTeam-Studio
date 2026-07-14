# NexOps Operating Model Settled Decisions

Date: 2026-07-12

This document closes the ask-list in `NEXOPS-OPERATING-MODEL-GAP-ANALYSIS-20260712.md`.

Read order for future lifecycle work:

1. `C:\Users\Peyto\Downloads\JOBBER-OPERATING-MODEL-NEXOPS-BIBLE-v2.md`
2. `docs/specs/phase1/NEXOPS-OPERATING-MODEL-GAP-ANALYSIS-20260712.md`
3. This document

This is still not a build ticket by itself. It is the settled decision record Chris approved after the gap-analysis review.

## 1. Settled Decisions

### 1.1 Request object

Decision:

- Build a first-class `Request` object now, before deeper quote and job work.
- This is not just a lead event. It is a real CRM record with its own lifecycle, matching the bible's section 3 model.

Required direction:

- Status path: `New` -> converted to `Quote` or `Job`, or `Archived`.

### 1.2 Quote approval model

Decision:

- NexOps will not copy Jobber here directly. This is a custom model.

Required toggles:

- Per-quote and per-quote-template toggles, each independently settable:
  - require signature
  - require deposit
  - require card on file

Required approval paths:

- Client self-approval through the client link must satisfy every active toggle on that quote.
- Internal/manual approval by staff can approve on the client's behalf and can bypass signature, deposit, and card requirements.
- Deposit collection can happen later in the internal/manual path.

Global setting:

- Separate account-level setting for whether any deposit collected in the system auto-saves the card to file.

Defaults:

- Most real quotes will default to deposit, card on file, and signature enabled.
- These defaults are never hardcoded permanently. Every toggle remains overridable per quote and per template.

### 1.3 Quote expiry

Decision:

- Add quote expiry as a deliberate NexOps improvement over Jobber.

Required behavior:

- Global default expiry window.
- Override per quote and per template.
- Expired quotes move to distinct `Expired` status.
- `Expired` is not the same as manually `Archived`.
- Approval attempts against expired or archived quotes must be hard-blocked server-side, even if the client clicks an old cached email link.
- Admin can renew an expired quote without creating a new record and without changing the quote number.

### 1.4 Quote immutability

Decision:

- Once approved, a quote is fully locked.
- NexOps will not use Jobber's edit-and-strip-signature pattern.

Required behavior:

- No edits at all after approval.
- The resulting job remains editable after quote conversion.
- Client change requests are allowed only before approval.
- Once approved, added work belongs on the job, not back on the quote.

### 1.5 Quote to job conversion

Decision:

- Conversion is a one-time snapshot.
- This matches the bible and remains true even with quote immutability.

Required behavior:

- Later quote changes never affect the job.
- Quote discount carries forward to the eventual invoice.

### 1.6 Job status model

Decision:

- Replace the current direct-enum job model with the reminder-driven derived status model from the bible.

Required behavior:

- States like `Requires Invoicing` must be derived from invoice-reminder objects and timing, not written directly as a manual status flag.

### 1.7 Close and invoice authority

Decision:

- Technicians can complete visits, but cannot close jobs or create/send invoices.
- Only `OWNER` and `OFFICE_ADMIN` can close jobs or create/send invoices.

Required flow:

- Technician completes visit.
- System sends admin-facing internal alert.
- For single-day jobs, the prompt fires after that visit completes.
- For multi-day jobs, the prompt fires only after the last scheduled visit completes.

Required actions:

- `Close job`
- `Invoice job`
- `Close and Invoice`

These must remain separate actions, not one merged button.

### 1.8 Close and invoice flow

Decision:

- `Close and Invoice` opens an invoice screen with two primary actions:
  - `Send Invoice Now`
  - `Collect Payment`

Required behavior:

- Send path can send by SMS or email.
- After initial send, staff can resend through the other channel.
- Collect-payment path shows balance due after deposit offset, plus card-on-file last four and card type when available.
- Staff can charge card on file or record alternate payment methods such as cash, check, or other.

### 1.9 Receipts

Decision:

- Receipts do not auto-send.
- They pause for review so staff can attach documents and reports before sending.

Required behavior:

- Receipt sending remains gated long enough to add attachments.
- This is a deliberate NexOps improvement and should remove the Jobber-style zero-balance-invoice workaround.

### 1.10 Invoice status model

Decision:

- Expand invoice states beyond the current minimal model.

Required distinctions:

- `Awaiting Payment`
- `Partial-Pay`
- `Void`
- `Bad Debt`

Decision rule:

- If the work happened and the invoice was valid, unpaid balance moves to bad debt.
- If the invoice was a mistake or should never have existed, use void.

### 1.11 Ledger architecture

Decision:

- Payments, deposits, refunds, and billing-history credits must become first-class ledger objects before broader billing UI work.

Required behavior:

- Each gets its own record, status path, and history.
- They are not just numbers hanging off invoices.

### 1.12 Payment integrations

Decision:

- Stripe: build multi-tenant Stripe Connect using Express accounts.
- PayPal: build through PayPal Checkout.
- Venmo: treat as part of PayPal Checkout, not a separate rail.
- Zelle: hold for now; if ever added later, treat it as a manual payment type, not a live integration.

Explicit unresolved business decision:

- Whether NexTeam takes an application fee on Stripe Connect transactions is still unresolved and must come back to Chris during implementation scoping.

### 1.13 Tax system

Decision:

- Do not build the three-level tax hierarchy now.
- Keep the current simple flat tax placeholder as-is.
- Revisit only if a real tenant need appears.

### 1.14 Client portal naming and scope

Decision:

- The client portal name is `NexPortal`.
- Do not use `NexHub` or any alternate name.

Scope decision:

- Chris explicitly chose the full client hub direction, not the narrower staged invoice-first portal recommendation.

Required product direction:

- Clients can access past, present, and pending work for their account.
- All relevant documents for each job are visible in the same hub.
- Every email entry point lands the client in the same full hub, not a link-scoped filtered view.

Avatar fallback chain:

1. Real photo first.
2. Last-name-initial avatar if no photo exists.
3. Both staff and client can change it.

Important scoping boundary:

- NexPortal is large enough to require its own dedicated planning session and ask-list.
- Do not fold it into unrelated lifecycle build work.

### 1.15 Notification automation carve-outs

Decision:

- ApprovalQueue-by-default remains the baseline rule.
- Only named exceptions auto-send.

Auto-send exceptions:

- request-submitted confirmation email
- quote-approval confirmation email
- internal admin alerts such as payment received, payment failed, and visit completed by technician

Explicit non-exception:

- Receipts do not auto-send.
- Even after card payment, receipts stay paused for review and attachments.

### 1.16 Home queue and activity feed

Decision:

- Build both early.

Required behavior:

- Home queue is derived from lifecycle states, not a static dashboard.
- Activity feed is a real audit trail patterned after the bible's documented event stream.

### 1.17 Visit reminders

Decision:

- Use a two-reminder pattern:
  - one day before: email with exact date, time window, and assigned technician
  - one hour before: SMS with arrival-window information

## 2. Proposed Build Order

This is the recommended dependency order before any build starts.

### Piece 1. Request foundation

Why first:

- Chris explicitly approved this as the first real lifecycle object to add.
- Quote and job depth should not grow on top of a missing intake record.

Scope:

- first-class request record
- request statuses
- request archive/convert behavior
- request -> quote/job conversion entry points

### Piece 2. Quote lifecycle foundation

Why second:

- Quote approval rules now have multiple hard server-side requirements.
- Quote immutability and expiry rules must exist before heavier quote-to-job and client-facing approval paths expand.

Scope:

- per-quote and per-template toggles
- self-approval vs internal/manual approval split
- quote expiry with server-side approval rejection
- full post-approval immutability
- pre-approval change-request path only
- snapshot conversion rules and discount carry-forward contract

### Piece 3. Reminder and derived job-state engine

Why third:

- Chris approved the bible's reminder-driven job model.
- The rest of the job close and invoice flows depend on this state engine being real first.

Scope:

- invoice-reminder object
- due/reminder timing model
- derived job states such as `Requires Invoicing`, `Action Required`, `Late`, and `Archived`
- last-visit completion logic

### Piece 4. Ledger domain foundation

Why fourth:

- Chris explicitly decided ledger objects must exist before broader billing UI.
- Invoice status expansion, deposits, refunds, and credits all depend on this layer.

Scope:

- first-class payment records
- first-class deposit records
- first-class refund records
- billing-history credits
- invoice status expansion including partial pay and bad debt
- tenant-aware payment rail boundaries for Stripe Connect and PayPal

### Piece 5. Close, invoice, collect-payment, and receipt review flow

Why fifth:

- This flow depends on both derived job-state logic and ledger objects.
- Receipt attachment support also belongs here.

Scope:

- technician-completes-visit -> admin alert
- owner/admin-only close and invoice authority
- `Close job`, `Invoice job`, `Close and Invoice` split actions
- send-now and collect-payment invoice actions
- paused receipt review with attachment support

### Piece 6. Notification exceptions and visit-reminder automation

Why sixth:

- The named automation carve-outs are now settled, but they should be wired only after the underlying objects and states are real.

Scope:

- request-submitted confirmation auto-send
- quote-approval confirmation auto-send
- internal admin alerts auto-send
- one-day email visit reminder
- one-hour SMS visit reminder
- preserve approval gating for everything else, including receipts

### Piece 7. Home queue and activity feed

Why seventh:

- The queue and feed should sit on top of the real request, quote, job, invoice, payment, and reminder events, not placeholder enums.

Scope:

- derived Home queues
- persistent activity-feed event model
- deep links into underlying objects

### Piece 8. NexPortal dedicated planning session

Why eighth:

- Chris explicitly separated this from the rest of the lifecycle work.
- It needs its own references, ask-list, and sequencing before build.

Scope for that future planning session:

- information architecture
- access model
- document visibility rules
- avatar flow
- email entry-point rules
- profile/self-service surface

### Deferred item. Tax hierarchy

Decision:

- Stay deferred until a real tenant need appears.

## 3. Build Boundaries to Keep in View

- Do not build NexPortal from this document alone.
- Do not auto-send receipts.
- Do not recreate Jobber's expired-quote approval bug. Approval rejection must be server-side.
- Do not recreate Jobber's editable-approved-quote pattern. Approved quotes are locked.
- Do not collapse void and bad debt into one path.
- Do not treat Venmo as a separate standalone rail.
- Do not start tax-hierarchy work without a new explicit decision.
