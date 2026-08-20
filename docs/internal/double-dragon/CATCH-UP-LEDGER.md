# NexTeam Catch-Up Ledger

Last reconciled: 2026-08-20
Scope: staging-only Double Dragon evidence. This is a controlled progress ledger, not a substitute for the live Splinter registry or a production readiness claim.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| PLANNED | No implementation or acceptance evidence has been established. |
| IMPLEMENTED | Source evidence exists, but it has not yet been proven through the required staging browser flow. |
| BROWSER-PROVEN | The behavior has been exercised through staging UI with recorded evidence. |
| OWNER-PROVEN | Owner has additionally accepted the relevant workflow or design decision. |

## Evidence and deployment order

The exact live staging build returned by `/api/version` at reconciliation is `418e1714f042fd15a440aef2aecac12094161c6d`. This ledger records browser evidence separately from owner acceptance.

| Candidate | Purpose | Current evidence | Deployment relationship |
| --- | --- | --- | --- |
| `e3c92f701cc058ecce26b74ff837f92898d8e808` | Secret-output guard | Accepted review evidence; live identity must be checked as part of provider acceptance | Baseline before transactional-email proof |
| `7217c2a556e3188c388fc1b0b51c4af302b1c6f2` | Transactional email provider | Accepted review evidence | Must be browser-proven with one safe approved staging send |
| `a7705bbeab859619a201f524a1203edd398f55a0` | NexCam long-caption responsive repair | Included in the current live ancestry | Final responsive browser re-proof remains pending; no separate deployment is required for this commit |
| `afc14538b94c7e7a264be695366bec6469296a37` | Reviewed evaporation persistence | Included in the live ancestry | Browser-proven below |
| `e75bdce409da808787c1ef0e58b0063bfed07114` | Legacy checklist read compatibility | Included in current live ancestry | Preserved by the current staging build |
| `418e1714f042fd15a440aef2aecac12094161c6d` | Booking-confirmation history projection | Live and browser-proven | Current staging build |

## Golden-path reconciliation

| Workflow | Lane / dependency | Status | Implementation / live evidence | Browser or owner proof | Next deterministic action |
| --- | --- | --- | --- | --- | --- |
| Intake to Client / Property | Clients, Requests | BROWSER-PROVEN | Existing CRM/request rails; exact current-live regression not repeated in this pass | Previously accepted staging workflow | Preserve; re-exercise only when an adjacent change requires it |
| Request | Requests | BROWSER-PROVEN | Requests shared-template rail accepted at `95b1a7f86ddcaf1cf5538b5aa29837187b4167d6` | Desktop and mobile evidence recorded | Preserve |
| Client-first Quote | Quotes, Clients | OWNER-PROVEN | Quote Builder reference accepted at `8e163842a93f22184c635d39bfcd7c0e6a3f9346` | Owner-approved browser/mobile proof | Preserve legacy template-default compatibility |
| Quote-first existing Client | Quotes | OWNER-PROVEN | Same Quote Builder reference | Owner-approved browser/mobile proof | Preserve |
| Quote-first new Client and return | Quotes, Clients | OWNER-PROVEN | Same Quote Builder reference | Owner-approved browser/mobile proof | Preserve |
| Quote approval to Job | Quotes, Jobs | IMPLEMENTED | Durable conversion reconciliation accepted at `37ddcddce6b2454366f06e102ce5fac5085508d0` | QA Job `JOB-0003` exists from an internally approved QA Quote | Browser-proof retry/failure convergence after the exact candidate is live |
| Job-first existing/new Client and return | Jobs, Clients | IMPLEMENTED | Job entry exists; no controlled end-to-end proof recorded in this ledger | None | Register and prove after current field-documentation acceptance |
| Booking and Visit | Schedule, Visits | BROWSER-PROVEN | Visits roster and detail template work are in current live ancestry | QA Visit `QA Evaporation Review Visit 2026-08-20` opened normally | Preserve schedule behavior |
| Booking confirmation | Schedule, Communications | BROWSER-PROVEN | `418e1714...` persists the Visit as `Already Sent` and projects the event into Client Notes & Communications | One approved staging email reached `nexteamai@gmail.com`; no office-copy recipient, reload persistence, console, runtime, and browser checks passed | Preserve as browser proof; do not classify as owner proof without separate usability acceptance |
| Visit reminders | Schedule, Communications | IMPLEMENTED | Prepared communication path exists | No controlled current-provider reminder acceptance | Require separate approval before any external reminder send |
| On My Way | Schedule, Communications | PLANNED | No accepted end-to-end proof found | None | Register after booking communications are proven |
| Field checklist | NexCam / NexDocs | IMPLEMENTED | Checklist persistence and legacy compatibility are live | Evaporation creates and links a checklist; field-template completion flow remains unproven | Prove checklist-driven visit completion and reuse separately |
| Visit media capture | NexCam | BROWSER-PROVEN | Normal safe QA capture previously created a legitimate Visit artifact; the responsive corrective commit is in the current live ancestry | Visit, Job roll-up, NexDocs and Closeout selection were proven; final responsive browser re-proof remains pending | Re-prove the responsive corrective behavior on the current live build before closing the mobile refinement |
| Visit documents and NexDocs | NexCam, NexDocs | BROWSER-PROVEN | Visit-scoped document filtering accepted at `cebe819faba9b8ae11926be8f84e35c1673d2740` | Current QA report appears in Visit and Job NexDocs with the originating Visit retained | Preserve scope regression |
| Moasure / evaporation review | Tenant extension, NexCam, NexDocs | BROWSER-PROVEN | Reviewed preview architecture at `afc14538...`; legacy checklist compatibility live at `e75bdce...` | QA Visit: manual measurements → weather review → report → Visit/Job/NexDocs/Closeout | Add a separate Moasure-upload acceptance; manual measurement path is proven |
| Checklist data reuse | NexCam / NexDocs | IMPLEMENTED | Report linkage writes checklist context; the reopened UI currently requires re-entry of measurement values | Browser observation from QA Visit | Create a scoped reusable-checklist-values repair before claiming reuse |
| Job completion | Jobs, Visits | IMPLEMENTED | Completion control exists | Not exercised; doing so would alter the active QA job state | Register a separate safe QA completion path |
| Partial / staged invoicing | Invoices, Payments | IMPLEMENTED | Payment schedule UI and invoice rails exist | No current controlled staging proof | Prove after completion policy is exercised |
| Final-payment closeout gate | Jobs, Invoices, Payments | IMPLEMENTED | Closeout workflow distinguishes selection/delivery state | No current final-payment acceptance | Prove using a dedicated safe QA job; do not charge real payment data |
| Final invoice and payment | Invoices, Payments, Receipts | IMPLEMENTED | Existing rails present | No current safe end-to-end acceptance in this ledger | Queue after staged-invoicing proof |
| Closeout package selection | Jobs, NexDocs, NexCam | BROWSER-PROVEN | Existing package lifecycle | Current QA report listed with Visit origin; selected, saved, reloaded as one draft artifact | Preserve package-vs-delivery separation |
| Closeout delivery review | Jobs, Communications | BROWSER-PROVEN | Existing delivery-review rail | Prior safe staging proof accepted; no resend re-proof on current provider baseline | Re-prove only after provider identity is verified |
| Transactional email | NexComms, provider integration | IMPLEMENTED | Resend adapter accepted at `7217c2...`; secret guard accepted at `e3c92f...` | Safe send/historical proof must be performed after exact provider runtime verification | Highest external-facing dependency once provider health is truthful |
| Feedback and review workflow | Reputation, Communications | IMPLEMENTED | Review follow-up UI exists | No safe end-to-end sequence proof | Queue after delivery and final-payment policy |
| Client relationship history | Clients, Communications | BROWSER-PROVEN | `418e1714...` projects the authoritative booking-confirmation lifecycle event into Notes & Communications | The one booking event persisted across reload with no duplicate event | Preserve scoped event mapping and tenant-authorized Job reads |

## Current staging proof package

The following was exercised against exact live SHA `e75bdce409da808787c1ef0e58b0063bfed07114` using the safe QA Job `JOB-0003` and its linked QA Visit:

1. The Visit opened at its branded Detail surface and retained Client, Property, Job and schedule context.
2. Measurements opened without the former legacy-checklist schema error.
3. A safe manual calculation was reviewed against an actual weather snapshot before report generation.
4. `Pool evaporation report` appeared as a NexCam field report in Visit-scoped NexDocs, carrying its Job and originating Visit identifiers.
5. The same report appeared through the parent Job's NexDocs roll-up.
6. The Closeout artifact resolver listed the report as `field_report · nexcam`, displayed the originating Visit, saved its draft selection, and the saved selection survived a full reload/reopen.
7. At 390 × 844 the Visit Detail and Measurements surface opened without horizontal overflow; no browser console errors or crash were recorded.

## Immediate prioritized queue

1. Browser-prove reusable checklist-value hydration in the live Visit measurement workflow; this closes the currently observed checklist-data-reuse gap without transmitting a communication.
2. Browser-accept the live NexCam responsive corrective behavior, without reopening unrelated field-media behavior.
3. Register and prove the safe Job-first existing-Client and new-Client-return flows.
4. Implement and prove Shadow Mode recipient protection at the shared NexComms boundary before any additional external communications.
5. Treat On My Way and reminder delivery as separate external-communication slices requiring explicit owner approval immediately before transmission.

## Evidence discipline

- A deployed SHA is not browser proof.
- Browser proof is not owner acceptance.
- Staging-only QA artifacts remain isolated from live customer communications and payment instruments.
- No credential values belong in this ledger or its evidence references.
