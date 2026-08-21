# NexTeam Catch-Up Ledger

Last reconciled: 2026-08-20
Scope: staging-only Double Dragon evidence. This is a controlled progress ledger, not a substitute for the live Splinter registry or a production-readiness claim.

## Evidence discipline

- A deployed SHA is not browser proof; browser proof is not owner acceptance.
- The last safely observed live `/api/version` identity is `70fc4c109d3e409ed6c59d25b507bf7fa29e1835` (staging). It is the identity for this reconciliation, not evidence that later accepted candidates are live.
- No credential values belong in this ledger. Provider status is recorded only as non-secret configuration metadata.
- Closeout Delivery is **not** complete: the approved send was rejected before provider delivery because the UI and saved-package snapshots diverged. No approved Closeout email was delivered and no duplicate was created.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| PLANNED | No implementation or accepted behavior is recorded. |
| IMPLEMENTED | Source/accepted engineering evidence exists, but the required staging browser flow is not proven. |
| BROWSER-PROVEN | The behavior has been exercised through staging UI with recorded evidence. |
| OWNER-PROVEN | Owner has additionally accepted the relevant workflow or design decision. |
| ACCEPTED-AWAITING-DEPLOY | Exact SHA has accepted review evidence but is not established as live. |
| PARKED | Known work is intentionally not active because a higher dependency or a separate diagnosis is required. |
| OWNER/EXTERNAL BLOCKED | An action-time owner approval or external dependency is the only remaining boundary. |
| ACTIVE | A verified defect or authorized repair is currently in execution. |

## Deployment queue (preserved order)

| Candidate | Purpose | Status | Dependency |
| --- | --- | --- | --- |
| `e3c92f701cc058ecce26b74ff837f92898d8e808` | Permanent secret-output guard | Accepted and represented by the current staging baseline lineage | Must remain active for every deployment and provider operation |
| `7217c2a556e3188c388fc1b0b51c4af302b1c6f2` | Transactional Resend adapter | Accepted; non-secret health selection is available | Needs one safe approved external send after Closeout state repair |
| `a7705bbeab859619a201f524a1203edd398f55a0` | NexCam long-caption responsive repair | In previously observed live ancestry; final responsive re-proof remains | Browser re-proof only, no fabricated media |
| `afc14538b94c7e7a264be695366bec6469296a37` | Reviewed evaporation persistence | Accepted | Superseded by later accepted compatibility/hydration candidates for live proof |
| `c282c3eacaada2e9dca1ba101cf85e2277c95ec1` | Checklist-to-evaporation input hydration | Accepted | Requires staging deployment and browser proof before checklist-reuse can advance |
| `37ddcddce6b2454366f06e102ce5fac5085508d0` | Quote-to-Job idempotent conversion reconciliation | Accepted | Requires controlled browser proof of retry/convergence |
| `c3fd2f044f3aec125f1e04c08cdc4bdb8fece017` | Shared Shadow Mode recipient guard | Accepted | Must be live before another external test communication |

## Full program reconciliation

| Item / workflow | Status | Current SHA / evidence | Raphael | Live staging / browser proof | Current blocker or next executable action |
| --- | --- | --- | --- | --- | --- |
| Intake → Client / Property | BROWSER-PROVEN | Existing CRM/request rails | Historical accepted evidence | Browser-proven | Preserve; repeat only when an adjacent change requires it |
| Requests | BROWSER-PROVEN | `95b1a7f86ddcaf1cf5538b5aa29837187b4167d6` | PASS | Desktop/mobile proven | Preserve shared-template behavior |
| Quote Builder | OWNER-PROVEN | `8e163842a93f22184c635d39bfcd7c0e6a3f9346` | PASS | Desktop/mobile accepted | Preserve focused builder and legacy template-default compatibility |
| Client-first Quote | OWNER-PROVEN | Quote Builder reference | PASS | Browser/mobile accepted | Preserve carry-forward context |
| Quote-first existing Client | OWNER-PROVEN | Quote Builder reference | PASS | Browser/mobile accepted | Preserve selection path |
| Quote-first new Client → return to Quote | OWNER-PROVEN | Quote Builder reference | PASS | Browser/mobile accepted | Preserve unfinished-draft return |
| Quote approval → Job | IMPLEMENTED | `37ddcddce6b2454366f06e102ce5fac5085508d0` | PASS | QA Job exists; retry convergence not browser-proven | Deploy/reconcile candidate, then prove one controlled approval-to-Job path |
| Job-first existing Client | IMPLEMENTED | Existing Jobs entry rail | Existing coverage | No controlled end-to-end evidence | Register and prove after current Closeout repair |
| Job-first new Client → return to Job | IMPLEMENTED | Existing inline Client continuation | Existing coverage | No controlled end-to-end evidence | Register and prove without losing draft work |
| Scheduling | BROWSER-PROVEN | Shared Schedule/Visits rail | PASS | Browser-proven | Preserve scheduling contract |
| Booking Confirmation | BROWSER-PROVEN | `418e1714f042fd15a440aef2aecac12094161c6d` | PASS | One safe send and history persistence proven | No further send without action-time owner approval |
| Reminders | IMPLEMENTED | Existing scheduling communications path | Existing coverage | No controlled current-provider acceptance | Requires a separately approved safe send |
| On My Way / ETA | PLANNED | No accepted end-to-end proof | — | Not proven | Define and implement after reminders dependency |
| Visit workflow | BROWSER-PROVEN | Shared Visit roster/detail work | PASS | Detail, relationships, navigation proven | Preserve; re-exercise after later Visit changes |
| NexCam Visit media | BROWSER-PROVEN | `a7705bbeab859619a201f524a1203edd398f55a0` in prior live ancestry | PASS | Legitimate QA capture, Visit, Job, NexDocs, Closeout proven | Re-prove responsive corrective behavior on current/live successor |
| NexDocs | BROWSER-PROVEN | `cebe819faba9b8ae11926be8f84e35c1673d2740` | PASS | Visit/Job scope and origin proven | Preserve tenant/job/Visit filtering |
| Moasure data | IMPLEMENTED | Manual field-measurement path exists | Existing coverage | Dedicated import/device acceptance not proven | Define a safe source-specific proof; do not fabricate data |
| Evaporation calculation | BROWSER-PROVEN | `afc14538b94c7e7a264be695366bec6469296a37` | PASS | Reviewed calculation/report flow proven | Preserve reviewed-token integrity |
| Checklist data reuse | IMPLEMENTED | `c282c3eacaada2e9dca1ba101cf85e2277c95ec1` | PASS | Not browser-proven on live build | Deploy then browser-prove hydration |
| Job completion | IMPLEMENTED | Existing lifecycle controls | Existing coverage | Active QA Job not completed | Use a separate safe QA completion path |
| Partial / staged invoicing | IMPLEMENTED | Payment schedule and invoice rails | Existing coverage | No controlled staging proof | Prove after safe completion policy |
| Final-payment closeout gate | IMPLEMENTED | Job, invoice, payment lifecycle rules | Existing coverage | No end-to-end proof | Use dedicated test payment data only |
| Stripe test-mode flow | IMPLEMENTED | Payment adapter/test coverage exists | Existing coverage | No controlled browser proof | Exercise after staged invoice proof, with safe test payment instrument |
| Receipt | IMPLEMENTED | Invoice/payment receipt rail exists | Existing coverage | No controlled browser proof | Prove after test payment |
| Closeout Package selection | ACTIVE | Current repair: authoritative hydration and Delivery Review invalidation | Pending exact review | Prior one-artifact proof exists; two-artifact state is not yet re-proven | Test, review, deploy, browser-prove two persisted NexDocs/NexCam selections |
| Closeout Delivery | OWNER/EXTERNAL BLOCKED | Prior Resend attempt rejected pre-provider; no email delivered | Prior provider review PASS | Browser failure diagnosed; no delivery/history event | After package repair, request one new action-time approval for exactly one safe retest |
| Resend transactional provider | IMPLEMENTED | `7217c2a556e3188c388fc1b0b51c4af302b1c6f2` | PASS | Runtime health selection previously reports Resend without secret exposure; no successful Closeout proof | Complete only through approved safe external send |
| Shadow Mode recipient guard | ACCEPTED-AWAITING-DEPLOY | `c3fd2f044f3aec125f1e04c08cdc4bdb8fece017` | PASS | Configuration set via guarded staging action; live enforcement SHA not yet verified | Deploy/verify before further external send |
| Feedback | IMPLEMENTED | Review-follow-up rail | Existing coverage | No safe end-to-end proof | Queue after payment/receipt and Closeout delivery |
| Google review workflow | IMPLEMENTED | Review sequence capability | Existing coverage | No safe end-to-end proof | Queue with feedback; requires action-time message approval |
| Client relationship history | BROWSER-PROVEN | `418e1714f042fd15a440aef2aecac12094161c6d` | PASS | Booking confirmation projected and persisted | Preserve scoped lifecycle mapping |
| Nexi Client-search defect | PARKED | No current verified reproduction in the ledger | — | Not proven | Reproduce against a controlled Client context before changing behavior |
| Nexi invoice-count defect | PARKED | No current verified reproduction in the ledger | — | Not proven | Reproduce against controlled invoice data before changing behavior |
| Design Contract / shared shell / templates | OWNER-PROVEN | Shared shell/template accepted references | PASS | Client, Quote, Request, Jobs foundations proven | Reuse; do not fork page architecture |
| Usage-Reset / Claude catch-up items | PARKED | No active verified implementation item in the registry evidence | — | Not proven | Reconcile only when an authoritative controller work item is registered |
| Double Dragon reliability ledger | ACTIVE | This document | N/A | Reconciled against safe evidence | Update with each accepted deployment/browser result |

## Reconciliation totals

| Measure | Count |
| --- | ---: |
| Total known catch-up items | 36 |
| Live / browser-proven or owner-proven | 14 |
| Implemented but not browser-proven | 14 |
| Accepted awaiting deployment | 1 |
| Currently active | 2 |
| Parked | 3 |
| Owner/external blocked | 1 |
| Planned | 1 |

The totals classify each item once. `OWNER-PROVEN` is counted with browser-proven evidence; it is not a production-readiness score.

## Next five dependency-ready actions

1. Repair and browser-prove Closeout’s two-artifact persistence/hydration behavior without sending external communication.
2. Stage and browser-prove checklist-to-evaporation hydration (`c282c3e...`) after the Closeout candidate is accepted and ordered.
3. Browser re-prove the NexCam responsive corrective behavior already represented in prior live ancestry.
4. Register and prove Job-first existing-Client and new-Client-return flows without transmitting external communications.
5. Reconcile the Quote approval-to-Job candidate (`37ddcdd...`) and prove its safe deterministic conversion behavior.

## External communication boundary

No additional external email or SMS may be sent until the precise workflow has an action-time owner approval, the applicable live Shadow Mode enforcement is verified, and the recipient is an approved staging test address. A provider/API acceptance is not delivery proof.
