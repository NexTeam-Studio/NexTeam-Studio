# Firestore Rules Deployment Guide

## Status
Rules are **authored but not yet deployed**. The file `firestore.rules` in the repo root is ready to deploy.

## What the rules cover

| Collection | Read | Write | Notes |
|---|---|---|---|
| `agentSessions/{id}` | Auth required | Schema-validated (open for now) | Lock down once Agent Architect has login |
| `tenants/{tid}/sops` | Known tenant only | Schema-validated (state enum enforced) | `aquatrace-case-study` + `nexteam-studio` allowed |
| `tenants/{tid}/blueprints` | Known tenant only | Schema-validated | Same allow-list |
| `tenants/{tid}/onboardingSessions` | Known tenant only | Validated (clientId + blueprintId required) | |
| `clientOrganizations/{id}` | Portal member only | Stripe-provisioned fields required | **Note: server.js uses client SDK** |
| `clientOrganizations/{id}/members/{uid}` | Self or org member | Self only | |
| `clientOrganizations/{id}/invites/{id}` | Org member or unauthenticated | Stripe source required on create | |
| `clientOrganizations/{id}/deliveryState/{id}` | Org member only | clientId required | |
| `njordSessions/{id}` | Auth required | tenantId must == aquatrace-case-study | |
| `njordSessions/{id}/events/{id}` | Auth required | Immutable after write | |
| `njordCampaignLogs/{id}` | Auth required | Immutable after write | |
| Everything else | DENIED | DENIED | Catch-all deny |

## Deploy steps
1. Install Firebase CLI if not already: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Init (if first time): `firebase init firestore` — select the NexTeam project
4. Test rules locally: `firebase emulators:start --only firestore`
5. Deploy: `firebase deploy --only firestore:rules`

Deploy indexes separately (or together):
```
firebase deploy --only firestore:indexes
```

## Critical caveat — server.js uses Client SDK

`server.js` (the Stripe webhook handler) uses the **Firebase Client SDK**, not the Admin SDK. This means Firestore security rules **do apply** to Stripe webhook writes.

The rules account for this by allowing unauthenticated creates to `clientOrganizations` if the required fields (`clientId`, `slug`, `purchaseStatus`) are present. However, this is not a strong security control.

**Recommended follow-up:** Migrate `server.js` Firestore writes to the **Firebase Admin SDK**. Once on Admin SDK, the `clientOrganizations` write rules can be changed to `allow write: if false` (Admin SDK bypasses all rules).

Migration steps:
1. `npm install firebase-admin` in the backend
2. Replace `initializeApp` + `getFirestore` imports with `admin.initializeApp()` + `admin.firestore()`
3. Use service account credentials via `GOOGLE_APPLICATION_CREDENTIALS` env var or Railway secret

## Code-side hardening (already implemented)

`src/features/missioncontrol/services/firestorePaths.js` provides:
- Tenant ID allow-listing (`isSafeTenantId`, `assertSafeTenantId`)
- Path segment sanitization (strips `/`, control chars, caps at 128 chars)
- Centralized path constants for all mission control collections

All three services updated to use it:
- `sopservice.js` → uses `sopCollectionPath`, `sopDocPath`
- `blueprintservice.js` → uses `blueprintCollectionPath`, `blueprintDocPath`, `onboardingSessionDocPath`
- `onboardingservice.js` → uses `onboardingSessionCollectionPath`, `onboardingSessionDocPath`

## Next safe task (no console access needed)
1. **Copy changed files to the live repo** — workspace clone has the hardened services; need a sync or PR
2. **Verify the live repo's clientPortal services** use consistent path patterns (portalMembershipService.js, portalInviteService.js look correct already)
3. **Write simple unit tests** for `firestorePaths.js` sanitization/rejection logic — verifiable locally with Vitest
4. **Admin SDK migration** for server.js — safe to scaffold tonight, deploy needs env var for service account key
