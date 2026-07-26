# NexReach

Last updated: 2026-07-20  
Build piece: NexReach marketing engine

## Statuses

### Eligibility statuses

#### `eligible`
- Closed job belongs to a client with marketing consent enabled.
- Job can enter owner-triggered or batch draft generation.

#### `drafted`
- NexReach already generated one or more drafts for the closed job.
- Eligibility record keeps `draftIds` so the job is not treated like untouched backlog.

#### `blocked_consent`
- Client marketing consent is off.
- The closed job is excluded from generation at the data layer.

### Draft statuses

#### `approval_pending`
- Draft exists and is parked behind ApprovalQueue.
- OWNER can approve or discard.
- OFFICE_ADMIN can revise and restate for approval.

#### `publish_ready`
- ApprovalQueue approval executed successfully.
- Draft is ready for manual owner use:
  - showcase assembly
  - copy/export bundle
  - future provider-adapter publishing

#### `rejected`
- Draft was discarded or superseded by a revision cycle.
- The rejected draft stays in history; it is not treated as active inventory.

### Showcase statuses

#### `live`
- Approved draft has been assembled into a public-facing showcase.
- Showcase is eligible to appear on the public portfolio page.

#### `review_required`
- Consent was revoked after the showcase went live.
- Showcase is flagged for owner review instead of being silently deleted.

## Transitions

### Closed job -> `eligible` or `blocked_consent`
- Triggered by `NexReachService.syncEligibility(...)`.
- Source jobs are filtered through the real closed-job rail.
- Consent ON yields `eligible`.
- Consent OFF yields `blocked_consent`.

### `eligible` -> `drafted`
- Triggered by `generateJobContent(...)`.
- Draft generation is on-demand or batch-driven, not forced immediately on every closeout.
- Current implemented cadence default is `owner_on_demand`.

### Draft `approval_pending` -> `publish_ready`
- Triggered by approval execution through:
  - `NexReachService.approveDraft(...)`
  - `ContentApprovalExecutor.execute(...)`
- This is approval-only state movement; no external platform publishing happens in v1.

### Draft `approval_pending` -> `rejected`
- Triggered by:
  - `discardDraft(...)`
  - `reviseDraft(...)` rejecting the prior approval item before re-queuing the edited draft

### Showcase `live` -> `review_required`
- Triggered by `handleConsentChange(...)` when marketing consent flips OFF.
- Existing live showcase items are surfaced to the owner for action.

## Triggers

### Intake + client profile consent
- Request forms can carry `marketing_consent`.
- Client records expose a staff-side marketing consent toggle after intake.
- Consent defaults OFF when absent.

### Generation entry points
- `POST /api/nexreach/jobs/:id/generate`
- Nexi tool: `generateJobContent`
- Both paths hard-block non-consented jobs.

### Approval queue
- `GET /api/nexreach/drafts`
- `GET /api/nexreach/drafts/:id`
- `PATCH /api/nexreach/drafts/:id`
- `POST /api/nexreach/drafts/:id/discard`
- `POST /api/nexreach/drafts/:id/approve`
- Nexi tools:
  - `listPendingDrafts`
  - `approveDraft`
  - `discardDraft`
  - `revisePendingDraftApproval`

### Settings / tone control
- `GET /api/nexreach/settings`
- `POST /api/nexreach/settings`
- Current tenant-managed settings:
  - `toneNotes`
  - `serviceAreaLine`
  - `licenseLine`
  - `ctaLine`

### Showcase and portfolio
- `POST /api/nexreach/showcases`
- `GET /api/nexreach/showcases`
- `GET /api/nexreach/reviews`
- `POST /api/nexreach/portfolio-link`
- `GET /nexportal/portfolio/:tenantId`

### Audience pool
- `GET /api/nexreach/audience`
- `GET /api/nexreach/audience.csv`
- Nexi tool: `listConsentedClients`

## Cascades

### Privacy enforcement
- Public draft copy is scrubbed to locality-level only.
- Street-address-like and GPS-like strings are removed from:
  - body copy
  - captions
  - service-type metadata carried onto public surfaces
- Hidden or trashed media never enter the selected public asset set.

### Photo selection
- Candidate media comes from the NexCam media rail, filtered by:
  - same job
  - photo type only
  - not hidden from client
  - not trashed
- Before/after pairs are prioritized when available.
- Draft selection notes record whether a before/after pair was found.

### Approval discipline
- Every generated draft creates a real ApprovalQueue item.
- Approval marks content `publish_ready`; it does not auto-publish anywhere.
- Owner manual use in v1 means:
  - create a showcase
  - copy bundle text
  - download the watermarked asset bundle

### Review display layer
- Review candidates come from the existing reviews domain.
- Only review items rated 4+ are offered as default showcase candidates.
- Showcase assembly stores the selected review ids, and the public portfolio renders only those selected items.

### Public portfolio access
- Portfolio link is revocable because it depends on the tenant settings token hash.
- Public portfolio page uses the shared tenant-branding resolver path.
- Current v1 URL pattern is the shared NexPortal host path, not a custom domain.

### Audience pool behavior
- Audience list is derived from closed jobs plus client marketing consent.
- Segmentation filters currently support:
  - service type
  - locality
  - closed-since date
- CSV export mirrors the same filtered audience.

## Current deliberate limits

- Direct publishing to GBP or social APIs is not live in v1.
- Provider seams exist, but credentials/adapters remain unwired.
- Platform-specific formatting is deferred; social output is currently short-caption + long-post variants only.
- Campaign sending is deferred; v1 stops at consented audience visibility/export, not broadcast delivery.
- Custom-domain handling for the public portfolio is deferred.
- 2026-07-20: D1 atomic quote/deposit behavior is proven in the lifecycle command-map layer but still needs a real runtime payment-execution proof in the quote/payment execution suite before that policy is considered fully end-to-end verified.
