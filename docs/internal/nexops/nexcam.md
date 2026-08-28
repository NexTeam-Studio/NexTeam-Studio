# NexOps NexCam Field Rail

Last updated: 2026-08-28  
Build piece: NexCam complete-build closure: native checklist, media, report, Nexi, and client-hub rails

## Completion record

- NexCam is the locked product name; legacy documentation uses this name rather than `NexLens`.
- The default seeded template is `leak_detection_checklist_v1`, derived from the existing Aquatrace R1–R10 extraction contract rather than a second extraction path.
- The authoritative runtime Page routes are `/nexcam`, `/nexcam/templates`, `/nexcam/photos`, and `/nexcam/reports`.
- The Page Template and Layout Part taxonomy for the surrounding NexSuite shell is maintained in `DESIGN-HIERARCHY.md`.  NexCam supplies field-work content into that shared product structure; it does not own a separate header or sidebar implementation.
- Direct public share links remain deliberately deferred. PDF download, receipt attachment, direct email attachment, and client-hub Documents/Appointments delivery are the current supported report-delivery paths.

## Statuses

### Capture batch statuses

#### `draft`
- Fresh NexCam session with a batch shell that has not been intentionally routed yet.
- First-photo capture can still branch to:
  - new client request
  - existing client
  - decide later

#### `unassigned`
- Staff explicitly chose `Decide Later`.
- Batch remains visible in the unassigned inbox until it is routed onto a client/request rail.

#### `assigned`
- Batch has been routed to:
  - an existing client, optionally narrowed to a job or visit
  - a newly created request/client context
- Further uploads on the same batch inherit that stored assignment automatically.

### Checklist statuses

#### `draft`
- Default state when a checklist is created from a template for a job or visit.
- Property-memory fields can prefill from the property's most recent completed checklist while visit-memory fields start blank.

#### `completed`
- Set when the checklist is explicitly completed.
- Completion writes property-memory fields back onto the property record under `property.fieldDocs.persistentChecklistValues`.

### Report statuses

#### `draft`
- Report exists but is not yet treated as posted/client-shareable.

#### `posted`
- Report PDF is ready for closeout receipt attachment, staff rail display, and client-hub visibility unless the job has been opted out.

### Signed document statuses

#### `pending_signature`
- Staff has created the document shell, but the client or field staff signer has not signed yet.

#### `signed`
- Signature payload, timestamp, and signer IP are attached.
- The generated PDF is retrievable from the same fielddocs rail and can appear in the client hub when the related job remains client-visible.

## Transitions

### Template library -> checklist instance
- Triggered by:
  - `POST /api/fielddocs/checklists`
  - NexCam staff UI checklist create flow
  - Nexi `generateVisitReport` path after a checklist exists
- Result:
  - a real checklist instance tied to a template
  - optional `jobId`
  - optional `visitId`
  - resolved `propertyId`

### Checklist `draft` -> `completed`
- Triggered by:
  - `PATCH /api/fielddocs/checklists/:id`
  - NexCam checklist completion flow
- Result:
  - property-memory values persist to the property
  - visit-memory values stay only on that visit checklist

### Capture batch `draft -> unassigned`
- Triggered by:
  - `POST /api/fielddocs/capture-batches/:id/assign` with `mode = "decide_later"`
  - NexCam `Decide Later` branch
- Result:
  - media remains unattached to client/job/visit rails
  - original GPS anchor and latest capture time stay visible in the inbox row

### Capture batch `draft|unassigned -> assigned (existing client)`
- Triggered by:
  - `POST /api/fielddocs/capture-batches/:id/assign` with `mode = "existing_client"`
  - NexCam Existing Client branch
- Result:
  - batch records `assignedClientId`
  - optional `assignedJobId` / `assignedVisitId`
  - media lands on the client rail immediately
  - later `Move to job/visit` can promote a direct client capture onto a job or visit

### Capture batch `draft|unassigned -> assigned (request)`
- Triggered by:
  - `POST /api/fielddocs/capture-batches/:id/assign` with `mode = "request"`
  - request-form submit success callback from the NexCam New Client path
- Result:
  - the request receives/merges `request_images`
  - client/property materialization runs through the same request-foundation rules as Piece 1
  - media lands on the newly created client rail
  - the same active batch remains usable for continued capture without showing the three-way chooser again

### Reopened unassigned batch -> same batch, more media
- Triggered by:
  - `Reopen` from the unassigned inbox
  - `Continue unassigned batch` from the capture entry point
- Result:
  - new photos attach to the same batch id
  - `originGps` stays pinned to the first capture in that batch
  - `latestGps` moves forward with the most recent reopened capture
  - `Done` returns the batch to the inbox unchanged unless it is routed during that continued session

### Posted field report -> receipt attachment
- Triggered by invoice payment / receipt-review creation for a job that already has a posted field report.
- Result:
  - receipt review includes the real report PDF attachment
  - outbound receipt email sends the actual PDF bytes, not just a placeholder seam

### Pending signed document -> signed document
- Triggered by:
  - `POST /api/fielddocs/signed-documents/:id/sign`
  - NexOps job-detail signature capture modal
- Result:
  - the stored record moves to `signed`
  - typed or drawn signature evidence is saved on the document
  - signer IP and `signedAt` timestamp are persisted
  - the PDF route renders the completed proof record

### Job visibility on -> off for client hub
- Triggered by job update setting `clientVisibility.hideFieldDocsFromPortal = true`.
- Result:
  - client-hub Documents and Appointments pages stop showing that job's field reports and photos
  - staff rails remain available in NexOps and NexCam

## Triggers

### Template library
- `GET /api/fielddocs/checklists/templates`
- `POST /api/fielddocs/checklists/templates`
- Seeded default:
  - `leak_detection_checklist_v1`

### Checklist instance routes
- `GET /api/fielddocs/checklists`
- `POST /api/fielddocs/checklists`
- `PATCH /api/fielddocs/checklists/:id`

### Media and report routes
- `POST /api/fielddocs/uploads/sessions`
- `POST /api/fielddocs/uploads`
- `POST /api/fielddocs/capture-batches`
- `GET /api/fielddocs/capture-batches`
- `POST /api/fielddocs/capture-batches/:id/assign`
- `GET /api/fielddocs/clients/:id/targets`
- `GET /api/fielddocs/media`
- `GET /api/fielddocs/reports`
- `GET /api/fielddocs/reports/:id/pdf`
- `GET /api/fielddocs/search`
- `GET /api/fielddocs/signed-documents`
- `POST /api/fielddocs/signed-documents`
- `POST /api/fielddocs/signed-documents/:id/sign`
- `GET /api/fielddocs/signed-documents/:id/pdf`

### Staff read rails
- NexOps client detail rail reads:
  - `/api/fielddocs/media?clientId=...`
  - `/api/fielddocs/reports?clientId=...`
- NexOps job detail rail reads:
  - `/api/fielddocs/media?jobId=...`
  - `/api/fielddocs/reports?jobId=...`
- NexOps schedule visit rail reads:
  - `/api/fielddocs/media?visitId=...`
  - `/api/fielddocs/reports?visitId=...`

### Client hub read rails
- NexPortal Documents page reads posted field reports and shared photos from the same fielddocs repository.
- NexPortal Documents page also reads signed field documents when:
  - the document is in `signed` status
  - the related job is still client-visible
- NexPortal Appointments page surfaces visit-scoped shared photos/reports for that visit.

## Cascades

### Template library is real, not one hardcoded checklist
- The seeded Aquatrace leak-detection checklist now lives inside the reusable template library.
- Custom templates can be created and saved beside it.
- Template fields carry:
  - `type`
  - `memory`
  - `section`
  - `required`
  - `photoRequiredDefault`
  - optional `options`
  - optional `unit`

### Checklist v2 controls
- Sections can now opt into `allowNa` at template level.
- Live checklist instances can mark those sections `not_applicable` without blocking completion.
- Field-level `photoRequired` carries from template default into the live checklist instance and can be overridden per instance without changing the template.
- Job-type bundles can now auto-attach:
  - one checklist template
  - one report template
  when a matching job is created.

### Property-memory vs visit-memory split
- `memory = "property"` fields:
  - persist to the property record
  - prefill on future checklists for that same property only
  - never cross-fill another property under the same client
- `memory = "visit"` fields:
  - remain local to the current checklist/visit
  - always start blank on a future visit

### Field types currently live
- `multi_select`
- `count`
- `measurement`
- `pass_fail`
- `free_text`
- `photo_attachment`

### Photo organization and scoping
- Media records can be filtered by:
  - client
  - property
  - job
  - visit
  - date range
- Visit scope is the primary container for client-shared field items.
- NexCam now adds a true client-level media tier above job/visit:
  - direct client captures can exist with no job or visit
  - job/visit-scoped captures still roll up into the same client media view
  - the client media view is intentionally mixed, but direct client captures and work-scoped captures are labeled distinctly
- `Move to job/visit` is a later reassignment action, not a second upload path:
  - a client-level capture can be promoted onto a job or visit later
  - the underlying client ownership remains intact
- GPS/timestamp EXIF data is preserved when present on upload.
- Capture batches now keep two GPS concepts deliberately separate:
  - `originGps` = the original anchor from the first photo in that batch
  - `latestGps` = the newest capture location if the batch is reopened later somewhere else
- Media review now supports:
  - AI tags/caption
  - manual tags
  - before/after pairing
  - per-photo comments
  - per-photo client hide within an otherwise visible job
  - soft trash with restore
  - saved drawn markup paths on the photo review surface
  - gallery/list views at client, job, visit, and date-range scope
- Trashed media currently carries a 30-day purge marker unless restored first.

### Capture-session UI behavior
- Fresh capture session:
  - can take multiple photos before any routing choice is forced
  - each photo can optionally open the existing markup tool immediately
  - `Done` is the routing gate that opens `New Client / Existing Client / Decide Later`
- Session filmstrip:
  - bottom thumbnail carousel is session-scoped only
  - tapping a thumbnail reopens that same existing markup tool on that photo
  - markup saved from the carousel and markup saved immediately after capture both persist onto the same photo record
- Reopened batch:
  - can be continued from the inbox or capture entry point
  - keeps its original assignment state unless staff explicitly reroutes it
  - `Done` does not reopen the three-way chooser; it returns the batch to its prior inbox state

### AI tagging behavior
- Upload flow runs through the generic vision pipeline when approved credentials are present.
- `FIELD_DOCS_VISION_ENABLED=true` can force the rail on for local/dev proof.
- `FIELD_DOCS_VISION_ENABLED=false` is the only explicit force-off switch.
- Search is generic and queryable through the shared fielddocs search path rather than a Nexi-only special case.
- Cost-cap and human-correction workflows remain in place.

### Client visibility default
- Field reports and photos are visible to the client by default.
- Owner/admin can hide a job's NexCam field rail from the client hub with `clientVisibility.hideFieldDocsFromPortal`.
- Owner/admin can also hide one specific photo from the client while leaving the rest of the job visible.
- Technician role does not get the client-visibility control.
- Client-facing media surfaces intentionally show date/time only; GPS coordinates remain staff-side only even when EXIF GPS is stored internally.

### Report delivery
- Reports render through the dedicated field-report PDF renderer today, not the quote/invoice PDF renderer.
- This is an intentional current divergence because field reports are checklist/media-first rather than commercial-document-first.
- Even with that dedicated renderer, the downstream delivery path is real:
  - closeout receipt review can attach the report
  - outbound receipt email sends the generated PDF bytes
  - client hub can open the same report PDF route

### Report templates, snippets, and recap output
- Tenant-managed text snippets can be attached to report-template sections and inserted into live report composition.
- Report templates can default watermark behavior on or off.
- Watermark output resolves through the shared tenant-branding resolver instead of a second branding input.
- NexCam now supports two report kinds on the same rail:
  - `field_report`
  - `ai_recap`
- AI recap documents summarize photo captions/tags plus checklist completion into a shareable document on the same PDF rail.

### Signed document storage
- Arbitrary signed documents (completion signoff, waiver, change order, custom) live in the NexCam field repository, not in quotes or a separate docs silo.
- They can attach to:
  - client
  - job
  - property
  - visit
- Completed records are reachable from:
  - NexOps client detail
  - NexOps job detail
  - NexPortal documents, when client-visible

### Capture-session continuation
- New Client branch:
  - camera -> capture one or more photos -> route into the existing request form
  - successful request submit returns straight to capture mode
  - continued photos in that same session attach directly to the created client/request context
  - `Done` is the explicit exit that clears the session and causes the next camera open to show the three-way chooser again
- Existing Client branch:
  - camera -> choose client -> optional job/visit targeting
  - later photos in that same session stay on that chosen client unless manually moved
- Decide Later branch:
  - session parks in the unassigned inbox with GPS + capture time
  - OWNER/OFFICE_ADMIN sees all tenant batches
  - TECHNICIAN sees at least their own created batches

## Nexi tools

- `photoSearch`
- `beforeAfterPairs`
- `listRecentPhotos`
- `getPropertyHistory`
- `generateVisitReport`
- `getVisitReport`
- `listUnassignedPhotoBatches`
- `assignPhotoBatch`

Current behavior:
- Nexi can search photos by natural-language metadata/tags.
- Nexi can read property-specific checklist history across visits.
- Nexi can generate a visit report from a completed checklist and fetch that report later.
- Nexi can list unassigned NexCam capture batches with role-scoped visibility.
- Nexi can attach an unassigned batch either to:
  - an exact existing client
  - a newly created request/client context

## Current deliberate limits

- Public share-link delivery for reports/media packages is deferred and tracked in `NEXTEAM-FUTURE-FEATURE-IDEAS.md`.
- Client-consent gating for marketing/content reuse of photos is not built in this pass.
- The field-report PDF renderer is still separate from the quote/invoice/receipt renderer family; this is documented intentionally rather than silently collapsed.
- Signed-document create/sign flows are live in NexOps, but no separate Nexi toolset is exposed for them yet.
