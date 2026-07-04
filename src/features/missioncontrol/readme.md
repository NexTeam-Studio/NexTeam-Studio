# Mission Control — Njord Scaffold

**Aquatrace Case Study #1 · NexTeam-Studio**

---

## What This Is

Mission Control is the Njord host-agent interface for the Aquatrace case study.
It is a demonstration environment within NexTeam-Studio showing the Norse agent
layer pattern: one host agent (Njord) routing to five specialist subagents.

**Isolation rules:**
- No connection to any external Aquatrace systems, repos, or credentials
- `IDENTITY.md` rule remains: Clawdia stays internal; this is a case-study only
- All campaign sends are sandbox/log-only until a real delivery service is wired

---

## Routes

```
/mission-control
/mission-control/aquatrace-case-study
```

Protected by:
1. `AdminGate` on both routes
2. `MissionControlGate` on the Aquatrace case-study route only

`/mission-control` is now the shared Mission Control landing page. It reads tenant records
from Firestore `tenants/*` and shows only clients where:
- `registryVisible !== false`
- `missionControlEnabled === true`

If the shared registry does not yet contain the Aquatrace case-study tenant, the landing page
still injects the Njord case-study card so the approved reference implementation remains visible.

---

## Norse Roster (Routing Stubs)

| Agent     | Role                       | Intent Tags                          |
|-----------|----------------------------|--------------------------------------|
| Heimdall  | Gatekeeper & Intake        | intake, validation, routing          |
| Thor      | Outreach & Campaign Exec   | campaign, email-send, follow-up      |
| Mimir     | Knowledge & Research       | lookup, research, record-fetch       |
| Freyja    | Relationships & Engagement | relationship, sentiment, nurture     |
| Bragi     | Content & Messaging        | content, copy, template, subject-line|

All handlers are **stubs**. Replace handler bodies in `njordRouter.js` with real
LLM calls or tool invocations as the case study evolves.

---

## Campaign Workflow (Buncombe-Style)

Lifecycle: `draft → test-pending → test-sent → test-confirmed → approved → sending → complete`

**Rules enforced in code:**
1. Test email must be sent before campaign can advance
2. Test email must be confirmed by operator before approval is possible  
3. Two separate operator confirmations required before a send is approved
4. In case-study mode, the "send" stage always logs to Firestore only — no real delivery

See `njordCampaignService.js` for the full state machine.

---

## Files

```
src/features/missioncontrol/
  config/
    njordConfig.js          Tenant config, case-study flags, collection names
    norseRoster.js          Norse agent definitions + intent routing
  services/
    njordSessionLogger.js   Firestore session lifecycle (init/log/close)
    njordIntentClassifier.js  Keyword-stub intent classification
    njordRouter.js          Routes intent → Norse agent stub handler
    njordCampaignService.js  Buncombe-style campaign workflow + 2-confirm approval
  hooks/
    useNjordSession.js      React hook: text input → intent → route → response
  components/
    NjordMissionControl.jsx  Main chat UI
    MissionControlGate.jsx   Case-study acknowledgment gate
  index.js                  Public exports
  README.md                 This file
```

---

## What's a Stub vs. What's Real

| Item                          | Status       | Notes                                    |
|-------------------------------|--------------|------------------------------------------|
| Text chat → Njord handler     | ✅ Working   | Intent classifies, routes, logs          |
| Session logging to Firestore  | ✅ Working   | Uses `njordSessions` collection          |
| Intent classification         | 🔶 Stub      | Keyword-based; swap for LLM call         |
| Norse agent routing           | 🔶 Stub      | Returns stub text; wire real handlers    |
| Voice input                   | 🔶 Stub      | Hook present; wire mic/ASR here          |
| Voice output (TTS)            | 🔶 Stub      | `speakResponse` present; wire ElevenLabs |
| Campaign state machine        | ✅ Wired     | Full lifecycle + 2-confirm in Firestore  |
| Test email actual delivery    | ✅ Wired     | Calls `/api/njord/send-test-email` → Resend |
| Shared client registry view   | ✅ Wired     | `/mission-control` reads Firestore tenant state |
| Full-list send                | 🔒 Locked    | Always sandbox in case-study mode        |

---

## Test Email 1 — Readiness

**Status: Wired. Pending env vars + deploy.**

`sendTestEmail()` now calls `/api/njord/send-test-email` on the server,
which calls Resend and delivers a real email to `chris@aquatraceleak.com`.

The server enforces that the `toAddress` must match `VITE_NJORD_TEST_EMAIL` —
no other address can be targeted through this route.

**To activate:**
1. Add `RESEND_API_KEY` to Railway env vars (get it from resend.com)
2. Set `VITE_NJORD_TEST_EMAIL=chris@aquatraceleak.com` in Railway env vars
3. Set `RESEND_FROM_EMAIL` to a Resend-verified sender (or leave unset to use `onboarding@resend.dev` for first test)
4. Deploy
5. Create a campaign with `createCampaign()`, call `sendTestEmail(campaignId, "chris")`, check inbox
6. Call `confirmTestEmail(campaignId, "chris")` once it looks good
7. Run the two-confirmation `approveCampaign()` flow
8. Full-list `executeCampaignSend()` remains sandbox-only (logs to Firestore only)

---

## Environment Variables Needed

```env
VITE_ADMIN_PASSWORD=<operator password>         # enables AdminGate
VITE_NJORD_TEST_EMAIL=chris@aquatraceleak.com   # test email target (server-enforced)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx          # from resend.com dashboard
RESEND_FROM_EMAIL=onboarding@resend.dev         # use this for first test; swap to verified domain after
```
