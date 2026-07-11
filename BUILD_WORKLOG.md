# NexTeam Build Worklog

Living handoff file for Claude/Nova/Atlas-style daily coordination. Update this file on each meaningful build pass, test pass, receipt, or owner decision so the next session can catch up without reconstructing context from chat.

## 2026-07-10 - NexOps + NexShot Phase 1 scaffold pass

### Source Of Truth Read
- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- Latest owner order: complete NexOps + NexShot Phase 1, start by closing the real-data sync gap.

### Owner Decisions Applied
- NexOps is the Jobber-style business engine: CRM, quoting, scheduling, invoicing, payments, portal, visit closeout.
- NexShot is the CompanyCam-style field documentation module: checklist templates, photos, reports.
- Client display rule: first-name/last-name by default; when company name exists, default display to company while preserving the person fields and allowing a display toggle.
- Multi-site rule: parent client owns billing/correspondence; properties/sites can have local contacts, but correspondence defaults to the parent client unless explicitly changed.
- Communication rule: email and SMS are independent toggles. SMS starts as one-way outbound unless the tenant upgrades to two-way.
- Branding rule: tenant dashboards use tenant branding when provided, with NexTeam/NexOps defaults and future white-label provision.

### Built This Pass
- Standalone NexOps web surface at `/nexops` with module navigation separate from Nexi chat.
- NexOps client workspace with Jobber-style list/detail layout, client metrics, create-client drawer, import/sync panel, approvals link, and module placeholders for the Phase 1 business engine.
- Jobber read-only sync control in the NexOps UI: dry-run first, then write native NexOps records without writing back to Jobber.
- CRM read routes for clients/properties/jobs/quotes/invoices feeding the NexOps UI from the shared native CRM repository.
- ApprovalQueue create-client execution path verified to write to the same native CRM repository read by the NexOps client card.
- Standalone NexShot web surface at `/nexshot` with overview, checklist templates, media search, and report generation panels.
- NexShot leak-detection checklist template shaped around Aquatrace visit data, report needs, and property/visit memory.
- NexShot report creation UI wired to the existing FieldDocs report endpoint.
- Mobile/responsive layout rules for the new NexOps/NexShot grids.
- NexOps lifecycle modules now show native records where available instead of placeholder-only panels:
  requests from lead clients, quotes, jobs, invoices, and paid invoice/payment records.

### Verification
- `npm run typecheck` passed.
- `npm --workspace @nexteam/web run build` passed.
- `npm run check:secrets` passed.
- Targeted live-path tests passed: `node --test apps/server/test/crm-read-side.test.mjs apps/server/test/fielddocs-read-side.test.mjs apps/server/test/nexi-job-desk.test.mjs`
- Targeted result: 100/100 tests passing.
- Second post-polish verification: `npm run typecheck` and `npm --workspace @nexteam/web run build` passed again after lifecycle record rendering was added.

### Reality Gate Status
- Not complete to final Phase 1 definition yet because this pass has not been deployed to staging and has not produced live owner-facing receipts.
- Next required receipt: run NexOps Jobber dry-run/write against staging and confirm real Aquatrace client rows populate in `/nexops/clients`.
- Next required receipt: open `/nexshot`, create or view a checklist/report path, and confirm the result is visible/retrievable from the UI.

### Next Work
- Deploy current branch to staging after final local verification.
- Run real Jobber sync with read-only provider access and confirm expected Aquatrace client counts.
- Continue NexOps pieces 3.3-3.6: quote builder, approval-to-scheduling, NexPortal, and visit closeout.
- Continue NexShot pieces: real upload/capture flow, inline photo viewer, report PDF polish, and checklist-to-report handoff.
