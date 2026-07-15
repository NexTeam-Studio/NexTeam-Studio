# NexOps Build Blueprint

Owner: Chris Sears  
Created: 2026-07-10  
Status: Active build blueprint  
Governs: NexOps business engine for Aquatrace first, then future tenants

## 1. Purpose

NexOps is the NexTeam business engine. It replaces the day-to-day operating layer of Jobber for trade businesses: CRM, requests, quoting, scheduling, jobs, invoices, payments, client hub, and closeout. Nexi is the assistant that can operate NexOps by conversation. NexOps itself is the web/mobile business application.

This document turns the Phase 1 master spec, Nova research, Chris's ask-list answers, and the latest UI corrections into one buildable blueprint. Future sessions building NexOps must read this file before touching code.

## 2. Product Boundary

NexOps is not the Nexi Job Desk.

- NexOps: full business web app and later mobile app for office/owner/tech operations.
- Nexi: assistant/chat layer that can read and operate NexOps through tools and approval gates.
- NexPortal: client-facing hub for quote approval, invoices, payments, reports, and work history.
- NexCam: field documentation rail for photos, checklists, reports, PDFs.
- NexReach: marketing/content/campaign/reputation engine.

The Job Desk may show quick NexOps summary cards, but the canonical NexOps UI lives on its own route such as `/nexops/clients`. It must not be framed as a phone-shaped Nexi chat surface.

## 3. Source Of Truth Files

Always read these with this blueprint:

- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- `docs/specs/phase1/ASK-LIST-DECISIONS-CHRIS-20260710.md`
- `docs/specs/phase1/ASK-LIST-RESEARCH-NOVA-20260710.md`
- `docs/sessions/lanes/aquatrace-nexops-crm.md`
- `docs/internal/M13_MULTI_USER_ACCESS_DESIGN.md`
- `SESSION_HIERARCHY.md`

## 4. Non-Infringement Rule

NexOps may duplicate Jobber's business operating model and familiar workflow logic, but it must not copy Jobber's code, markup, proprietary icons, exact visual expression, or pixel-level design.

The target is workflow familiarity, not visual cloning:

- Similar concepts: clients, requests, quotes, jobs, invoices, payments, schedule, pipeline, files/media, client hub.
- Different expression: NexTeam/NexOps navigation, Aquatrace tenant branding, NexTeam typography/color system, original component styling, original icons where used.
- Reference screenshots are workflow anchors, not design files.

## 5. Hosting And Access

NexOps is part of the hosted NexTeam product.

- Development can run locally.
- Owner/team access runs through hosted NexTeam web/API infrastructure, currently Railway staging plus Firebase.
- Future production remains hosted.
- Native/offline mobile comes later through M11.
- Tenant branding and white-label settings must be stored per tenant, not hardcoded per screen.

## 6. Branding Model

Every tenant-facing NexOps screen must display tenant branding.

Tenant branding document:

- Collection: `tenantBranding/{tenantId}`
- Required fields: `tenantId`, `displayName`, `colors`, `updatedAt`, `updatedBy`
- Optional fields: `logo`, `fontFamily`, `whiteLabelMode`
- Logo sources: PNG, JPEG, WebP preferred when available.
- If no logo exists, render a text fallback using the tenant display name.
- Aquatrace default logo fallback: `apps/web/public/tenants/aquatrace/aquatrace-banner-logo.png`

Aquatrace visual direction:

- Deep near-black/navy base.
- Bright aqua/cyan action color from aquatraceleak.com.
- White/cream content surfaces.
- Aquatrace logo displayed in NexOps app chrome.
- NexOps product chrome should feel like a serious trade-business dashboard, not a chat toy.

White-label provision:

- NexOps should support tenant-specific logo/colors now.
- Future platform-level white-label can hide NexTeam marks for eligible plans without changing data model.

## 7. Access Model

All new NexOps endpoints and tools require AccessContext:

```ts
type AccessContext = {
  tenantId: string;
  tenantUserId: string;
  role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
};
```

Role rules:

- OWNER: full tenant access.
- OFFICE_ADMIN: CRM, scheduling, quotes, invoices, client communication, reports; no platform billing/config unless explicitly allowed.
- TECHNICIAN: assigned jobs, assigned visits, checklists, photo upload, limited client/property details needed for work.
- Job-scoped external/subcontractor links are not internal roles. They are narrow magic-link style access to one assigned job/property.

Gate codes and access notes:

- OWNER and OFFICE_ADMIN can see anytime.
- TECHNICIAN can see only for assigned job/property/visit.
- Never expose gate/access fields in broad tenant client list responses for unassigned technicians.

## 8. Build Order

The Phase 1 NexOps build order is:

1. Client CRM foundation - piece 3.2.
2. Intake - piece 3.1.
3. Quoting - piece 3.3.
4. Approval to scheduling - piece 3.4.
5. NexPortal client hub - piece 3.5.
6. Visit, closeout, billing, receipt plus report - piece 3.6.
7. Review follow-up sequence readiness - piece 3.7, GBP wiring blocked until credentials/approval.
8. Marketing drop-in notes - piece 3.8, defers to NexReach.

No piece is done until it passes the Part 9 reality gate: Chris can reach and use it through the actual UI or Nexi, not just backend tests.

## 9. Piece 3.2 - Client CRM Foundation

### 9.1 Goals

NexOps CRM is the foundation for everything else. It must handle simple homeowners and contractor/multi-site accounts without flattening identity.

Required v1 abilities:

- Create/edit client.
- Store person identity separately from company identity.
- Choose forward-facing display name.
- Store billing contact/address separately from property/site contacts.
- Support multiple contacts, phones, emails.
- Support fixed phone/email labels.
- Support SMS eligibility per phone number.
- Support parent client -> named site/facility -> address/location.
- Show full client history: quotes, jobs, visits, invoices, payments, communications, files/media.
- Support read-through imports from Jobber and native NexOps records.
- Support CSV import preview/write path.

### 9.2 Display Name Rules

If no company name exists:

- Display as `First name Last name`.

If company name exists:

- Default forward-facing display to company name.
- Entry person can toggle display to `First name Last name`.
- Company field must remain stored even when person display is selected.

Store:

- `personName.title`
- `personName.firstName`
- `personName.lastName`
- `company`
- `displayNamePreference: "person" | "company"`
- computed `displayName`

### 9.3 Hierarchy Rules

NexOps supports a two-level contractor/commercial hierarchy now:

```text
Parent client -> named site/facility -> address/location
```

Examples:

- `Medallion Pool Company -> Mulberry Farms -> 1126 Upper Thomas Branch Road`
- `L3 Campus -> Statehouse Arena -> address/location`
- `Windsor Hospitality -> Renaissance Downtown Asheville Hotel -> 31 Woodfin Street`

Simple homeowner clients can collapse to one default site/location without making the UI feel heavier.

Store property/site fields separately:

- `clientId`
- `siteId`
- `siteName`
- `locationId`
- `address`
- `siteContacts`
- `gateCode`
- `accessNotes`
- `companyCamProjectId`
- `jobberPropertyId`
- `active`

Display:

- If site name exists: `Site Name - Street Address`.
- If no site name exists: street address alone.
- UI must allow site name to be added later.

### 9.4 Billing And Correspondence

New entry defaults:

- `Billing address is the same as property address` checked.

If unchecked:

- Show separate billing address fields.

Multi-site/contractor rule:

- Billing lives on the parent client.
- Ordinary correspondence goes to the parent client billing/correspondence contact.
- Property/site contacts are for on-site access and coordination only unless explicitly selected as correspondence contacts.

Example:

- Mulberry Farms may have an email/contact for access.
- Medallion Pool Company remains the billing/correspondence client unless changed.

### 9.5 Contacts

A client can have multiple contacts.

Contact fields:

- Person name.
- Company name.
- Role.
- Billing contact toggle.
- Correspondence contact toggle.
- Phones.
- Emails.
- Channel preference.

Phone labels:

- Main
- Work
- Mobile
- Home
- Fax
- Other

Email labels:

- Main
- Work
- Personal
- Other

### 9.6 SMS And Communication Settings

NexOps v1 supports outbound one-way SMS only.

Two-way SMS is a later upgraded capability. The UI must not imply inbound replies are read unless the tenant has a two-way provider/tier enabled.

Each automated correspondence type can choose:

- Email
- Text message
- Both
- Off

Correspondence types:

- Quote/invoice follow-ups.
- Job/visit reminders.
- Job closure follow-ups.
- Review requests.
- General client messages.

Per-phone storage:

- `receivesMessages`
- `smsCapability: "mobile" | "landline" | "fax" | "invalid" | "unknown"`
- `smsMode: "one_way" | "two_way"`

Validation:

- Normalize phone numbers before enabling SMS.
- If number appears mobile, allow SMS.
- If number appears landline, fax, invalid, or unknown, prompt the entry person in plain language before allowing SMS.
- Never auto-send outbound messages without ApprovalQueue or configured automation approval rules.

### 9.7 Imports

CSV import:

- Available to every tenant.
- Preview/mapping/dry-run before write.
- Duplicate detection.
- Conflict report.
- Owner approval before write.
- Non-destructive by default.
- Deletes require a separate explicit approval-gated workflow.

API sync:

- Aquatrace uses Jobber read-only sync.
- Jobber remains read-only.
- Sync writes into native NexOps collections.
- Live Jobber fallback must exist when native data is stale/missing.
- API and CSV imports must feed the same native schemas.

Import result should show:

- Created count.
- Updated count.
- Skipped count.
- Conflicts.
- Unmapped fields.
- Source ids.
- Timestamp.

### 9.8 Client List UI

NexOps `/nexops/clients` should resemble a real operating page, not a status card.

Required sections:

- Tenant-branded left navigation.
- Top search/actions bar.
- Page title: Clients.
- Buttons: New Client, Import, Sync, More Actions.
- Metrics: new leads, new clients, total clients, optional overdue/active.
- Filters: tag, status, source, active/lead, search.
- Table columns: Name, Address/Site, Tags, Status, Last Activity.
- Row hover/selection.
- Detail pane or route for selected client.

Client detail:

- Header with display name, primary contact, status.
- Overview summary.
- Properties/sites.
- Contacts.
- Work overview: requests, quotes, jobs, invoices.
- Billing/payment methods.
- Client schedule.
- Files/media.
- Notes.
- Communications.

### 9.9 New Client UI

The new client flow must support the same data model but stay simple.

First screen:

- Primary contact details.
- Company name optional.
- Display preference toggle appears when company is present.
- Phone/email fields with fixed labels.
- Communication settings.
- Lead source.
- Additional client details.
- Additional contacts.
- Property address.
- Site name optional.
- Billing same as property checkbox, checked by default.
- Separate billing address if unchecked.
- Property details.
- Property contacts.

Plain-language SMS prompt examples:

- "This looks like a landline. Text messages may not work. Still allow one-way texts to this number?"
- "I cannot tell if this number can receive texts. Want to allow one-way texts anyway?"
- "This is marked Fax, so texts are off unless you change the label."

### 9.10 Nexi Tools For CRM

Nexi must be able to:

- Create a client through ApprovalQueue.
- Look up a client.
- List clients.
- Explain why a client could not be found.
- Detect stale native data and fall back to live Jobber search.
- Summarize a client record.
- Add/update a property or site through ApprovalQueue.
- Add contact details through ApprovalQueue.

Create/update tools must return clean preview fields, not a garbled natural-language blob.

Approval preview must show:

- Client/person/company.
- Display preference.
- Parent billing/correspondence contact.
- Property/site/address.
- Billing same or separate.
- SMS/email settings.
- Any unknown SMS eligibility warnings.

## 10. Piece 3.1 - Intake

NexOps intake includes:

- Manual client entry from owner/office.
- In-CRM request creation for existing clients.
- Embeddable web form for lead/request capture.

Embeddable form v1:

- Tenant-branded.
- Configurable fields.
- Creates lead/request in NexOps.
- Associates with existing client when matched confidently.
- Creates `lead.received` event.
- Notifies owner through Nexi/ApprovalQueue.

Open before build:

- Exact public form fields for Aquatrace.
- Spam protection choice.
- Whether form submissions create lead only or lead plus request.

## 11. Piece 3.3 - Quoting

Required:

- Product/service catalog line items.
- Custom line item creation.
- Option to save custom item back to catalog.
- Quote templates.
- Client-facing quote layout.
- Send by email, SMS, or both.
- Quote approval link through NexPortal.
- Expiry ticker, configurable by quote.
- Optional deposit/card/payment schedule.

Approval/send:

- Draft quote is owner-reviewable.
- Sending is ApprovalQueue-gated unless later configured as an allowed automation.
- No live outbound sends without approval.

## 12. Piece 3.4 - Approval To Scheduling

Approved quote should flow to booking.

Required:

- Convert accepted quote to job.
- Create visit(s).
- Calendar day/week/map views.
- Availability and conflict checks.
- Drive-time suggestions.
- Confirmation/reminder drafts through M6.
- Jobber overlay remains read-only during migration.

## 13. Piece 3.5 - NexPortal Client Hub

Client-facing hub:

- View current/past/scheduled work.
- View and approve quotes.
- Pay invoices.
- View reports/PDFs.
- Update basic contact details if allowed.

Security:

- Magic link or authenticated portal access.
- Tenant-scoped.
- Client scoped.
- No access to other clients.

## 14. Piece 3.6 - Visit, Closeout, Billing, Receipt

Closeout path:

1. Visit complete.
2. NexCam checklist/report finalized.
3. PDF report generated.
4. Job marked complete after appropriate checks.
5. Invoice/payment flow starts.
6. Receipt email includes real report PDF attachment.
7. Optional tip prompt if enabled.

Rules:

- If Jobber/native status conflict, do not guess. Flag for owner.
- Report PDF attachment support is part of closeout quality.
- Payment charging uses test mode until explicitly approved for live.

## 15. Piece 3.7 - Review Follow-Up

Build sequence logic ready, but GBP connection may block live profile sync.

Required:

- Review request after closeout.
- Follow-up sequence.
- Stop on review completion.
- Stop on expiry.
- ApprovalQueue for drafted replies.

Blocked until:

- GBP OAuth/API state is verified and configured.
- Any Google quota/approval case is cleared.

## 16. Piece 3.8 - Marketing Drop-In

Deferred to NexReach, but NexOps must emit clean events:

- `client.created`
- `lead.received`
- `quote.approved`
- `job.scheduled`
- `job.completed`
- `invoice.paid`
- `report.generated`

NexReach consumes these events for content/campaign/reputation work.

## 17. Data Model Summary

Minimum native collections:

- `clients`
- `clientContacts`
- `clientSites`
- `clientLocations`
- `properties` if existing code uses this name, with migration path to site/location shape.
- `requests`
- `quotes`
- `jobs`
- `visits`
- `invoices`
- `payments`
- `catalogItems`
- `communications`
- `approvalQueue`
- `media`
- `documents`
- `importRuns`
- `importConflicts`

Every document must include:

- `tenantId`
- `createdAt`
- `updatedAt`
- `createdBy` or source metadata
- `updatedBy` when user-originated
- `externalIds` when imported/synced

No tenant-facing query may rely on raw tenantId from the client without AccessContext validation.

## 18. API Surface

Core routes:

- `GET /api/crm/clients`
- `POST /api/crm/clients`
- `GET /api/crm/clients/:clientId`
- `PATCH /api/crm/clients/:clientId`
- `GET /api/crm/clients/:clientId/sites`
- `POST /api/crm/clients/:clientId/sites`
- `GET /api/crm/imports`
- `POST /api/crm/imports/csv/preview`
- `POST /api/crm/imports/csv/commit`
- `POST /api/crm/imports/jobber/dry-run`
- `POST /api/crm/imports/jobber/commit`
- `GET /api/crm/catalog`
- Quote/job/invoice routes as each piece opens.

Every write route:

- Requires AccessContext.
- Validates role.
- Emits events.
- Uses ApprovalQueue where owner approval is required.

## 19. Testing And Receipts

Required tests:

- Unit tests for schema validation.
- Repository tests for native create/read/update.
- Import tests for CSV preview and Jobber sync dry-run.
- AccessContext tests for owner/admin/technician restrictions.
- Nexi tool tests for clean create-client parsing.
- Regression wall entries for every trial-proven CRM question.
- UI smoke test for `/nexops/clients`.

Reality-gate receipts:

- Chris can open NexOps web page and see client list.
- Chris can create a client through Nexi and approve it.
- Approved client appears in NexOps list/detail.
- Multi-site contractor record can be created/read.
- Separate billing address/contact works.
- Property/site contact does not become billing correspondence by accident.
- SMS prompt appears for uncertain/non-mobile numbers.
- Jobber live fallback resolves a client missing from native data.
- CSV preview shows mapped rows and conflicts before any write.

## 20. Current Local State

As of 2026-07-10:

- `/nexops/clients` exists as standalone NexOps web app surface locally.
- `localhost:4174` remains Nexi Job Desk.
- `localhost:4175/nexops/clients` is the local standalone NexOps test URL, proxying APIs to `4174`.
- Aquatrace logo fallback exists.
- CRM schema has been extended for person/company/display preference, contacts, communication settings, and richer fields.
- Approval-created client visibility bug was fixed by sharing the native CRM repository between approval execution and CRM reads.
- First UI correction from "developer receipt card" toward real business app is in progress, but the full Jobber-style flow is not complete yet.

## 21. Immediate Next Build Steps

1. Replace the remaining placeholder-style CRM panels with full NexOps web pages.
2. Make `/nexops/clients` the canonical client list.
3. Add client detail route.
4. Add New Client form matching Section 9.9.
5. Add approval-created client refresh and persistence receipt.
6. Add CSV import preview UI.
7. Add Jobber sync status/dry-run UI.
8. Add role-aware field visibility, especially gate/access notes.
9. Add receipt files proving each reality-gate item.

## 22. Open Items

Open before deeper build:

- Confirm exact Aquatrace public intake form fields.
- Confirm initial CSV import file format when ready.
- Confirm SMS provider/tier when M6 full SMS opens.
- Confirm GBP OAuth state before review follow-up wiring.
- Confirm whether payment methods are stored only in Stripe or mirrored as metadata.

Not blocked:

- NexOps 3.2 CRM foundation is unblocked.
- The screenshots already provided are enough to continue the initial CRM build.

## 23. Done Definition

NexOps Phase 1 is done only when:

- Each Phase 1 piece has a receipt.
- Each receipt passes Part 9 reality gate.
- Chris can use the feature through real NexOps UI or Nexi.
- AccessContext and tenant isolation are enforced.
- No hardcoded Aquatrace-only assumptions prevent another tenant.
- Jobber remains read-only.
- Large receipts/exports are stored in Firebase Storage with pointer files in git.
- Regression wall remains green for affected Nexi paths.

