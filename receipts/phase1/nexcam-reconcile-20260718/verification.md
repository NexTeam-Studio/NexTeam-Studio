# NexCam Reconcile + Build Verification

Date: July 18, 2026  
Worktree: `C:\Users\Peyto\NexTeam-Studio-worktrees\nightly-integration-20260709`  
Scope source: `C:\Users\Peyto\Downloads\NEXCAM-RECONCILE-AND-BUILD-PROMPT.md`

## Step Zero Inventory

This is the reconstructed Step Zero inventory against the real fielddocs module state at the start of this reconcile pass, before the final gap-fill work below.

| Section | Step Zero finding | Evidence at start |
| --- | --- | --- |
| A. Checklist template system | `ALREADY BUILT AND MATCHES SPEC` | `apps/server/src/fielddocs/checklists.ts:5-324`, `apps/server/src/fielddocs/fieldDocsService.ts:59-156`, `apps/server/test/fielddocs-template-library.test.mjs:57`, `:99` |
| B. Photo organization | `ALREADY BUILT BUT NEEDS GENERALIZING/CHANGING` | GPS/timestamp, before/after, search, uploads, and AI pipeline existed, but there was no saved per-photo review surface for comments/markup and the request-form upload path was not sending `imageBase64`/`imageMime` into the live vision path. Evidence: `apps/server/src/fielddocs/uploadService.ts:37-92`, `apps/server/src/fielddocs/photoSearch.ts:1-69`, `apps/server/test/fielddocs-read-side.test.mjs:54-169` |
| C. Viewability integration | `ALREADY BUILT AND MATCHES SPEC` | Staff client/job/visit rails plus client-hub visibility/default-visible rule were already present. Evidence: `apps/web/src/main.tsx:2287-2326`, `apps/web/src/nexopsJobs.tsx:1249-1335`, `apps/web/src/nexopsSchedule.tsx:517-537`, `:877-931`, `apps/server/test/client-hub-review-followup.test.mjs:532` |
| D. Reports | `ALREADY BUILT AND MATCHES SPEC` | Real report route, PDF render, date filtering, and receipt-review attachment seam already existed. Evidence: `apps/server/src/fielddocs/routes.ts:431-605`, `apps/server/test/fielddocs-read-side.test.mjs:114`, `apps/server/test/fielddocs-template-library.test.mjs:165`, `apps/server/test/close-invoice-payment-flow.test.mjs:615` |
| E. Repeat-client variable transfer | `ALREADY BUILT BUT NEEDED LIVE PROOF` | Property-memory and visit-fresh behavior already existed in code/test, but the prompt required a real receipt artifact beyond unit coverage. Evidence: `apps/server/src/fielddocs/fieldDocsService.ts:37-53`, `:99-156`, `apps/server/test/fielddocs-template-library.test.mjs:99` |
| F. Visual restraint | `ALREADY BUILT BUT NEEDED GENERALIZING/CHANGING` | Checklist section disclosure and mobile-first field sizing existed, but photo/media review was still too card-only and lacked a focused one-task surface. Evidence: `apps/web/src/main.tsx:3513-3517`, `apps/web/src/styles.css:3440-3519` |
| G. Nexi tooling | `ALREADY BUILT BUT NEEDED GENERALIZING/CHANGING` | The tools existed, but the local Nexi chooser was not reliably routing real chat prompts into the fielddocs toolset. Evidence: `apps/server/src/fielddocs/nexiTools.ts:1-236`, `apps/server/test/fielddocs-nexi-tools.test.mjs:73`, `:108` |

## What Changed In This Pass

1. Added shared media review data to the native media schema:
   - `packages/core/src/types.ts:543-568`
   - `packages/core/src/schemas.ts:1064-1093`
   - New fields: `comments[]`, `annotations[]`

2. Added real media review routes:
   - `GET /api/fielddocs/media/:id`
   - `PATCH /api/fielddocs/media/:id`
   - File: `apps/server/src/fielddocs/routes.ts:315-375`

3. Added saved per-photo review behavior:
   - per-photo comments
   - saved drawn markup paths
   - comment text also feeds metadata search
   - Files:
     - `apps/server/src/fielddocs/routes.ts:332-375`
     - `apps/server/src/fielddocs/photoSearch.ts:17-31`

4. Fixed the HTTP NexCam search contract so the UI gets flat media hits instead of nested `{ media, score, matched }` wrappers:
   - `apps/server/src/fielddocs/routes.ts:261-270`

5. Added a real photo review surface in NexCam:
   - photo review modal
   - draw-markup mode
   - saved comments
   - open-original action
   - Files:
     - `apps/web/src/main.tsx:3709-3711`, `4398-4490`
     - `apps/web/src/styles.css:4857-4900`

6. Closed the live AI-tagging upload seam on request-form uploads:
   - request-form image uploads now send `imageBase64` and `imageMime`, matching Job Desk uploads
   - `apps/web/src/nexopsRequests.tsx:597-606`

7. Updated living docs:
   - `apps/server/src/fielddocs/README.md:1-9`
   - `docs/internal/nexops/fielddocs.md`
   - `NEXTEAM-FUTURE-FEATURE-IDEAS.md:33-37`

8. Branding follow-up plus live-route seam fix:
   - Added shared product-brand resolver:
     - `apps/web/src/productBranding.tsx`
   - Added canonical static logo directory:
     - `apps/web/public/assets/brand/`
   - Wired live NexOps, NexCam, NexPortal, and Nexi placements:
     - `apps/web/src/main.tsx`
     - `apps/web/src/nexopsJobs.tsx`
     - `apps/web/src/nexopsSchedule.tsx`
     - `apps/server/src/crm/portalHubHtml.ts`
     - `apps/server/src/crm/quotePdf.ts`
   - Fixed a real runtime seam caught by the branding proof pass:
     - `AuthGate` was passing an out-of-scope `clients` variable into `NexCamPage`, leaving `/nexcam` blank until the page self-loaded its own client list.
     - Fix: `apps/web/src/main.tsx:3025-3123`, `5011-5019`

## Per-Decision Confirmation

### A. Checklist template system

`BUILT AND CONFIRMED`

- Template library is real, plural, and reusable.
  - Code: `apps/server/src/fielddocs/checklists.ts:180-200`, `apps/server/src/fielddocs/fieldDocsService.ts:59-76`
  - UI: `apps/web/src/main.tsx:3864-3964`, `4073-4192`
  - Tests: `apps/server/test/fielddocs-template-library.test.mjs:57`
- Field types are live:
  - `multi_select`, `count`, `measurement`, `pass_fail`, `free_text`, `photo_attachment`
  - Code: `apps/server/src/fielddocs/checklists.ts:5-24`
- Property/visit picker is explicit, not auto-detected:
  - Code: `apps/server/src/fielddocs/checklists.ts:13-24`
  - UI picker: `apps/web/src/main.tsx:3918`, `4162`
- Property-persistent values live on the property record:
  - Code: `apps/server/src/fielddocs/fieldDocsService.ts:37-53`, `133-137`
  - Tests: `apps/server/test/fielddocs-template-library.test.mjs:99`

### B1. Timestamp + GPS

`BUILT AND CONFIRMED`

- Upload schema captures `capturedAt` and `gps`.
  - Code: `apps/server/src/fielddocs/uploadService.ts:8-19`, `41-54`
- Stored as EXIF metadata on media.
  - Code: `packages/core/src/types.ts:552-568`, `packages/core/src/schemas.ts:1073-1093`
- Test proof:
  - `apps/server/test/fielddocs-read-side.test.mjs:89`
  - Raw wall test: `upload service creates native storage refs, thumbnails, and EXIF metadata`

### B2. Client -> job -> visit organization

`BUILT AND CONFIRMED`

- Media filters by client/property/job/visit/date.
  - Code: `apps/server/src/fielddocs/routes.ts:267-313`
- Staff visit rail exists on Schedule, isolated by visit.
  - UI: `apps/web/src/nexopsSchedule.tsx:517-537`, `877-931`
- Job rail exists and stays job-scoped.
  - UI: `apps/web/src/nexopsJobs.tsx:1249-1335`
- Test proof:
  - `apps/server/test/fielddocs-template-library.test.mjs:165`
  - Raw wall test: `fielddocs media and report routes filter by client, visit, and date range`

### B3. Annotate/draw, tag, comment, before/after, gallery

`BUILT AND CONFIRMED`

- Tag/caption search and before/after pairing:
  - Code: `apps/server/src/fielddocs/photoSearch.ts:1-69`
  - Tests: `apps/server/test/fielddocs-read-side.test.mjs:54`, `106`, `159`
- Gallery/list views:
  - UI: `apps/web/src/main.tsx:3994-4045`, `4215-4232`
- Comment + draw markup review surface:
  - Schema: `packages/core/src/types.ts:555-568`, `packages/core/src/schemas.ts:1079-1093`
  - Route: `apps/server/src/fielddocs/routes.ts:332-375`
  - UI: `apps/web/src/main.tsx:3709-3711`, `4398-4490`
  - Test: `apps/server/test/fielddocs-template-library.test.mjs:301`

### B4. Upload path architected for future mobile

`BUILT AND CONFIRMED`

- Upload session and upload endpoints remain generic:
  - `apps/server/src/fielddocs/routes.ts:211-259`
- Request-form upload path uses the same server rail:
  - `apps/web/src/nexopsRequests.tsx:597-606`
- Job Desk upload path uses the same server rail:
  - `apps/web/src/main.tsx:5311-5322`

### B5. AI caption/tag default-on with generic query API

`BUILT AND CONFIRMED`

- Vision auto-enables when approved Anthropic credentials are present.
  - Code: `apps/server/src/fielddocs/visionPipeline.ts:157-163`
- Explicit force-off remains possible with `FIELD_DOCS_VISION_ENABLED=false`.
  - Code: `apps/server/src/fielddocs/visionPipeline.ts:158-160`
- Request-form uploads now send image payloads into the same live vision path:
  - `apps/web/src/nexopsRequests.tsx:605-606`
- Job Desk uploads already did:
  - `apps/web/src/main.tsx:5319-5321`
- Generic query API:
  - `GET /api/fielddocs/search`
  - Code: `apps/server/src/fielddocs/routes.ts:261-270`
- Route/UI contract now flattened and usable:
  - Test: `apps/server/test/fielddocs-template-library.test.mjs:165`
- Docs updated:
  - `apps/server/src/fielddocs/README.md:1-9`
  - `docs/internal/nexops/fielddocs.md`

### B6. Cost safeguard + human correction

`BUILT AND CONFIRMED`

- Cost-cap survey block:
  - Test: `apps/server/test/fielddocs-vision-survey.test.mjs:68`
- Human correction writeback:
  - Test: `apps/server/test/fielddocs-vision-survey.test.mjs:81`
- Route gating:
  - Test: `apps/server/test/fielddocs-vision-survey.test.mjs:107`

### C1. View by client

`BUILT AND CONFIRMED`

- Client rail in NexOps:
  - `apps/web/src/main.tsx:2287-2326`
- Media/report API filters by client:
  - `apps/server/src/fielddocs/routes.ts:267-313`, `431-446`
- Test:
  - `apps/server/test/fielddocs-template-library.test.mjs:165`

### C2. View by visit

`BUILT AND CONFIRMED`

- Visit rail on Schedule:
  - `apps/web/src/nexopsSchedule.tsx:517-537`, `877-931`
- API filters by visit:
  - `apps/server/src/fielddocs/routes.ts:267-313`, `431-446`
- Test:
  - `apps/server/test/fielddocs-template-library.test.mjs:165`

### C3. View by date

`BUILT AND CONFIRMED`

- Media/report routes accept `dateFrom` and `dateTo`.
  - Code: `apps/server/src/fielddocs/routes.ts:267-313`, `431-446`
- Tests:
  - `apps/server/test/fielddocs-template-library.test.mjs:165`

### C4. NexOps screens

`BUILT AND CONFIRMED`

- Client detail rail:
  - `apps/web/src/main.tsx:2287-2326`
- Job rail:
  - `apps/web/src/nexopsJobs.tsx:1249-1335`
- Calendar visit rail:
  - `apps/web/src/nexopsSchedule.tsx:877-931`

### C5. Client Hub default-visible with per-job opt-out

`BUILT AND CONFIRMED`

- Portal service filters by `clientVisibility.hideFieldDocsFromPortal`.
  - `apps/server/src/crm/portalHubService.ts:540-621`
- Job toggle:
  - `apps/web/src/nexopsJobs.tsx:719-729`, `1261-1270`
- Test:
  - `apps/server/test/client-hub-review-followup.test.mjs:532`

### D1. Report PDF pipeline decision

`BUILT AND CONFIRMED`

- Current decision: keep field report PDF renderer intentionally separate.
  - Code: `apps/server/src/fielddocs/reportService.ts`
  - Living doc: `docs/internal/nexops/fielddocs.md`
- Reason logged: field reports are checklist/media-first, not commercial-document-first.
- No silent consolidation was done.

### D2. Export by visit and date range

`BUILT AND CONFIRMED`

- Visit/date filtering:
  - `apps/server/src/fielddocs/routes.ts:431-446`
- PDF open route:
  - `apps/server/src/fielddocs/routes.ts:605-627`
- Test:
  - `apps/server/test/fielddocs-template-library.test.mjs:165`

### D3. Real report attachment into real closeout receipt

`BUILT AND CONFIRMED`

- Field report PDF attachment path verified through closeout receipt flow.
  - Test: `apps/server/test/close-invoice-payment-flow.test.mjs:615`
- Living doc updated:
  - `docs/internal/nexops/payments.md:311-315`

### D4. Delivery = PDF + email now, share-link deferred

`BUILT AND CONFIRMED`

- PDF open/download route:
  - `apps/server/src/fielddocs/routes.ts:605-627`
- Email attachment path proven:
  - `apps/server/test/close-invoice-payment-flow.test.mjs:615`
- Share-link deferred:
  - `NEXTEAM-FUTURE-FEATURE-IDEAS.md:33-37`

### E1. Same-property carry-forward only

`BUILT AND CONFIRMED`

- Code:
  - `apps/server/src/fielddocs/fieldDocsService.ts:37-53`, `99-156`
- Test:
  - `apps/server/test/fielddocs-template-library.test.mjs:99`
- Live proof artifact:
  - `receipts/phase1/nexcam-reconcile-20260718/repeat-client-live-proof.json`

### E2. Visit-fresh fields blank on next visit

`BUILT AND CONFIRMED`

- Code:
  - `apps/server/src/fielddocs/checklists.ts:299-321`
- Test:
  - `apps/server/test/fielddocs-template-library.test.mjs:99`
- Live proof artifact:
  - `receipts/phase1/nexcam-reconcile-20260718/repeat-client-live-proof.json`

### E3. Live proof

`BUILT AND CONFIRMED`

- Real route-driven proof artifact created:
  - `receipts/phase1/nexcam-reconcile-20260718/repeat-client-live-proof.json`
- Verified values in the artifact:
  - property fields (`item_7`, `item_12`, `item_17`) carry forward to the second visit on the same property
  - the same fields stay blank for a different property under the same client
  - visit-only fields (`item_1`, `item_24`) remain blank/pending on the next visit

### F. Visual restraint

`BUILT AND CONFIRMED`

- Checklist flow stays section-scoped instead of dumping all fields:
  - `apps/web/src/main.tsx:3513-3517`
- Photo review moved behind a focused overlay with one dominant save action instead of always-visible clutter:
  - `apps/web/src/main.tsx:4398-4490`
  - `apps/web/src/styles.css:4857-4900`
- Mobile-first layout support remains active:
  - `apps/web/src/styles.css:3440-3519`, `4903-4915`

### G. Nexi tooling

`BUILT AND CONFIRMED`

- Tool implementations:
  - `apps/server/src/fielddocs/nexiTools.ts:100-236`
- Local chat chooser routing:
  - `apps/server/src/nexi/nexiService.ts:642-717`, `1367-1397`
- Tests:
  - `apps/server/test/fielddocs-nexi-tools.test.mjs:73`, `108`, `149`
- Transcript artifact:
  - `receipts/phase1/nexcam-reconcile-20260718/nexi-local-transcript.json`

## Proof Artifacts

- Step Zero + verification report:
  - `receipts/phase1/nexcam-reconcile-20260718/verification.md`
- Repeat-client live proof:
  - `receipts/phase1/nexcam-reconcile-20260718/repeat-client-live-proof.json`
- Nexi transcript:
  - `receipts/phase1/nexcam-reconcile-20260718/nexi-local-transcript.json`
- Branding screenshot bundle + selector proof:
  - `receipts/phase1/nexcam-reconcile-20260718/branding/branding-proof.json`
  - `receipts/phase1/nexcam-reconcile-20260718/branding/*.png`

## Raw Verification Output

### `npm run typecheck`

```text
> typecheck
> tsc -b
```

### `npm run build`

```text
> build
> npm --workspace @nexteam/server run build && npm --workspace @nexteam/web run build

> @nexteam/server@0.0.0 build
> tsc -b

> @nexteam/web@0.0.0 build
> vite build

vite v5.4.11 building for production...
transforming...
✓ 58 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                0.34 kB │ gzip:   0.24 kB
dist/assets/index-B89rov_5.css                75.60 kB │ gzip:  13.74 kB
dist/assets/nexopsCommunications-Dt-VD4hM.js   2.73 kB │ gzip:   1.01 kB
dist/assets/nexopsIntake-BHPJOVoB.js           4.72 kB │ gzip:   1.74 kB
dist/assets/nexopsCatalog-oPzeej8l.js          5.71 kB │ gzip:   1.71 kB
dist/assets/nexopsHome-DanGf25h.js             5.83 kB │ gzip:   1.91 kB
dist/assets/nexopsUiKit-DOqylgpR.js            7.88 kB │ gzip:   1.78 kB
dist/assets/nexopsPatternLibrary-F4WjdzEj.js   8.20 kB │ gzip:   2.88 kB
dist/assets/nexopsSettings-D5CBE4v_.js        14.88 kB │ gzip:   3.95 kB
dist/assets/nexopsSchedule-clBKor0M.js        21.22 kB │ gzip:   5.54 kB
dist/assets/nexopsRequests-sLKzTzhJ.js        28.60 kB │ gzip:   7.81 kB
dist/assets/nexopsJobs-DDAPCDKz.js            35.15 kB │ gzip:   8.36 kB
dist/assets/nexopsInvoices-gIx-X2uK.js        54.95 kB │ gzip:  12.04 kB
dist/assets/nexopsQuotes-BWpnKQF9.js          62.20 kB │ gzip:  13.96 kB
dist/assets/index-CH3tQCac.js                496.46 kB │ gzip: 126.96 kB
✓ built in 1.85s
```

### Full fielddocs verification wall

```text
✔ client hub sessions authenticate, reverify after 14 days, and keep property-scoped viewers isolated (117.3633ms)
✔ client hub shows NexCam visit documents by default and removes them when the job rail is opted out (21.9107ms)
✔ portal appointment confirmation stamps the visit and surfaces the event to client and staff rails (12.5138ms)
✔ client statements keep tips separate from invoice balance and can be delivered from the hub (11.0623ms)
✔ review sequences honor exhaustion, opt-out, and manual stop without auto-restarting closed jobs (6.9232ms)
✔ Nexi client-hub and review tools send portal links, read activity, generate statements, and restart then complete review rails (5.2905ms)
✔ local Nexi chat routes portal and review intents through the new client-hub tools (8.7886ms)
✔ draft invoices stay fully editable through line items, discount, tax, and terms until delivery locks them (25.5362ms)
✔ closing without invoicing creates a recurring 9AM reminder that advances until dismissal (3.9446ms)
✔ combining a selected subset of jobs keeps per-job references and carries the chosen payment schedule (2.4495ms)
✔ invoice delivery honors global defaults first, then per-invoice overrides for email and SMS payloads (1.8431ms)
✔ default invoice delivery templates keep labeled pay-link and hosted-link content at the shared template layer (0.4761ms)
✔ saved-card reuse defaults to the newest card, supports alternate selection, and keeps manual/failed branches distinct (30.0405ms)
✔ receipt review sends email attachments and an SMS hosted link from the same paused review (2.3868ms)
✔ receipt review sends a real field report PDF attachment when NexCam already generated one for the job (2.5713ms)
✔ PayPal and Venmo checkout helpers create sandbox orders and capture completed payments (27.2792ms)
✔ Nexi billing tools run combine, send, partial collect, failed recovery, and receipt review approval loops in chat (19.4788ms)
✔ fielddocs Nexi tools expose property history and recent photos (20.2763ms)
✔ fielddocs Nexi tools generate and fetch visit reports (2.4568ms)
✔ local Nexi chat routes NexCam photo search, property history, and report generation (11.319ms)
✔ natural-language photo search matches imported metadata (0.9718ms)
✔ vision pipeline stub is wired off by default (0.1846ms)
✔ vision pipeline parses live Anthropic-style JSON responses with usage (1.2429ms)
✔ upload service creates native storage refs, thumbnails, and EXIF metadata (1.0223ms)
✔ before/after pairing and vision fallback are wired (0.3832ms)
✔ leak checklist and report PDF render (4.1204ms)
✔ native repository persists checklists and posted field report records (2.835ms)
✔ Field Docs read tool searches native media repository (1.3353ms)
✔ fielddocs template library exposes seeded leak template and accepts custom templates (10.8846ms)
✔ fielddocs persists property-memory fields on the property and keeps visit fields blank on the next visit (5.8087ms)
✔ fielddocs media and report routes filter by client, visit, and date range (57.5219ms)
✔ fielddocs media review saves per-photo comments and markup paths (30.2119ms)
✔ vision survey reviews known and insufficient photos without guessing (2.7264ms)
✔ vision survey blocks batches before estimated spend exceeds the cap (0.352ms)
✔ vision survey correction adds human-confirmed tags (0.3495ms)
✔ vision survey helpers expose conservative cost and metadata classification (0.1478ms)
✔ vision survey routes are AccessContext-gated and tenant-scoped (66.4384ms)
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1273.8464
```

## Notes / Carry-forwards

- Local build only. No Railway deploy was done in this pass.
- Deferred share-link delivery remains logged in `NEXTEAM-FUTURE-FEATURE-IDEAS.md:33-37`.
- Existing broader project carry-forwards still stand:
  - Chris's deferred 1-5 walkthrough review
  - 6+7 rail review
  - 8+9 rail review
  - Gmail/Twilio live credentials
  - review cadence confirmation
