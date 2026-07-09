# DEFECT-CLASSES

Part 9 source of truth for recurring Nexi defects. This file is class-based, not incident-based.

Evidence source for this backfill:

- Firestore export: `receipts/m1/nexi-trial-full-session-export-20260708-part9-redacted.json`
- Export window: 2026-07-04T00:00:00.000Z through 2026-07-08T20:36:41.046Z
- Export counts: 3,820 conversation turns, 2,001 grouped sessions, 898 failureLog entries, 3,644 usageLog entries
- Existing live wall before Part 9 class suite: `receipts/m1/nexi-regression-wall-live-20260708-p1.json`, 189/189 passing
- Note: a variant can belong to more than one class when the same user turn exercises multiple failure modes.

## CLASS A - SINGLE-RAIL CONCLUSION

DEFINITION: Nexi treats absence or incomplete data in one connected rail as absence in the business reality.

ROOT CAUSE: Rail selection historically lived in routing/prompt judgment instead of an enforced job-detail policy. Job/status/measurement/detail answers must exhaust the relevant rail set before answering or saying data is missing.

KNOWN VARIANTS:

- (355) How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.
- (150) Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.
- (72) Findings are in the report. What are the total gallons of Deborah Justice
- (59) What were the leak detection findings for Valley View Condominiums from the CompanyCam report?
- (48) What was the issue at camp mikell
- (46) What was the issue at Deborah Justice?
- (46) Who was the technician for Deborah Justice?
- (38) What were the leak detection findings for Camp Mikell from the CompanyCam report?
- (25) Find CompanyCam photos for Deborah Justice.
- (24) Same.report shows results of leak detection. What are they
- (24) What are the total gallons of Deborah Justice?
- (24) What was the issue at Forrest gerguson
- (24) What were the pool leak detection results for Deborah Justice in company cam report
- (24) What were the pool leak detection results for Deborah Justice in CompanyCam report?
- (24) Who owes us money
- (21) Did I send the report more medallion Pool company last week?
- (21) There is a report for medallion Pool company last week in company camp. But I need you to check the aqua Trace leak in Gmail mail box for it
- (20) did todays pool pay?
- (20) What were the leak detection findings for L3 Campus Statehouse Arena from the CompanyCam report?
- (20) yes there is, incorrect here, service completion is in company cam reports
- (19) Check email for a report sent to medallion Pool company last week
- (19) using company cam find the completion time for deboarh justice
- (19) what was the issue at todays pool
- (19) what was the service time completion for Deborah Justice
- (18) Deborah Justice is in company cam and you have shown me the pictures before
- (18) Gallons per inch and square footage are both available in the same report in the same section of the total gallons and square footage is also available on a separate document in the same area of company cam for the mosier measurement document
- (18) incorrect. it is paid in jobber and also email receipt was sent and zero blaanc einvoce sent, bth viweable in email
- (18) What is the square footage of the Deborah Justice pool and how many gallons per inch?
- (17) did she pay
- (17) did todays pool pay
- (9) What are the total gallons for Deborah Justice?
- (3) did Deborah Justice have 14 pool main drains or 4?
- (3) How many pool main drains did Deborah Justice have?
- (3) what about the spa main drains?
- (1) Deborah Justice is in company cam
- (1) Email me the Deborah Justice report PDFs all of them
- (1) Look in company cam and show me the photos for Deborah Justice pool
- (1) We are scheduled to do a main drain cover survey with sump photos tomorrow at that location. It is one of their sub properties named Clarion Hotel. Add it to the schedule for tomorrow
- (1) What are the total number of gallons for this pool?
- (1) What's the total number of gallons for Deborah Justice pool?

STATUS: CLOSED-PENDING-SOAK - Part 9 class closure passed live; requires next unrelated merge soak before CLOSED.

CLOSURE RECEIPT: `receipts/part9/class-closure-a-c-d-live-20260708.json` - Class A/C/D closure suite 11/11 live on staging at SHA `9b1567c9813996495d175f5904def7226d07e5e4`.

REGRESSION TEST IDS:

- `20260707-owner-1-total-gallons-deborah-justice-cross-rail`
- `20260708-owner-p1y-pool-main-drains-deborah-justice`
- `20260708-owner-p1y-spa-main-drains-followup`
- `20260708-owner-good-fourteen-vs-four-glitch-catch`
- `part9-class-A-valley-view-findings-different-client`
- `part9-class-A-rachel-payne-findings-different-phrasing`
- `part9-class-A-forrest-ferguson-issue-different-client`
- `part9-class-A-deborah-justice-measurement-section-scope`

## CLASS B - FABRICATED TOOL INPUT

DEFINITION: Nexi sends untraceable or stale parameters to a tool, especially relative dates, then treats the empty result as a real check.

ROOT CAUSE: Relative-date resolution and follow-up context were not originally validated as traceable to user text or verified conversation context before tool execution.

KNOWN VARIANTS:

- (177) What Jobber jobs are on the schedule today? Use getSchedule and include sources.
- (136) What's on Monday July 6, 2026?
- (114) send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow
- (88) what emails came in today
- (42) Send an email to nexi@aquatraceleak.com saying I received the audit and will review it today.
- (37) What's on schedule for today?
- (24) A lot of information here. Mich of these are unscheduled or late jobs. There is a job on schedule for Monday July 6. What is it
- (24) What is approved but not scheduled yet
- (24) What is on schedule for next week
- (24) What's on schedule for monday
- (24) What's on schedule for tomorrow
- (22) Send me an email to chris1bata@gmail.com. Bryson City job is confirmed for tomorrow.
- (22) What emails came in today
- (19) How many miles are we away from today's pool?
- (17) his job is on schedule for tomorrow. in jobber. he also has pror work alst year
- (17) what time is tomorrows pool
- (17) when is forrest ferguson scheduled
- (3) what time is it
- (1) add add 234 Hendersonville Road Asheville North Carolina to the schedule for tomorrow
- (1) did she pay
- (1) did todays pool pay
- (1) We are scheduled to do a main drain cover survey with sump photos tomorrow at that location. It is one of their sub properties named Clarion Hotel. Add it to the schedule for tomorrow

STATUS: OPEN - backfilled; separate Part 9 closure audit not yet run.

CLOSURE RECEIPT: Pending.

REGRESSION TEST IDS:

- `20260706202922-5-what-time-is-tomorrows-pool`
- `20260706203000-7-when-is-forrest-ferguson-scheduled`
- `20260708-owner-p2z-what-time-is-it`
- Generated schedule/date cases in `tests/fixtures/nexi-trial-regression-cases.mjs`

## CLASS C - INTENT MISROUTING

DEFINITION: Nexi collapses action, meta, correction, and fact intents into the wrong path.

ROOT CAUSE: The routing layer allowed broad keyword overlap and LLM judgment to decide whether a turn was action/meta/fact/email-search instead of enforcing deterministic intent boundaries first.

KNOWN VARIANTS:

- (200) yes there is, incorrect here, service comletion is in company cam reports
- (114) ok, where is the answer then, i corrected you and you should have replied with correct answer
- (114) send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow
- (96) Wrong answer, that was a live receipt correction and should be logged.
- (84) That was incorrect, this feedback should be logged as a correction.
- (47) Wrong answer
- (47) You're incorrect, this would have been referenced in companycan
- (42) Formatting feedback: attention items must lead with sender, subject, and one-line ask, grouped by priority with minimal IDs.
- (42) Send an email to nexi@aquatraceleak.com saying I received the audit and will review it today.
- (40) yes there is, incorrect here, service completion is in company cam reports
- (36) incorrect. it is paid in jobber and also email receipt was sent and zero blaanc einvoce sent, bth viweable in email
- (23) Somewhat correct, there is a report in company cam that specifies the resukts
- (22) Send me an email to chris1bata@gmail.com. Bryson City job is confirmed for tomorrow.
- (22) That was an email in the inbox
- (21) Did I send the report more medallion Pool company last week?
- (19) Check the email inbox and see if they were four was sent to Oleta Falls Community
- (10) email me the report PDFs
- (3) check inbox
- (3) Draft the VGB hotel GM outreach campaign for the Chris-owned test list. Do not send it; park it for approval.
- (3) how do I upload photos
- (3) order unread
- (3) summarize inbox
- (3) what commands can I use
- (3) why did that fail
- (1) Do I have any unread emails?
- (1) Email me the Deborah Justice report PDFs all of them
- (1) Send the email now
- (1) Yes. Go ahead and send the email to me at chris@aquatraceleak.com

STATUS: CLOSED-PENDING-SOAK - Part 9 class closure passed live; requires next unrelated merge soak before CLOSED.

CLOSURE RECEIPT: `receipts/part9/class-closure-a-c-d-live-20260708.json` - Class A/C/D closure suite 11/11 live on staging at SHA `9b1567c9813996495d175f5904def7226d07e5e4`.

REGRESSION TEST IDS:

- `20260708-owner-p1w-check-inbox`
- `20260708-owner-p1w-summarize-inbox`
- `20260708-owner-p1w-order-unread`
- `20260708-owner-p1x-use-evaporation-calculator-deborah-justice`
- `20260708-owner-p2aa-what-commands-can-i-use`
- `20260708-owner-p2aa-why-did-that-fail`
- `20260708-owner-p2aa-how-do-i-upload-photos`
- `part9-class-C-draft-email-action-not-search`
- `part9-class-C-inbox-summary-not-search-misroute`
- `part9-class-C-correction-not-fact-lookup`
- `part9-class-C-capabilities-meta-not-stonewall`

## CLASS D - CAPABILITY GAP MISCLASSIFIED AS DATA GAP

DEFINITION: Nexi says she could not find data when the real issue is that a capability is not built or not reachable.

ROOT CAUSE: Missing capability paths used the same failure wording/logging as empty data lookups. Tool availability needs to be checked before data lookup messaging.

KNOWN VARIANTS:

- (47) What is our current ytd revenue
- (44) read email:chris:19f3354877e85a73 and tell me whether it has attachments; do not quote or summarize the body
- (37) How many miles are we away from today's pool?
- (37) Open Denver Justice pool address in Google maps
- (35) how far is deborah justice from here
- (35) how far is it from my house
- (35) open it in google maps
- (24) Who owes us money
- (20) email me the report PDFs
- (16) 102 kate lane fair play sc
- (6) what is our YTD revenue
- (2) how far is deborah justice pool from here
- (1) Check email for a report sent to medallion Pool company last week
- (1) Did I send the report more medallion Pool company last week?
- (1) Email me the Deborah Justice report PDFs all of them
- (1) You need to infer what I mean. Regardless of typos. The report should be sitting in one of the email boxes as sent and I also copy ourselves on those so we should also have a receipt in the mail

STATUS: CLOSED-PENDING-SOAK - Part 9 class closure passed live; requires next unrelated merge soak before CLOSED.

CLOSURE RECEIPT: `receipts/part9/class-closure-a-c-d-live-20260708.json` - Class A/C/D closure suite 11/11 live on staging at SHA `9b1567c9813996495d175f5904def7226d07e5e4`.

REGRESSION TEST IDS:

- `20260707-owner-4-email-me-report-pdfs`
- `20260708-owner-good-ytd-revenue-honest-gap`
- `part9-class-D-distance-tool-gap-plain-language`
- `part9-class-D-report-pdf-email-attachment-gap`
- `part9-class-D-ar-summary-gap-not-empty-data`

## CLASS E - RAW ERROR LEAKAGE

DEFINITION: Raw runtime, validation, provider, or exception text reaches the owner as the answer.

ROOT CAUSE: Tool exceptions and schema validation errors were not consistently wrapped before being converted into user-facing replies.

KNOWN VARIANTS:

- (2) Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.
- (2) What Jobber jobs are on the schedule today? Use getSchedule and include sources.
- (2) What were the leak detection findings for Valley View Condominiums from the CompanyCam report?
- (1) Draft the VGB hotel GM outreach campaign for the Chris-owned test list. Do not send it; park it for approval.
- (1) What did semrush site audit say
- (1) What needs my attention

STATUS: OPEN - backfilled; separate Part 9 closure audit not yet run.

CLOSURE RECEIPT: Pending.

REGRESSION TEST IDS:

- `20260705` Semrush/email-body date parsing cases generated in `tests/fixtures/nexi-trial-regression-cases.mjs`
- All wall cases with `noRawToolError`

## CLASS F - CLAIMED WIRING THAT DOES NOT EXIST

DEFINITION: A feature is receipted or marked done in a backend/direct-test sense but cannot be performed by the owner through the promised user-facing path.

ROOT CAUSE: Previous merge gates allowed direct API/tool receipts to count as done even when the user-facing Nexi/UI path was not reachable. Part 9 now makes the owner path the reality gate.

KNOWN VARIANTS:

- (3) how do I upload photos
- (3) Run the evap for 100 Main Street, Bryson City, NC 28713 with surface area 500 square feet, water temperature 82 degrees, and observed daily loss 1.5 inches.
- (3) use the evaporation calculator on Deborah Justice's pool
- (module audit) `createClient` existed in `createCrmTools`, but server registered only `createCrmReadTools` into `/api/nexi/message`. Phase 0 item 2 now wires `createCrmTools`, routes create-client prompts deterministically, queues writes through ApprovalQueue, and proves live staging approval/execute to native CRM; receipts: `receipts/phase0/create-client-nexi-local-smoke-20260708.json`, `receipts/phase0/phase0-reality-live-receipt-current.json`.
- (module audit) M4 native upload endpoints exist, but owner-facing photo upload is not complete without the M11 real-device path.
- (module audit) M5 content tools existed, but content queue visibility was not proven through owner-facing chat/UI after Part 9. Phase 0 item 3 now routes content queue prompts to `contentQueue`, supports approve/reject decisions, exposes a `/web` Content Queue card, and proves live staging show/approve/reject states; receipts: `receipts/phase0/content-queue-visibility-local-smoke-20260708.json`, `receipts/phase0/phase0-reality-live-receipt-current.json`.
- (module audit) M12a voice was left marked in progress after live staging TTS and usageLog cost receipts existed. Phase 0 item 4 corrected BUILDSTATE to done for the M12a foundation and records the status receipt at `receipts/phase0/m12a-voice-reality-gate-status-20260708.json`; M12b full-duplex/interruptible voice remains separate future scope.
- (module audit) M6 Campaigns was marked blocked even though generation, templates, sequencing, compliance injection, suppression, tracking, transactional queueing, and ApprovalQueue-only behavior were live-receipted. Phase 0 item 5 separates the completed build-to-approval module from the parked external bulk-send boundary; receipt: `receipts/phase0/m6-campaigns-blocker-resolution-20260708.json`.

STATUS: OPEN - createClient, content queue, M12a voice, M6 campaigns, and Item 7 evap reality gaps are corrected; M4/M11 owner-facing photo upload remains open until the real-device path is proven.

CLOSURE RECEIPT: Pending user-facing module re-audit.

REGRESSION TEST IDS:

- `20260708-owner-p1x-use-evaporation-calculator-deborah-justice`
- `20260708-owner-p2aa-how-do-i-upload-photos`
- `phase0-content-queue-chat-route-visible`
- `phase0-content-queue-web-approve-reject-visible`
- Future module reality-gate checks under `receipts/part9/module-reality-gate-20260708.json`

## CLASS G - FORMAT/TONE REGRESSION

DEFINITION: Nexi replies in robotic, jargon-heavy, overbroad, or poorly organized language that makes the owner unlikely to keep using her.

ROOT CAUSE: Formatting and tone rules existed mostly in SOUL/prompt text, while several server/user-interface paths still emitted source-check jargon, rail terms, or generic stonewalls.

KNOWN VARIANTS:

- (408) How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.
- (179) What Jobber jobs are on the schedule today? Use getSchedule and include sources.
- (151) Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.
- (73) What sources do you use
- (46) Show me Deborah Justice pool photos
- (45) What did the Semrush site audit say
- (42) Formatting feedback: attention items must lead with sender, subject, and one-line ask, grouped by priority with minimal IDs.
- (34) Deborah Justice is in company cam and you have shown me the pictures before
- (34) Who is assigned to it
- (33) Show me pictures from Deborah Justice
- (24) A lot of information here. Mich of these are unscheduled or late jobs. There is a job on schedule for Monday July 6. What is it
- (24) Emails pulled but no information specific. We need to figure out how to roagaize these in a reasonably readable format. A client would never use this again fomatteds like this
- (24) Great detail, organization and format sucks,
- (24) Ok. All of these were reasonably correct. But the format should only be inclusive of the info requested, not the whole project info..format should be easier to read.
- (23) Who owes us money
- (22) There is a report for medallion Pool company last week in company camp. But I need you to check the aqua Trace leak in Gmail mail box for it
- (21) You need to infer what I mean. Regardless of typos. The report should be sitting in one of the email boxes as sent and I also copy ourselves on those so we should also have a receipt in the mail
- (20) what is forrest fergusons address
- (19) Check email for a report sent to medallion Pool company last week
- (19) Did I send the report more medallion Pool company last week?
- (18) aquatraceleak@gmail.com
- (18) did todays pool pay?
- (18) ok, where is the answer then, i corrected you and you should have replied with correct answer
- (17) what was the service ime competion for deborah justice
- (16) what emails came in today
- (15) using company cam find the completion time for deboarh justice
- (14) What were the leak detection findings for Valley View Condominiums from the CompanyCam report?
- (13) Deborah Justice
- (13) Gallons per inch and square footage are both available in the same report in the same section of the total gallons and square footage is also available on a separate document in the same area of company cam for the mosier measurement document
- (12) Findings are in the report. What are the total gallons of Deborah Justice
- (12) whats important from chris@aquatraceleak.com
- (11) what needs my attention
- (11) What needs my attention
- (11) What's the ETA?
- (7) What were the leak detection findings for Camp Mikell from the CompanyCam report?
- (6) explain this date you randonly pulled from your ass
- (6) Same.report shows results of leak detection. What are they
- (6) what was the service time completion for Deborah Justice
- (6) Who are the technicians for Deborah Justice
- (5) What were the pool leak detection results for Deborah Justice in CompanyCam report?
- (4) 102 kate lane fair play sc
- (4) Reply with exactly: readiness check.
- (4) what was the issue at todays pool
- (4) What's on Monday July 6, 2026?
- (3) Check the email inbox and see if they were four was sent to Oleta Falls Community
- (3) show me the Deborah Justice photos
- (3) The photos in that reply show thumbnails but are t clickable or savable
- (3) what commands can I use
- (3) What emails came in today
- (3) What were the pool leak detection results for Deborah Justice in company cam report
- (3) why did that fail
- (2) alphabetically who is the first customer in
- (2) correct
- (2) how far is deborah justice from here
- (2) how far is it from my house
- (2) I asked that and now you are wasting api tokens because you should already inger what I asked here,
- (2) Open Denver Justice pool address in Google maps
- (2) send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow
- (2) Send me an email to chris1bata@gmail.com. Bryson City job is confirmed for tomorrow.
- (2) show me Denver Justice photos
- (2) Show me photos for Deborah Justice
- (2) Show me the Deborah Justice photos
- (2) Somewhat correct, there is a report in company cam that specifies the resukts
- (2) That was an email in the inbox
- (2) The sub property is the address I have you however there is not a nameme associated with it. I am telling you to name the sub property Clarion Hotel.
- (2) Try aspmarcee
- (2) What are the total gallons of Deborah Justice?
- (2) What are the total number of gallons for this pool?
- (2) What is approved but not scheduled yet
- (2) What is our current ytd revenue
- (2) What is the square footage of the Deborah Justice pool and how many gallons per inch?
- (2) what ssues were found on rachel paynes pool
- (2) What's on schedule for today?
- (2) What's the total number of gallons for Deborah Justice pool?
- (2) Who was the technician for Deborah Justice?
- (1) did Deborah Justice have 14 pool main drains or 4?
- (1) Do you see any emails for medallion Pool company?
- (1) Email me the Deborah Justice report PDFs all of them
- (1) How many miles are we away from today's pool?
- (1) No. What is the eta for the job
- (1) read email:chris:19f3354877e85a73 and tell me whether it has attachments; do not quote or summarize the body
- (1) Show me the email from marcee at asp
- (1) Show me the email from marcee quinn
- (1) What are the total gallons for Deborah Justice?
- (1) What is on schedule for next week
- (1) What was the issue at camp mikell
- (1) What was the issue at Deborah Justice?
- (1) What was the issue at Forrest gerguson
- (1) What were the leak detection findings for L3 Campus Statehouse Arena from the CompanyCam report?
- (1) Wrong answer

STATUS: OPEN - backfilled; separate Part 9 closure audit not yet run.

CLOSURE RECEIPT: Pending.

REGRESSION TEST IDS:

- All cases with `noNoSourceStonewall`
- Future Class G tone/format suite to replace broad prompt-only checks
