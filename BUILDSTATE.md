# BUILDSTATE

| Module | Phase | Status | Receipt |
|---|---|---|---|
| core | M0.1 worktree + baseline | done | `receipts/m0/archive-pre-bible-main.txt` |
| core | M0.2 monorepo restructure | done | `apps/`, `packages/`, `tests/`, `infra/` present in `build/core` |
| core | M0.3 TypeScript strict foundation | done | `receipts/m0/verify.txt` |
| core | M0.4 core contracts | done | `packages/core/src/types.ts`, `packages/core/src/schemas.ts`; `receipts/m0/verify.txt` |
| core | M0.5 provider extraction | done | `packages/providers/src/jobber/JobberAdapter.ts`, `packages/providers/src/companycam/CompanyCamAdapter.ts`, `receipts/m0/smoke-m0.txt` |
| core | M0.6 foundation services | done | `apps/server/src/server.ts`, `receipts/m0/local-version-health.json` |
| core | M0.7 verify + receipts | blocked | Local verify/smoke done in `receipts/m0/verify.txt` and `receipts/m0/smoke-m0.txt`; live `/api/version` SHA-match blocked until push + separate Railway environment |
| nexi | M1 Nexi Job Desk | blocked | Opens after M0 commit; no M1 worktree yet |
| crm | M2 read-side skeleton | blocked | M0 priority consumed current run |
| fielddocs | M4 read-side skeleton | blocked | M0 priority consumed current run |
