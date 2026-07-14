# NexOps Operating Model Gap Analysis + Ask List

Date: 2026-07-12

Source bible: `C:\Users\Peyto\Downloads\JOBBER-OPERATING-MODEL-NEXOPS-BIBLE-v2.md`

Cross-referenced against:

- `BUILDSTATE.md`
- `packages/core/src/types.ts`
- `packages/core/src/schemas.ts`
- `packages/providers/src/native/NativeAdapter.ts`
- `packages/providers/src/jobber/JobberAdapter.ts`
- `apps/server/src/crm/*`
- `apps/server/src/scheduling/*`
- `apps/server/src/fielddocs/*`
- `apps/server/src/content/*`
- `apps/server/src/sites/*`
- `apps/server/src/platform/*`
- `apps/web/src/main.tsx`

This document is a scoping reference, not a build instruction. It records what NexOps already has, what is partial, what is still absent, and where NexOps should deliberately avoid copying Jobber.

Status note:

- The original ask-list in this document was resolved by Chris on 2026-07-12.
- The settled decision record now lives in `docs/specs/phase1/NEXOPS-OPERATING-MODEL-DECISIONS-20260712.md`.
- Future lifecycle scoping should read this gap analysis first, then the settled decisions document, then the source bible.

## 1. Executive Summary

### Already built

- Native `Client`, `Property`, `Job`, `Quote`, `Invoice`, and `Visit` records exist in shared core contracts.
- The CRM already supports native client creation, read-side lists, quote drafting, quote signing via a portal token, invoice creation from a signed quote, Stripe checkout session creation, and Stripe webhook payment completion.
- Scheduling already owns first-class visit records, conflict detection, drive-time slot suggestions, booking, reminder drafts, and on-my-way drafts through ApprovalQueue.
- Lead intake exists through the M8 site lead form and emits `lead.received`.
- Tenant branding/settings groundwork exists in platform routes and repository.

### Partially built

- Quote lifecycle exists, but only the narrow draft -> pending_approval -> sent -> signed/declined path.
- Job lifecycle exists only as a simplified direct status enum, not the bible's reminder-driven state machine.
- Invoice lifecycle exists only as draft/sent/paid/void/overdue and lacks bad debt, partial-pay semantics, deposits, and billing-history behavior.
- Notifications exist as isolated rails and approval drafts, not as a unified settings-driven trigger system.
- Portal access exists for quote signing only, not a full client hub.
- Event contracts exist for several lifecycle events, but the internal audit feed/home queue behavior is not built.

### Not built

- A first-class CRM `Request` object and its full conversion/archive lifecycle.
- Invoice reminders as first-class objects.
- Job close/cancel flows and their cascades.
- Distinct bad-debt handling.
- Deposits, refunds, payment records, statements, saved payment methods, and auto-pay behavior.
- The three-level tax hierarchy.
- A real admin activity feed/home queue derived from statuses.

### Deliberately not matching Jobber

- NexOps already models a richer client/property/contact structure than Jobber's flatter client model. This should be preserved.
- Outbound notifications in current NexOps lanes are intentionally approval-gated instead of silently sending direct automations.
- Scheduling is already being shaped around visit conflict/distance control instead of reproducing Jobber's weaker visit pile-up behavior.

## 2. High-Stakes Patterns

### 2.1 Invoice-reminder-as-state-driver

Classification: `NOT BUILT`

Current evidence:

- `packages/core/src/types.ts` defines direct job statuses only: `lead`, `quoted`, `scheduled`, `in_progress`, `complete`, `invoiced`, `paid`.
- `packages/providers/src/native/NativeAdapter.ts` updates job state directly with `updateJobStatus`.
- `apps/server/src/crm/routes.ts` moves a job to `paid` when Stripe marks an invoice paid.
- No reminder object, reminder repository, reminder route, or derived `requires_invoicing` state exists anywhere in CRM code.

Implication:

- NexOps does not currently work the way the bible describes.
- If NexOps is meant to follow the bible here, the current job model needs a real re-architecture: reminder objects must become the driver, and job list state must be derived from reminder timing plus visit timing, not manually written enums.

### 2.2 Job-closing cascade warnings

Classification: `OPEN RISK / NOT BUILT YET`

Current evidence:

- No job-close route or cancellation route exists in `apps/server/src/crm`.
- No code path currently triggers auto-charge on close.
- No code path currently triggers job follow-up email on cancellation.
- Scheduling reminders exist, but only as approval drafts for visits in `apps/server/src/scheduling/routes.ts` and `notifications.ts`.

Implication:

- NexOps is safe only by omission right now.
- The moment close/cancel lands, the two bible warnings must be handled intentionally:
  - closing a billable job must not accidentally charge without an explicit rule
  - cancellation must not accidentally fire a follow-up email

### 2.3 Void vs Bad Debt

Classification: `PARTIALLY BUILT`

Current evidence:

- `packages/core/src/types.ts` and `schemas.ts` include invoice status `void`.
- No `bad_debt` status or separate write-off path exists.
- No payment/balance ledger exists to support partial-payment plus bad-debt handling.

Implication:

- NexOps currently has only one half of the bible's deliberate split.
- A real invoice lifecycle pass must add bad debt as a distinct accounting path, not collapse everything into cancel/void.

### 2.4 Three-level tax hierarchy with linked-vs-custom properties

Classification: `NOT BUILT`

Current evidence:

- Native totals carry only a numeric `tax` field on jobs, quotes, and invoices.
- `packages/providers/src/native/NativeAdapter.ts` computes quote totals with `tax: 0`.
- `apps/web/src/main.tsx` shows only a placeholder `Tax rate` select with `No tax rate created`.
- `packages/providers/src/jobber/JobberAdapter.ts` reads product `taxable`, but that does not become a native tax settings model.

Implication:

- NexOps has no global default tax, no per-property linked/default toggle, no custom property override, no tax groups, and no taxation report model.

## 3. Cross-Reference Matrix

| Bible area | Current NexOps state | Classification | Notes |
|---|---|---|---|
| Object model: client + contacts + billing identity | Native client contracts support contacts, billing address, billing-contact flags, communication settings, and custom fields. | `PARTIALLY BUILT` | Stronger than Jobber structurally, but archive state, billing history, hub access, and active-work gating are absent. |
| Object model: property/site hierarchy | `Property.parentSiteId`, property contacts, access notes, and separate property records exist. | `DELIBERATELY NOT MATCHING JOBBER` | This is a better structure than Jobber's flatter model and should stay. |
| Client archiving and unarchive cascades | No archive status or archive/unarchive routes in native CRM. | `NOT BUILT` | Bible rules like "cannot archive with active work" and "new request auto-unarchives" do not exist yet. |
| Request object and lifecycle | No first-class CRM request type in core/server. M8 site leads and M10 intake exist, but they are separate rails. | `NOT BUILT` | `apps/server/src/sites/routes.ts` captures `lead.received`; `apps/web/src/main.tsx` labels Requests as scaffolded only. |
| Request conversion to quote/job | UI scaffold text exists only. | `NOT BUILT` | `apps/web/src/main.tsx` says `Convert request to quote/job`, but there is no server-side request conversion engine. |
| Quote core record | Native quote record exists with totals, approval id, portal token, signature metadata, PDF ref, and optional job link. | `ALREADY BUILT` | Base object is real. |
| Quote status machine | Native quote status is `draft`, `pending_approval`, `sent`, `signed`, `declined`. | `PARTIALLY BUILT` | Missing converted/archive behavior, change-request path, and automation distinction. |
| Quote send/sign flow | Quote draft route queues approval; portal signing writes `signedBy`, `signedAt`, `signatureIp`, and emits `quote.signed`. | `ALREADY BUILT` | This is the strongest built slice of the lifecycle model today. |
| Quote signature integrity after edits | No rule strips signatures when approved quotes are edited. | `NOT BUILT` | This is a major bible behavior gap. |
| Quote deposits / payment schedules / optional items / discounts | No native deposit object, no payment schedule, no optional items, no discount model. | `NOT BUILT` | Discount cascade cannot exist because discount state itself does not exist. |
| Quote-to-job conversion | No dedicated conversion route/object mutation exists. | `NOT BUILT` | Jobs can link back to quotes, but conversion behavior is not implemented. |
| Job core record | Native job record exists with client/property linkage, line items, totals, and simplified status. | `PARTIALLY BUILT` | Object exists, lifecycle does not. |
| Job full status machine | Current status enum is `lead`, `quoted`, `scheduled`, `in_progress`, `complete`, `invoiced`, `paid`. | `PARTIALLY BUILT` | This is much simpler than Active/Upcoming/Today/Late/Unscheduled/Action Required/Requires Invoicing/Ending Within 30 Days/Archived. |
| Invoice reminder object/mechanism | No reminder model in CRM. | `NOT BUILT` | This is the core blocker for matching the bible's job-state behavior. |
| Visit object | Native visit object exists in scheduling and fielddocs checklist memory. | `ALREADY BUILT` | Visits are a real first-class record in NexOps today. |
| Reschedule cascade | Visit move tooling exists, but there is no automatic reminder regeneration or forced client-notify prompt. | `PARTIALLY BUILT` | Scheduling can move visits, but the bible cascade is not there yet. |
| Job close/cancel | No close/cancel flow exists. | `NOT BUILT` | This includes incomplete-visit prompts, cancellation handling, and reminder deletion/retention logic. |
| Invoice core record | Native invoice object exists with quote/job linkage, PDFs, checkout, webhook payment completion, and `invoice.paid` event. | `PARTIALLY BUILT` | Good foundation, but still shallow compared with the bible. |
| Invoice status machine | Native status is `draft`, `sent`, `paid`, `void`, `overdue`. | `PARTIALLY BUILT` | Missing `awaiting payment` naming, partial-payment semantics, bad debt, and richer billing-history behavior. |
| Invoice from signed quote | `POST /api/crm/quotes/:id/invoice` exists and reuses prior invoice if already created. | `ALREADY BUILT` | This specific path is real. |
| Invoice merge/multi-job invoicing | No support. | `NOT BUILT` | Bible behavior is absent. |
| Payments as first-class objects | No native payment entity in core/server. | `NOT BUILT` | Current payment behavior is an invoice status change plus Stripe session metadata. |
| Deposits | No first-class deposit model. | `NOT BUILT` | Neither quote deposits nor billing-history deposits exist. |
| Refunds | No refund model or route. | `NOT BUILT` | Manual-only refund receipt behavior also absent. |
| Partial payments | UI hints at `partially_paid`, but shared core contract does not support it. | `PARTIALLY BUILT` | This is a scaffold-level hint, not an implemented lifecycle. |
| Auto-pay / automatic payment failures | No business auto-pay model. | `NOT BUILT` | Only platform subscription billing has Stripe customer/payment-method behavior, which is a different domain. |
| Tax hierarchy | Only numeric tax totals and a placeholder tax-rate UI exist. | `NOT BUILT` | No global default, property link/custom choice, or tax reporting model. |
| Statements | No statement object, generation flow, or report. | `NOT BUILT` | Nothing in server or UI matches bible statement behavior. |
| Notification trigger map | Client communication preferences exist and scheduling/quote/review drafts exist in isolated slices. | `PARTIALLY BUILT` | No central trigger registry, template system, or per-object notification ruleset yet. |
| Booking confirmations / visit reminders / on-my-way | Scheduling can queue booking, reminder, and on-my-way drafts through ApprovalQueue. | `PARTIALLY BUILT` | Present, but still approval-only and not settings-driven automation. |
| Quote approval confirmation | `quote.signed` event exists. | `PARTIALLY BUILT` | Event is emitted, but the auto confirmation email behavior from the bible is not wired in CRM. |
| Invoice receipt / review request | Stripe `invoice.paid` event exists; reputation rail can queue review requests. | `PARTIALLY BUILT` | Current review request flow is not yet coupled to real invoice payment rules the way the bible describes. |
| Payment failure internal notice | No business auto-pay failure handler. | `NOT BUILT` | Bible's "always notify admins even if toggles are off" rule is absent. |
| Client hub / portal | Quote portal exists for view + sign only. Stripe checkout URLs point to invoice portal paths, but no matching invoice portal pages/routes exist. | `PARTIALLY BUILT` | Full hub behavior is not there yet. |
| Activity feed / admin home queues | Event bus types exist and a few modules emit events. No persistent activity-feed model or home queue UI exists. | `NOT BUILT` | `job.completed`, `visit.booked`, `visit.completed`, and `quote.sent` are defined contractually, but most are not actually emitted or surfaced. |
| Settings architecture | Tenant branding, platform billing, approval settings, operator UI theme, and some communication preferences exist. | `PARTIALLY BUILT` | Nothing close yet to the bible's complete settings surface for work defaults, tax, reminders, templates, automations, requests/bookings, and payments. |
| Master cause-and-effect table overall | Only isolated slices are implemented: `lead.received`, `quote.signed`, `invoice.paid`, media upload, scheduling message drafts. | `PARTIALLY BUILT` | NexOps has event seeds, not a fully connected lifecycle graph. |

## 4. Deliberate Non-Matches NexOps Should Keep

### 4.1 Do not copy Jobber's flat client shape

Evidence:

- `Client` and `Property` support parent billing vs local property contacts.
- `Property.parentSiteId` already creates space for multi-site/client hierarchies.
- `apps/web/src/main.tsx` is already framed around parent client, service sites, billing, work, and contacts.

Recommendation:

- Keep this as a permanent divergence.
- The bible remains useful for lifecycle/state/cascade rules, but not for flattening NexOps back down to Jobber's client model.

### 4.2 Do not copy direct uncontrolled outbound sends

Evidence:

- Scheduling reminders, content drafts, review replies, site lead notifications, and most draftable outbound actions are approval-gated.

Recommendation:

- Keep approval-gating as the default NexOps safety posture unless Chris explicitly chooses an automation to bypass it.

### 4.3 Do not copy passive visit-pile-up scheduling

Evidence:

- M3 already has conflict detection and least-drive slot reasoning in `schedulingEngine.ts`.

Recommendation:

- Keep visit scheduling opinionated and conflict-aware rather than mirroring Jobber's weaker pile-up tendencies.

## 5. Original Ask List for Chris

Status: resolved. See `NEXOPS-OPERATING-MODEL-DECISIONS-20260712.md` for the settled record.

These are scoping decisions, not build instructions.

### A1. Request object

Decision:

- Should NexOps create a real first-class `Request` object now, with statuses and conversion history, or keep website leads/intake as separate pre-CRM rails until later?

Default recommendation:

- Follow the bible and add a real Request object before deeper quote/job lifecycle work.

### A2. Quote lifecycle breadth

Decision:

- Should NexOps match the bible's richer quote behavior now: converted terminal state, change-request path, signature invalidation after material edits, and deposit/payment-schedule support?

Default recommendation:

- Follow the bible on signature integrity and converted state.
- Delay deposits/payment schedules only if Chris wants invoice/payment work sequenced first.

### A3. Quote-to-job conversion model

Decision:

- Should quote conversion create a new job snapshot exactly once, with discount carry-forward reserved for invoice time and no live linkage back to quote line edits?

Default recommendation:

- Follow the bible snapshot pattern.

### A4. Job state architecture

Decision:

- Should NexOps replace the current direct job-status enum with a reminder-driven derived model that can express Upcoming, Today, Late, Action Required, Requires Invoicing, and Archived?

Default recommendation:

- Yes. This is the most important architecture choice in the whole document.

### A5. Job close/cancel safety

Decision:

- When close/cancel is built, should NexOps:
  - force an explicit invoice-now / remind-later / no-billing path
  - suppress cancellation follow-up by default unless the operator re-enables it
  - forbid any implicit charge on close without an explicit payment step

Default recommendation:

- Yes to all three.

### A6. Invoice status model

Decision:

- Should NexOps expand invoice states to include at least awaiting payment, partially paid, paid, void, and bad debt as distinct deliberate paths?

Default recommendation:

- Yes.

### A7. Payments/deposits/refunds

Decision:

- Should deposits, payments, refunds, and billing-history credits become first-class ledger objects before broader payment UI work proceeds?

Default recommendation:

- Yes, because bad debt, statements, receipts, tax reporting, and client balance all depend on it.

### A8. Tax system

Decision:

- Should NexOps adopt the three-level tax hierarchy now:
  - global default
  - property linked to default
  - property custom override

Default recommendation:

- Yes. Tax should be built as a shared model, not as per-form math patches.

### A9. Portal scope

Decision:

- Should the current quote-signing portal grow into a full client hub for quotes, invoices, appointment confirm-back, receipts, and statements, or should quote signing remain standalone until invoices/payments are deeper?

Default recommendation:

- Build invoice view/pay next, but do not claim a full client hub until statements and payment history exist.

### A10. Notifications architecture

Decision:

- Should NexOps keep the current approval-first posture for external notifications even when the bible describes true automations, or should specific notification classes become auto-send once owners configure them?

Default recommendation:

- Keep approval-first by default, then allow Chris to explicitly bless narrow auto-send classes later.

### A11. Activity feed + home queues

Decision:

- Should NexOps build an internal event feed and queue-driven Home early, using derived lifecycle states instead of a static dashboard?

Default recommendation:

- Yes. The bible is right that this becomes the operator heartbeat.

## 6. Recommended Build Order

If Chris chooses to follow the bible closely, the clean order is:

1. Request object + quote-to-job conversion decision.
2. Reminder-driven job lifecycle architecture.
3. Invoice lifecycle expansion: awaiting payment, partial pay, bad debt, void.
4. First-class payment/deposit/refund ledger.
5. Tax hierarchy.
6. Notification/settings architecture.
7. Client hub and statements.
8. Activity feed + derived Home queues.

This order matters because the later layers depend on the earlier state model being correct.
