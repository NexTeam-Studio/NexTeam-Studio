FOLLOW-UP 2 CONSOLIDATED A-G PACKAGE

ENCODING

- Root cause: the mojibake example came from the follow-up prompt text / terminal-rendering path, not from the seeded catalog, native CRM settings write path, or the saved Nexi transcript.
- Clean source proof:
  - `packages/industry-packs/src/poolLeakVgbCatalog.ts:28`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:164`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:174`
- Guard added:
  - `apps/server/test/crm-read-side.test.mjs:429`
- No reseed performed:
  - the stored seed/source values already round-trip cleanly, so there was no bad persisted catalog data to overwrite

LIVE SEND BLOCKER

- Real third-party template-send proof is blocked in this local dev environment because the outbound credential env vars are missing.
- Runtime config path:
  - `apps/server/src/server.ts:80`
  - `apps/server/src/comms/gmailRegistry.ts:72`
  - `apps/server/src/comms/gmailRegistry.ts:97`
- Documentation updated:
  - `docs/internal/nexops/templates.md:92`

NEXOPSPATTERNLIBRARY

- `apps/web/src/nexopsPatternLibrary.tsx` is the Track 1 generic component/state pattern-library page from the later full-build authorization, not part of the combined A-G prompt; it is pre-existing/unrelated to A-G.
- Proof:
  - `apps/web/src/nexopsPatternLibrary.tsx:27`
  - `apps/web/src/nexopsPatternLibrary.tsx:28`
  - `apps/web/src/nexopsPatternLibrary.tsx:29`
  - `apps/web/src/main.tsx:2377`
  - `apps/web/src/main.tsx:2378`

SECTION C

- Rule 16, lifecycle-aware dominant action on job detail:
  - before confirmation: `Send booking confirmation`
    - `apps/web/src/nexopsJobs.tsx:297`
    - `apps/web/src/nexopsJobs.tsx:847`
  - after confirmation: `Go to visits`
    - `apps/web/src/nexopsJobs.tsx:315`
    - `apps/web/src/nexopsJobs.tsx:841`
- Rule 19, persistent feedback on booking confirmation:
  - persistent state copy lives in page state, not only a toast
    - `apps/web/src/nexopsJobs.tsx:335`
    - `apps/web/src/nexopsJobs.tsx:690`
    - `apps/web/src/nexopsJobs.tsx:804`
  - confirmation rail stays open as a durable detail block with resend/calendar state
    - `apps/web/src/nexopsJobs.tsx:863`
    - `apps/web/src/nexopsJobs.tsx:891`

SECTION F

F1. Booking confirmation by text and email

- Composer/surface:
  - `apps/web/src/nexopsJobs.tsx:847`
  - `apps/web/src/nexopsJobs.tsx:863`
  - `apps/web/src/nexopsJobs.tsx:891`
- Runtime generation/send:
  - `apps/server/src/crm/jobLifecycle.ts:754`
  - `apps/server/src/crm/jobLifecycle.ts:783`
  - `apps/server/src/crm/jobLifecycle.ts:791`
  - `apps/server/src/crm/jobLifecycle.ts:807`
  - `apps/server/src/crm/jobLifecycle.ts:820`
  - `apps/server/src/crm/jobLifecycle.ts:860`
- Test proof:
  - `apps/server/test/job-lifecycle.test.mjs:281`
  - `apps/server/test/job-lifecycle.test.mjs:306`
  - `apps/server/test/job-lifecycle.test.mjs:308`
  - `apps/server/test/job-lifecycle.test.mjs:309`
  - `apps/server/test/job-lifecycle.test.mjs:310`
  - `apps/server/test/job-lifecycle.test.mjs:311`
  - `apps/server/test/job-lifecycle.test.mjs:312`

F2. Quote send / resend template category

- Template category exists:
  - `apps/server/src/crm/communicationTemplates.ts:17`
  - `docs/internal/nexops/templates.md:56`
- Runtime send path:
  - `apps/server/src/crm/routes.ts:2484`

F3. Deposit-paid staff notification

- Template category exists:
  - `apps/server/src/crm/communicationTemplates.ts:16`
- Runtime office notification branch:
  - `apps/server/src/crm/routes.ts:2511`
  - `apps/server/src/crm/routes.ts:2513`
  - `apps/server/src/crm/routes.ts:2533`
- Validation seam fixed so the route completes instead of 400ing after send:
  - `packages/core/src/schemas.ts:1053`
  - `packages/core/src/schemas.ts:1058`
  - `packages/core/src/types.ts:1190`
  - `packages/core/src/types.ts:1195`
- Runtime proof:
  - `apps/server/test/crm-read-side.test.mjs:756`

F4. Quote approval surface

- Implementation:
  - `apps/server/src/crm/routes.ts:2253`
  - `apps/server/src/crm/routes.ts:2265`
  - `apps/server/src/crm/routes.ts:2414`
  - `apps/server/src/crm/routes.ts:2479`
  - `apps/server/src/crm/quotePdf.ts:349`
  - `apps/server/src/crm/quotePdf.ts:360`
  - `apps/server/src/crm/quotePdf.ts:380`
  - `apps/server/src/crm/quotePdf.ts:387`
  - `apps/server/src/crm/quotePdf.ts:541`
- Client-facing portal approval UI:
  - `apps/server/test/crm-read-side.test.mjs:682`
  - `apps/server/test/crm-read-side.test.mjs:683`
  - `apps/server/test/crm-read-side.test.mjs:684`
  - `apps/server/test/crm-read-side.test.mjs:685`
- Approval result / approved summary:
  - `apps/server/test/crm-read-side.test.mjs:748`
  - `apps/server/test/crm-read-side.test.mjs:765`
  - `apps/server/test/crm-read-side.test.mjs:766`
  - `apps/server/test/crm-read-side.test.mjs:767`
  - `apps/server/test/crm-read-side.test.mjs:768`

A

- Tab/filter carry-forward stays wired in the four list surfaces:
  - `apps/web/src/nexopsQuotes.tsx:2016`
  - `apps/web/src/nexopsQuotes.tsx:2034`
  - `apps/web/src/nexopsQuotes.tsx:2064`
  - `apps/web/src/nexopsRequests.tsx:1067`
  - `apps/web/src/nexopsRequests.tsx:1105`
  - `apps/web/src/nexopsRequests.tsx:1136`
  - `apps/web/src/nexopsJobs.tsx:745`
  - `apps/web/src/nexopsJobs.tsx:764`
  - `apps/web/src/nexopsJobs.tsx:791`
  - `apps/web/src/nexopsInvoices.tsx:1363`
  - `apps/web/src/nexopsInvoices.tsx:1382`
  - `apps/web/src/nexopsInvoices.tsx:1477`

B

- Intake foundation / V2 fields / propagation / referral-source sync / sub-property contact split:
  - `apps/server/src/crm/requestFoundation.ts:81`
  - `apps/server/src/crm/requestFoundation.ts:692`
  - `apps/server/src/crm/requestFoundation.ts:703`
  - `apps/server/src/crm/requestFoundation.ts:815`
  - `apps/server/src/crm/quoteFoundation.ts:66`
  - `apps/server/src/crm/quoteFoundation.ts:368`
  - `apps/web/src/nexopsIntake.ts:33`
  - `apps/web/src/nexopsRequests.tsx:529`
  - `apps/server/test/request-foundation.test.mjs:62`
  - `apps/server/test/request-foundation.test.mjs:103`
  - `apps/server/test/request-foundation.test.mjs:157`
  - `apps/server/test/request-foundation.test.mjs:210`

D

- Gear-icon reachability and settings surfaces:
  - shared shell mounts the gear icon globally above every active module:
    - `apps/web/src/main.tsx:2483`
    - `apps/web/src/main.tsx:2492`
    - `apps/web/src/main.tsx:2502`
  - three distinct starting pages mount under that same shell:
    - `apps/web/src/main.tsx:2365`
    - `apps/web/src/main.tsx:2371`
    - `apps/web/src/main.tsx:2380`
  - `apps/web/src/nexopsSettings.tsx:255`
  - `apps/web/src/nexopsSettings.tsx:288`
  - `apps/web/src/nexopsSettings.tsx:325`
  - `apps/web/src/nexopsSettings.tsx:405`

E

- Existing catalog match and new-item-save-to-catalog:
  - `apps/web/src/nexopsQuotes.tsx:1639`
  - `apps/web/src/nexopsQuotes.tsx:2438`
  - `apps/web/src/nexopsQuotes.tsx:2448`
  - `apps/web/src/nexopsQuotes.tsx:2455`
  - `apps/web/src/nexopsQuotes.tsx:2465`
  - `apps/web/src/nexopsInvoices.tsx:1645`
  - `apps/web/src/nexopsInvoices.tsx:2055`
  - `apps/web/src/nexopsInvoices.tsx:2065`
  - `apps/web/src/nexopsInvoices.tsx:2071`
  - `apps/web/src/nexopsInvoices.tsx:2082`
- Live Nexi transcript proof:
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:163`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:164`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:173`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:174`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:399`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:400`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:644`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:645`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:769`
  - `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json:770`

G

- Communication template categories / settings editing:
  - `apps/server/src/crm/communicationTemplates.ts:12`
  - `apps/server/src/crm/communicationTemplates.ts:13`
  - `apps/server/src/crm/communicationTemplates.ts:14`
  - `apps/server/src/crm/communicationTemplates.ts:15`
  - `apps/server/src/crm/communicationTemplates.ts:16`
  - `apps/server/src/crm/communicationTemplates.ts:17`
  - `apps/server/src/crm/communicationTemplates.ts:18`
  - `apps/server/src/crm/communicationTemplates.ts:19`
  - `apps/server/src/crm/communicationTemplates.ts:20`
  - `apps/web/src/nexopsSettings.tsx:324`
  - `apps/web/src/nexopsSettings.tsx:330`
  - `docs/internal/nexops/templates.md:55`
  - `docs/internal/nexops/templates.md:56`
  - `docs/internal/nexops/templates.md:62`
- Live-send boundary still explicitly documented:
  - `docs/internal/nexops/templates.md:92`

LIVE NEXI TOOLING TRANSCRIPT

- `receipts/phase1/a-g-settings-tools-local-transcript-20260715.json`
