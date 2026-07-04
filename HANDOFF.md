# GBP Rail Layer 1 Handoff

Built:
- Google OAuth 2.0 authorization-code flow for the NexTeam GBP rail inside the existing Vite + Express app.
- Encrypted local token vault with AES-256-GCM at rest and a gitignored vault key file under `credentials/`.
- Multi-account connection model keyed by operator-supplied Google account label, with automatic refresh-token-based access token renewal.
- Inventory sync that calls the Account Management API and Business Information API, then stores account and location IDs for later publishing work.
- Admin-facing route at `/mission-control/google-business-profile` for connect, status, and manual inventory runs.

Locally tested:
- `node scripts/test-gbp-rail.mjs`
  - Verifies auth URL generation
  - Verifies signed callback state parsing
  - Verifies encrypted vault writes without plaintext token leakage
  - Verifies refresh-token exchange logic
  - Verifies account + location inventory mapping for four mocked Aquatrace locations
- Frontend/build verification resumes through the live app shell after normal local startup.

Blocked live step:
- Google OAuth itself is live and the callback path is ready now.
- The live Business Profile inventory call was tested successfully through OAuth and returned a Google-side zero-quota block instead of locations.
- Confirmed live response: `429 RESOURCE_EXHAUSTED` with quota metadata showing `quota_limit_value: "0"` for `mybusinessaccountmanagement.googleapis.com`.
- Treat this as the expected "access pending" state for case `6-2215000040637`, not as a separate quota-remediation task.
- Do not file a separate quota-increase request while the access request is still under review.

Resume point after Google approval:
- Open `/mission-control/google-business-profile`
- Connect with the managing account
- Click `Run Account + Location Inventory`
- Confirm the four Aquatrace locations appear and capture any final IDs needed for Layer 2 publishing

## WordPress Rail Update

- WordPress media upload is now live again through the Application Password rail.
- InMotion cleared the blocking ModSecurity rule, and a real upload to `/wp-json/wp/v2/media` succeeded on `2026-06-27T03:56:34.575Z`.
- Full end-to-end verification also succeeded:
  - throwaway draft created
  - image uploaded
  - `featured_media` persisted with cache-busted verification
  - throwaway draft deleted
  - uploaded test image deleted
- The reusable WordPress rail in `src/features/missioncontrol/services/wordpressRailService.js` is no longer stubbed for uploads.

## Local Rail API

- A localhost-only internal rail API now exists as the seam for Clawdia's Bragi.
- Binding:
  - host: `127.0.0.1`
  - default port: `3210`
- Start command:
  - `npm run rail:local-api`
- Auth:
  - `Authorization: Bearer <RAIL_LOCAL_API_TOKEN>`
- Contract doc:
  - `docs/internal/LOCAL_RAIL_API_CONTRACT.md`
- Live test script:
  - `npm run rail:local-api:test`
- Implemented routes:
  - `POST /rail/wp/draft`
  - `POST /rail/wp/yoast`
  - `POST /rail/wp/upload-media`
  - `POST /rail/wp/featured-image`
  - `GET /rail/companycam/photos`
  - `GET /rail/companycam/photo/:id`
