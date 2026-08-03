# Nexi Live Aquatrace Client Acceptance — 2026-08-02

## Scope

The real Aquatrace Firestore tenant was used only to verify the live server/client-data connection. The test created only clearly named synthetic test records, then removed every one in a `finally` cleanup path. No existing customer record was changed, deleted, messaged, or imported.

## Result

**100 / 100 assertions passed.**

The live Firestore data source reported 1,329 client records during the run. Synthetic fixtures remaining after cleanup: **0**.

## What was checked

Twenty repeatable chat-style scenarios checked client lookup, address and property answers, missing-fact handling, map and telephone handoffs, incomplete creation, confirmation/rejection/cancellation, approved creation, spelling correction, duplicate detection, approved edit, safe deletion of NexTeam-created test records, and deletion protection for an imported legacy test record.

Each scenario scored five assertions:

1. Correct Nexi understanding and tool routing.
2. Correct tenant-scoped client record.
3. No invented missing fact.
4. Confirmation before a changing action.
5. Correct saved state or protected state after the action.

## Commands and evidence

```text
npm run build --workspace @nexteam/server
PASS

NEXTEAM_RUN_LIVE_CLIENT_ACCEPTANCE=true node --env-file=<local gitignored env> --test apps/server/test/nexi-live-aquatrace-client-acceptance.test.mjs
PASS: Nexi live Aquatrace client acceptance: 100 points
pass 1, fail 0
LIVE_TEST_FIXTURES_REMAINING=0
```

## Availability guard added

A named tenant runtime now refuses to start if Firebase Admin durable persistence is unavailable. It can no longer silently switch to an empty in-memory client database. The health endpoint now reports the Firebase Admin persistence rail as well.
