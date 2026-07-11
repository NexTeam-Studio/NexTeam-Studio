# NEXTEAM PHASE 1 MASTER SPEC â€” "JOBBER ON STEROIDS"
**Vision + lane ownership + build method + what Atlas asks Chris for before each piece.**
Owner: Chris Sears | Date: 2026-07-10 | Governs: the full job-lifecycle build

---

## 1. THE VISION IN ONE PARAGRAPH

NexTeam replaces Jobber + CompanyCam + a marketing agency for a trade business â€” run by talking to Nexi, backed by screens so simple a 5-year-old can use them. Chris uses Jobber 90% on mobile, 10% web: **mobile-first is the design law.** Every feature Jobber does in this lifecycle, NexTeam does â€” plus the things Jobber's own customers complain it can't: one-question answers ("who owes me money?"), unified reporting, AI-drafted marketing from real completed jobs. The target is not parity. The target is Jobber's lifecycle with Nexi as the brain and marketing built in â€” better than any agency because it markets from real job data, automatically, with owner approval on everything.

## 2. LANE OWNERSHIP LAW (the construction-trades rule)

Per the GC Hierarchy already established: **one code area owns one job. No lane edits another lane's files â€” ever.** A lane may READ/CALL another lane's data through its interfaces, never modify its logic. Cross-lane needs get flagged to Chris, who routes them to the owning lane's session.

| Lane | Owns | May call (read-only) |
|---|---|---|
| M2 CRM | client records, multi-site hierarchy, intake, products/services catalog, quotes, invoices, payments | â€” |
| M3 Scheduling | calendar, visits, booking flow, confirmations/reminders | M2 clients/quotes |
| M4 Field Docs | checklists, completion reports, PDFs, photos/media | M2 jobs, M3 visits |
| M6 Comms | email/SMS rails, templates, sequences | M2 contacts, M4 reports |
| M7 Reputation | review requests + follow-up sequences, GBP | M6 send rails, M4 closeouts |
| M5 Content | articles, social drafts, content queue | M4 job data/photos |
| M8 Web/UI | dashboard, client hub, branding, embeddable form | everything (display only) |
| M1 Nexi | tool registry, routing, conversation | every lane's tools |

Shared contracts (packages/core) = the survey lines: changed rarely, with everyone's awareness, never casually.

## 3. THE FULL LIFECYCLE TO BUILD (Phase 1 scope)

### 3.1 INTAKE (M2 + M8)
- Manual client entry (owner/office)
- **Embeddable web form**: customizable fields, generates embed code, submissions auto-create CRM contact + lead. [NEW â€” needs design confirmation before build]
- In-CRM "request" option for existing clients (Jobber's Requests pattern)

### 3.2 CLIENT CRM (M2) â€” the foundation everything sits on
- Person: first/last name, multiple labeled phones (add as needed), multiple labeled emails (add as needed), property address
- **Multi-site clients (contractors, property managers):** business name; toggle to use business name as forward-facing; primary contact (first/last); billing address + billing contact SEPARATE from properties; unlimited properties under one client, each with its own address, label/name, gate codes, on-site contact person/phone/email
- Full history per client: every quote, job, visit, invoice, communication
- Document/photo storage on the client record

### 3.3 QUOTING (M2)
- Attractive client-facing layout â€” Jobber's polish is the bar (screenshots to follow from Chris)
- Line items from pre-built products/services catalog OR created on the fly and saved back to catalog
- Quote templates
- Sent via email AND SMS; client views + approves via link
- **Expiry ticker** [NEW â€” needs design confirmation]: toggleable validity window (7/10/X days); expired quotes disable approval until owner resets/adjusts
- Payment options on quote: optional required card on approval, deposits, payment schedules (deposit now / balance on completion / custom)

### 3.4 APPROVAL â†’ SCHEDULING (M3)
- Approved quote flows directly into booking
- Booking confirmations via email + SMS; reminders
- Calendar (day/week/map) shows visits â€” already partially built, extend

### 3.5 CLIENT HUB (M8)
- Client-facing portal: all their work â€” past, current, scheduled; view/approve quotes; pay invoices
- Jobber's Client Hub is the reference pattern

### 3.6 VISIT â†’ COMPLETION â†’ CLOSEOUT (M4 + M2)
- Checklist-driven visit execution (existing extraction-schema pattern), company-branded
- Completion converts checklist â†’ PDF report automatically
- Closeout: mark complete â†’ charge payment method on file (if saved) â†’ auto-send receipt â†’ **attach the real report PDF to the receipt**
- Tipping: settings toggle to enable tip prompt on invoices/receipts

### 3.7 REVIEW FOLLOW-UP (M7)
- Post-closeout: automated Google review request, then a follow-up SEQUENCE (multiple nudges) that stops on review completion OR sequence expiry
- DEPENDENCY: blocked on GBP OAuth resolution â€” build the sequence logic ready, do not wire to a connection that doesn't exist

### 3.8 MARKETING DROP-IN (M5/M6 â€” deferred, note only)
- On intake, client joins content/campaign eligibility (articles, social drafts from their completed jobs)
- Phase 2 â€” logged, not built now

## 4. "ON STEROIDS" â€” WHERE NEXTEAM BEATS JOBBER

1. **Nexi answers what Jobber's dashboard fragments:** "who owes me money," "how many leads this week," "what's unscheduled but approved" â€” one question, one sourced answer. (Jobber's own 2026 reviews name fragmented reporting as its top weakness.)
2. **Marketing from real jobs, automatically:** completed job â†’ drafted article/GBP/social post â†’ owner approval queue. No agency does this from live job data.
3. **Unified approvals:** quotes, emails, content, reviews â€” one queue, one habit.
4. **Voice in the field:** hands-free Nexi at the pool deck. Jobber has nothing equivalent.
5. **Offline-first mobile (M11, later phase):** the feature Jobber has failed to ship for a year.

## 5. BUILD METHOD â€” ASK FIRST, BUILD SECOND (mandatory)

**Before building each numbered piece above, Atlas posts an ASK LIST to Chris:**

```
PIECE: [e.g., 3.2 Client CRM]
ALREADY EXISTS (mapped vs BUILDSTATE/lane files): [honest list]
GENUINELY NEW: [list]
WHAT I NEED FROM CHRIS BEFORE BUILDING:
  - Screenshots: [specific Jobber screens that would anchor this piece]
  - Decisions: [each open design question, stated as a choosable option]
  - Assets: [logos, templates, wording, pricing data, etc.]
  - Credentials/config: [flag early per standing rule]
JOBBER RESEARCH FINDINGS: [what their Help Center shows for this
  feature; where I propose following their pattern; where I propose
  deviating and why â€” especially known Jobber weaknesses I should NOT
  replicate]
PROPOSED BUILD SEQUENCE FOR THIS PIECE: [small, testable steps]
```

Chris answers the ask list; THEN the build starts. No piece begins on assumptions where an ask would have prevented a redo.

**Research rule:** Jobber's public Help Center (help.getjobber.com) and product-update pages are the reference for field names, flows, and UI patterns â€” reference, never verbatim spec. Where Chris's spec is silent, default to Jobber's pattern and FLAG it ("using Jobber's pattern for X â€” confirm or override"). Where Jobber is known-weak, flag and propose better. Never copy code, markup, or proprietary structure â€” visual/UX inspiration only.

**Review rhythm:** build the smallest complete testable piece â†’ live on staging â†’ Chris tests with real usage â†’ adjust â†’ next piece. Never batch a whole lane for one big review.

**Styling law (every screen, every lane):** attractive, modern, and so simple a 5-year-old can use it. Mobile-first always. Jobber's home-screen workflow bar (color-coded stage cards, big numbers, small breakdowns) is a confirmed good pattern to reference.

## 6. BUILD ORDER

1. **3.2 Client CRM** (foundation â€” multi-site hierarchy is the hard part, do it first)
2. **3.1 Intake** (manual + request; embeddable form after its design confirmation)
3. **3.3 Quoting** (catalog + templates + expiry + payments)
4. **3.4 Scheduling flow** (approval â†’ booking â†’ confirmations)
5. **3.5 Client Hub**
6. **3.6 Visit/closeout/billing/receipt+report**
7. **3.7 Review follow-up** (sequence logic; GBP wiring when unblocked)
8. **3.8 Marketing drop-in** â€” deferred

Each piece: ask list â†’ Chris's answers â†’ build â†’ live receipt â†’ Chris's real-usage test â†’ next.

---
*This document is the Phase 1 master spec. It lives in the repo per the session hierarchy (suggested: docs/internal/PHASE1-MASTER-SPEC.md), gets a lane-file reference from every lane it touches, and is updated only with Chris's approval.*

