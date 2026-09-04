# NexTeam Build Worklog

Living handoff file for Claude/Nova/Atlas-style daily coordination. Update this file on each meaningful build pass, test pass, receipt, or owner decision so the next session can catch up without reconstructing context from chat.

## Build-Time Estimate — 2026-09-02

- Owner-approved cumulative estimate: **700 hours** of NexTeam/NexOps build work as of September 2, 2026.
- This is a planning estimate, not a time-clock total: it carries forward the earlier approximately 500-hour estimate and the agreed daily-average estimate since July 10, 2026.

## 2026-07-11 - NexTeam brand assets and New Client proof screen

### Owner Decisions Applied
- Final NexTeam design system supersedes the prior NexOps/Aquatrace-heavy visual direction.
- Primary product palette is the NexTeam lime-to-green gradient: `#D4FF20` to `#25D238`.
- Flat green fallback is `#A8E600`.
- Support colors are deep navy/charcoal, white, and silver/light gray.
- Montserrat is the site-wide product font.
- NexOps/NexCam should feel like NexTeam products, not Jobber clones and not Aquatrace-branded dashboards.
- The New Client modal is the proof-of-concept screen before the system rolls out broadly.

### Brand Assets Saved
- Source `C:\Users\Peyto\Downloads\ChatGPT Image Jul 11, 2026, 01_00_36 PM (1).png` saved as `apps/web/public/assets/brand/nexteam-icon.png`, served at `/assets/brand/nexteam-icon.png`.
- Source `C:\Users\Peyto\Downloads\ChatGPT Image Jul 11, 2026, 01_00_36 PM (2).png` saved as `apps/web/public/assets/brand/nexteam-lockup-horizontal.png`, served at `/assets/brand/nexteam-lockup-horizontal.png`.
- Source `C:\Users\Peyto\Downloads\ChatGPT Image Jul 11, 2026, 01_00_36 PM (3).png` saved as `apps/web/public/assets/brand/nexteam-wordmark.png`, served at `/assets/brand/nexteam-wordmark.png`.
- Canonical icon decision: use the standalone icon file `nexteam-icon.png` as the single canonical icon shape for app icon, favicon, sidebar mark, and all composed UI lockups. The horizontal lockup remains saved as a brand asset, but product UI composes the canonical icon plus wordmark to avoid two slightly different icon crops.

### Built This Pass
- Added reusable NexTeam lockup rendering from the canonical icon and wordmark assets.
- Rebuilt the NexOps New Client modal header as the proof screen for the final NexTeam design system.
- Added NexTeam product CSS tokens and Montserrat import.
- Updated NexOps and NexCam product chrome to use NexTeam-owned palette/font tokens rather than tenant colors.
- Updated NexOps and NexCam sidebars to show the NexTeam lockup plus module name.
- Updated default tenant branding font fallback to Montserrat so new tenant-facing surfaces do not revert to serif typography.

### Reality Gate Status
- This is not a full site-wide rollout yet. It is the requested proof screen for owner approval before applying the system across NexOps and NexCam.

## 2026-07-11 - NexOps New Client form polish

### Owner Decisions Applied
- NexOps UI should use a non-serif font throughout.
- NexOps business screens should feel like a clean field-service CRM, not a Nexi chat card.
- New Client entry should use rounded text boxes for all fields, with a Jobber-like section layout.
- Primary-contact additional fields and property additional fields must both be available in NexOps.
- Parent client owns billing/correspondence by default; property contacts are property-scoped and do not receive parent-client correspondence unless later configured.

### Built This Pass
- Changed global app typography and NexOps typography to a sans-serif stack.
- Reworked the NexOps New Client form into sectioned CRM layout:
  - Primary contact details
  - Communication
  - Lead information
  - Additional client details
  - Additional contacts
  - Property address
  - Optional separate billing address
  - Property details
  - Property contacts
- Added rounded input/select boxes for every visible entry field.
- Added property fields matching the Jobber reference screenshots:
  - Site name
  - Gated Entry
  - Gate Entry Code(s)
  - Property Client Name
  - Property Client Telephone Number
  - Property Client eMail Address
  - CompanyCam Project
  - Property custom field name/value
- Added client custom field name/value, payment terms, ask-for-review, role, and additional contact fields.
- Extended native CRM schema so optional `customFields` can be saved on clients and properties.
- Updated `/api/crm/clients` so creating a client can also create the first native property/site record from the same form submission.

### Verification
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run check:secrets` passed.
- `node --test apps/server/test/crm-read-side.test.mjs` passed: 11/11.

## 2026-07-10 - NexOps + NexCam Phase 1 scaffold pass

### Source Of Truth Read
- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- Latest owner order: complete NexOps + NexCam Phase 1, start by closing the real-data sync gap.

### Owner Decisions Applied
- NexOps is the Jobber-style business engine: CRM, quoting, scheduling, invoicing, payments, portal, visit closeout.
- NexCam is the CompanyCam-style field documentation module: checklist templates, photos, reports.
- Client display rule: first-name/last-name by default; when company name exists, default display to company while preserving the person fields and allowing a display toggle.
- Multi-site rule: parent client owns billing/correspondence; properties/sites can have local contacts, but correspondence defaults to the parent client unless explicitly changed.
- Communication rule: email and SMS are independent toggles. SMS starts as one-way outbound unless the tenant upgrades to two-way.
- Branding rule: tenant dashboards use tenant branding when provided, with NexTeam/NexOps defaults and future white-label provision.

### Built This Pass
- Standalone NexOps web surface at `/nexops` with module navigation separate from Nexi chat.
- NexOps client workspace with Jobber-style list/detail layout, client metrics, create-client drawer, import/sync panel, approvals link, and module placeholders for the Phase 1 business engine.
- Jobber read-only sync control in the NexOps UI: dry-run first, then write native NexOps records without writing back to Jobber.
- CRM read routes for clients/properties/jobs/quotes/invoices feeding the NexOps UI from the shared native CRM repository.
- ApprovalQueue create-client execution path verified to write to the same native CRM repository read by the NexOps client card.
- Standalone NexCam web surface at `/nexcam` with overview, checklist templates, media search, and report generation panels.
- NexCam leak-detection checklist template shaped around Aquatrace visit data, report needs, and property/visit memory.
- NexCam report creation UI wired to the existing FieldDocs report endpoint.
- Mobile/responsive layout rules for the new NexOps/NexCam grids.
- NexOps lifecycle modules now show native records where available instead of placeholder-only panels:
  requests from lead clients, quotes, jobs, invoices, and paid invoice/payment records.

### Verification
- `npm run typecheck` passed.
- `npm --workspace @nexteam/web run build` passed.
- `npm run check:secrets` passed.
- Targeted live-path tests passed: `node --test apps/server/test/crm-read-side.test.mjs apps/server/test/fielddocs-read-side.test.mjs apps/server/test/nexi-job-desk.test.mjs`
- Targeted result: 100/100 tests passing.
- Second post-polish verification: `npm run typecheck` and `npm --workspace @nexteam/web run build` passed again after lifecycle record rendering was added.

### Reality Gate Status
- Not complete to final Phase 1 definition yet because this pass has not been deployed to staging and has not produced live owner-facing receipts.
- Next required receipt: run NexOps Jobber dry-run/write against staging and confirm real Aquatrace client rows populate in `/nexops/clients`.
- Next required receipt: open `/nexcam`, create or view a checklist/report path, and confirm the result is visible/retrievable from the UI.

### Next Work
- Deploy current branch to staging after final local verification.
- Run real Jobber sync with read-only provider access and confirm expected Aquatrace client counts.
- Continue NexOps pieces 3.3-3.6: quote builder, approval-to-scheduling, NexPortal, and visit closeout.
- Continue NexCam pieces: real upload/capture flow, inline photo viewer, report PDF polish, and checklist-to-report handoff.

## 2026-07-10 - Phase 1 staging receipt pass

### Deploy Receipt
- Deployed commit `f2aef5d5f650a2c7a0be2892e5ae8b8878e58734` to Railway staging.
- `/api/version` matched `f2aef5d5f650a2c7a0be2892e5ae8b8878e58734`.
- `/api/health` was green for Jobber, CompanyCam, Comms, and Anthropic configured/no-spend health.
- Receipt: `receipts/phase1/staging-version-health-nexops-nexcam-20260710.json`.

### NexOps Live Data Receipt
- `/api/crm/clients?tenantId=aquatrace` returned `1,327` real Aquatrace client records with Jobber external IDs.
- This proves the deployed read surface is populated with real native CRM/Jobber-backed data, not the earlier placeholder record.
- Receipt: `receipts/phase1/nexops-live-clients-20260710.json`.

### ASP Of Asheville Hierarchy Receipt
- ASP of Asheville was found in the live client list.
- `/api/crm/properties?tenantId=aquatrace` and `/api/crm/jobs?tenantId=aquatrace` showed `41` ASP properties and `34` ASP jobs.
- Hierarchy confirmed from live records.
- Receipt: `receipts/phase1/nexops-asp-hierarchy-20260710.json`.

### NexCam Report Receipt
- Created a live NexCam checklist/report record using Deborah Justice CompanyCam checklist-derived data.
- Generated a real PDF from the staging report route: `%PDF-1.4`, `3,665` bytes, saved at `receipts/phase1/nexcam-deborah-justice-report-20260710.pdf`.
- Receipt: `receipts/phase1/nexcam-report-live-20260710.json`.

### Open Blockers
- Authenticated `/nexops` screenshot is blocked from this runner because staging does not expose an operator password to automation. The unauthenticated screenshot correctly shows the Firebase sign-in wall, saved at `receipts/phase1/nexops-clients-staging-screenshot-20260710.png`. API receipts prove the data; owner/browser or a dedicated service-account browser-auth path is needed for the signed-in UI screenshot.
- Full live regression wall is not complete. Local run failed before reaching Nexi because the proof runner lacked `VITE_FIREBASE_API_KEY`. Railway-env run reached staging and passed the first `32/32` cases with `0` failures, but did not complete before the 30-minute tool limit. Orphaned wall processes were stopped to avoid continued spend. Partial receipt: `receipts/phase1/nexi-regression-wall-live-20260710.json`.
