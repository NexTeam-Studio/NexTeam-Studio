# Master Asset Inventory

Standing external-service inventory for NexTeam work. Check this file before any build, deploy, auth change, or new integration work that touches a third-party account.

Rules:
- Never put secret values in this file.
- Record only login method, account identity, login URL, and storage reference.
- If something is not directly verified from the repo, local machine state, or a live checked integration, mark it `unverified - needs Chris to confirm`.
- Update this file whenever a new service is added, a credential path changes, or an auth method changes.

Last reviewed: 2026-06-29

## Verification Legend

- `verified` = confirmed from repo files, local machine state, or a live checked integration
- `partially verified` = some fields confirmed, but account owner/login path still needs confirmation
- `unverified - needs Chris to confirm` = not safely provable from current machine/repo state

## Machine Auth State Snapshot

- Railway CLI is installed and local Railway CLI auth is refreshed as of 2026-06-29.
- Firebase CLI is installed and local Firebase CLI auth is refreshed as of 2026-06-29.
- GitHub CLI is not installed on this machine.
- Current local credential storage is split across:
  - repo-local gitignored `.env`
  - repo-local `credentials/`
  - Windows user environment variables at `HKCU:\Environment`
  - Railway environment variables
  - external runtimes outside this repo, especially `C:\Users\Peyto\clawdia-bot`

## Access & Login Map

| Service | Login method | Account / email tied to it | Login URL | Credential / token storage reference | Status / notes |
| --- | --- | --- | --- | --- | --- |
| GitHub (`NexTeam-Studio`, `aquatrace-app`) | Google Sign-In | `Chris1BATA / chris1bata@gmail.com` | <https://github.com/> | Git remote in local repo config; browser/session or Git Credential Manager storage is unverified | `verified`; Chris confirmed login method, email, username, and repos on 2026-06-29 |
| Railway | Continue with GitHub | `Chris1BATA / chris1bata@gmail.com` via GitHub account above | <https://railway.app> | Railway env for deployed apps; user-level Railway project/link state at `C:\Users\Peyto\.railway\config.json`; local Railway CLI auth cache outside repo | `verified`; account and live project list confirmed from Railway dashboard on 2026-06-29; local Railway CLI session was refreshed successfully during the auth/Admin cutover |
| Firebase Console | Google Sign-In | `chris@aquatraceleak.com` | <https://console.firebase.google.com/> | Web config in `C:\Users\Peyto\NexTeam-Studio\.env`; Admin SDK credentials expected in Railway env or `GOOGLE_APPLICATION_CREDENTIALS`; local Firebase CLI auth cache outside repo | `verified`; Chris confirmed login method/account on 2026-06-29; projects are `nexteam-studio` and `aquatrace-app-mobile`; local Firebase CLI session was refreshed successfully during the auth/Admin cutover |
| Google Cloud Console / GBP API project `nexteam-gbp-rail` | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://console.cloud.google.com/> | OAuth client file `C:\Users\Peyto\NexTeam-Studio\credentials\nexteam-gbp-rail-oauth.json` | `partially verified`; project and credential file exist locally, but console login identity is not yet confirmed |
| Google Business Profile managing account | Google sign-in | `aquatraceleak@gmail.com` | <https://business.google.com/locations> | Encrypted token vault `C:\Users\Peyto\NexTeam-Studio\credentials\nexteam-gbp-rail-token-vault.enc` with key at `C:\Users\Peyto\NexTeam-Studio\credentials\nexteam-gbp-rail-token-vault.key` | `verified`; this is the connected GBP managing account in local tests/code |
| Gmail API send path for repo workflows | OAuth 2.0 | Send-as identity `service@aquatraceleak.com`; exposed Gmail connector profile historically `aquatraceleak@gmail.com` in proof logs | <https://mail.google.com/> | OAuth client file `C:\Users\Peyto\NexTeam-Studio\credentials\nexteam-gmail-oauth.json`; refresh token in `C:\Users\Peyto\NexTeam-Studio\.env`; additional Gmail/SMTP env exists in `HKCU:\Environment` | `partially verified`; send-as and storage path are known, exact owning mailbox path still needs confirmation |
| WordPress admin (`aquatraceleak.com` and/or `nexteam.studio`) | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | `unverified - Chris to confirm` | No browser-login credential stored in repo; API path below uses application password only | `unverified - needs Chris to confirm`; admin-panel login path/account should be filled before future site work |
| WordPress API for `aquatraceleak.com` | WordPress Application Password over REST API | Username `aquatrace-bragi` | <https://aquatraceleak.com/wp-login.php> | `WORDPRESS_BASE_URL`, `WORDPRESS_USERNAME`, and `WORDPRESS_APP_PASSWORD` in `C:\Users\Peyto\NexTeam-Studio\.env` | `verified`; this is the repo's live API auth path |
| Hosting / registrar for `nexteam.studio` | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | `unverified - Chris to confirm` | No hosting-panel or registrar credential found in repo or local env | `unverified - needs Chris to confirm`; record the real host, registrar, and DNS control plane here when confirmed |
| Cloudflare | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://dash.cloudflare.com/login> | No Cloudflare API token or panel credential found in repo or local env | `unverified - needs Chris to confirm`; active operational role is documented, account details are not |
| Anthropic console | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://platform.claude.com/settings/keys> | Repo-local key source in `C:\Users\Peyto\NexTeam-Studio\.env`; additional live key present in `HKCU:\Environment` as `ANTHROPIC_API_KEY`; live app may also use Railway env | `partially verified`; credential storage is split and should be normalized |
| OpenAI / ChatGPT / Codex | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://platform.openai.com/api-keys> | No `OPENAI_API_KEY` found in this repo's local `.env`; docs indicate Railway env for `clawdia-bot` outside this repo | `partially verified`; documented external runtime dependency, no local key found here |
| CompanyCam | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://app.companycam.com/login> | `COMPANYCAM_API_TOKEN` in `C:\Users\Peyto\NexTeam-Studio\.env` | `partially verified`; repo token exists and works, but browser-login method/account still needs confirmation |
| Jobber | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://secure.getjobber.com/login> | No local Jobber token, OAuth file, or env var found | `unverified - needs Chris to confirm`; future/planned integration only in current repo state |
| ElevenLabs | Google Sign-In | `nexteamstudioai@gmail.com` | <https://elevenlabs.io/> | `ELEVENLABS_API_KEY` in `C:\Users\Peyto\NexTeam-Studio\.env`; also present in Railway env for `cozy-sparkle` | `verified`; workspace `ElevenCreative / My Workspace`; plan `Creator (paid)`; approximately `126,485` credits remaining as of 2026-06-29 |
| Simli | Google Sign-In | `nexteamstudioai@gmail.com` | <https://app.simli.com/> | `SIMLI_API_KEY` and `SIMLI_FACE_ID` are present in Railway env for `cozy-sparkle` | `verified`; plan `Free (50 min/month)`; Nexi face is `Genetic Meerkat` (`Trinity`); other avatars present: `Ong`, `Hope (Legacy)`; Railway `SIMLI_FACE_ID` is `5fc23ea5-8175-4a82-aaaf-cdd8c88543dc`, which matches the verified `5fc23ea5-8175-...` prefix for the Genetic Meerkat face |
| Resend | `unverified - Chris to confirm login method/account` | `unverified - Chris to confirm` | <https://resend.com/login> | `RESEND_API_KEY` present in Railway env for `cozy-sparkle`; optional sender env names documented in `.env.example` and `status.md` | `partially verified`; deploy env confirms use, account/login path is not documented |
| Stripe | Google Sign-In | `nexteamstudioai@gmail.com` | <https://dashboard.stripe.com/login> | `VITE_STRIPE_PAYMENT_LINK` present in Railway env for `cozy-sparkle`; no Stripe secret key documented in this repo | `verified`; account name `NexTeam Studio`; name on file `Chris Sears`; 2FA uses Google Authenticator, with the authenticator app itself held under `chris@aquatraceleak.com` |
| Telegram bot runtime (`clawdia-bot`) | Bot token / operator allowlist | No email; operator identity is Telegram user ID based | <https://my.telegram.org/> | Railway env for the external `clawdia-bot` runtime; see `C:\Users\Peyto\NexTeam-Studio\docs\internal\CLAWDIA_COMPANYCAM_OPERATOR_RUNBOOK.md` | `partially verified`; runtime is outside this repo |
| Dropbox (local CompanyCam sync destination) | `unverified - needs Chris to confirm` | `unverified - needs Chris to confirm` | <https://www.dropbox.com/login> | Local filesystem base only: `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\`; no Dropbox API credential found here | `partially verified`; local sync destination is known, cloud API auth is not configured here |

### Verified Account-Email Pattern

- `chris1bata@gmail.com` -> GitHub, Railway
- `chris@aquatraceleak.com` -> Firebase, and holds the Stripe Google Authenticator app for 2FA
- `nexteamstudioai@gmail.com` -> Simli, ElevenLabs, Stripe

## Current Gaps To Close

- Confirm the real GitHub browser/PAT/GCM login path.
- Confirm the Google Cloud / GBP console owner account email and login method.
- Confirm the actual `nexteam.studio` registrar, host, and DNS control-panel owner.
- Confirm the WordPress browser-login account(s) for `aquatraceleak.com` and `nexteam.studio`.
- Confirm the CompanyCam account email or owner name.
- Confirm whether the Gmail API path is owned by `aquatraceleak@gmail.com`, `service@aquatraceleak.com`, or another Google account with send-as delegation.
- Normalize Anthropic key storage so one controlled source of truth exists.

## Firebase Project State

Verified from Chris's live Firebase console session on 2026-06-29:

- Firebase console login account: `chris@aquatraceleak.com`
- Projects present:
  - `NexTeam-Studio` (`nexteam-studio`)
  - `Aquatrace-APP` (`aquatrace-app-mobile`)
- `nexteam-studio` plan: `Spark` (free plan)
- Registered web app in `nexteam-studio`: `NexTeam-Studio-Web`
- Firebase Authentication state in `nexteam-studio`:
  - Email/Password provider is enabled
  - Existing Auth users created on 2026-04-08:
    - `owner@aquatrace.com` — current real operator-style Auth user for the NexTeam-Studio Firebase project
    - `portal-check@example...` — test user
  - `chris@aquatraceleak.com` is the Firebase console login, but is **not** currently a Firebase Auth user in `nexteam-studio`
- Backend Admin env vars for the new auth/Admin cutover are now present in Railway `cozy-sparkle`:
  - `FIREBASE_ADMIN_PROJECT_ID`
  - `FIREBASE_ADMIN_CLIENT_EMAIL`
  - `FIREBASE_ADMIN_PRIVATE_KEY`
  - `FIREBASE_DEFAULT_TENANT_ID`
  - `FIREBASE_PLATFORM_OPERATOR_EMAILS`
  - `FIREBASE_PLATFORM_OPERATOR_UIDS`
  - `FIREBASE_PLATFORM_OPERATOR_ROLE`
- Important correction for future cutover work:
  - `FIREBASE_PLATFORM_OPERATOR_EMAILS` / `FIREBASE_PLATFORM_OPERATOR_UIDS` should reference the real existing Firebase Auth operator user `owner@aquatrace.com`, not the Firebase console login `chris@aquatraceleak.com`, unless a new operator Auth user is deliberately created later
- Live bootstrap proof completed on 2026-06-29:
  - operator user `owner@aquatrace.com` now successfully bootstraps to claims `{ tenantId: "nexteam-studio", role: "platform_operator" }`
  - non-operator test user `portal-check@example.com` now successfully bootstraps to claims `{ tenantId: "nexteam-studio" }`

## Live Firestore Collections

Verified from the live `nexteam-studio` default Firestore database on 2026-06-29:

- `agentSessions`
  - Contains dozens of real documents
  - Confirmed sample doc includes:
    - `agentId`
    - `businessName: "Aquatrace"`
    - `createdAt: April 4 2026`
    - `missingFields` array with values including `trade`, `crewSize`, `jobVolume`, `serviceArea`, `biggestPain`, `existingTools`, `recommendedAgents`, `priorityAgent`, `agentName`, `agentMission`
  - Code match: this is the live Nexi / Agent Architect intake persistence lane. The current app writes incremental intake patches to `agentSessions/{sessionId}` and the admin review surface reads from the same collection.
- `agentSpecs`
  - Exists live
  - Code match: this points to the earlier `standalone-agent-demo` write path and looks like older scaffold/prototype persistence rather than the main current intake lane
- `clientOrganizations`
  - Exists live
  - Code match: this is the multi-client / portal organization container used by the portal and Stripe onboarding lane
- `njordSessions`
  - Exists live
  - Code match: this is the Mission Control / Njord session log lane, isolated from `agentSessions`
- `tenants`
  - Exists live
  - Code match: this is the tenant registry/root-doc layer already in use by Mission Control and related tenant-aware services

### Firestore Coexistence Note

- The current tenant-foundation code added on 2026-06-29 does **not** replace `agentSessions`, `agentSpecs`, `clientOrganizations`, or `njordSessions`.
- The new validated foundation documents live under tenant subpaths:
  - `tenants/{tenantId}/intakePackets/{packetId}`
  - `tenants/{tenantId}/config/current`
  - `tenants/{tenantId}/runtimeSummary/current`
- That means the new foundation is a **clean extension path**, not a wholesale schema replacement.
- Live Admin SDK inspection before the 2026-06-29 tenant-root write found that `tenants` existed as a collection but had **zero** root docs and **zero** `config`, `runtimeSummary`, or `intakePackets` documents.
- On 2026-06-29, the live tenant root/foundation lane was populated safely without touching the April collections:
  - created `tenants/nexteam-studio` as the hidden internal/default tenant root doc
  - created `tenants/aquatrace` as the real Aquatrace tenant root doc
  - created Aquatrace validated foundation docs:
    - `tenants/aquatrace/intakePackets/{packetId}`
    - `tenants/aquatrace/config/current`
    - `tenants/aquatrace/runtimeSummary/current`
- Post-write proof:
  - `agentSessions/3b566495-5743-4138-8623-3f6e3d1d80df` still exists
  - `clientOrganizations/aquatrace` still exists
  - `njordSessions/njord-1775871202000-1xoarv` still exists
- Canonical tenant note:
  - the real live tenant root is now `tenants/aquatrace`
  - `aquatrace-case-study` remains a legacy route alias / case-study label in code, not the canonical root-doc ID for the real client foundation

## Character & Agent Roster

Authoritative cast map for the NexTeam + Aquatrace build, reconciled from the current repo, live runtime code, and verified OpenClaw/Railway state.

Naming themes:
- `TMNT` = internal NexTeam role templates
- `Norse` = client-facing / Mission Control host-and-specialist lanes
- `Goonies` = consult-only advisory bench
- `One-Eyed Willy` = special consult-only operator advisor for Clawdia
- `Brokk` = client-facing duplicate of Donatello's website/page-builder skill
- `Slade` = isolated non-agency finance / crypto lane outside NexTeam client work

### Core Operating Lanes

| Name | Role / what they do | Where they run | Real status | Brain / model |
| --- | --- | --- | --- | --- |
| `Clawdia` | NexTeam internal general contractor and operator; routes work, manages proof, owns internal coordination | Railway project `clawdia-bot`, plus the local shared-brain/operator runtime in `C:\Users\Peyto\clawdia-bot` | `live/working` | OpenAI fallback/operator lane in `clawdia-bot` (`gpt-4o` by default) plus rule/runtime routing; not powered by the repo's Anthropic proxy |
| `Nexi` | Public-facing NexTeam intake / blueprint guide | NexTeam-Studio `/agent-architect`; verified Simli/ElevenLabs account stack exists for broader Nexi voice/face work | `live surface, but AI path currently stale-configured` | Anthropic via `/api/anthropic/v1/messages` in `architectApi.js`, currently set to retired `claude-sonnet-4-20250514`; Rive avatar + ElevenLabs TTS are wired in repo |
| `Atlas/Codex` | Approved builder / execution hand for repo work | Codex/OpenClaw local execution lane | `live/working` | Codex / OpenAI execution lane, outside the repo-managed app model config |

### TMNT Internal Role Templates

| Name | Role / what they do | Where they run | Real status | Brain / model |
| --- | --- | --- | --- | --- |
| `Splinter` | Standards keeper, architect, boundary/policy guide | `docs/internal/tmnt/splinter/*` | `framework-only internal role template` | `n/a` |
| `Leonardo` | Internal coordination and project leadership | `docs/internal/tmnt/leonardo/*` | `framework-only internal role template` | `n/a` |
| `Donatello` | Technical builder/system engineer; owner of NexTeam.Studio build/maintenance | `docs/internal/tmnt/donatello/*`; reflected in repo ownership docs | `framework-only internal role template with real ownership authority` | `n/a` |
| `Raphael` | Escalation, risk, pressure-testing | `docs/internal/tmnt/raphael/*` | `framework-only internal role template` | `n/a` |
| `Michelangelo` | Warmth, engagement, retention support | `docs/internal/tmnt/michelangelo/*` | `framework-only internal role template` | `n/a` |
| `April` | Onboarding and client communication support | `docs/internal/tmnt/april/*` | `framework-only internal role template` | `n/a` |
| `Casey` | Dispatch and routing support | `docs/internal/tmnt/casey/*` | `framework-only internal role template` | `n/a` |
| `Karai` | Scheduling and load-balance strategist | `docs/internal/tmnt/karai/*` | `framework-only internal role template` | `n/a` |
| `Metalhead` | Automation pipeline planner | `docs/internal/tmnt/metalhead/*` | `framework-only internal role template` | `n/a` |
| `Leatherhead` | Inventory/materials awareness | `docs/internal/tmnt/leatherhead/*` | `framework-only internal role template` | `n/a` |
| `Slash` | Collections / hard-reminder lane | `docs/internal/tmnt/slash/*` | `framework-only internal role template` | `n/a` |
| `Bebop` | Lead capture and marketing-ops support | `docs/internal/tmnt/bebop/*` | `framework-only internal role template` | `n/a` |
| `Rocksteady` | Work-order and job-record structure lane | `docs/internal/tmnt/rocksteady/*` | `framework-only internal role template` | `n/a` |
| `Krang` | Internal analytics and reporting | `docs/internal/tmnt/krang/*` | `framework-only internal role template` | `n/a` |
| `Shredder` | Internal adversarial review / failure-mode pressure test | `docs/internal/tmnt/shredder/*` | `framework-only internal role template` | `n/a` |

### Client-Facing / Aquatrace Lanes

| Name | Role / what they do | Where they run | Real status | Brain / model |
| --- | --- | --- | --- | --- |
| `Njord` | Aquatrace workspace host agent / Mission Control shell | NexTeam-Studio `/mission-control/aquatrace/workspace` with `njordSessions` logging | `live shell + logging; specialist AI path stale-configured` | Anthropic via `/api/anthropic/v1/messages` in `njordClaudeService.js`, currently set to retired `claude-sonnet-4-20250514` |
| `Heimdall` | Intake/gatekeeper specialist inside Njord | Routed inside the Njord workspace | `wired specialist profile inside live shell; not separate executor` | Same Njord Anthropic path / same stale model string |
| `Thor` | Outreach/campaign specialist inside Njord | Routed inside the Njord workspace | `wired specialist profile inside live shell; not separate executor` | Same Njord Anthropic path / same stale model string |
| `Mimir` | Knowledge/research specialist inside Njord | Routed inside the Njord workspace | `wired specialist profile inside live shell; not separate executor` | Same Njord Anthropic path / same stale model string |
| `Freyja` | Relationship/engagement specialist inside Njord | Routed inside the Njord workspace | `wired specialist profile inside live shell; not separate executor` | Same Njord Anthropic path / same stale model string |
| `Bragi` | Articles, SEO, metadata, content workflow | NexTeam-Studio Mission Control + WordPress/CompanyCam rail + local rail API | `partially live`: rails are proven, but autonomous writing/vision have never completed a real successful run yet | Direct Anthropic Mode B path currently blocked by retired model string; also appears as the Norse content prompt in Njord |
| `Brokk` | Client website/page-builder specialist; duplicate of Donatello's site-build skill for client work | `docs/AQUATRACE_WEBSITE_AGENTS.md`; Website Requests lane in Aquatrace workspace | `defined/framework-only; no proven separate autonomous runtime` | `n/a` |

### Consult-Only Advisory Bench

| Name | Role / what they do | Where they run | Real status | Brain / model |
| --- | --- | --- | --- | --- |
| `Chunk` | Research, facts, case studies, source truth | `clawdia-bot` consult runtime + `docs/internal/goonies/chunk/*` | `live consult runtime, but not LLM-backed as a separate worker` | Structured consult runtime built from docs/runtime profiles, not a separate model call |
| `Mikey` | Strategy, leverage, sequencing | `clawdia-bot` consult runtime + `docs/internal/goonies/mikey/*` | `live consult runtime, but not LLM-backed as a separate worker` | Structured consult runtime built from docs/runtime profiles |
| `Mouth` | Sales/messaging/customer communication advisor | `clawdia-bot` consult runtime + `docs/internal/goonies/mouth/*` | `live consult runtime, but not LLM-backed as a separate worker` | Structured consult runtime built from docs/runtime profiles |
| `Brand` | Field operations / real-world workflow advisor | `clawdia-bot` consult runtime + `docs/internal/goonies/brand/*` | `live consult runtime, but not LLM-backed as a separate worker` | Structured consult runtime built from docs/runtime profiles |
| `Data` | Systems/architecture/integration advisor | `clawdia-bot` consult runtime + `docs/internal/goonies/data/*` | `live consult runtime, but not LLM-backed as a separate worker` | Structured consult runtime built from docs/runtime profiles |
| `Andy` | Local growth / SEO / visibility advisor | `clawdia-bot` consult runtime + `docs/internal/goonies/andy/*` | `live consult runtime, but not LLM-backed as a separate worker` | Structured consult runtime built from docs/runtime profiles |
| `One-Eyed Willy` (`Willy`) | Clawdia's Nova-like operator/strategy/proof/next-step advisor | `clawdia-bot` shared-brain consult runtime + `docs/internal/goonies/willy/*` | `live/working consult-only advisor` | OpenAI `gpt-4o` by default in `willyConsultRuntime.js` |

### Legacy / System-Defined Specs

| Name | Role / what they do | Where they run | Real status | Brain / model |
| --- | --- | --- | --- | --- |
| `Agent Architect` | System/meta-agent spec and anti-duplication planner | `docs/AGENT_ARCHITECT.md` | `defined/stale spec; not a separate deployed runtime` | `n/a` |
| `Intake Agent` | Intake spec | `docs/AGENT_INTAKE.md` | `defined/stale spec` | `n/a` |
| `Planner Agent` | Planning spec | `docs/AGENT_PLANNER.md` | `defined/stale spec` | `n/a` |
| `QA / Review Agent` | Quality/review spec | `docs/AGENT_QA_REVIEW.md` | `defined/stale spec` | `n/a` |
| `Documentation Agent` | Documentation/knowledge-maintenance spec | `docs/AGENT_DOCUMENTATION.md` | `defined/stale spec` | `n/a` |

### Outside The NexTeam Client Stack But Real On This Machine

| Name | Role / what they do | Where they run | Real status | Brain / model |
| --- | --- | --- | --- | --- |
| `Slade` | Isolated finance / crypto / mailbox operator; explicitly not part of NexTeam client work | OpenClaw workspace docs and finance lane under `C:\Users\Peyto\.openclaw\workspace` | `active but isolated / non-agency` | OpenClaw finance/mailbox/runtime lane; provider/model is not governed by this repo |

## Railway Project Map

Source of truth used here:
- user-level Railway link state in `C:\Users\Peyto\.railway\config.json`
- live public URL probes on 2026-06-29
- local repo metadata for each linked project path
- Chris-confirmed Railway dashboard state on 2026-06-29

| Railway project | What it actually is | Linked local repo / app | Git remote | Region | Verified URL | Live status |
| --- | --- | --- | --- | --- | --- |
| `clawdia-bot` | Clawdia/OpenClaw backend. Clawdia Telegram webhook bot and operator runtime. Runs `node index.js`, exposes `GET /health`, expects Telegram webhook `POST /telegram/webhook`, and contains the CompanyCam/operator/shared-brain Railway wrapper lane. | `C:\Users\Peyto\clawdia-bot` | No Git remote configured locally | `US West` | <https://clawdia-bot-production.up.railway.app> | `verified working for its intended role`: Railway dashboard shows online with 1/1 service online; last successful deploy was `OpenAI key rotation and safety cleanup` about 2 months ago; `GET /health` returns `200 ok`; `GET /` returns `404 not found`; `GET /telegram/webhook` returns `404 not found`, which matches the code because the webhook route only accepts `POST` |
| `cozy-sparkle` | NexTeam-Studio app deploy lane. This is the Railway project linked to the `NexTeam-Studio` repo and is the one that serves the NexTeam app and the Firebase auth routes. | `C:\Users\Peyto\NexTeam-Studio` and `C:\Users\Peyto\.openclaw\workspace\NexTeam-Studio` | `https://github.com/Chris1BATA/NexTeam-Studio.git` | `EU West` | <https://nexteam-studio-production.up.railway.app> | `verified serving current cutover state`: clean-snapshot deploy succeeded on 2026-06-29; `GET /health`, `GET /`, `GET /agent-architect`, `GET /mission-control/aquatrace/workspace`, and `GET /mission-control/clients` all return `200`; `GET /api/internal/firebase-auth/me` returns `401` unauthenticated as expected |

### Railway Project Conclusions

- `cozy-sparkle` is the NexTeam-Studio Railway project. That is verified from `C:\Users\Peyto\.railway\config.json`, which links `C:\Users\Peyto\NexTeam-Studio` to project name `cozy-sparkle`.
- `clawdia-bot` is a separate Railway project for the Telegram bot runtime, not the NexTeam app.
- `https://nexteam-studio-production.up.railway.app` is not a dead or wrong Railway hostname. It is a live service endpoint because it responds on `GET /health`.
- The prior 404 problem was resolved by the 2026-06-29 clean-snapshot Railway deploy; the live app is serving the main SPA routes again.
- The Firebase auth/Admin routes are now live in production:
  - `GET /api/internal/firebase-auth/me` returns `401` when unauthenticated
  - `POST /api/internal/firebase-auth/tenant-bootstrap` returns `401` when unauthenticated and `200` with verified claims when authenticated
- `https://cozy-sparkle.up.railway.app` is not the NexTeam app URL. It returns Railway's JSON `Application not found`.

### cozy-sparkle / NexTeam-Studio live env state (verified from Railway dashboard 2026-06-29)

Already present in Railway env:
- `ANTHROPIC_API_KEY`
- `BLUEPRINT_FROM_EMAIL`
- `BLUEPRINT_TO_EMAIL`
- `ELEVENLABS_API_KEY`
- `RESEND_API_KEY`
- `SIMLI_API_KEY`
- `SIMLI_FACE_ID`
- `VITE_APP_URL`
- `VITE_BOOKING_LINK`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_STRIPE_PAYMENT_LINK`
- plus Railway-managed platform vars

Added for today's backend Firebase Admin auth layer:
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `FIREBASE_DEFAULT_TENANT_ID`
- `FIREBASE_PLATFORM_OPERATOR_EMAILS`
- `FIREBASE_PLATFORM_OPERATOR_UIDS`
- `FIREBASE_PLATFORM_OPERATOR_ROLE`

### 2026-06-29 auth/Admin cutover result

- Clean deploy snapshot created from commit `4d2a900` in a detached worktree to avoid shipping unrelated dirty main-branch changes.
- Deployment required one additional untracked content bundle from the current workspace:
  - `docs/internal/goonies/`
  - Reason: the committed code already imports this bundle, but it was not present in the clean snapshot and caused the first build to fail.
- Live deployment result:
  - `https://nexteam-studio-production.up.railway.app/api/internal/firebase-auth/me` now returns `401` unauthenticated instead of `404`
  - `https://nexteam-studio-production.up.railway.app/api/internal/firebase-auth/tenant-bootstrap` is live and returns `401` unauthenticated instead of `404`
  - authenticated bootstrap proof succeeded for both operator and non-operator test users
- Firestore rules state:
  - `firestore.rules` deployed live to project `nexteam-studio` on 2026-06-29
  - live cross-tenant denial proof succeeded: same-tenant read resolved to `404 NOT_FOUND` on a missing doc, while cross-tenant read resolved to `403 PERMISSION_DENIED`
- Live route smoke after the cutover and tenant-root write:
  - `GET /` -> `200`
  - `GET /agent-architect` -> `200`
  - `GET /mission-control/aquatrace/workspace` -> `200`
  - `GET /mission-control/clients` -> `200`

### Deployment posture warning

- `cozy-sparkle` last deployed via `railway up`, not a fresh GitHub auto-deploy from current repo state.
- `C:\Users\Peyto\NexTeam-Studio` is currently far ahead of live and the working tree is dirty with many unrelated changes.
- A careless `railway up` from the current working directory would risk shipping far more than the Firebase auth/Admin cutover.
- Safest path: deploy from a clean snapshot pinned to the intended auth/Admin commit set, not from the current dirty workspace.

## Live Website & Deployment Inventory

Verified on 2026-06-29 by live GET requests, public HTML markers, DNS checks, deploy scripts, and proof logs.

| Public URL | What it actually is | Live proof | Hosting / deploy truth | Who built / owns it | Status / notes |
| --- | --- | --- | --- | --- | --- |
| `https://nexteam.studio` | Public NexTeam marketing site. This is not the Railway app. It is a live WordPress site that markets NexTeam and links out to the app lane for Nexi. | `200 OK`; title `NexTeam Studio - NexTeam Studio`; public HTML contains `wp-json`, `wp-content/themes/twentytwentyfive`, and a link to `nexteam-studio-production.up.railway.app`; no React root marker | DNS currently resolves to `173.205.126.13`; nameservers are `ns1.inmotionhosting.com` / `ns2.inmotionhosting.com`; public evidence says WordPress on hosting behind those nameservers. The exact hosting-panel/registrar login is still unverified. | `partially verified`: role authority says Donatello owns NexTeam.Studio website/workspace build and maintenance. The exact editor/builder of the current live WordPress pages is not fully provable from repo-only state because the repo does not contain a full export of the live CMS content. | `verified` live public site; important correction: this is a separate WordPress marketing site, not the Railway SPA |
| `https://nexteam-studio-production.up.railway.app` | The actual NexTeam-Studio app runtime and Firebase-auth/API lane. This is the app, not the marketing site. | `200 OK`; title `NexTeam-Studio`; HTML contains React root; live routes verified: `/`, `/agent-architect`, `/mission-control/aquatrace/workspace`, `/mission-control/clients`; auth route `/api/internal/firebase-auth/me` returns `401` unauthenticated as expected | Railway project `cozy-sparkle`, region `EU West`, linked to repo `https://github.com/Chris1BATA/NexTeam-Studio.git` | `verified`: Atlas/Codex performed the clean-snapshot auth/Admin cutover deploy on 2026-06-29; Donatello remains the permanent internal owner of NexTeam.Studio build/maintenance per role authority | `verified` live app runtime |
| `https://divefactor.com` | Live Dive Factor public website. Static HTML site, not WordPress and not the Railway React app. | `200 OK`; title `Dive Factor | Underwater Services, Scuba Training & Aquatic Safety Programs`; public HTML has no WordPress markers and no React root | DNS resolves to `173.205.126.13`; nameservers are `ns1.inmotionhosting.com` / `ns2.inmotionhosting.com`; repo deploy script `scripts/divefactor-ftps-deploy.ps1` targets remote root `/home/aquatr7/divefactor.com` over explicit FTPS | `verified`: the local canonical build/deploy trail is Atlas/Codex-driven through `docs/clients/dive-factor-underwater-services`; the intended reusable client website role is Brokk, but the proven live deploy evidence is the Atlas/Codex static-package + FTPS lane | `verified` live static site; proof logs confirm full static publish on 2026-06-15 and boutique redesign deploy with backup/live QA on 2026-06-16 |
| `https://aquatraceleak.com` | Live Aquatrace public site. Existing WordPress site using Themify, fronted by Cloudflare. | `200 OK`; title `Home - Aquatrace Swimming Pool Leak Detection`; public HTML contains `wp-json`, `wp-content`, `themify`, and `themify-ultra`; no React root | Public DNS is Cloudflare (`cass.ns.cloudflare.com`, `glen.ns.cloudflare.com`); repo and support-history docs show WordPress + app-password API rail + InMotion/ModSecurity operational work, but current public DNS cannot directly prove the origin host because Cloudflare is in front | `partially verified`: Brokk is the defined page-builder/site-improvement specialist for Aquatrace; Bragi owns the content/SEO lane; Atlas/Codex has verified WordPress draft/Yoast/media rail work. The exact human/CMS builder history before the current repo work is not fully provable from repo state. | `verified` live WordPress site and rail target |

### Website inventory conclusions

- `nexteam.studio` and `nexteam-studio-production.up.railway.app` are two different things:
  - `nexteam.studio` = public WordPress marketing site
  - `nexteam-studio-production.up.railway.app` = live NexTeam app/runtime
- `divefactor.com` is a real deployed static site with a verified FTPS publish trail and proof logs.
- `aquatraceleak.com` is a real live WordPress/Themify site behind Cloudflare; the WordPress rail targets this site.
- No additional standalone public domain or landing-page deployment was directly verified from current repo state on 2026-06-29 beyond the four URLs above. Anything else should be marked `unverified - needs Chris to confirm` before relying on it.

## Agent Origin, Intended Purpose, And Verified Output History

This section adds the missing "why the agent exists" and "what it has actually produced" layer. If an agent has role docs but no separately provable shipped artifact, that is stated plainly.

### Core lanes

| Agent | Original intended purpose | Verified actual outputs to date |
| --- | --- | --- |
| `Clawdia` | Internal general contractor and front door for routing, proof, judgment, and keeping work moving | Shared-brain operator architecture is live in `C:\Users\Peyto\clawdia-bot`; single-command router, proof gates, reroute rules, and operator-truth docs are verified; governs the verified Bragi draft-review-email-Yoast route and the local Atlas/Codex bridge |
| `Nexi` | Public-facing blueprint/intake guide that interviews a prospect, shapes the first solution, and turns conversation into an account-ready intake | Live `agent-architect` route exists; real `agentSessions` records exist in Firestore from April 2026; recent tenant cutover now auto-provisions tenants from completed Nexi sessions; `docs/clients/dive_factor_agent_spec.md` shows `Prepared by: Nexi Core`, proving Nexi was used to shape the Reef client spec |
| `Atlas/Codex` | Approved execution hand for repo work, repairs, and proof-backed implementation | Verified build/output trail includes the WordPress/CompanyCam rails, localhost rail API, GBP Layer 1 OAuth/token-vault build, multi-tenant foundation (`b3ee972`), Firebase auth/Admin cutover (`4d2a900`), conversation-to-tenant provisioner (`e9c8052`, `22b6bae`), and the live static Dive Factor deploy proof package |

### NexTeam internal TMNT roles

| Agent | Original intended purpose | Verified actual outputs to date |
| --- | --- | --- |
| `Splinter` | Standards keeper, architect, and boundary/policy guide | Verified durable role/standards docs and build-review filters; no separate live execution runtime or shipped public artifact proven beyond governance docs |
| `Leonardo` | Internal coordination, sequencing, and clean handoffs | Verified as a durable routing/coordination role in docs; no separately provable live runtime or shipped artifact beyond governance/handoff structure |
| `Donatello` | Internal technical builder and systems engineer for NexTeam.Studio | Verified permanent owner of NexTeam.Studio website/workspace build and maintenance per role authority; live public marketing-site build ownership is recorded here, but the exact commit-by-commit Donatello runtime trail is not separately provable from local repo state |
| `Raphael` | Risk, escalation, and pressure-testing | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Michelangelo` | Warmth, retention, and human-friendly engagement support | Verified role docs only; no separately provable live runtime or shipped artifact |
| `April` | Intake, onboarding, and client communication support | Verified role docs only; no separately provable live runtime or shipped artifact separate from the broader Nexi intake lane |
| `Casey` | Dispatch and routing support | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Karai` | Scheduling and load-balance strategist | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Metalhead` | Automation pipeline planner | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Leatherhead` | Inventory/materials awareness | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Slash` | Collections / hard-reminder lane | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Bebop` | Lead capture and marketing-ops support | Verified role docs only; no separately provable live runtime or shipped artifact separate from the broader Nexi/marketing intake work |
| `Rocksteady` | Work-order and job-record structure | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Krang` | Internal analytics and reporting | Verified role docs only; no separately provable live runtime or shipped artifact |
| `Shredder` | Internal adversarial review / failure-mode pressure testing | Verified role docs only; no separately provable live runtime or shipped artifact |

### Client-facing Norse and website/content roles

| Agent | Original intended purpose | Verified actual outputs to date |
| --- | --- | --- |
| `Njord` | Client master host/overview agent for Mission Control | Live Aquatrace workspace shell is verified at `/mission-control/aquatrace/workspace`; `njordSessions` exists live in Firestore; current shell/routing layer is real even though the direct Anthropic specialist brain path is stale-configured |
| `Heimdall` | Intake, lead watch, and scheduling gatekeeper for client work | Verified as a specialist profile inside the live Njord shell; no separately provable autonomous shipped artifact beyond that wiring |
| `Thor` | Field-operations / execution-support lane | Verified as a specialist profile inside the live Njord shell; no separately provable autonomous shipped artifact beyond that wiring |
| `Mimir` | Reports, findings, and documentation memory | Verified as a specialist profile inside the live Njord shell; no separately provable autonomous shipped artifact beyond that wiring |
| `Freyja` | Follow-up, reviews, and referrals | Verified as a specialist profile inside the live Njord shell; no separately provable autonomous shipped artifact beyond that wiring |
| `Bragi` | Client article writing, SEO structure, metadata, and content workflow | Verified outputs include real Aquatrace WordPress draft artifacts `3307`, `3316`, `3320`, `3332`, and `3343`; review email and Yoast writes are proven; Bragi soul/memory/tone system is durable. Important limit: autonomous Mode B writer + vision selection have not yet produced a real successful AI run, so no "real AI sample article" should be attributed to Bragi yet. |
| `Brokk` | Reusable client page-builder / website implementation specialist, duplicating Donatello's site-build skill for client work | Verified role authority and in-app website-request routing exist, but no separately provable autonomous Brokk runtime or independently logged published website/page change is currently evidenced in the repo. Brokk is real as a role/ownership lane, but not yet proven as a separate active builder runtime. |
| `Reef` | Dive Factor inbound inquiry, trip/training triage, and lead-capture agent | Verified historical agent spec at `docs/clients/dive_factor_agent_spec.md`; no live deployed Reef runtime or public booking/chatbot proof is currently recorded |

### Consult-only advisory bench

| Agent | Original intended purpose | Verified actual outputs to date |
| --- | --- | --- |
| `Chunk` | Source-backed research, facts, and case studies | Verified consult-doc bench member; no direct execution outputs or separate LLM worker proof |
| `Mikey` | Executive strategy, leverage, and sequencing | Verified consult-doc bench member; no direct execution outputs or separate LLM worker proof |
| `Mouth` | Sales, messaging, and customer communication advice | Verified consult-doc bench member; no direct execution outputs or separate LLM worker proof |
| `Brand` | Field-operations realism and service-business grounding | Verified consult-doc bench member; no direct execution outputs or separate LLM worker proof |
| `Data` | Systems, architecture, and integration reasoning | Verified consult-doc bench member; no direct execution outputs or separate LLM worker proof |
| `Andy` | Local growth, SEO, and visibility advice | Verified consult-doc bench member; no direct execution outputs or separate LLM worker proof |
| `One-Eyed Willy` / `Willy` | Clawdia's consult-only Nova-like operator/strategy/proof advisor | Verified live consult runtime in `C:\Users\Peyto\clawdia-bot\willyConsultRuntime.js`; helps Clawdia choose next moves, proof judgment, routing, and ask-Chris decisions; does not execute tools directly |

### System-defined / legacy specs

| Agent | Original intended purpose | Verified actual outputs to date |
| --- | --- | --- |
| `Agent Architect` | Meta-agent/system spec for designing agents without duplication | Verified as docs/spec layer and live route name (`/agent-architect`); no separate standalone agent runtime beyond the current Nexi-facing intake experience |
| `Intake Agent` | Intake role spec | Verified spec only; no separately provable standalone runtime |
| `Planner Agent` | Planning role spec | Verified spec only; no separately provable standalone runtime |
| `QA / Review Agent` | QA/review role spec | Verified spec only; no separately provable standalone runtime |
| `Documentation Agent` | Documentation/knowledge-maintenance role spec | Verified spec only; no separately provable standalone runtime |

### Outside the NexTeam client stack but real on this machine

| Agent | Original intended purpose | Verified actual outputs to date |
| --- | --- | --- |
| `Slade` | Isolated crypto/finance/mailbox operator outside NexTeam client work | Real machine/runtime lane is verified, including recent journal-repair and live-daemon operations in other sessions, but the full Slade build history is outside this repo and should not be mixed into NexTeam client ownership claims |

## Build History By Agent / Lane

This is the practical "who actually built what" map, based only on evidence visible from the repo, public sites, live runtime checks, and verified logs.

| Agent / lane | Verified builds, artifacts, or durable outputs |
| --- | --- |
| `Atlas/Codex` | Built and/or repaired the multi-tenant foundation, auth/Admin cutover, live Firestore rules deploy, conversation-to-tenant provisioner, localhost rail API, WordPress + CompanyCam rail functions, GBP Layer 1 OAuth/token vault, and the proven Dive Factor static deploy package and FTPS publish path |
| `Clawdia` | Established the durable operator truth, single-command routing posture, proof gates, reroute rules, shared-brain front-door architecture, and the verified governance around Bragi draft creation + review email + Yoast workflow |
| `Nexi` | Produced real intake/session data in Firestore and shaped blueprint/spec outputs; historically authored the Dive Factor `Reef` spec as `Prepared by: Nexi Core`; now feeds the live conversation-to-tenant provisioner when sessions complete |
| `Donatello` | Permanent owner of NexTeam.Studio website/workspace build and maintenance by authority docs. This ownership was not previously written clearly enough in the inventory. The exact commit-by-commit live public-page changes attributable only to Donatello are not fully reconstructable from current repo state. |
| `Bragi` | Produced verified Aquatrace WordPress draft artifacts and the durable Aquatrace tone/SEO/content operating system. Has not yet produced a verified successful autonomous Mode B article+vision run. |
| `Njord` | Delivered the live Aquatrace Mission Control workspace shell and live `njordSessions` logging lane. |
| `Brokk` | Owns the client website/page-builder lane by role authority, and the app's website-request flow routes to Brokk/Bragi choices. No separately proven autonomous Brokk runtime or logged live page-build artifact is currently documented. |
| `Reef` | Exists as a real client-specific agent design/spec for Dive Factor, but not as a proven live runtime. This agent was missing from the earlier inventory. |
| `Willy` | Live consult runtime for next-step strategy/proof review inside `clawdia-bot`; advises but does not execute. |
| `Goonies` bench except Willy | Real consult-doc bench exists, but no direct execution/build artifact is separately attributable to those names. |
| `TMNT` roles other than Donatello | Real role architecture exists and informs decisions, but most TMNT names are governance templates, not separately proven shipping runtimes. |
| `System agent specs` | `AGENT_ARCHITECT`, `AGENT_INTAKE`, `AGENT_PLANNER`, `AGENT_QA_REVIEW`, and `AGENT_DOCUMENTATION` are real spec artifacts, but not separately proven live workers. |

### Major verified build timeline highlights

- 2026-04-25 to 2026-05-03:
  - Bragi WordPress proof-of-life and draft workflow established on Aquatrace
  - real draft artifacts: `3307`, `3316`, `3320`, `3332`, `3343`
- 2026-06-15:
  - Dive Factor static HTML public publish completed with backup and GET verification
  - proof log records FTPS deploy, backup paths, and completion email
- 2026-06-16:
  - Dive Factor boutique redesign deployed with backup, research proof, and live QA
  - proof log records `26` public files, `11` HTML pages, and all live URLs returning `200`
- 2026-06-29:
  - Firebase auth/Admin cutover deployed live to Railway `cozy-sparkle`
  - Firestore tenant-isolation rules deployed live
  - tenant root docs safely created without disturbing April 2026 Firestore data
  - conversation-to-tenant provisioner and completed-session auto-trigger are now in the repo

## Remaining truth gaps

- Exact CMS-editor/build ownership for the current live `nexteam.studio` WordPress page content remains `partially verified`; Donatello ownership is durable, but the repo does not contain a full export of the live CMS edits.
- Exact legacy pre-repo build history for `aquatraceleak.com` remains `partially verified`; the current live WordPress/Themify target and the modern Bragi/Brokk/Atlas rails are verified.
- No additional public standalone domains or live landing pages were safely verified beyond:
  - `nexteam.studio`
  - `nexteam-studio-production.up.railway.app`
  - `divefactor.com`
  - `aquatraceleak.com`
- If Chris wants a complete pre-repo ownership history for older sites or agents, that requires Chris-origin confirmation and should be added as `verified by Chris` rather than inferred.
