# BUILDSTATE

| Module | Phase | Status | Receipt |
|---|---|---|---|
| core | M0.1 worktree + baseline | done | `receipts/m0/archive-pre-bible-main.txt` |
| core | M0.2 monorepo restructure | done | `apps/`, `packages/`, `tests/`, `infra/` present in `build/core` |
| core | M0.3 TypeScript strict foundation | done | `receipts/m0/verify.txt` |
| core | M0.4 core contracts | done | `packages/core/src/types.ts`, `packages/core/src/schemas.ts`; `receipts/m0/verify.txt` |
| core | M0.5 provider extraction | done | `packages/providers/src/jobber/JobberAdapter.ts`, `packages/providers/src/companycam/CompanyCamAdapter.ts`, `receipts/m0/smoke-m0.txt` |
| core | M0.6 foundation services | done | `apps/server/src/server.ts`, `receipts/m0/local-version-health.json` |
| core | M0.7 verify + receipts | done | Local verify/history scan plus staging `/api/version` SHA-match, `/api/health` all-green, and fresh Jobber/CompanyCam smokes in `receipts/m0/verify.txt`, `receipts/security/history-scan.txt`, `receipts/m0/staging-version-health.json`, and `receipts/m0/staging-smoke-m0.txt` |
| nexi | M1 Nexi Job Desk | done | `build/nexi` receipt package: `receipts/m1/staging-live-transcripts.json`, `receipts/m1/staging-cache-proof.json`, `receipts/m1/staging-phone-chat.webm` |
| crm | M2 read-side skeleton | done | `build/crm` receipt package: `receipts/m2/jobber-import-dry-run.json`, `receipts/m2/dependency-install-proof.txt` |
| fielddocs | M4 read-side skeleton | done | `receipts/m4/verify.txt`, `receipts/m4/companycam-import-dry-run.json`, `receipts/m4/dependency-install-proof.txt` |
| fielddocs | M4 upload + checklist + report foundation | done | `receipts/m4/upload-report-slice-verify.txt`, `receipts/m4/upload-report-slice-verify-exit.txt` |
| fielddocs | M4 live AI caption + posted report receipt | blocked | Live paid vision/report-posting receipt waits for approved spend/outbound test window; no outbound report delivery attempted. |
