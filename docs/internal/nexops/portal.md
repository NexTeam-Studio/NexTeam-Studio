# NexPortal Client Hub

Last updated: 2026-07-17  
Build piece: Client hub / review follow-up combined pass

## Statuses

### Portal session scopes

#### `client`
- Full-hub session for the saved client record.
- Can navigate across:
  - quotes
  - invoices
  - appointments
  - documents
- Uses the shared NexPortal shell instead of a one-off object page.

#### `property`
- Restricted session scoped to one property on a multi-property client.
- Shows only work for that property.
- Billing-contact details and other properties do not leak into this view.

### Verification methods

#### `magic_link`
- Default passwordless entry path.
- Session starts from a hashed portal token and no password is stored.

#### `phone_last4`
- Re-verification path after the hub session ages past the tenant-configured freshness window.
- Current default freshness window is 14 days.

### Entry depth

#### `hub`
- Session-backed entry into `/nexportal`.
- Includes hub navigation and cross-object access based on session scope.

#### `standalone`
- Bare per-object quote or invoice link still works without exposing the rest of the hub.
- Current standalone surfaces:
  - `/portal/quotes/:id`
  - `/portal/invoices/:id`

## Transitions

### outbound link -> authenticated hub session
- Triggered by `PortalHubService.issueMagicLink(...)`.
- Result:
  - hashed token stored in `portalSessions`
  - delivery target recorded
  - `portal.link_sent` event emitted

### authenticated session -> refreshed activity
- Triggered by `PortalHubService.consumeMagicLink(...)`.
- Result:
  - `lastVerifiedAt` and `lastActivityAt` update
  - `portal.session_started` event emitted

### aged session -> reverify required
- Triggered when `buildSnapshot(...)` detects `lastVerifiedAt` older than `portalDefaults.hubSessionReverifyDays`.
- Result:
  - full hub pages redirect to `/nexportal/reverify`
  - standalone quote/invoice actions also bounce through the same reverify gate

### reverify required -> restored session
- Triggered by:
  - a fresh magic link, or
  - `PortalHubService.reverifyByPhoneLast4(...)`
- Result:
  - verification method updates
  - hub access resumes without forcing a password reset flow

### unconfirmed appointment -> confirmed appointment
- Triggered by `POST /api/nexportal/visits/:id/confirm`.
- Result:
  - visit `confirmedAt` is stamped
  - `visit.confirmed` event is emitted
  - client page state updates immediately instead of relying on toast-only feedback

### open statement range -> rendered/downloaded statement
- Triggered by `generateStatementSnapshot(...)` and the statement PDF route.
- Result:
  - running-balance statement reflects invoices, payments, credits, and tips already stored in the ledger

## Triggers

### Hub and reverify routes
- `GET /nexportal/session/:sessionId`
- `GET /nexportal`
- `GET /nexportal/quotes`
- `GET /nexportal/invoices`
- `GET /nexportal/appointments`
- `GET /nexportal/documents`
- `GET /nexportal/reverify`
- `POST /api/nexportal/reverify/phone`

### Detail and action routes
- `GET /nexportal/quotes/:id`
- `GET /nexportal/quotes/:id/pdf`
- `POST /api/nexportal/quotes/:id/approve`
- `POST /api/nexportal/quotes/:id/change-request`
- `GET /nexportal/invoices/:id`
- `GET /nexportal/invoices/:id/pdf`
- `GET /api/nexportal/invoices/:id/checkout`
- `GET /nexportal/invoices/:id/paypal-return`
- `POST /api/nexportal/visits/:id/confirm`
- `GET /nexportal/statements/:clientId.pdf`
- `GET /nexportal/reviews/opt-out`

### Staff-side support routes
- `POST /api/crm/clients/:id/portal-link`
- `GET /api/crm/clients/:id/portal-activity`
- `GET /api/crm/clients/:id/statement`
- `GET /api/crm/clients/:id/statement.pdf`
- `POST /api/crm/clients/:id/statements/send`

### Current client actions inside the hub
- Approve quote
- Request quote changes
- Pay invoice through Stripe or PayPal/Venmo checkout
- Confirm appointment
- Download quote, invoice, receipt, statement, and posted field-report documents
- Open shared visit photos when the job has not been hidden from the client hub

## Cascades

### Single portal, not parallel portals
- The hub wraps the earlier quote portal instead of duplicating it.
- Quote and invoice standalone links still render when no hub session exists.

### Archived-client visibility rule
- Archived clients can still authenticate into the hub.
- The hub does not display an archived-state badge or alternate language to the client.

### Address-privacy rule
- `portalDefaults.keepBusinessAddressPrivate` hides the tenant business address from the client-facing shell.
- The same client still sees the tenant brand block and contact surfaces that are allowed.

### Multi-property leak prevention
- Property-scoped sessions filter:
  - quotes
  - invoices
  - jobs/visits
  - documents
- Property labels render from the associated work record.
- Billing-contact details remain client-level and do not appear in a property-only portal session.

### Delivered-record boundary

- NexPortal snapshots admit only customer-delivered quotes (`sent`, `change_requested`, or `approved`) and invoices (`sent`, `awaiting_payment`, `partial_pay`, or `paid`) that hold a portal token.
- The shared NexDocs client-library is additionally narrowed to the snapshot's delivered quote, invoice, receipt, and statement records before portal rendering or document search. Draft/internal office records stay staff-only.

### Statement and document assembly
- Statement PDFs reuse the same HTML/PDF pipeline already used by quotes, invoices, and receipts.
- Statement send uses the `statement_send` communication-template category and emits `statement.sent`.

### NexCam / NexDocs visibility rule
- Field reports and shared photos are visible in the hub by default.
- Documents page and Appointments page both read from the shared NexCam/NexDocs repository layer used by staff rails.
- Owner/admin can opt a job out by setting `clientVisibility.hideFieldDocsFromPortal = true`.
- That job-level opt-out removes both report and photo entries from the client hub without affecting staff-side NexOps/NexCam access.
- Quote PDFs, invoice PDFs, receipts, statements, and client-uploaded files now render through NexDocs on that same hub instead of a second standalone Documents surface.

### Portal activity rail
- Client activity is derived from emitted lifecycle events rather than a second ad hoc audit store.
- Current surfaced portal events include:
  - `portal.link_sent`
  - `portal.session_started`
  - `visit.confirmed`
  - `statement.sent`
  - review-sequence events when they affect the client rail

## Nexi tools

- `sendPortalLink`
- `getClientPortalActivity`
- `generateStatement`
- `sendStatement`

Current behavior:
- Nexi can send a full hub link for the whole client or a property-scoped link.
- Nexi can read back portal activity to staff from the same event-driven rail used by the UI.
- Nexi can generate a statement snapshot before sending it.

## Current deliberate limits

- Google Business Profile review detection is not wired yet; review completion is staff-marked today.
- Hub sessions currently originate from quote/invoice-linked sends and staff-generated client links; there is not yet a separate self-serve portal signup concept.
- Live third-party delivery proof for real field email/SMS remains a separate external receipt step from this local build.
