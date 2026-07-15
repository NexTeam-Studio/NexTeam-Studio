# Claude Build Handoff

Last updated: 2026-07-10
Worktree: `C:\Users\Peyto\NexTeam-Studio-worktrees\nightly-integration-20260709`
Branch: `build/nightly-integration-20260709`

## Purpose

This is the living daily handoff file for Claude/Nova review. Update it after every meaningful build pass, owner decision, receipt, blocker, or test result so the end-of-day upload is one file instead of a reconstructed chat summary.

Hard rule: no secrets, tokens, API keys, refresh tokens, passwords, connection strings, or raw private env values in this file. Credential locations and variable names are okay; values are not.

## Current Local Test URL

- Local Job Desk: `http://localhost:4174`
- Local `/api/public/runtime-config` checked clean with Firebase web config present after restarting the local server with Firebase-only env values loaded from the main repo `.env`.
- This is local only, not staging-deployed.
- Local verification note for Claude/Nova: avoid the Codex in-app browser for routine localhost verification on the current Windows ChatGPT/Codex build. It has shown unstable internal browser-session routing and can fail independently of the app under test. Prefer direct HTTP checks plus the user's normal external browser unless the prompt explicitly requires the in-app browser.

## Owner Decisions Captured Today

- Branding family locked: NexOps business engine, NexCam field docs, NexPortal client hub, NexReach marketing, Nexi assistant, NexTeam company/platform.
- Handoff workflow: this file is the daily Claude/Nova upload file and should be updated after every meaningful pass, owner input, receipt, blocker, and decision. It must never contain secret values.
- NexOps 3.2 display rule: no company means display `First Last`; company present means default display company; entry person can toggle display back to `First Last` while preserving company field.
- NexOps 3.2 site label rule: `Site Name - Street Address` when a site name exists; street address only when no site name exists; site name can be added later.
- NexOps 3.2 billing rule: billing defaults to same as property; if unchecked, separate billing address is allowed. Multi-site/contractor billing and correspondence stay on the parent client contact, not property/site contacts.
- NexOps 3.2 correspondence rule: email, text, or both can be chosen independently. SMS follows Jobber-style one-way outbound by default. Two-way SMS is future/upgraded only.
- NexOps 3.2 phone rule: phone labels fixed for now: Main, Work, Mobile, Home, Fax, Other. NexOps should detect/prompt for mobile vs landline/fax/unknown/invalid before enabling SMS.
- NexOps 3.2 hierarchy rule: parent client -> named site/facility -> address/location. Two levels now.
- Gate code/access visibility: OWNER and OFFICE_ADMIN anytime; TECHNICIAN only by job/property assignment.
- NexOps hosting: hosted NexTeam product using Railway/Firebase; local server is only for development.

## Build Pass Log

### Pass 2026-07-10 - Canonical NexOps Build Blueprint Created

Owner asked to create the full NexOps document from the earlier Phase 1 master spec and ask-list decisions.

Created:
- `docs/specs/phase1/NEXOPS-BUILD-BLUEPRINT.md`

What it contains:
- NexOps vs Nexi product boundary.
- Non-infringement rule: duplicate Jobber-style operating model and muscle memory, not code/pixel design/trademarks.
- Tenant branding/white-label model.
- AccessContext and role visibility rules.
- Full NexOps build order: CRM, intake, quoting, scheduling, NexPortal, closeout/billing, review sequence readiness, marketing event handoff.
- Detailed piece 3.2 Client CRM blueprint using Chris's decisions: display name logic, two-level contractor hierarchy, billing/correspondence, fixed contact labels, SMS eligibility, imports/API sync, Nexi tools, UI expectations, receipts.
- CSV import and Aquatrace Jobber read-only API sync requirements.
- Testing and Part 9 reality-gate receipts.

Also updated:
- `SESSION_HIERARCHY.md` now lists the NexOps blueprint as an always-read Phase 1 file.
- `docs/sessions/lanes/aquatrace-nexops-crm.md` now points to the blueprint as the canonical lane build doc.

Build implication:
- NexOps 3.2 Client CRM foundation is no longer ask-list blocked. It is approved to continue from this blueprint and the provided Jobber screenshots.

### Pass 2026-07-10 - NexOps 3.2 CRM Foundation Slice

Built locally in the nightly integration worktree.

Changed:
- Added NexOps-ready CRM schema extensions while preserving legacy flat client compatibility.
- Client records now support person name, company, display preference, parent billing address, contacts, per-phone SMS eligibility, and communication settings.
- Property records now support site name, parent site id, access notes/gate code, site contacts, and billing-address relationship.
- Added `GET /api/crm/clients?tenantId=aquatrace`.
- Updated Nexi `createClient` tool so richer NexOps fields can be approval-queued.
- Updated CRM ApprovalQueue executor so rich client fields survive approval execution.
- Updated native CRM search so client lookup considers person names, company, contact emails, and contact phones.
- Added a visible `NexOps CRM / Client Foundation` panel to the Job Desk side dashboard.
- Styled the NexOps panel with NexTeam/NexOps cyan/navy product branding while preserving tenant white-label hooks.
- Recorded SMS/correspondence decisions in the Phase 1 ask-list decision file and Aquatrace NexOps lane file.

Files touched by this pass:
- `packages/core/src/schemas.ts`
- `packages/core/src/types.ts`
- `packages/providers/src/native/NativeAdapter.ts`
- `apps/server/src/crm/routes.ts`
- `apps/server/src/crm/nexiTools.ts`
- `apps/server/src/crm/approvalExecutor.ts`
- `apps/server/test/crm-read-side.test.mjs`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `docs/specs/phase1/ASK-LIST-DECISIONS-CHRIS-20260710.md`
- `docs/sessions/lanes/aquatrace-nexops-crm.md`

Verification:
- `npm run typecheck` passed.
- `npm run build` passed.
- `node --test apps/server/test/crm-read-side.test.mjs` passed, 10/10.
- `npm run check:secrets` passed.
- Local `/` returned HTTP 200.
- Local `/api/crm/clients?tenantId=aquatrace` returned clean JSON.
- Local `/api/public/runtime-config` returned `firebaseConfigured: true` after server restart.

Known caveat:
- This pass is local only. Staging deployment/live Aquatrace data validation still needs a deploy/receipt step.
- Local CRM endpoint may show empty native client data depending on which env/service account is loaded into the local process.

Next logical receipt:
- Ask Nexi to create a realistic multi-site contractor client.
- Confirm ApprovalQueue preview contains clean parent client, display preference, billing/correspondence, email/text/both, and one-way SMS details.
- Approve the item.
- Confirm the NexOps CRM panel shows the richer record.

## Open Items / Next Queue

- Deploy this NexOps CRM slice to staging only after the current merge/deploy gate is appropriate.
- Run live Job Desk receipt against staging after deployment.
- Continue NexOps 3.2 toward actual multi-site property UI once the foundation slice is reviewed.
- Keep the handoff file updated after each meaningful pass so Claude/Nova can read one durable state file.

## Owner Q&A Captured

### 2026-07-10 - Client Import Ability

Owner asked whether NexOps will support client imports by CSV and, for Aquatrace, by API.

Answer: yes, both should be supported.

- CSV import is the general tenant-safe path for one-time onboarding, migrations from other systems, cleanup batches, and non-integrated tenants. It should use a preview/mapping/dry-run flow before any write.
- API import/sync is the Aquatrace path because Jobber already has the real source data. Aquatrace should use a Jobber read-only importer/sync that writes into native NexOps collections without writing back to Jobber.
- Both paths should feed the same native `clients`, `properties/sites`, `contacts`, and communication-settings schemas so CSV and API records behave identically after import.
- Import must be non-destructive by default: preview counts, duplicate detection, conflict report, owner approval, then write/update. Deletes should be explicitly separate and approval-gated.
- CSV should be available to every tenant. API sync should be provider-specific by tenant, starting with Aquatrace/Jobber.

### 2026-07-10 - NexOps CRM UI Direction Correction

Owner rejected the first visible `Client Foundation` panel because it looked like a developer receipt/status card and did not resemble a real Jobber-style CRM workflow enough.

Clarification locked: NexOps should duplicate the business operating model and muscle memory of Jobber without copying Jobber code, exact UI expression, icons, trademarks, or pixel-level design. The interface should feel familiar to a Jobber user because the workflows are similar, but it must use NexTeam/NexOps/Aquatrace-owned visual language.

Follow-up build pass:
- Replaced the first decorative `Client Foundation` card with a CRM workspace surface.
- Added NexOps client action bar: `New client`, `CSV import`, `Jobber sync`, `Refresh`.
- Added client metrics for native clients, contacts, and text-ready records.
- Added searchable client-list pane with filters.
- Added detail pane sections for primary contact, properties/sites, work overview, billing, files/media, and import status.
- Kept the empty state honest when local native clients are not loaded.

Verification after this correction:
- `npm run typecheck` passed.
- `npm run build` passed.

### 2026-07-10 - Create Client Approval Did Not Populate CRM Card

Owner tested: "add chris sears, 102 kate lane, fair play, sc 29643 as a client." Nexi queued the approval correctly, and the ApprovalQueue showed/executed it, but the NexOps CRM card still showed zero clients.

Root cause: in local/no-Firestore mode, the approval executor and `/api/crm/clients` route were using two different in-memory native CRM repositories. The approval wrote into one store while the CRM panel read from another. This made the queue look successful while the CRM card stayed empty.

Fix:
- `apps/server/src/server.ts` now passes the same `nativeCrmRepository` into `registerCrmRoutes`, so approval execution and CRM reads share the same native read model.
- `apps/web/src/main.tsx` now dispatches a `nexops:crm-mutated` browser event after a create-client approval executes successfully.
- `NexOpsCrmPanel` listens for that event and refreshes immediately after the approval action.
- Added regression test: `CRM routes read clients created by ApprovalQueue execution from the shared native repository`.

Local proof:
- Rebuilt and restarted the local 4174 server.
- Local smoke created and executed a create-client approval.
- `/api/crm/clients?tenantId=aquatrace` returned one native client: `Chris Sears`, `displayNamePreference=person`.

Verification:
- `npm run typecheck` passed.
- `npm run build` passed.
- `node --test apps/server/test/crm-read-side.test.mjs` passed, 11/11.
- `npm run check:secrets` passed.

### 2026-07-10 - NexOps Must Be Its Own Web App Surface

Owner clarified that the current CRM view was still wrong: it was Nexi Job Desk with a NexOps card, not a real NexOps web version. NexOps should be a full business web app surface similar in workflow density to Jobber, with no Nexi phone/chat shell taking over the page.

Fix in this pass:
- Added route-level split: `/` remains Nexi Job Desk; `/nexops/clients` renders a standalone NexOps Clients page.
- Restored Aquatrace logo fallback by adding the provided Aquatrace banner logo under `apps/web/public/tenants/aquatrace/aquatrace-banner-logo.png`.
- `tenantLogoSrc()` now falls back to that Aquatrace logo when the tenant branding document has no logo yet.
- Built a full-width NexOps Clients page with left navigation, top bar, client actions, metric cards, filter/search controls, client table, and a right-side detail card.
- The NexOps page uses the same CRM read endpoint as the Job Desk card, so approval-created clients should appear there too.

Important product boundary:
- Nexi = assistant/chat surface.
- NexOps = business engine web app surface.
- A quick-glance NexOps card may still appear inside Job Desk, but the canonical NexOps web URL is `/nexops/clients`.

Verification after this pass:
- `npm run typecheck` passed.
- `npm --workspace @nexteam/web run build` passed.
- `npm run check:secrets` passed.
- Local standalone route check passed at `http://127.0.0.1:4175/nexops/clients`.
- Local API proxy check passed: `http://127.0.0.1:4175/api/crm/clients?tenantId=aquatrace` returned JSON with CRM clients from the existing local API server.
- Logo asset check passed: `http://127.0.0.1:4175/tenants/aquatrace/aquatrace-banner-logo.png` returned the Aquatrace banner logo.

Local testing note:
- `localhost:4174` is still the existing signed-in Nexi Job Desk server. It was intentionally left untouched because the current shell does not have the Firebase runtime variables needed to restart it safely.
- `localhost:4175/nexops/clients` is the temporary local NexOps web app test URL. It proxies APIs to the existing `4174` server.
