# ACCOUNTS

Living inventory of external accounts and services touched by the NexTeam ecosystem.

Hard rule: this file may contain account names, owner emails, credential locations, and env var names only. It must never contain passwords, tokens, API keys, refresh tokens, private keys, OAuth secrets, connection strings, or screenshots of secrets.

Last reviewed: 2026-07-05

## Migration Flags

| Flag | Meaning |
|---|---|
| SHOULD MOVE | NexTeam-owned account or credential should be migrated to a `nexteam.studio` workspace/account when practical. |
| STAYS | Belongs with its current venture or client account. Do not migrate just for neatness. |
| DECIDE | Ownership, workspace, or architecture needs an explicit decision before moving. |

## Sources Swept

| Source | Result |
|---|---|
| Railway `NexTeam-Studio` staging variable-name inventory | 63 variable names read through Railway CLI; values were not printed or stored. |
| Railway `NexTeam-Studio` production variable-name inventory | 47 variable names read through Railway CLI; values were not printed or stored. |
| Local Windows env var-name inventory | Matching Process/User names only; values were not printed. |
| Repo config and code | `.env.example`, `railway.json`, `firebase.json`, `nixpacks.toml`, `package.json`, `server.js`, `apps/`, `packages/`, `scripts/`. |
| Repo history docs and receipts | `DECISIONS.md`, `BUILDSTATE.md`, `MASTER_ASSET_INVENTORY.md`, `NEXTEAM_DOC_INDEX.md`, `docs/`, and available `receipts/`. |
| Google Cloud/OAuth console API | Not live-verified from this machine; `gcloud` is not installed. Known OAuth state is from Railway env names, prior screenshots/user-guided OAuth capture, and repo docs. |
| Local credential folders | No `credentials/` directory exists in the clean main worktree. Historical credential paths in older docs are marked as historical/not present when applicable. |

## Account Inventory

| Service | Login/owner email currently on account | Venture | Used for | Credential/key location only | Migration |
|---|---|---|---|---|---|
| GitHub (`NexTeam-Studio`, `aquatrace-app`) | `Chris1BATA / chris1bata@gmail.com` | NEXTEAM | Source control, remotes, and Railway-linked deploy identity. | Git remote config; browser/Git Credential Manager outside repo. | SHOULD MOVE |
| Railway (`cozy-sparkle` / `NexTeam-Studio`) | `Chris1BATA / chris1bata@gmail.com` via GitHub | NEXTEAM | Hosting for NexTeam app staging/production and runtime env vars. | Railway staging/production variables; local Railway CLI auth cache outside repo. | SHOULD MOVE |
| Railway external `clawdia-bot` runtime | UNKNOWN | NEXTEAM | Telegram/OpenClaw/Clawdia operator runtime outside this service. | External Railway project/env referenced by docs; not part of current `NexTeam-Studio` variable scan. | DECIDE |
| Firebase project `nexteam-studio` | `chris@aquatraceleak.com` console login; operator UID confirmed for `chris@aquatraceleak.com` | NEXTEAM | Firestore, Auth, Storage, rules, usage logs, failure logs, tenant data. | Railway `FIREBASE_ADMIN_*`, `FIREBASE_PLATFORM_OPERATOR_*`, and `VITE_FIREBASE_*`; Firebase CLI auth cache outside repo. | SHOULD MOVE |
| Firebase project `aquatrace-app-mobile` | `chris@aquatraceleak.com` | AQUATRACE | Legacy Aquatrace mobile app Firebase project. | No active key location verified in current main worktree; referenced by prior asset inventory. | STAYS |
| Google Cloud/OAuth project `NexTeam Gmail OAuth` | UNKNOWN; screenshots/docs show `aquatraceleak@gmail.com`, `chris@aquatraceleak.com`, and `nexi@aquatraceleak.com` as OAuth users/mailboxes | NEXTEAM | Gmail OAuth client for M6-lite read/send rail. | Railway staging `GMAIL_OAUTH_CLIENT_*` and mailbox refresh-token env vars; downloaded OAuth client JSON was placed in Downloads during setup. | SHOULD MOVE |
| Gmail read-only mailbox 1 | `chris@aquatraceleak.com` | AQUATRACE | Read-only Nexi access to Aquatrace operational email. | Railway staging `GMAIL_READONLY_MAILBOX_1_*`. | STAYS |
| Gmail read-only mailbox 2 | `aquatraceleak@gmail.com` | AQUATRACE | Read-only Nexi access to original Aquatrace Gmail/subscription/account traffic. | Railway staging `GMAIL_READONLY_MAILBOX_2_*`. | STAYS |
| Gmail Nexi mailbox | `nexi@aquatraceleak.com` | AQUATRACE | Dedicated Nexi mailbox; read access plus approval-gated send only. | Railway staging `GMAIL_SEND_MAILBOX_*`; send path must stay behind ApprovalQueue. | STAYS |
| Legacy Gmail repo sender | Send-as identity `service@aquatraceleak.com`; exposed connector profiles have included `aquatraceleak@gmail.com` and `chris1bata@gmail.com` in proof logs | AQUATRACE | Older Clawdia/Dive Factor checkpoint and CompanyCam transfer email paths. | Local User/Process env var names `GMAIL_SEND_FROM`, `GMAIL_SEND_AS_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`; historical `.env` references. | DECIDE |
| Google Cloud/GBP API project `nexteam-gbp-rail` | UNKNOWN | NEXTEAM | Bragi/GBP OAuth rail for Google Business Profile publishing. | Historical local `credentials/` OAuth/token-vault paths in older inventory; no `credentials/` directory in clean main worktree. | SHOULD MOVE |
| Google Business Profile managing account | `aquatraceleak@gmail.com` | AQUATRACE | Aquatrace GBP profile management and future GBP post rail. | Historical encrypted token-vault location in older inventory; no active credential file in clean main worktree. | STAYS |
| Google Maps Platform | UNKNOWN | NEXTEAM | M3 drive-time/distance/geocoding support. | Railway staging `GOOGLE_MAPS_API_KEY`; not present in production variable-name scan. | SHOULD MOVE |
| Jobber | UNKNOWN | AQUATRACE | Read-only source of clients, jobs, visits, products/services, CRM import data. | Railway staging/production `JOBBER_*`; provider code in `packages/providers`. | STAYS |
| CompanyCam | UNKNOWN | AQUATRACE | Read-only source of projects, photos, documents/reports, and field media metadata. | Railway staging/production `COMPANYCAM_API_TOKEN`; provider code in `packages/providers`. | STAYS |
| Stripe account `NexTeam Studio` | `nexteamstudioai@gmail.com`; name on file `Chris Sears` per prior verified inventory | NEXTEAM | M2 test-mode payments, checkout, invoices, webhook receipts. | Railway staging `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; Railway staging/production `VITE_STRIPE_PAYMENT_LINK`. | SHOULD MOVE |
| WordPress API for `aquatraceleak.com` | WordPress bot username `aquatrace-bragi`; owner email UNKNOWN | AQUATRACE | Bragi/Brokk draft creation, media, Yoast/content rail for Aquatrace site. | User said M5 WordPress creds are Railway env vars; current `NexTeam-Studio` staging/production variable-name scan did not show `WORDPRESS_*`. Historical local env/docs reference `WORDPRESS_*`. | STAYS |
| WordPress site `nexteam.studio` | UNKNOWN | NEXTEAM | Public NexTeam marketing site, separate from Railway app. | No WordPress/admin credential location verified in current repo or env scans. | SHOULD MOVE |
| WordPress admin accounts in general | UNKNOWN | UNKNOWN | Browser/CMS login for `aquatraceleak.com` and `nexteam.studio`. | No browser-login credential stored in repo; API path for Aquatrace is separate. | DECIDE |
| InMotion hosting | UNKNOWN | UNKNOWN | Hosting/origin for `nexteam.studio`, `divefactor.com`, and historical support path for Aquatrace. | No hosting-panel credential found; Dive Factor FTPS user appears in docs with password unknown/not recoverable. | DECIDE |
| Cloudflare | UNKNOWN | AQUATRACE | DNS/cache/proxy layer for `aquatraceleak.com`; cache incidents documented. | No Cloudflare API token or panel credential found in repo/Railway/current env scans. | STAYS |
| Domain registrar/DNS for `nexteam.studio` | UNKNOWN | NEXTEAM | NexTeam marketing domain. | Registrar and panel credential unknown; public DNS points to InMotion nameservers in prior inventory. | SHOULD MOVE |
| Domain registrar/DNS for `aquatraceleak.com` | UNKNOWN | AQUATRACE | Aquatrace public website/domain. | Registrar credential unknown; Cloudflare is documented DNS/proxy layer. | STAYS |
| Domain registrar/DNS for `divefactor.com` | UNKNOWN | DIVE FACTOR | Dive Factor public static site/domain. | Registrar credential unknown; public DNS/InMotion and FTPS deploy path documented. | STAYS |
| Anthropic Console/API | UNKNOWN | NEXTEAM | Claude model calls for NexTeam app, Nexi, Bragi, vision, and usage logs. | Railway staging/production `ANTHROPIC_API_KEY`; local User/Process `ANTHROPIC_API_KEY`; `.env.example` documents the name. | SHOULD MOVE |
| OpenAI / ChatGPT / Codex | UNKNOWN | PERSONAL | Codex desktop execution and possible future API lane; no active app API key found. | Codex app/session outside repo; no `OPENAI_API_KEY` found in current repo/Railway scans. | DECIDE |
| ElevenLabs | `nexteamstudioai@gmail.com` | NEXTEAM | NexTeam/Nexi voice generation and avatar audio. | Railway staging/production `ELEVENLABS_API_KEY`; `.env.example` documents the name. | SHOULD MOVE |
| Simli | `nexteamstudioai@gmail.com` | NEXTEAM | Legacy avatar rendering experiment; now deprecated on quality pending M12c decision. | Railway staging/production `SIMLI_API_KEY` and `SIMLI_FACE_ID`. | DECIDE |
| HeyGen LiveAvatar | UNKNOWN | NEXTEAM | Parked M12c avatar provider candidate. | No credentials found; evaluation only. | DECIDE |
| D-ID Agents | UNKNOWN | NEXTEAM | Parked M12c avatar provider candidate. | No credentials found; evaluation only. | DECIDE |
| Resend | UNKNOWN | NEXTEAM | Blueprint/test email delivery and possible notification rail. | Railway staging/production `RESEND_API_KEY`; sender/recipient env names in Railway and `.env.example`. | SHOULD MOVE |
| OpenWeatherMap | UNKNOWN | UNKNOWN | Planned evaporation calculator/weather tool. | No `OPENWEATHER*` env var found in repo, Railway name scan, or local env-name scan. | DECIDE |
| Telegram / OpenClaw | No email; operator access is Telegram user/allowlist based where documented | NEXTEAM | Clawdia/operator command surface and OpenClaw coordination references. | External `clawdia-bot` Railway env per docs; current repo `.env.example` names Telegram vars but current `NexTeam-Studio` Railway scan does not. | DECIDE |
| Dropbox | UNKNOWN | AQUATRACE | Local CompanyCam sync destination documented for Aquatrace media. | Local Dropbox folder path only; no Dropbox API credential found. | STAYS |
| Rive | UNKNOWN | NEXTEAM | Local avatar asset and React canvas runtime. | No credential/key found; dependency and asset stored in repo. | DECIDE |
| NPM package registry | UNKNOWN | NEXTEAM | Dependency install from public npm packages. | No npm auth token found in repo/Railway/current env scans. | DECIDE |
| Firebase CLI | `chris@aquatraceleak.com` per prior inventory | NEXTEAM | Firestore rules/deploy management. | Local Firebase CLI auth cache outside repo. | SHOULD MOVE |
| Railway API/CLI access | `Chris1BATA / chris1bata@gmail.com` via GitHub per prior inventory | NEXTEAM | Deploys, env-name audits, staging/production management. | Local Railway CLI auth cache outside repo; token values cleared by `railway logout` on 2026-07-06, re-auth or a dashboard-created project token is required for future CLI deploys. | SHOULD MOVE |

## Parked/Backlog Services With No Active Credential Verified

These services are in the roadmap/backlog but no active account credentials were verified in repo, Railway, or local env-name scans during this pass.

| Service | Login/owner email currently on account | Venture | Used for | Credential/key location only | Migration |
|---|---|---|---|---|---|
| QuickBooks | UNKNOWN | NEXTEAM | Future accounting/profitability sync; first priority after Wave 4 backlog opens. | No credentials found. | DECIDE |
| Twilio | UNKNOWN | NEXTEAM | Future missed-call text-back rail. | No credentials found. | DECIDE |
| Google Calendar | UNKNOWN | NEXTEAM | Future calendar sync. | No separate calendar credential found; would likely share Google OAuth architecture. | DECIDE |
| Outlook / Microsoft Calendar | UNKNOWN | NEXTEAM | Future calendar sync. | No credentials found. | DECIDE |
| Zapier | UNKNOWN | NEXTEAM | Future outbound webhook/integration bridge. | No credentials found. | DECIDE |
| Angi | UNKNOWN | AQUATRACE | Future lead ingestion. | No credentials found. | DECIDE |
| Thumbtack | UNKNOWN | AQUATRACE | Future lead ingestion. | No credentials found. | DECIDE |
| Google Local Services Ads | UNKNOWN | AQUATRACE | Future LSA lead ingestion. | No credentials found. | DECIDE |
| DocuSign-tier e-sign | UNKNOWN | NEXTEAM | Future higher-tier e-sign option. | No credentials found. | DECIDE |
| Water-test device APIs | UNKNOWN | AQUATRACE | Future device data integration. | No credentials found. | DECIDE |
| Permit database lead rail | UNKNOWN | NEXTEAM | Future permit/lead discovery rail. | No credentials found. | DECIDE |
| Mileage/receipt capture provider | UNKNOWN | NEXTEAM | Future expense/mileage capture. | No credentials found. | DECIDE |
| Checkr | UNKNOWN | NEXTEAM | Future background-check integration. | No credentials found. | DECIDE |
| Fleet cards provider | UNKNOWN | AQUATRACE | Future fleet card integration. | No credentials found. | DECIDE |

## Railway Variable Name Map

Names only. No values were copied.

| Scope | Variable names |
|---|---|
| Staging only or primarily staging | `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_READONLY_MAILBOX_1_ALIAS`, `GMAIL_READONLY_MAILBOX_1_EMAIL`, `GMAIL_READONLY_MAILBOX_1_REFRESH_TOKEN`, `GMAIL_READONLY_MAILBOX_2_ALIAS`, `GMAIL_READONLY_MAILBOX_2_EMAIL`, `GMAIL_READONLY_MAILBOX_2_REFRESH_TOKEN`, `GMAIL_SEND_MAILBOX_ALIAS`, `GMAIL_SEND_MAILBOX_EMAIL`, `GMAIL_SEND_MAILBOX_READ_ENABLED`, `GMAIL_SEND_MAILBOX_REFRESH_TOKEN`, `GOOGLE_MAPS_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GIT_SHA` |
| Staging and production | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `ANTHROPIC_API_KEY`, `BLUEPRINT_FROM_EMAIL`, `BLUEPRINT_TO_EMAIL`, `CLAWDIA_BRAIN_PUBLIC_URL`, `COMPANYCAM_API_TOKEN`, `ELEVENLABS_API_KEY`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_DEFAULT_TENANT_ID`, `FIREBASE_PLATFORM_OPERATOR_EMAILS`, `FIREBASE_PLATFORM_OPERATOR_ROLE`, `FIREBASE_PLATFORM_OPERATOR_UIDS`, `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `JOBBER_GRAPHQL_VERSION`, `JOBBER_REDIRECT_URI`, `JOBBER_REFRESH_TOKEN`, `NEXTEAM_INTERNAL_SERVICE_SECRET`, `OPERATOR_ENV_BUMP`, `RAILWAY_*`, `RESEND_API_KEY`, `SIMLI_API_KEY`, `SIMLI_FACE_ID`, `VITE_APP_URL`, `VITE_BOOKING_LINK`, `VITE_CLAWDIA_BRAIN_PUBLIC_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_NJORD_TEST_EMAIL`, `VITE_STRIPE_PAYMENT_LINK` |
| Expected by docs/code but not present in current `NexTeam-Studio` Railway scan | `OPENWEATHER*`, `WORDPRESS_*`, `TELEGRAM_*`, `CLAWDIA_TELEGRAM_*`, `GOOGLE_CLIENT_*`, `GMAIL_SEND_FROM`, `GMAIL_SEND_AS_NAME` |

## Owner-Email Audit

| Email/account | Services currently tied to it |
|---|---|
| `chris1bata@gmail.com` | GitHub, Railway via GitHub, Blueprint recipient/test paths in env/docs. |
| `chris@aquatraceleak.com` | Firebase console/login history, Firebase operator identity, Gmail read-only mailbox 1, Stripe 2FA holder per prior inventory. |
| `aquatraceleak@gmail.com` | Google Business Profile managing account, Gmail read-only mailbox 2, OAuth support/test user evidence, historical exposed Gmail connector profile. |
| `nexi@aquatraceleak.com` | Dedicated Nexi Gmail read/send mailbox for Aquatrace tenant. |
| `nexteamstudioai@gmail.com` | Stripe, ElevenLabs, Simli per prior verified inventory. |
| `service@aquatraceleak.com` | Legacy send-as identity for repo/Clawdia email paths. |
| `service@divefactor.com` | Public Dive Factor contact address in static site; login/hosting mailbox owner unknown. |

## Immediate Unknowns To Resolve

| Item | Why it matters |
|---|---|
| Google Cloud project owners for Gmail OAuth, GBP, Maps | Need to know whether these are controlled by Aquatrace, personal Gmail, or a future NexTeam workspace. |
| Domain registrar and hosting panel owners for `nexteam.studio`, `aquatraceleak.com`, and `divefactor.com` | Migration and recovery risk cannot be closed without the real panel owner emails. |
| WordPress admin/browser-login owners | API bot username is known for Aquatrace, but human/CMS account ownership is not. |
| Jobber and CompanyCam owner emails | Tokens work through Railway, but account-owner login emails remain unverified. |
| OpenWeatherMap account/key location | User stated a key exists from prior work, but no active env name was found in this pass. |
