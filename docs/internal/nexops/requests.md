# NexOps Requests

Last updated: 2026-07-12
Build piece: Request foundation

## Statuses

### `new`
- The request exists and is still waiting for staff review or downstream conversion.
- This is the default status for:
  - office-created requests
  - website form submissions
  - legacy lead backfill imports
  - manually reopened archived requests

### `archived`
- Dead-end holding state for requests that should stay out of the active queue.
- Archive is reversible by staff through the reopen action.

### `converted_to_quote`
- The request has been converted into a native quote.
- The request keeps its full intake payload and records `convertedQuoteId`.

### `converted_to_job`
- The request has been converted directly into a native job.
- The request keeps its full intake payload and records `convertedJobId`.

## Transitions

### `new -> archived`
- Triggered by `POST /api/crm/requests/:id/archive`.
- Sets `archivedAt`.

### `archived -> new`
- Triggered by `POST /api/crm/requests/:id/reopen`.
- Clears `archivedAt`, sets `reopenedAt`.

### `new -> converted_to_quote`
- Triggered by `POST /api/crm/requests/:id/convert-to-quote`.
- Creates or links the client/property first, then creates a draft native quote.

### `new -> converted_to_job`
- Triggered by `POST /api/crm/requests/:id/convert-to-job`.
- Creates or links the client/property first, then creates a native job with notes/context only.

## Triggers

### Office create
- `POST /api/crm/requests`
- Supports:
  - new client intake
  - existing client intake
  - existing client plus existing property
  - existing client plus new property address
- Validation rules:
  - client name required
  - issue summary required
  - exact email or exact phone required unless explicitly linked to an existing client
  - full service address required unless explicitly linked to an existing property
  - pool configuration required unless the caller explicitly opts into incomplete backfill behavior

### Website form submit
- `GET /request-forms/:tenantId/:slug` renders the public form.
- `POST /api/request-forms/:tenantId/:slug/submit` creates a real request directly.
- Website submissions are not parked in a separate lead-only queue first.

### Lead backfill
- `POST /api/crm/requests/backfill-leads`
- Existing `leads` records are converted into first-class requests.
- Backfill is allowed to remain incomplete when older lead data lacks the full pool/service-address detail now required for fresh intake.

### Request form library
- `GET /api/crm/request-forms`
- `POST /api/crm/request-forms`
- `PATCH /api/crm/request-forms/:id`
- Each tenant can save multiple intake forms with:
  - independent field selections
  - independent share URLs
  - independent embed codes

### Nexi tools
- `listRequests`
- `getRequestDetail`
- `createRequest`
- Current local conversation behavior:
  - Nexi writes real requests through the tool layer
  - Nexi asks one clarification question before writing when required request data is missing
  - Nexi answers recall questions from stored request data with native sources

## Cascades

### First-class intake capture
- Every saved intake field is preserved on the request as:
  - `intake.fieldValues`
  - `intake.fieldIndex`
- Trade-specific fields like `pool_configuration`, `gate_code`, `pet_present`, `pet_name`, and `water_loss_rate` are queryable from the saved request object.

### Downstream propagation
- Every intake field carries a per-surface visibility map:
  - `request`
  - `quote`
  - `job`
  - `visit`
  - `invoice`
- Default visibility is on for every surface.
- Staff can patch field visibility on the request detail screen or through `PATCH /api/crm/requests/:id`.
- When a request converts:
  - quote receives `requestId` plus the full `intake` snapshot
  - job receives `requestId` plus the full `intake` snapshot
  - invoice receives `requestId` plus the same `intake` snapshot when it is later created from the quote
- Visit is modeled in the visibility contract now, but visit-specific UI/workflow is still part of later lifecycle pieces.

### Client and property matching
- Auto-match only happens on:
  - exact email
  - exact phone
- No loose name/address guessing is allowed.
- If a client match is found, manual review is still required.
- If an existing client is matched or selected and the property address is new:
  - the property is added under the matched/selected client
  - a duplicate client is not created

### Notifications
- On request creation:
  - OWNER and OFFICE_ADMIN recipients are collected from `tenantUsers`
  - an admin notification email is queued/sent if the comms rail is available
  - a client confirmation email is queued/sent if the request includes an email and the comms rail is available
- Notification timestamps are stored back onto the request under `notifications`.

### Review state
- Marking a request reviewed stores `reviewedAt`.
- Review also clears `match.reviewRequired`.

## Current deliberate limits

- Request creation itself is still a direct write when validation passes. The new chat-native approval flow currently applies to ApprovalQueue-backed writes like client creation, not to every request save.
- Requests do not yet drive quote/job/invoice reminder state machines.
- Direct-to-job conversion carries request narrative/context only and does not auto-create billable line items.
- Tax hierarchy, reminder engines, visit automation, and ledger behavior are separate later pieces.
