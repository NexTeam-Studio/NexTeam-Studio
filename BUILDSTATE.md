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
| crm | M2 native Jobber import write | done | `receipts/m2/jobber-native-import-write-integration.json`; 625 clients, 625 jobs, and 547 properties written to native collections with external IDs preserved. `jobberWrites:false`, `destructiveWrites:false`. |
| crm | M2 Stripe webhook setup | done | `receipts/m2/stripe-webhook-setup.json`; test-mode endpoint enabled, `STRIPE_WEBHOOK_SECRET` stored, no secret values printed. |
| crm | M2 Stripe test payment live receipt | done | `receipts/m2/stripe-payment-receipt.json`; test card `4242` completed Checkout, redirected, and signed Stripe webhook produced native `invoice.paid`. |
| fielddocs | M4 read-side skeleton | done | `receipts/m4/verify.txt`, `receipts/m4/companycam-import-dry-run.json`, `receipts/m4/dependency-install-proof.txt` |
| fielddocs | M4 upload + checklist + report foundation | done | `receipts/m4/upload-report-slice-verify.txt`, `receipts/m4/upload-report-slice-verify-exit.txt` |
| fielddocs | M4 live AI caption receipt | done | `receipts/m4/live-vision-receipt.json` |
| fielddocs | M4 native posted report receipt | done | `receipts/m4/native-report-post-receipt.json`, `receipts/m4/native-report-post-output.txt`, `receipts/m4/native-field-report.pdf`; outbound report delivery remains approval-gated and was not attempted. |
| integration | M2/M4 merge to main + staging deploy | done | Merge commit `5050cda83978acbae223531893ec5361f2acff9b`; staging `/api/version` SHA-match and `/api/health` all-green in `receipts/main/staging-main-version.json`. |
| schedule | M3 Scheduling worktree | opened | `build/schedule` from main after M2/M4 merge; receipts pending. |
| content | M5 Content Engine worktree | opened | `build/content` from main after M2/M4 merge; outbound sends/publishing remain parked behind explicit approval and must build to ApprovalQueue only. |
| voice | M12a Voice worktree | opened | `build/voice` from main after M2/M4 merge. |
| voice | M12a voice chat foundation | done | Server-side `/api/voice/tts` ElevenLabs rail, web mic dictation, opt-in TTS playback, and mocked no-spend verify receipts in `receipts/m12a/verify.txt` and `receipts/m12a/staging-env-presence.json`. Live phone video receipt still pending. |
| platform | M13 Platform worktree | opened | `build/platform` from main after M2/M4 merge; receipts pending. |
