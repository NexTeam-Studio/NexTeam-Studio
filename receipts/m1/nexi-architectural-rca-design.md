# Nexi Trial Architectural RCA

Generated: 2026-07-06

Source export:
- `receipts/m1/nexi-trial-full-session-export-redacted.json`
- 170 conversation turns
- 80 conversation IDs
- 50 `failureLog` entries
- 198 `usageLog` entries

Taxonomy receipt:
- `receipts/m1/nexi-architectural-rca-taxonomy.json`

## Root Cause

Nexi's current architecture lets the LLM and a regex chain decide too much:

- Which rails count as required for a business question.
- Whether a missing field in one rail means the real answer does not exist.
- Whether a relative date/tool argument is traceable.
- Whether a turn is an action, correction, feedback, meta question, or fact lookup.
- Whether "we cannot do that yet" is a capability gap or missing data.

That made each patch local to the phrase that failed. The same underlying class returned when the phrase, rail, or tool changed.

## Failure Classes

### CLASS A: Single-Rail Conclusions

Examples:
- Camp Mikell issue lookup stopped at Jobber title instead of CompanyCam report.
- Deborah Justice completion time stopped at Jobber lead status instead of CompanyCam report.
- Rachel Payne payment status stopped at Jobber lead/status and did not exhaust invoice/email rails.
- Deborah Justice gallons reused Camp Mikell blueprint before entity binding was enforced.

Architectural cause:
- Required rails are not a first-class policy.
- `deterministicToolNames()` returns a list of tool names, but it is still phrase-driven.
- Live `/api/nexi/message` did not include CRM invoice tools, so payment questions had no invoice rail available.

Structural fix:
- Add a policy registry that maps intent classes to required rails before any LLM answer.
- Job issue/completion/technician/report questions require Jobber + CompanyCam docs/photos as applicable.
- Payment/status questions require Jobber + native invoice + email receipt search when configured.
- A required rail can return "no match", but the answer cannot conclude until every required rail has run or is explicitly unavailable.

### CLASS B: Fabricated Or Untraceable Tool Inputs

Examples:
- "Tomorrow" queried Jan 1-2, 2024.
- ETA follow-up used the wrong date window from context.
- Semrush body lookup surfaced `Invalid time value`.

Architectural cause:
- Tool input normalization fills missing fields but does not reject or override stale fields supplied by the LLM.
- Relative dates are resolved in multiple places instead of pinned to one deterministic `TimeContext`.
- Tool errors can still surface as assistant-facing strings.

Structural fix:
- Add a traceable input validator for every deterministic tool run.
- Schedule windows must be derived from user words, stored conversation context, or an explicit fixed clock.
- If a schedule/date parameter is not traceable, reject before the tool call and ask for clarification.
- Tool exceptions return typed safe failures, never raw exception text.

### CLASS C: Intent Misrouting

Examples:
- "Send me an email..." routed to searchEmail.
- Correction follow-up routed to email lookup.
- Feedback/formatting complaints triggered fact/source handling.

Architectural cause:
- Action/meta/feedback/fact intents compete in the same routing chain.
- Source enforcement happens after answer generation, so a wrong intent can still get stonewalled.

Structural fix:
- Add a deterministic intent classifier before rail selection.
- Precedence order: correction/feedback/meta, outbound action, explicit email read, business fact.
- Action commands route only to ApprovalQueue draft tools and are exempt from fact-source gating.
- Corrections always log `user_flagged_incorrect` and then trigger the recovery policy for the corrected domain.

### CLASS D: Capability Gap Answered As Data Failure

Examples:
- Distance/how-far questions received "I don't have that written down" instead of "I can't measure distance yet."
- Open Google Maps request lacked a direct action/capability response.

Architectural cause:
- No capability inventory separates "tool exists but found no data" from "tool does not exist."

Structural fix:
- Add capability registry checks before source enforcement.
- If intent requires a missing tool, return a capability-gap answer and log `capability_not_available`.
- If the tool exists and returns no data, return checked-but-missing-data wording.

### CLASS E: Source Gate Scope

Examples:
- "What sources do you use" received no-source stonewall.
- Feedback/corrections and formatting notes were source-gated.

Architectural cause:
- Source gate decides from answer text and latest prompt, but it is not fed the deterministic intent class.

Structural fix:
- Source enforcement only applies to `business_fact` answers.
- Meta/action/feedback/capability-gap turns bypass fact-source gating and use their own contracts.

### CLASS F: Client UI Contract Gap

Example:
- Photos rendered as thumbnails but were not tappable/savable.

Architectural cause:
- Server media success did not imply client interaction success.

Structural fix:
- Keep photo open/save behavior covered by regression wall UI tests, not just API tests.

### CLASS G: Output Quality Rule Not Enforced

Example:
- Inbox triage was technically correct but formatted like internal data instead of owner-useful work.

Architectural cause:
- Formatting was prompt guidance before server-side display contracts.

Structural fix:
- Keep triage and summaries as structured tool output: sender, subject, one-line ask, priority group, minimal IDs.
- The final formatter can only render those fields.

## Regression Wall Design

Every trial turn becomes a named test case. The case checks behavior rather than stale literals when real-world data can change.

Required per-case fields:
- `id`
- `createdAt`
- `conversationId`
- `question`
- `expectedIntent`
- `requiredRails`
- `forbiddenRails`
- `expectedBehavior`
- `assertions`

Merge/deploy rule:
- Any change touching Nexi, tools, SOUL, or a data rail must run the full wall live against staging.
- Daily line must include `regression wall: X/X` or named failures.
- New trial questions are appended in the same cycle as the audit.

## Implemented In This Pass

- `deterministicToolNames()` now enforces multi-rail policy before model judgment for payment, schedule, report, technician, gallons, email, and capability-gap classes.
- Tool input normalization overwrites untraceable schedule windows with tenant-local user/context dates, preventing stale fabricated dates from reaching `getSchedule`.
- Meta, exact-echo, and feedback turns now return through a no-tool path before the model can call search/read tools.
- Email action commands stay routed to `draftEmail`/ApprovalQueue only.
- `invoiceStatus` is available to Nexi from the native CRM read rail.
- The source contract and web client accept the `email` source rail.
- The regression wall generator builds 170 named cases from 80 Firestore sessions and now distinguishes business-fact missing data from action/meta/capability stonewalls.
- `/api/version` no longer trusts the legacy `GIT_SHA` shim; staging uses the explicit non-secret `NEXTEAM_DEPLOY_SHA` deployment stamp plus live wall behavior receipts.

## Current Live Blocker

The full live wall cannot honestly be marked passed yet. Current staging commit `fb3cd745f43bb473a1fc98165cad3c0ddf488060` reports a matching `/api/version` SHA and green `/api/health`, but even a one-case live wall probe now fails with Firestore `RESOURCE_EXHAUSTED: Quota exceeded`.

Receipt:
- `receipts/m1/nexi-regression-wall-live-blocked-quota.json`

Local verification completed before the quota blocker:
- `npm run build`
- `npm test -- --runInBand` (`95/95`)
- `npm run lint`
- `npm run typecheck`
- `npm run check:secrets`
