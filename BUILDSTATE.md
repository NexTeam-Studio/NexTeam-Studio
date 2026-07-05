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
| nexi | M1 Nexi Job Desk | done | Local verify plus live staging SHA-match, health, A/B/C transcripts, Camp Mikell `101000` ingest, Firestore usageLog cache proof, phone UI recording, and Firebase auth landing in `receipts/m1/verify.txt`, `receipts/m1/staging-version-health.json`, `receipts/m1/staging-live-transcripts.json`, `receipts/m1/staging-cache-proof.json`, `receipts/m1/staging-usage-log.json`, `receipts/m1/staging-phone-chat.webm`, and `receipts/m1/firebase-auth-verify.txt` |
| crm | M2 read-side skeleton | done | `receipts/m2/verify.txt`, `receipts/m2/jobber-import-dry-run.json`, `receipts/m2/dependency-install-proof.txt` |
| crm | M2 native writes + quote foundation | done | `receipts/m2/native-write-slice-verify.txt`, `receipts/m2/native-write-slice-verify-exit.txt` |
| crm | M2 Jobber-seeded pool leak catalog | done | `receipts/m2/jobber-catalog-pull.json` |
| crm | M2 full Jobber import dry-run | done | `receipts/m2/jobber-full-import-dry-run.json`; 625 clients, 625 jobs, 547 properties, all preserving Jobber external IDs; no Jobber writes. |
| crm | M2 native Jobber import write | blocked | `receipts/m2/jobber-native-import-write.json`, `receipts/m2/staging-env-presence-check.json`; Railway staging env injection lacks `FIREBASE_SERVICE_ACCOUNT`, so no native Firestore writes were attempted. |
| crm | M2 Stripe webhook setup | done | `receipts/m2/stripe-webhook-setup.json`; test-mode endpoint enabled, `STRIPE_WEBHOOK_SECRET` stored, no secret values printed. |
| crm | M2 Stripe test payment live receipt | blocked | `receipts/m2/staging-crm-route-probe.json`; current staging SHA `c52a2e12030c575f199d4547ea931701867905af` does not include CRM routes, so `/api/crm/clients` returns 404. |
| fielddocs | M4 read-side skeleton | done | `build/fielddocs` receipt package: `receipts/m4/companycam-import-dry-run.json`, `receipts/m4/dependency-install-proof.txt` |
