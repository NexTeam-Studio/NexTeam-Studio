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
| nexi | M1 Nexi Job Desk | blocked | Local gateway/tool-loop, Firestore persistence, failureLog, cache-metric tests, Camp Mikell ingest, and mobile PWA UI done in `receipts/m1/verify.txt`, `receipts/m1/build.txt`, `receipts/m1/local-transcripts.json`, `receipts/m1/local-failurelog.json`, and `receipts/m1/mobile-ui.png`; live A/B/C transcripts, live cacheReadTokens>0 usageLog, phone recording, and staging deployment remain pending on `build/nexi` staging deploy |
| crm | M2 read-side skeleton | blocked | M0 priority consumed current run |
| fielddocs | M4 read-side skeleton | blocked | M0 priority consumed current run |

