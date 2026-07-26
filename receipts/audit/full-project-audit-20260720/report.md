# Full Project Audit - 2026-07-20

Audit scope: NexTeam Studio, all modules built to date. No new feature work. Audit-only harness/doc changes are listed at the end.

Line-citation note: `BUILDSTATE.md` is still authoritative for the core M0-M13 rows and the Phase 1 pieces through Job6-7, but it is stale for several later modules. Where `BUILDSTATE.md` has no row, the status below is reconstructed conservatively from current tests, docs, and receipts instead of being implied from memory.

## Pre-read findings

### BUILDSTATE.md

What I found:

- `BUILDSTATE.md:5-56` is still the main status ledger for M0-M13 and the first seven Phase 1 pieces.
- `BUILDSTATE.md:33-37` shows the FieldDocs foundation is not fully reality-gated; M4 upload/capture and owner-selected live vision batch proof are still open.
- `BUILDSTATE.md:45` shows M11 is still blocked on a real phone / airplane-mode proof even though the code, local receipts, and live API receipts exist.
- `BUILDSTATE.md:52-56` shows M13 billing/entitlements is done, but tenancy, self-repair, and intake still carried live-proof blockers when those rows were last updated.
- `BUILDSTATE.md:60-65` establishes the standing lifecycle-reference and knowledgebase rules, plus the rule that no NexOps build piece is done until Nexi can read and write the object domain with a live conversational receipt.
- `BUILDSTATE.md:66` keeps the original post-Piece-5 full walkthrough checkpoint alive. Pieces 1-5 are accepted as builds, but the real end-to-end Chris review is still outstanding.
- `BUILDSTATE.md:67` records the Codex Windows in-app browser instability note, which remains relevant to this audit.
- `BUILDSTATE.md:71` explicitly keeps D1 atomic quote approval/deposit as an open verification item on the quote/payment runtime path.
- `BUILDSTATE.md:72` keeps the 6+7 local review rail live at `http://127.0.0.1:4275/nexops` and the matching request-form rail at `http://127.0.0.1:4275/request-forms/aquatrace/service-request`.
- `BUILDSTATE.md:73` says live-send proof is still blocked on local Gmail OAuth send-mailbox credentials and Twilio delivery credentials.
- Gap found: `BUILDSTATE.md` does **not** currently carry later explicit rows for Job8-9, NexCam, NexDocs, NexReach, tap-to-pay, or the branding/logo passes, so those statuses had to be reconstructed from current tests/docs/receipts instead of the ledger itself.

### DECISIONS.md

What I found:

- `DECISIONS.md:19-21` records the staging environment creation and the first clean Jobber/CompanyCam smoke receipts.
- `DECISIONS.md:95` records the full live Nexi wall being split into deterministic chunks on 2026-07-08 after one monolithic runner hung.
- `DECISIONS.md:96` records that M11 is not merge-complete until a physical phone proves the airplane-mode flow.
- `DECISIONS.md:97` records that M8 staging is Railway-internal only until owner Cloudflare/custom-domain setup is complete.
- `DECISIONS.md:99-101` records that M6 is done only to the ApprovalQueue boundary and that the Phase 0 reality-gate corrections closed Classes A, C, and D after a full live soak.
- `DECISIONS.md:104-118` carries the late-night operating decisions that still matter for this audit: distance defaults to the Aquatrace home base, self-repair is deterministic-first, reputation/SEO remain live-blocked on credentials, and intake is still approval-gated.
- `DECISIONS.md:121-122` makes the Phase 1 master specs and the handoff discipline build-governing, which is still the right interpretation for later NexOps pieces.
- Net: `DECISIONS.md` is still the best chronology for why a module was accepted, blocked, or split into "built to the ApprovalQueue boundary" versus "not live-proven yet."

### ACCOUNTS.md

What I found:

- `ACCOUNTS.md:5` keeps the hard rule that no passwords, tokens, secrets, private keys, or screenshots of secrets belong in the file.
- `ACCOUNTS.md:21-27` shows the audit sources were variable-name inventories, repo config/code, docs/receipts, and local credential folders, not live provider consoles.
- `ACCOUNTS.md:38-42` confirms Gmail OAuth / mailbox ownership is still split across Aquatrace addresses and a Nexi mailbox, with send rails still tied to staging env names rather than a settled NexTeam workspace.
- `ACCOUNTS.md:46-49` confirms Jobber, CompanyCam, and Stripe are all active dependency accounts in the current system.
- `ACCOUNTS.md:64` says no OpenWeather env name was found in current repo/Railway/local-env scans.
- `ACCOUNTS.md:79` shows Twilio still has no verified credentials in repo, Railway, or local env-name scans.
- `ACCOUNTS.md:99-101` is the current sanitized Railway variable-name map. It confirms `VITE_FIREBASE_API_KEY` exists as a staging/production variable name, and separately confirms the still-missing families: `OPENWEATHER*`, `WORDPRESS_*`, `TELEGRAM_*`, `GOOGLE_CLIENT_*`, `GMAIL_SEND_FROM`, and `GMAIL_SEND_AS_NAME`.
- `ACCOUNTS.md:117-123` keeps the unresolved ownership questions visible: Google project owners, domain/hosting owners, WordPress owners, Jobber/CompanyCam owner emails, and the OpenWeather account/key location.

### DEFECT-CLASSES.md

What I found:

- Closed/restored classes:
  - `DEFECT-CLASSES.md:62-64` Class A closed.
  - `DEFECT-CLASSES.md:156-158` Class C closed.
  - `DEFECT-CLASSES.md:199-201` Class D closed.
  - `DEFECT-CLASSES.md:390-420` Class H closed and Class I restored with runtime proof.
- Open classes that still matter to the current audit:
  - `DEFECT-CLASSES.md:108-117` Class B fabricated tool input is still open.
  - `DEFECT-CLASSES.md:226-233` Class E raw error leakage is still open.
  - `DEFECT-CLASSES.md:252-262` Class F claimed wiring/path not actually reachable is still open.
  - `DEFECT-CLASSES.md:363-370` Class G tone/format regression is still open.
  - `DEFECT-CLASSES.md:422-442` Class J time-freeze test harness drift is open and now includes the three currently red test cases surfaced by this audit.
  - `DEFECT-CLASSES.md:444-463` Class K receipt/log PII retention is open and was logged during this audit.
- New audit logging added in this pass:
  - `DEFECT-CLASSES.md:251` logs the fresh full live wall failure where all 203 prompts aborted because the staging proof-session path could not provide `VITE_FIREBASE_API_KEY`.

## Section D1 - Status table

| Piece | Status | Test citation | Chris checkpoint |
|---|---|---|---|
| M0 core foundation (monorepo, providers, CI laws, staging pipeline) | BUILT+ATLAS-TESTED | `BUILDSTATE.md:5-11`; audit reruns `typecheck.txt`, `build.txt`, `check-secrets.txt`, `check-tenancy.txt`, `check-provider-imports.txt` | not-applicable |
| M1 Nexi core Q&A + regression wall foundation | BUILT+ATLAS-TESTED | `BUILDSTATE.md:12-17`; `DECISIONS.md:95,101`; current audit wall rerun is red from Class F proof-session config drift, not from a newly proven answer-quality failure: `DEFECT-CLASSES.md:251`; `regression-wall-live.txt` | not-applicable |
| M2 native CRM / quotes / payments base | BUILT+ATLAS-TESTED | `BUILDSTATE.md:18-31`; `apps/server/test/crm-read-side.test.mjs:250,425,1124` | not-applicable |
| M3 scheduling foundation | BUILT+ATLAS-TESTED | `BUILDSTATE.md:25-26`; `receipts/phase1/job6-7-local-verification-20260716.md`; current suite caveat is Class J date drift, not a proven runtime break: `DEFECT-CLASSES.md:431-432` | pending |
| M4 FieldDocs foundation | BUILT+UNTESTED | `BUILDSTATE.md:32-37`; `apps/server/test/fielddocs-template-library.test.mjs:57,352`; `apps/server/test/fielddocs-read-side.test.mjs:373,403,475,498` | pending |
| M5 Content Engine | BUILT+ATLAS-TESTED | `BUILDSTATE.md:41`; `apps/server/test/content-engine.test.mjs`; Phase 0 reality gate receipts cited in `BUILDSTATE.md:41` | not-applicable |
| M6-LITE Email Rail | BUILT+ATLAS-TESTED | `BUILDSTATE.md:42`; `apps/server/test/comms-lite.test.mjs:452-462`; tenant isolation proof referenced in `DECISIONS.md:85` | pending for live-send only |
| M6 Campaigns | BUILT+ATLAS-TESTED | `BUILDSTATE.md:43`; `apps/server/test/campaigns.test.mjs:83,237,270,368` | not-applicable |
| M7 Reputation / GBP | BUILT+UNTESTED | `BUILDSTATE.md:47`; `apps/server/test/reputation.test.mjs:104`; live GBP receipt still blocked by missing GBP OAuth/account/location credentials | pending |
| M8 Website | BUILT+ATLAS-TESTED | `BUILDSTATE.md:46`; live phone-form receipt and staging live receipt are cited directly there | pending |
| M9 SEO | BUILT+UNTESTED | `BUILDSTATE.md:48`; no live DataForSEO/browser-rich-results proof exists in current receipts | pending |
| M10 Intake / tenant onboarding | BUILT+UNTESTED | `BUILDSTATE.md:56`; live "Demo Pool Co" onboarding receipt is still missing per that row | pending |
| Item 7 Evaporation tool | BUILT+ATLAS-TESTED | `BUILDSTATE.md:44`; `DECISIONS.md:93`; live integrated receipt cited in the BUILDSTATE row | not-applicable |
| M11 mobile offline-first foundation | BUILT+CHRIS-PENDING | `BUILDSTATE.md:45`; `DECISIONS.md:96`; `docs/internal/nexops/mobile.md:127-130` | pending |
| M12a voice I/O foundation | BUILT+ATLAS-TESTED | `BUILDSTATE.md:49-50`; live TTS/usageLog proof is cited in those rows | pending for human voice-quality judgment |
| M12b full-duplex voice | BUILT+UNTESTED | `BUILDSTATE.md:51`; local-only receipt cited there, but real browser hands-free video and live wall remain open | pending |
| M13 billing / entitlements / backups | BUILT+ATLAS-TESTED | `BUILDSTATE.md:52`; `DECISIONS.md:107-108`; live receipt cited in the BUILDSTATE row | not-applicable |
| M13 multi-user / tenancy extension | BUILT+UNTESTED | `BUILDSTATE.md:53-55`; `apps/server/test/platform.test.mjs:170,315`; live browser/claim proof still open in the BUILDSTATE row | pending |
| Job1 Request Foundation | BUILT+CHRIS-PENDING | `BUILDSTATE.md:20`; full walkthrough still pending per `BUILDSTATE.md:66` | pending |
| Job2 Quote Lifecycle | BUILT+CHRIS-PENDING | `BUILDSTATE.md:21`; D1 runtime execution gap is still open per `BUILDSTATE.md:71` and `docs/internal/nexops/quotes.md:299` | pending |
| Job3 Job State Engine | BUILT+CHRIS-PENDING | `BUILDSTATE.md:22`; walkthrough checkpoint still pending per `BUILDSTATE.md:66` | pending |
| Job4 Ledger Foundation | BUILT+CHRIS-PENDING | `BUILDSTATE.md:23`; walkthrough checkpoint still pending per `BUILDSTATE.md:66` | pending |
| Job5 Close / Invoice / Payment / Receipt review | BUILT+CHRIS-PENDING | `BUILDSTATE.md:24`; walkthrough checkpoint still pending per `BUILDSTATE.md:66`; actual walkthrough artifacts exist in `receipts/phase1/checkpoint-walkthrough-20260714/guide.md:21-58` | pending |
| Job6-7 Scheduling + Home/Activity | BUILT+CHRIS-PENDING | `BUILDSTATE.md:25-26,72`; `receipts/phase1/job6-7-nexi-transcript-20260716.json` | pending |
| Job8-9 Client Hub + Review/Follow-up | BUILT+CHRIS-PENDING | `apps/server/test/client-hub-review-followup.test.mjs:439,726,835,908,1008,1085`; `docs/internal/nexops/portal.md:4`; `docs/internal/nexops/reviews.md:4` | pending |
| Manage Team permission model | BUILT+UNTESTED | `apps/server/test/platform.test.mjs:170,315`; `docs/internal/nexops/permissions.md:55,61`; `apps/web/src/nexopsSettings.tsx:370,547` | pending |
| NexCam Pieces 1-5 + v2 refinements | BUILT+CHRIS-PENDING | `apps/server/test/camera-capture-tool.test.mjs:156,418`; `apps/server/test/fielddocs-template-library.test.mjs:57,352`; `apps/server/test/fielddocs-nexi-tools.test.mjs:164,245`; `receipts/phase1/nexcam-reconcile-20260718/nexi-local-transcript.json` | pending |
| NexDocs | BUILT+CHRIS-PENDING | `apps/server/test/fielddocs-read-side.test.mjs:373,403,475,498`; `apps/server/test/fielddocs-nexi-tools.test.mjs:307`; `apps/server/test/client-hub-review-followup.test.mjs:726`; `docs/internal/nexops/nexdocs.md` | pending |
| Jobber / CompanyCam decoupling build | BUILT+UNTESTED | `docs/internal/nexops/third-party-adapters.md:1-5`; active defaults are documented as native, but the audit did not find a dedicated dynamic proof suite just for the cutover itself | pending |
| M11 native mobile capture | BUILT+CHRIS-PENDING | `apps/mobile/test/native-capture.test.mjs:148`; `apps/server/test/mobile-native-capture.test.mjs:353`; `docs/internal/nexops/mobile.md:127-130` | pending |
| NexReach | BUILT+CHRIS-PENDING | `docs/internal/nexops/nexreach.md:1,53,65,127`; `docs/internal/nexops/reviews.md:137,150-151`; `receipts/phase1/nexreach-local-transcript-20260720.json` | pending |
| Tap-to-pay | BUILT+CHRIS-PENDING | `apps/server/test/tap-to-pay.test.mjs:102,169,239`; `docs/internal/nexops/payments.md:362-365`; no real card-present device receipt exists yet | pending |
| Branding / logo placement (including NT block logo) | BUILT+CHRIS-PENDING | `apps/web/src/productBranding.tsx:19,110`; branding proof artifacts under `receipts/phase1/nexcam-reconcile-20260718/branding/` and `receipts/phase1/nexdocs-followup-20260719/` | pending |

## Section D2 - Already verified, no action needed from Chris

Conservative list only. These are the pieces where the decided behavior is either backend/safety-net heavy or already fully covered by Atlas receipts without a remaining human-UI acceptance gate:

1. M0 core foundation
   - Evidence: `BUILDSTATE.md:5-11`; current audit reruns in `typecheck.txt`, `build.txt`, `check-secrets.txt`, `check-tenancy.txt`, `check-provider-imports.txt`.
2. M5 Content Engine to the ApprovalQueue boundary
   - Evidence: `BUILDSTATE.md:41`; Phase 0 reality-gate receipts cited there.
3. M6 Campaigns to the ApprovalQueue boundary
   - Evidence: `BUILDSTATE.md:43`; `apps/server/test/campaigns.test.mjs:83,237,270,368`.
4. M13 billing / entitlements / backups safety-net rail
   - Evidence: `BUILDSTATE.md:52`; `BUILDSTATE.md:53-55` for adjacent tenancy/self-repair/intake context; current audit security reruns plus the Firestore emulator suite in `firestore-rules-emulator-retry.txt`.

Everything else still needs either a live human walkthrough, a real device, a real external credential, or a missing late-piece BUILDSTATE closeout.

## Section D3 - Chris must test himself

Literal checklist, grouped by piece. This list is the human-reality gate that is still open after Atlas's automated/local/live receipts.

### A. Piece 1-5 full lifecycle walkthrough checkpoint

1. Open `http://127.0.0.1:4275/request-forms/aquatrace/service-request`.
2. Submit a real test request including gate code, pet flag, and pool type.
3. Open `http://127.0.0.1:4275/nexops` and confirm the request appears with match-review + downstream propagation.
4. Convert that request to a quote, add a custom line item, discount, and signature/deposit/card-on-file toggles.
5. Open the client approval page and confirm drawn signature + deposit flow works as expected.
6. Convert the approved quote to a job, schedule a visit, complete the visit, and confirm technician/office handoff is understandable.
7. Run the close/invoice/payment path end to end, including saved-card reuse and receipt review.
8. Compare your live clicks to the recorded checkpoint artifacts in `receipts/phase1/checkpoint-walkthrough-20260714/guide.md:21-58` and flag any mismatch.

### B. Job6-7 local live rail review

1. Open `http://127.0.0.1:4275/nexops`.
2. Verify day/week/month/list schedule views are readable and the dominant action is obvious.
3. Reschedule at least one visit and confirm the reminder-aware cascade behaves correctly.
4. Check the Home surface and confirm `Now`, `Needs attention`, `Upcoming`, and activity panels read clearly with real data.
5. Compare against Atlas receipts `BUILDSTATE.md:25-26,72` and `receipts/phase1/job6-7-local-verification-20260716.md`.

### C. Job8-9 client hub / review follow-up rail

1. Open the client hub / portal surface and walk one real client through portal access, appointment confirmation, statement view, and review follow-up.
2. Verify client-upload visibility, property scoping, and review opt-out behavior with a human eye, not only the tests at `apps/server/test/client-hub-review-followup.test.mjs:439,726,835,908,1008,1085`.
3. Confirm whether the current client-facing flow is clear enough to keep or needs UI simplification before wider use.

### D. NexCam rail

1. Run a real photo-capture batch from the field surface.
2. Confirm multi-shot capture, carousel review, per-photo markup/comments, and routing all make sense on an actual phone/browser workflow.
3. Reopen an unassigned batch and confirm the GPS anchor / routing behavior feels correct in real use.
4. Compare live behavior to Atlas proofs at `apps/server/test/camera-capture-tool.test.mjs:156,418` and `apps/server/test/fielddocs-template-library.test.mjs:57,352`.

### E. NexDocs rail

1. Upload a real client document through both office and portal paths.
2. Search for it through NexDocs and confirm the result quality, OCR behavior, and technician fence are understandable in practice.
3. Confirm the unified document rail actually feels simpler than the old scattered attachments flow.

### F. M11 mobile / native capture / tap-to-pay real-device proofs

1. On a real phone, run the airplane-mode checklist/photo/closeout flow described in `BUILDSTATE.md:45`.
2. Reconnect and verify sync completes without duplicates or data loss.
3. On real supported tap-to-pay hardware, collect a live card-present payment and confirm the same paid state reached by `apps/server/test/tap-to-pay.test.mjs:102,169,239` happens in practice.
4. Confirm whether the mobile UX is field-usable in one-handed bright-sun conditions. Atlas cannot close this from desktop tests alone.

### G. Manage Team / branding / late-piece visual passes

1. Open the current Settings / team surface and verify the present Manage Team UI, not the earlier screenshots, is acceptable.
2. Check the branding/logo surfaces with your eye across sidebar, stack top, portal, NexCam, NexDocs, and NexReach.
3. Specifically confirm the current NT block logo usage from `apps/web/src/productBranding.tsx:19,110` is the one you actually want to keep.

### H. Live-send credential gap

1. Provide/confirm local Gmail OAuth send-mailbox credentials.
2. Provide/confirm Twilio delivery credentials.
3. Re-run the live send tests. Until then, the following proofs remain blocked:
   - real approved email arrival
   - real SMS delivery
   - live third-party outbound proof for updated template rails
4. Reference: `BUILDSTATE.md:73`.

### I. Anything from Section C marked NEVER RUN

Run every `NEVER RUN` prompt in Section C below before claiming the wall is complete. The biggest unrun buckets are:

1. GBP live prompts.
2. M8 site-editing prompts through Nexi.
3. M9 live SEO prompts plus Rich Results browser proof.
4. M10 full onboarding interview.
5. M11 real airplane-mode flow.
6. Several photo/checklist/report and "before and after" variants that have no exact matching receipt yet.

## Section B - Regression wall and security battery

Raw-output bundle folder:

- `receipts/audit/full-project-audit-20260720/typecheck.txt`
- `receipts/audit/full-project-audit-20260720/build.txt`
- `receipts/audit/full-project-audit-20260720/check-secrets.txt`
- `receipts/audit/full-project-audit-20260720/check-tenancy.txt`
- `receipts/audit/full-project-audit-20260720/check-provider-imports.txt`
- `receipts/audit/full-project-audit-20260720/npm-test.txt`
- `receipts/audit/full-project-audit-20260720/npm-test-legacy.txt`
- `receipts/audit/full-project-audit-20260720/firebase-auth-admin-emulator.txt`
- `receipts/audit/full-project-audit-20260720/firestore-rules-emulator.txt`
- `receipts/audit/full-project-audit-20260720/firestore-rules-emulator-retry.txt`
- `receipts/audit/full-project-audit-20260720/staging-version-health.txt`
- `receipts/audit/full-project-audit-20260720/regression-wall-live.txt`
- `receipts/audit/full-project-audit-20260720/pii-log-scan.txt`
- `receipts/audit/full-project-audit-20260720/git-status-short.txt`
- `receipts/audit/full-project-audit-20260720/git-diff-stat.txt`

Small raw outputs are pasted here. Large suite outputs are preserved verbatim in the adjacent files above so the individual test names stay intact without turning this report into an unreadable wall.

### `npm run typecheck`

```text
> typecheck
> tsc -b
```

### `npm run build`

Verbatim raw output: `receipts/audit/full-project-audit-20260720/build.txt`

### `npm run check:secrets`

```text
> check:secrets
> node scripts/check-secrets.mjs

Secret scan passed (1119 tracked non-doc files checked).
```

### `npm run check:tenancy`

```text
> check:tenancy
> node scripts/check-tenancy.mjs

Tenancy check passed (195 files checked).
```

### `npm run check:provider-imports`

```text
> check:provider-imports
> node scripts/check-provider-imports.mjs

Provider boundary check passed (245 files checked).
```

### `npm run test:firebase-auth-admin:emulator`

Verbatim raw output with all six test names: `receipts/audit/full-project-audit-20260720/firebase-auth-admin-emulator.txt`

### `npm run test:firestore-rules:emulator`

First run raw failure (port collision): `receipts/audit/full-project-audit-20260720/firestore-rules-emulator.txt`

Retry raw success (21/21 with individual test names): `receipts/audit/full-project-audit-20260720/firestore-rules-emulator-retry.txt`

### `npm test`

Verbatim raw output with all 261 modern-suite test names: `receipts/audit/full-project-audit-20260720/npm-test.txt`

Current result:

- 259 passing
- 2 failing
- both reds are Class J harness drift, not yet proven runtime regressions:
  - `DEFECT-CLASSES.md:431` platform job-link expiry drift
  - `DEFECT-CLASSES.md:432` schedule/home/activity date drift

### `npm run test:legacy`

Verbatim raw output with all legacy-suite test names: `receipts/audit/full-project-audit-20260720/npm-test-legacy.txt`

Current result:

- 111 passing
- 1 failing
- 2 skipped
- the red case is the already-tracked Class J legacy schedule-clock drift at `DEFECT-CLASSES.md:430`

### `/api/version` and `/api/health`

```text
VERSION
{"sha":"710ea325287405610527c2941ff2f8766767ee66","builtAt":"2026-07-20T21:43:39.177Z"}
HEALTH
{"ok":true,"checkedAt":"2026-07-20T21:43:40.129Z","rails":{"jobber":{"ok":true,"configured":true,"provider":"jobber","op":"graphql_read","latencyMs":396,"detail":"Jobber GraphQL read succeeded."},"companycam":{"ok":true,"configured":true,"provider":"companycam","op":"projects_read","latencyMs":407,"detail":"CompanyCam projects read succeeded."},"comms":{"ok":true,"configured":true,"provider":"gmail","op":"configured_no_secret_values","latencyMs":0,"detail":"tenantId=aquatrace; readMailboxes=3; sendConfigured=true; operatorEmailConfigured=false"},"anthropic":{"ok":true,"configured":true,"provider":"anthropic","op":"configured_no_spend","latencyMs":0,"detail":"Configured; live message call skipped by no-spend overnight limit."}}}
```

Raw file: `receipts/audit/full-project-audit-20260720/staging-version-health.txt`

### Full live regression wall on staging

Verbatim raw output: `receipts/audit/full-project-audit-20260720/regression-wall-live.txt`

Current result:

- `0/203` passing on 2026-07-20
- all 203 cases aborted with the same runtime-config failure:
  - `Missing required environment variable VITE_FIREBASE_API_KEY.`
- This is now logged as an active Class F path-reachability variant at `DEFECT-CLASSES.md:251`.

### PII-in-logs / receipts scan

Verbatim raw output: `receipts/audit/full-project-audit-20260720/pii-log-scan.txt`

Current result:

- red
- findings are now logged as Class K at `DEFECT-CLASSES.md:444-458`

### 14-day / >=80% / zero-hallucination bar

Result: **NOT MET**

- Requirement source: `C:\Users\Peyto\Downloads\NEXTEAM-TESTING-BLUEPRINT-v1.md:317`
- Qualifying day clusters evidenced in repo today: **1** (`2026-07-08`)
- Evidence for the historical green day cluster:
  - `DECISIONS.md:95`
  - `receipts/m1/nexi-regression-wall-live-20260708-m6-aggregate.json`
  - `receipts/m1/nexi-regression-wall-live-20260708-phase0-soak-aggregate.json`
- What broke the streak:
  - no repo evidence of fourteen consecutive qualifying live-wall days
  - the fresh 2026-07-20 rerun is red `0/203` because the proof-session path fails to initialize without `VITE_FIREBASE_API_KEY`

## Section C - Testing Blueprint cross-reference

Status legend:

- `RUN, PASSING`
- `RUN, FAILED/FLAGGED`
- `NEVER RUN`

### v1 cross-reference

#### 1.1 Schedule

- `NEXTEAM-TESTING-BLUEPRINT-v1.md:23` `[ASK NEXI] What's on schedule today?` - `RUN, PASSING` - `receipts/m1/p2e-schedule-live-staging.json`; `receipts/phase1/job6-7-nexi-transcript-20260716.json`
- `NEXTEAM-TESTING-BLUEPRINT-v1.md:24` `[ASK NEXI] What's on schedule tomorrow?` - `RUN, PASSING` - regression-wall schedule cases and `DECISIONS.md:95`
- `NEXTEAM-TESTING-BLUEPRINT-v1.md:25` `[ASK NEXI] What's on schedule next week?` - `RUN, PASSING` - historical wall coverage plus scheduling transcript `receipts/phase1/job6-7-nexi-transcript-20260716.json`
- `NEXTEAM-TESTING-BLUEPRINT-v1.md:26` `[ASK NEXI] What's on schedule for [specific real date]?` - `RUN, PASSING` - `receipts/m1/p2e-schedule-live-staging.json`
- `NEXTEAM-TESTING-BLUEPRINT-v1.md:27` `[ASK NEXI] Do I have anything Friday?` - `RUN, PASSING` - schedule/date wall coverage tied to `DECISIONS.md:95`

#### 1.2 Job detail

- `v1:33` address for real client - `RUN, PASSING` - Class H closure proof `DEFECT-CLASSES.md:390-398`
- `v1:34` total gallons - `RUN, PASSING` - Class A closure proof `DEFECT-CLASSES.md:62-76`
- `v1:35` issue at client - `RUN, PASSING` - Class A closure proof `DEFECT-CLASSES.md:62-76`
- `v1:36` technician for client - `RUN, PASSING` - Class A closure proof `DEFECT-CLASSES.md:62-76`
- `v1:37` completion time for client - `RUN, PASSING` - historical live wall / transcript coverage in `receipts/m1/staging-live-transcripts.json`
- `v1:38` did client pay - `RUN, PASSING` - Class A/C/D closure and later billing rails `DEFECT-CLASSES.md:62-64,199-201`

#### 1.3 Photos

- `v1:44` show me photos from client - `RUN, PASSING` - `receipts/m1/p2f-p2g-live-staging.json`; `apps/server/test/fielddocs-nexi-tools.test.mjs:245`
- `v1:45` show me before and after photos from job - `NEVER RUN` - no exact matching receipt/transcript found in current repo

#### 1.4 SiteJobBlueprint / report findings

- `v1:51` leak detection results - `RUN, PASSING` - Class A closure + report extraction receipts `DEFECT-CLASSES.md:62-76`
- `v1:52` defects found - `RUN, PASSING` - `receipts/m4/report-extraction-schema-receipt.json`
- `v1:53` pool system type - `NEVER RUN` - no exact matching receipt/transcript found in current repo

#### 2. Action vs fact vs meta routing

- `v1:64` send an email - `RUN, PASSING` - routing behavior closed under Class C `DEFECT-CLASSES.md:156-172`; outbound arrival still blocked separately by `BUILDSTATE.md:73`
- `v1:65` what sources do you use - `RUN, PASSING` - Class C closure `DEFECT-CLASSES.md:156-172`
- `v1:66` that answer was wrong - `RUN, PASSING` - Class C closure `DEFECT-CLASSES.md:156-172`
- `v1:67` where is the answer then - `RUN, PASSING` - Class C closure `DEFECT-CLASSES.md:156-172`
- `v1:68` draft a quote - `RUN, PASSING` - `BUILDSTATE.md:21`; `receipts/phase1/quote-lifecycle-chat-local-20260712.json`
- `v1:69` book client - `RUN, PASSING` - `BUILDSTATE.md:25`; `receipts/phase1/job6-7-nexi-transcript-20260716.json`
- `v1:73-79` SEND ATLAS routing regression check - `RUN, PASSING` - Class C closure receipt `DEFECT-CLASSES.md:156-158`

#### 3. Cross-rail defaults

- `v1:88` did client pay - `RUN, PASSING` - Class A closure `DEFECT-CLASSES.md:62-64`
- `v1:89` what was the issue - `RUN, PASSING` - Class A closure `DEFECT-CLASSES.md:62-64`
- `v1:90` who was the technician - `RUN, PASSING` - Class A closure `DEFECT-CLASSES.md:62-64`
- `v1:91` has client replied to last email - `RUN, PASSING` - email/report cross-rail prompts in `receipts/m1/staging-live-transcripts.json`
- `v1:92` balance owed on invoice - `RUN, PASSING` - Class A/D closure plus billing rails `DEFECT-CLASSES.md:62-64,199-201`

#### 4. M2 CRM

- `v1:101` who owes us money - `RUN, PASSING` - `receipts/phase1/close-invoice-payment-nexi-local-transcript-20260713.json`
- `v1:102` what's approved but not scheduled yet - `RUN, PASSING` - `BUILDSTATE.md:22,25`
- `v1:103` pipeline look - `RUN, PASSING` - `receipts/m2/native-write-slice-verify.txt`
- `v1:104` draft a quote - `RUN, PASSING` - `receipts/phase1/quote-lifecycle-chat-local-20260712.json`
- `v1:106-113` SEND ATLAS M2 live test block - `RUN, PASSING` - quote draft, Stripe test payment, and portal magic-link proof are all cited in `BUILDSTATE.md:21,30-31`

#### 5. M3 Scheduling

- `v1:120` least-drive-time slot - `RUN, PASSING` - `BUILDSTATE.md:25`; `receipts/wave2/staging-reconciliation-live-redacted.json`
- `v1:121` book client - `RUN, PASSING` - `BUILDSTATE.md:25`; `receipts/phase1/job6-7-nexi-transcript-20260716.json`
- `v1:122` move appointment - `RUN, PASSING` - `BUILDSTATE.md:25`; `receipts/phase1/job6-7-nexi-transcript-20260716.json`
- `v1:123` what's my day Thursday - `RUN, PASSING` - schedule/date wall coverage and `BUILDSTATE.md:25`

#### 6. M4 Field Docs

- `v1:132` show me photos from job - `RUN, PASSING` - `apps/server/test/fielddocs-nexi-tools.test.mjs:245`
- `v1:133` pull the checklist for job - `NEVER RUN` - no exact matching receipt/transcript found in current repo
- `v1:134` generate a report PDF - `RUN, PASSING` - `BUILDSTATE.md:35-36`; `receipts/m4/native-report-post-receipt.json`
- `v1:135` evap reading vs checklist reading - `RUN, PASSING` - `receipts/m4/report-extraction-schema-receipt.json`
- `v1:136` what does 2 + 1/2 inch mean - `NEVER RUN` - no exact matching receipt/transcript found in current repo
- `v1:138-143` SEND ATLAS R3/R4 live spot-check from real data - `NEVER RUN` - `DECISIONS.md:86` says the local receipt had to use a synthetic R3 conflict because the real sample PDFs did not contain one

#### 7. M5 Content Engine

- `v1:150` show me the content queue - `RUN, PASSING` - `BUILDSTATE.md:41`; `receipts/phase0/content-queue-visibility-local-smoke-20260708.json`
- `v1:151` draft a post from recent job - `RUN, PASSING` - `BUILDSTATE.md:41`; content queue receipts cited there
- `v1:152` what's our content performance this month - `NEVER RUN` - no exact matching receipt/transcript found in current repo

#### 8. M6 / M6-LITE Email & Campaigns

- `v1:161` what emails came in today - `RUN, PASSING` - `BUILDSTATE.md:42`; M6-lite live read receipts cited there
- `v1:162` what needs my attention - `RUN, PASSING` - `BUILDSTATE.md:42`; Class G tone remains open but routing/read path exists
- `v1:163` what did sender say in their last email - `RUN, PASSING` - `BUILDSTATE.md:42`
- `v1:164` send an email - `NEVER RUN` end-to-end as specified - routing/approval exists, but live send arrival remains blocked by `BUILDSTATE.md:73`
- `v1:165` draft a follow-up campaign - `RUN, PASSING` - `BUILDSTATE.md:43`; `apps/server/test/campaigns.test.mjs:237`
- `v1:169-175` SEND ATLAS tenant-isolation comms spot-check - `RUN, PASSING` - `DECISIONS.md:85`; `receipts/m6-lite-tenant-isolation.txt`

#### 9. M7 Reputation / GBP

- `v1:182` do we have any new reviews - `NEVER RUN` live as specified - `BUILDSTATE.md:47` blocks live GBP proof on credentials
- `v1:183` draft a reply to review - `NEVER RUN` live as specified - `BUILDSTATE.md:47`
- `v1:184` what's our GBP profile status - `NEVER RUN` live as specified - `BUILDSTATE.md:47`

#### 10. M8 Website

- `v1:192` update hero photo on site - `NEVER RUN` - no exact matching receipt/transcript found in current repo
- `v1:193` add a page for VGB compliance services - `NEVER RUN` - no exact matching receipt/transcript found in current repo
- `v1:194` show me the site leads from this week - `NEVER RUN` - no exact matching receipt/transcript found in current repo
- `v1:196` manual phone lead-form submission - `RUN, PASSING` - `BUILDSTATE.md:46`; `receipts/m8/website-mobile-lead-form-current.png`

#### 11. M9 SEO

- `v1:203` ranking question - `NEVER RUN` live as specified - `BUILDSTATE.md:48`
- `v1:204` why aren't we ranking - `NEVER RUN` live as specified - `BUILDSTATE.md:48`
- `v1:205` this month's SEO report - `NEVER RUN` live as specified - `BUILDSTATE.md:48`
- `v1:207` Rich Results manual test - `NEVER RUN` - `BUILDSTATE.md:48`

#### 12. M10 Intake

- `v1:213` Demo Pool Co full onboarding manual run - `NEVER RUN` - `BUILDSTATE.md:56`

#### 13. M11 Mobile / Offline

- `v1:219-227` physical-device airplane-mode flow - `NEVER RUN` - `BUILDSTATE.md:45`; `DECISIONS.md:96`

#### 14. M12 Voice

- `v1:235` spoken what's on schedule today - `RUN, PASSING` - `BUILDSTATE.md:50`; `receipts/m12a/m12a-voice-live-receipt-20260708-integrated.json`
- `v1:236` spoken what was the issue at client - `RUN, PASSING` - `BUILDSTATE.md:50`; same live voice receipt family

#### 15. M13 Platform / Billing / Security

- `v1:244-256` SEND ATLAS M13 live test battery - `RUN, PASSING` - `BUILDSTATE.md:52`; `receipts/m13/m13-platform-live-receipt-20260708-integrated.json`; `receipts/m13/m13-platform-predeploy-regression-wall.json`; `receipts/m13/m13-storage-bucket-probe.json`

#### 16. Tone & accessibility

- `v1:263` honest-failure stock-price prompt - `RUN, PASSING` - honest-gap behavior now explicitly policed under Class D; see `DEFECT-CLASSES.md:174-209`

#### 17. Standing security / tenancy

- `v1:271-282` SEND ATLAS standing security block - `RUN, FAILED/FLAGGED` - this audit reran the block and found:
  - live wall red from Class F proof-surface config drift: `DEFECT-CLASSES.md:251`
  - cumulative suites still red from Class J harness drift: `DEFECT-CLASSES.md:430-442`
  - PII scan red from Class K: `DEFECT-CLASSES.md:444-458`

#### 18. Regression wall protocol

- `v1:290-298` SEND ATLAS full cumulative wall after every session - `RUN, FAILED/FLAGGED` - current fresh rerun is `0/203` in `regression-wall-live.txt`; 14-day bar not met per `NEXTEAM-TESTING-BLUEPRINT-v1.md:317`

### v2 cross-reference

#### 1. Schedule & calendar

- `v2:20` whats on today - `RUN, PASSING` - same evidence as v1 schedule, plus `receipts/phase1/job6-7-nexi-transcript-20260716.json`
- `v2:21` anything tomorrow - `RUN, PASSING` - same evidence as v1 schedule
- `v2:22` what about thursday - `RUN, PASSING` - same evidence as v1 schedule
- `v2:23` whos my first stop next week - `RUN, PASSING` - same evidence as v1 schedule
- `v2:24` am i free friday afternoon - `RUN, PASSING` - same evidence as v1 schedule
- `v2:25` when is forrest ferguson on the books - `RUN, PASSING` - historical schedule wall coverage
- `v2:26` did i have anything last tuesday - `RUN, PASSING` - historical schedule wall coverage
- `v2:32` find me a slot this week with least windshield time - `RUN, PASSING` - `BUILDSTATE.md:25`; `receipts/wave2/staging-reconciliation-live-redacted.json`
- `v2:33` book that - `RUN, PASSING` - `BUILDSTATE.md:25`
- `v2:34` actually move it to friday morning - `RUN, PASSING` - `BUILDSTATE.md:25`

#### 2. Job details & cross-rail

- `v2:47` hartwell job - `NEVER RUN` exact prompt not found
- `v2:48` what did we find at deborah justice - `RUN, PASSING` - Class A closure `DEFECT-CLASSES.md:62-64`
- `v2:49` how many gallons is the mikell pool - `RUN, PASSING` - Class A closure `DEFECT-CLASSES.md:62-64`
- `v2:50` whats the address for rachel payne - `RUN, PASSING` - Class H closure `DEFECT-CLASSES.md:390-398`
- `v2:51` who ran the justice job - `RUN, PASSING` - Class A closure `DEFECT-CLASSES.md:62-64`
- `v2:52` what time did we wrap up at deborah justice - `RUN, PASSING` - historical wall/transcript coverage
- `v2:53` did that lady in fair play ever pay - `RUN, PASSING` - Class A/D closure
- `v2:54` whats the balance on the ferguson job - `RUN, PASSING` - billing rail transcripts from Piece 5
- `v2:55` has anybody paid this week - `RUN, PASSING` - billing rail transcripts from Piece 5

#### 3. Reports & findings

- `v2:64` pull up the leak results - `RUN, PASSING` - `receipts/m4/report-extraction-schema-receipt.json`
- `v2:65` what all was wrong at camp mikell - `RUN, PASSING` - Class A closure
- `v2:66` evap number vs checklist says for valley view - `RUN, PASSING` - `receipts/m4/report-extraction-schema-receipt.json`
- `v2:67` water loss in plain numbers - `NEVER RUN` exact prompt not found
- `v2:68` make me a report pdf - `RUN, PASSING` - `BUILDSTATE.md:35-36`
- `v2:69` whats the pool type - `NEVER RUN` exact prompt not found

#### 4. Photos

- `v2:78` justice pool pics - `RUN, PASSING` - `receipts/m1/p2f-p2g-live-staging.json`; `apps/server/test/fielddocs-nexi-tools.test.mjs:245`
- `v2:79` before and afters - `NEVER RUN`
- `v2:80` whats that first photo showing - `NEVER RUN` exact prompt not found
- `v2:81` show me the skimmer shot - `RUN, PASSING` - natural-language photo search support is proven in `apps/server/test/fielddocs-read-side.test.mjs:218`

#### 5. Money & CRM

- `v2:90` who owes me money - `RUN, PASSING` - Piece 5 transcript
- `v2:91` whats sitting out there unpaid - `RUN, PASSING` - Piece 5 transcript
- `v2:92` whats approved but not on the schedule yet - `RUN, PASSING` - scheduling/job-state rails
- `v2:93` how many clients we got - `RUN, PASSING` - CRM read-side coverage `apps/server/test/crm-read-side.test.mjs:250`
- `v2:94` give me a client list, just names - `RUN, PASSING` - CRM read-side coverage `apps/server/test/crm-read-side.test.mjs:250`
- `v2:95` whats our pipeline look like - `RUN, PASSING` - CRM read-side receipts
- `v2:96` draft a quote - `RUN, PASSING` - Piece 2 transcript
- `v2:97` whats on that quote - `RUN, PASSING` - Piece 2 transcript

#### 6. Email

- `v2:106` anything come in today - `RUN, PASSING` - M6-lite live read receipts
- `v2:107` what needs my attention - `RUN, PASSING` - M6-lite live read receipts
- `v2:108` did sender ever get back to me - `RUN, PASSING` - live email-read receipt family
- `v2:109` what did that semrush email say - `RUN, PASSING` - M6-lite receipt family and Class E guard coverage
- `v2:110` read me the last email from sender - `RUN, PASSING` - live email-read receipt family
- `v2:111` shoot an email to personal address - `NEVER RUN` end-to-end as specified - live send arrival remains blocked by `BUILDSTATE.md:73`
- `v2:112` email me the justice report pdfs - `RUN, PASSING` on honest-gap behavior - Class D closure `DEFECT-CLASSES.md:199-209`

#### 7. Voice

- `v2:122` spoken whats on today - `RUN, PASSING` - `BUILDSTATE.md:50`
- `v2:123` spoken how many gallons at mikell - `RUN, PASSING` - `BUILDSTATE.md:50`

#### 8. Evaporation

- `v2:132` run the evap for 181 isbell road fair play - `RUN, PASSING` - `BUILDSTATE.md:44`
- `v2:133` whats the evap loss looking like at current job today - `NEVER RUN` exact prompt not found

#### 9. Content queue

- `v2:142` whats in the content queue - `RUN, PASSING` - `BUILDSTATE.md:41`
- `v2:143` draft a post from the justice job - `RUN, PASSING` - content engine receipts
- `v2:144` show me what you'd post about the mikell repair - `NEVER RUN` exact prompt not found

#### 10. Routing gauntlet

- `v2:154` whats on tomorrow - `RUN, PASSING` - schedule wall
- `v2:155` send me an email about it - `RUN, PASSING` on routing-to-approval behavior - Class C closure
- `v2:156` whered you get that - `RUN, PASSING` - Class C closure
- `v2:157` thats wrong, its actually - `RUN, PASSING` - Class C closure
- `v2:158` ok so where is the answer then - `RUN, PASSING` - Class C closure
- `v2:159` book the first opening thursday - `RUN, PASSING` - scheduling transcript
- `v2:160` what sources do you even use - `RUN, PASSING` - Class C closure

#### 11. Honest-gap behavior

- `v2:169` how far is client from my house - `RUN, PASSING` as honest gap / distance-rail boundary - `BUILDSTATE.md:54`; Class D closure
- `v2:170` whats our stock price - `RUN, PASSING` - Class D closure
- `v2:171` cancel my amazon order - `NEVER RUN` exact prompt not found

#### 13. Platform & security [ATLAS only]

- `v2:186-197` ATLAS-only current-deploy battery - `RUN, FAILED/FLAGGED` - same current audit outcome as v1 standing security block:
  - live wall red from Class F proof-surface config drift `DEFECT-CLASSES.md:251`
  - cumulative test reds from Class J `DEFECT-CLASSES.md:430-442`
  - PII scan red from Class K `DEFECT-CLASSES.md:444-458`
  - `/api/version` and `/api/health` did pass and are pasted in Section B

## Audit-only changes made during this pass

Only harness/docs changes were made, which the audit prompt explicitly allowed:

1. `package.json:16`
   - `npm test` now runs with `node --import tsx --test ...` so `.tsx` imports in the modern suites no longer fail at the harness layer.
2. `scripts/check-tenancy.mjs:2,20`
   - imported `existsSync` and skipped deleted tracked files before `readFileSync`, so the tenancy check no longer crashes when a file is deleted but still appears in the tracked-file list.
3. `DEFECT-CLASSES.md:251,422-458`
   - logged the fresh live-wall `VITE_FIREBASE_API_KEY` proof-surface failure under Class F
   - logged the current three time-drift reds under Class J
   - logged the receipt/log PII retention findings under Class K
