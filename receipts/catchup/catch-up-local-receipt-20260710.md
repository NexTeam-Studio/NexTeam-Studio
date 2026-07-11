# Catch-up Batch Local Receipt

Date: 2026-07-10
Worktree: `build/nightly-integration-20260709`

## Fixed Locally

- Evaporation chat regression: the exact natural-language pattern `what is the evaporation at Deborah Justice right now` now routes through job/report context before `runEvaporation`.
- Job Desk uploads: native uploaded photos/videos and PDFs are included in `getPhotos` and `getDocuments`, so newly uploaded media can be referenced in the same conversation.
- Report email attachments: `draftReportEmail` now attaches matching CompanyCam PDF documents for the client instead of a generated stub placeholder.
- Content queue durability: content drafts persist through Firestore when Admin SDK is configured, and the web panel reads the same repository.
- Freeform content stale-text bug: queue save uses the latest substantial authored article/post instead of prior short status text.
- Report-based article lookup: prompts asking for content from a report/checklist/document now use the CompanyCam document lookup path.
- Approval panel history: `/api/approval-queue?includeHistory=true` returns historical approved/rejected items, and the web panel shows pending plus history sections.
- Upload control: Job Desk upload control is now a paperclip-style file attachment control and accepts any file type.
- WordPress remains out of scope for this fix batch; internal content queue is the immediate target.
- M7 Reviews honest-gap message remains the expected current behavior until GBP OAuth is connected.

## GBP Recon

- Staging Railway variable-name probe: all checked current and legacy GBP names are absent.
- Production Railway probe: blocked with `Unauthorized` using the available vaulted token, which is scoped to staging.
- Legacy docs show an older GBP Layer 1 OAuth/token rail existed, but current M7 remains blocked for live GBP credentials and does not have active staging GBP env names.

## Verification

- `npm --workspace @nexteam/nexi run build`
- `npm --workspace @nexteam/core run build`
- `npm --workspace @nexteam/server run build`
- `npm --workspace @nexteam/web run build`
- `node --test apps\server\test\nexi-job-desk.test.mjs` => 81/81 passing
- `node --test apps\server\test\comms-lite.test.mjs` => 21/21 passing
- `node --test apps\server\test\content-engine.test.mjs` => 5/5 passing

## Remaining Blockers

- Production GBP variable-name check requires a production-scoped Railway token captured into the DPAPI vault pattern.
- Google Cloud OAuth app publishing status and support case `6-2215000040637` require Google Console/support access; not publicly verifiable from this repo.
