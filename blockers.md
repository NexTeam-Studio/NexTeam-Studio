# Blockers
_Updated when blockers change. Clear resolved items._

---

## ACTIVE BLOCKERS (non-Railway)

### None currently.
All known local/code blockers resolved in 2026-04-11 finish-out pass.

---

## RAILWAY / ENV BLOCKERS (require Chris)

### 1. RESEND_API_KEY not set
- **Impact:** Test email cannot be delivered to chris@aquatraceleak.com
- **Fix:** Chris adds RESEND_API_KEY to Railway env, redeploys
- **Priority:** HIGH - needed for first real campaign send test

### 2. VITE_NJORD_TEST_EMAIL not confirmed set in Railway
- **Impact:** Test email route returns error; campaign flow halts at test-confirm step
- **Fix:** Chris confirms VITE_NJORD_TEST_EMAIL=chris@aquatraceleak.com in Railway

### 3. Firebase production rules not deployed
- **Impact:** Firestore reads/writes may fail in production depending on current rules state
- **Fix:** Chris runs firestore deploy (see FIRESTORE_RULES_DEPLOY.md) after reviewing rules
- **Status:** Rules file exists locally; not confirmed deployed to production project

### 4. Full end-to-end session logging requires live Firestore
- **Impact:** Without Railway deploy + Firebase config, session logs don't persist
- **Note:** Seed data provides UI state in dev; real logging needs live env

---

## COMPLETED / CLEARED

- [x] Schema file case-sensitivity (Linux crash on import) - fixed 2026-04-11
- [x] NjordShell imports using wrong-cased filenames - fixed 2026-04-11  
- [x] /mission-control/aquatrace/workspace not opening NjordShell - fixed in 993b4e5
- [x] Onboarding Checklist showing empty state instead of seed data - fixed 2026-04-11
- [x] blueprintService.updateBlueprint using unsafe path - fixed 2026-04-11
