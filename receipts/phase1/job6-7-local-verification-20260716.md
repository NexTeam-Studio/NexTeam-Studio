# Job 6+7 Local Verification — 2026-07-16

## Local access

- NexOps: `http://127.0.0.1:4275/nexops`
- Request form: `http://127.0.0.1:4275/request-forms/aquatrace/service-request`
- Runtime config check: `http://127.0.0.1:4275/api/public/runtime-config`

Verified reachability:
- `GET /nexops` returned `200`
- `GET /request-forms/aquatrace/service-request` returned `200`
- `GET /api/public/runtime-config` returned `{"ok":true,...,"firebaseConfigured":false,"authRequired":false}`
- `GET /api/crm/home?tenantId=aquatrace` returned `ok: true`
- `GET /api/crm/schedule/workspace?...` returned `ok: true`

## Event coverage actually present

Current event bus/schema types consumed by Home/Activity/Notifications:

- `request.created`
- `request.converted_to_quote`
- `request.converted_to_job`
- `quote.created`
- `quote.sent`
- `quote.viewed`
- `quote.signed`
- `quote.approved`
- `quote.deposit_paid`
- `quote.converted_to_job`
- `job.created`
- `job.state_changed`
- `job.closed`
- `job.requires_invoicing_cleared`
- `visit.booked`
- `visit.booking_confirmation_sent`
- `visit.completed`
- `invoice.reminder_due`
- `invoice.created`
- `invoice.sent`
- `invoice.paid`
- `payment.created`
- `payment.failed`
- `refund.created`
- `invoice.voided`
- `invoice.bad_debt`
- `receipt.review_created`

Source refs:
- `packages/core/src/types.ts:1184-1214`
- `apps/server/src/crm/operationsHub.ts:346-956`
- `apps/server/test/schedule-home-activity.test.mjs:392-691`

## Nexi transcript

Saved transcript:
- `receipts/phase1/job6-7-nexi-transcript-20260716.json`

Key turns:

1. User: `schedule 3 visits on visit series for job_c9151c27-b873-465c-80a3-907631f4f61d on 2026-07-20 with Logan every week`
   Tool: `scheduleJobVisits`
   Answer begins: `Visit schedule ready...`

2. User: `yes`
   Tool: `approvePendingApproval`
   Answer: `Approved and booked 3 visits.`

3. User: `show the schedule for Logan Monday`
   Tool: `getSchedule`
   Answer: `I found 1 scheduled visit in that window.`

4. User: `push remaining visits on visit series for job_c9151c27-b873-465c-80a3-907631f4f61d on 2026-07-22 back 2 days`
   Tool: `shiftJobVisitSeries`
   Answer begins: `Visit move ready...`

5. User: `yes`
   Tool: `approvePendingApproval`
   Answer: `Approved and moved the anchor visit, shifting 2 remaining visits.`

6. User: `what needs my attention`
   Tool: `getHomeQueues`
   Answer: `Home is showing 6 live queues right now.`

## Per-decision confirmation

### A. Schedule module

- `A1 BUILT-AND-CONFIRMED`
  Day/week/month/list views are implemented in `apps/web/src/nexopsSchedule.tsx:144-156,597-682`; live workspace payload comes from `apps/server/src/crm/operationsHub.ts:397-466`; verified by `apps/server/test/schedule-home-activity.test.mjs:694` and `apps/server/test/scheduling.test.mjs:177,235`.

- `A2 BUILT-AND-CONFIRMED`
  Calendar create/edit/batch scheduling routes are wired in `apps/server/src/crm/routes.ts:1289-1418`; lifecycle move cascade is centralized in `apps/server/src/crm/jobLifecycle.ts:1010-1088`; reminder regeneration is pinned by `apps/server/test/job-lifecycle.test.mjs:244`.

- `A3 BUILT-AND-CONFIRMED`
  Team filtering and technician scoping live in `apps/server/src/crm/operationsHub.ts:397-466` and `apps/web/src/nexopsSchedule.tsx:528-566`; verified by `apps/server/test/schedule-home-activity.test.mjs:470,694,839`.

- `A4 BUILT-AND-CONFIRMED`
  Unscheduled queue data is produced in `apps/server/src/crm/operationsHub.ts:449-465` and rendered in `apps/web/src/nexopsSchedule.tsx:568-593`; verified by `apps/server/test/job-lifecycle.test.mjs:169` and `apps/server/test/schedule-home-activity.test.mjs:839`.

- `A5 BUILT-AND-CONFIRMED`
  Arrival windows are included in workspace visits in `apps/server/src/crm/operationsHub.ts:199-204,437` and rendered in `apps/web/src/nexopsSchedule.tsx:485-489`; reminder/window continuity is verified by `apps/server/test/job-lifecycle.test.mjs:281`.

### B. Multi-visit one-off jobs

- `B1 BUILT-AND-CONFIRMED`
  Batch visit create and per-visit details/assignment flow are implemented in `apps/server/src/crm/routes.ts:1314-1384`, `apps/server/src/crm/jobLifecycle.ts:1010-1048`, and `apps/web/src/nexopsSchedule.tsx:686-780`; verified by `apps/server/test/schedule-home-activity.test.mjs:839`.

- `B2 BUILT-AND-CONFIRMED`
  No visible 20-cap exists in the UI or tool schemas; 25-visit proof is covered by `apps/server/test/schedule-home-activity.test.mjs:839`; no tenant-visible cap is enforced in `apps/server/src/crm/nexiTools.ts:184-210,1877-1911`.

- `B3 BUILT-AND-CONFIRMED`
  Conversational multi-visit create + bulk shift are implemented in `apps/server/src/crm/nexiTools.ts:1841-1938`, approval execution in `apps/server/src/crm/approvalExecutor.ts`, and transcript parsing/answers in `apps/server/src/nexi/nexiService.ts:628,890,1125,1129`; verified by `apps/server/test/schedule-home-activity.test.mjs:981` and `receipts/phase1/job6-7-nexi-transcript-20260716.json`.

- `B4 BUILT-AND-CONFIRMED`
  Deferred items were logged in `NEXTEAM-FUTURE-FEATURE-IDEAS.md:8-20`.

### C. Home

- `C1 BUILT-AND-CONFIRMED`
  Live status-derived queue rows are built in `apps/server/src/crm/operationsHub.ts:494-550` and rendered in `apps/web/src/nexopsHome.tsx:220-262`; verified by `apps/server/test/schedule-home-activity.test.mjs:470,694,981`.

- `C2 BUILT-AND-CONFIRMED`
  Business health strip is computed in `apps/server/src/crm/operationsHub.ts:489-564` and rendered in `apps/web/src/nexopsHome.tsx:214-222`; verified by `apps/server/test/schedule-home-activity.test.mjs:470,694`.

- `C3 BUILT-AND-CONFIRMED`
  Technician-specific home queues and no-financial fence are in `apps/server/src/crm/operationsHub.ts:471-493` and `apps/web/src/nexopsHome.tsx:101-122,264-288`; verified by `apps/server/test/schedule-home-activity.test.mjs:470`.

### D. Activity feed

- `D1 BUILT-AND-CONFIRMED`
  Feed entry shape and deep-link targets are implemented in `apps/server/src/crm/operationsHub.ts:569-845` and rendered in `apps/web/src/nexopsHome.tsx:294-323`; verified by `apps/server/test/schedule-home-activity.test.mjs:392`.

- `D2 BUILT-AND-CONFIRMED`
  Real persisted event coverage is defined in `packages/core/src/types.ts:1184-1214` and rendered in `apps/server/src/crm/operationsHub.ts:569-845`; verified by `apps/server/test/schedule-home-activity.test.mjs:392`.

- `D3 BUILT-AND-CONFIRMED`
  Object filtering and technician scoping are implemented in `apps/server/src/crm/operationsHub.ts:552-567,847-881` and `apps/web/src/nexopsHome.tsx:294-307`; verified by `apps/server/test/schedule-home-activity.test.mjs:470,694`.

- `D4 BUILT-AND-CONFIRMED`
  Nexi feed read tools are exposed in `apps/server/src/crm/nexiTools.ts:1157-1213` and summarized in `apps/server/src/nexi/nexiService.ts:1129-1134`; verified by `apps/server/test/schedule-home-activity.test.mjs:981`.

### E. Notifications

- `E1 BUILT-AND-CONFIRMED`
  Notification stream subset is built in `apps/server/src/crm/operationsHub.ts:346-346,884-944`; header bell/panel UI is in `apps/web/src/main.tsx:1237-1240,1392-1408,2487-2654`; verified by `apps/server/test/schedule-home-activity.test.mjs:694`.

- `E2 BUILT-AND-CONFIRMED`
  Read-on-open and mark-all-read are wired in `apps/server/src/crm/operationsHub.ts:947-962`, routes `apps/server/src/crm/routes.ts:1163-1196`, and UI `apps/web/src/main.tsx:1505-1526`; verified by `apps/server/test/schedule-home-activity.test.mjs:694`.

- `E3 BUILT-AND-CONFIRMED`
  Push remains deferred and logged in `NEXTEAM-FUTURE-FEATURE-IDEAS.md:20`; in-app notification center is the implemented surface and is documented in `docs/internal/nexops/notifications.md`.

### F. Visual restraint

- `F BUILT-AND-CONFIRMED`
  Home rows and activity entries are row-based, not nested-card stacks, in `apps/web/src/nexopsHome.tsx:220-323` with supporting layout in `apps/web/src/styles.css:4364-4425`; schedule board remains mostly flat with status-tone-only visit cards in `apps/web/src/nexopsSchedule.tsx:474-498,597-682` and `apps/web/src/styles.css:4586-4644`.

### G. Nexi tooling

- `G BUILT-AND-CONFIRMED`
  Required tools are exposed in `apps/server/src/crm/nexiTools.ts:1187-1213,1841-1938`; route selection and answer summaries are in `apps/server/src/nexi/nexiService.ts:628,657,890,1125,1129`; transcript proof is `receipts/phase1/job6-7-nexi-transcript-20260716.json`; test proof is `apps/server/test/schedule-home-activity.test.mjs:981`.

## Raw verification output

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
dist/assets/index-Co20CLrx.css                73.71 kB │ gzip:  13.45 kB
dist/assets/nexopsCommunications-Dt-VD4hM.js   2.73 kB │ gzip:   1.01 kB
dist/assets/nexopsIntake-Bsxkd1ff.js           4.75 kB │ gzip:   1.76 kB
dist/assets/nexopsCatalog-BqTqZZSY.js          5.71 kB │ gzip:   1.70 kB
dist/assets/nexopsHome-lOfADm8B.js             5.83 kB │ gzip:   1.91 kB
dist/assets/nexopsUiKit-D2gowuPQ.js            7.88 kB │ gzip:   1.78 kB
dist/assets/nexopsPatternLibrary-KMo4tQFc.js   8.20 kB │ gzip:   2.88 kB
dist/assets/nexopsSettings-Dh4asJoq.js         8.31 kB │ gzip:   2.66 kB
dist/assets/nexopsSchedule-CNOiXiDS.js        17.59 kB │ gzip:   4.84 kB
dist/assets/nexopsJobs-_KLDiZ6f.js            26.20 kB │ gzip:   6.68 kB
dist/assets/nexopsRequests-DO47H4iQ.js        28.51 kB │ gzip:   7.78 kB
dist/assets/nexopsInvoices-BzPQIDA6.js        54.95 kB │ gzip:  12.05 kB
dist/assets/nexopsQuotes-D9O42BlW.js          62.20 kB │ gzip:  13.96 kB
dist/assets/index-4O0x7-Ep.js                462.58 kB │ gzip: 119.57 kB
✓ built in 1.80s
```

### `node --test apps/server/test/request-foundation.test.mjs`

```text
✔ request routes create, update, convert, archive, and reopen while preserving intake fields (88.0875ms)
✔ local Nexi request tools clarify missing intake data, then create and recall real requests (9.5953ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1249.1199
```

### `node --test apps/server/test/crm-read-side.test.mjs`

```text
✔ CRM quote and invoice native schemas parse (2.3845ms)
✔ NativeAdapter exposes CRM read methods (0.8895ms)
✔ native import upserts remain idempotent by Jobber external ids (0.5517ms)
✔ NativeAdapter writes native clients and approval-gated quote drafts (1.7371ms)
✔ NexOps 3.2 client records preserve display, billing, and one-way SMS settings (0.6699ms)
✔ CRM read nexi-tools expose pipeline and client lookup (0.9256ms)
✔ CRM clientLookup falls back to live Jobber when native CRM has no matching client (0.3722ms)
✔ CRM write nexi-tools cover client create, quote draft, catalog/template settings, and invoice reads (24.0925ms)
✔ seeded catalog UTF-8 punctuation survives native settings round-trip (0.7024ms)
✔ CRM createClient tool blocks approval when telephone is missing (0.9398ms)
✔ CRM client route rejects incomplete saves before a client record is created (54.0811ms)
✔ CRM routes read clients created by ApprovalQueue execution from the shared native repository (11.1301ms)
✔ CRM quote routes create, send, approve, convert, invoice, and renew quotes (73.3ms)
✔ CRM quote change requests store per-line comments plus a freeform note (9.8165ms)
✔ Quote materialization preserves custom lines and future client-selectable fields (0.4481ms)
✔ Quote terms resolve tenant default, then template override, then per-quote override (0.5468ms)
✔ TECHNICIAN role is blocked from manual quote approval authority (0.4143ms)
✔ NativeAdapter writes invoices and renders invoice PDFs (0.4411ms)
✔ Stripe rail refuses live keys and verifies webhook signatures (0.9864ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1340.2912
```

### `node --test apps/server/test/job-lifecycle.test.mjs`

```text
✔ legacy job schema and in-memory native repository normalize stored jobs onto the new lifecycle rail (2.7134ms)
✔ request and quote conversions land as Unscheduled and invoice reminders clear only by invoice or dismissal (17.4952ms)
✔ moving a visit cancels old reminder timers and creates a fresh pair for the new slot (1.1702ms)
✔ due visit reminders auto-send email and sms with technician and access-note context (9.5028ms)
✔ technicians can complete visits but stay blocked from office-only close and invoice authority (0.4928ms)
✔ Nexi job tools create, read, revise, and execute lifecycle actions through chat-native approvals (14.69ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1059.0651
```

### `node --test apps/server/test/ledger-foundation.test.mjs`

```text
✔ quote deposit bridge migrates into first-class payment, deposit, receipt review, and saved card records without rewriting the quote snapshot (12.7321ms)
✔ invoice sync auto-applies deposits and credits, and overdue only marks awaiting-payment invoices (21.2751ms)
✔ Stripe checkout uses tenant Connect headers with zero application fee and charges only the current balance due (28.0342ms)
✔ payment states progress through pending, succeeded, partially_refunded, and refunded with separate refund and receipt-review records (6.1987ms)
✔ invoice and refund receipt reviews carry the default invoice, quote, report, photo, and job-file attachments (3.1384ms)
✔ one payment stays on one invoice and overpayment rolls forward as credit instead of splitting across invoices (2.3592ms)
✔ the ledger model already accepts PayPal and Venmo slots even though the live adapter is deferred (0.9866ms)
✔ draft invoices stay draft and failed payments do not settle the invoice (0.94ms)
✔ void and bad debt stay distinct, and ledger chat tools require OWNER or OFFICE_ADMIN for execution (27.3787ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 377.684
```

### `node --test apps/server/test/close-invoice-payment-flow.test.mjs`

```text
✔ draft invoices stay fully editable through line items, discount, tax, and terms until delivery locks them (28.6222ms)
✔ closing without invoicing creates a recurring 9AM reminder that advances until dismissal (5.0171ms)
✔ combining a selected subset of jobs keeps per-job references and carries the chosen payment schedule (3.1414ms)
✔ invoice delivery honors global defaults first, then per-invoice overrides for email and SMS payloads (2.9431ms)
✔ saved-card reuse defaults to the newest card, supports alternate selection, and keeps manual/failed branches distinct (30.8908ms)
✔ receipt review sends email attachments and an SMS hosted link from the same paused review (2.3281ms)
✔ PayPal and Venmo checkout helpers create sandbox orders and capture completed payments (32.0672ms)
✔ Nexi billing tools run combine, send, partial collect, failed recovery, and receipt review approval loops in chat (18.6492ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 411.8631
```

### `node --test apps/server/test/schedule-home-activity.test.mjs`

```text
✔ operations hub activity feed renders every currently-defined lifecycle event type with deep-link targets (33.9657ms)
✔ operations hub schedule, home queues, and activity stay role-aware for owner and technician (41.2041ms)
✔ CRM schedule, home, activity, and notification routes expose live workspace data and unread-state changes (91.5148ms)
✔ CRM scheduling tools queue unscheduled jobs, create 25-visit series, shift remaining visits, and read role-aware queues (46.3381ms)
✔ Nexi conversational scheduling, shifting, schedule lookup, and home triage use the new Job 6/7 tools through chat-native approvals (14.8541ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1384.972
```

### `node --test apps/server/test/scheduling.test.mjs`

```text
✔ suggestSlots prefers the least-drive non-conflicting slot (13.2419ms)
✔ detectConflicts only flags overlapping visits for the same assigned crew (1.0191ms)
✔ bookVisit parks the visit and queues a notification instead of sending (4.4398ms)
✔ whatsMyDay reads native visits for the requested technician (0.5544ms)
✔ calendar board overlays Jobber visits as read-only schedule cards (62.5971ms)
✔ calendar board returns native visits when Jobber overlay is slow (34.9146ms)
✔ reminder and on-my-way messages are approval queued, not sent (1.8296ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8498.0392
```

### `node --test apps/server/test/lifecycle-command-map.test.mjs`

```text
✔ lifecycle command map keeps the full D1-D19 decision register (1.1089ms)
✔ lifecycle command map exposes the 12 required communication templates (0.1625ms)
✔ every command references valid decision ids and valid communication templates (0.2008ms)
✔ permission registry stays unique and the portal commands stay on authorization profiles (0.1076ms)
✔ quote dominant action derives atomic approval and renewal states (0.2682ms)
✔ D1 atomic portal approval contract keeps failed deposit attempts out of accepted quote state (0.2408ms)
✔ visit, invoice, and client-schedule dominant actions derive from orthogonal status dimensions (0.245ms)
✔ decision traces expose downstream command dependencies for auditability (0.1451ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 131.4975
```
