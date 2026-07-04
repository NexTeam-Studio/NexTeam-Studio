# NexTeam-Studio Status
_Auto-maintained. Last updated: 2026-04-11_

## Current Build State

| Area | Status | Notes |
|------|--------|-------|
| Route: /mission-control/aquatrace/workspace | ACTIVE | -> NjordShell (tabbed: Chat, Session Log, SOPs, Blueprints, Onboarding) |
| Route: /mission-control/aquatrace | ACTIVE | -> AquatraceDashboard with launch button to workspace |
| Route: /mission-control/aquatrace-case-study | REDIRECT | -> /mission-control/aquatrace/workspace |
| NjordShell navigation | WORKING | All 6 tabs functional; SOP Editor appears on demand |
| Chat (NjordMissionControl) | WORKING | Claude-backed via /api/anthropic proxy; case-study banner shown |
| Session logging (Firestore) | WIRED | Requires deployed Firestore; seeds to local only if unavailable |
| SOP Library | WORKING | Loads from Firestore or seed data; state transitions work |
| SOP Editor | WORKING | Create/edit/AI-draft; validates before save |
| Blueprint Library | WORKING | Loads from Firestore or seed data; instantiate flow works |
| Onboarding Checklist | WORKING | Loads from Firestore or seed data (seed fallback added 2026-04-11) |
| AdminGate | ACTIVE | Requires VITE_ADMIN_PASSWORD env var |
| MissionControlGate | ACTIVE | Case-study acknowledgment required before workspace access |
| Test email (Resend) | WIRED, NOT DEPLOYED | Needs RESEND_API_KEY + VITE_NJORD_TEST_EMAIL in Railway |
| Full-list campaign send | SANDBOXED | Log-only in case-study mode; never sends to real list |
| Client Portal | WIRED | Portal login/invite/profile flow; needs Firebase Auth deployed |

## Environment Dependency Summary

| Var | Required For | Status |
|-----|-------------|--------|
| VITE_ADMIN_PASSWORD | AdminGate | Set in Railway (assumed from prior deploy) |
| VITE_NJORD_TEST_EMAIL | Test email target | Must be set in Railway |
| RESEND_API_KEY | Test email delivery | Not yet set in Railway |
| RESEND_FROM_EMAIL | Email sender | Optional; defaults to onboarding@resend.dev |
| Firebase config vars | Firestore, Auth | Must be set in Railway |
