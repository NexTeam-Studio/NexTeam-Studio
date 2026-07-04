# CLAWDIA Telegram Operator Runbook
- version: 1.0
- status: active
- last_updated: 2026-04-26
- scope: internal operator use only

## Current architecture
- Telegram bot runtime lives in `C:\Users\Peyto\clawdia-bot`.
- Natural-language operator routing runs before generic OpenAI fallback.
- Slash commands remain supported for direct operator control.
- Owner-only authorization is controlled by `CLAWDIA_TELEGRAM_ALLOWED_USER_ID`.
- CompanyCam remains read-only only.
- Email sends remain preview-first and confirmation-gated.
- Clawdia now also acts as the NexTeam general contractor layer for owner-facing routing.

## Natural intent categories
- CompanyCam or Dropbox sync intent
- Email intent
- Status intent
- Bragi intent
- VGB intent
- Unknown operator intent that needs one clarifying question
- General contractor intent for Atlas routing, proof review, blocking, and approval status

## What Chris can say naturally
- `Move the new CompanyCam photos to Dropbox for 2026 and tell me when done.`
- `Run a dry run for CompanyCam 2026.`
- `Send me a test email.`
- `Send me an email saying have a nice day.`
- `What is blocked right now?`
- `What needs my approval?`
- `What is the CompanyCam status?`
- `What is Bragi working on?`
- `Clawdia, route this to Atlas.`
- `Clawdia, what is Atlas working on?`
- `Clawdia, what can you do without me?`
- `Clawdia, create the next build task.`
- `Clawdia, review this Atlas proof.`

## CompanyCam routing logic
- Clawdia decides whether the request is status, dry run, or transfer intent.
- Clawdia must not force Chris to say local or remote unless both routes are safe and the choice matters.
- CompanyCam real work stays approval-gated.
- Real CompanyCam transfer must never run from a vague request.

## CompanyCam remote or cloud plan
- Intended path:
  `Telegram -> Railway Clawdia -> CompanyCam API read-only -> Dropbox API -> approved Aquatrace Dropbox paths`
- Required env vars by name only:
  - `COMPANYCAM_API_TOKEN`
  - `DROPBOX_ACCESS_TOKEN`
  - `DROPBOX_APP_KEY`
  - `DROPBOX_APP_SECRET`
  - `DROPBOX_REFRESH_TOKEN`
  - `DROPBOX_ROOT_PATH`
- Confirmation phrase for a future real cloud transfer:
  `CONFIRM COMPANYCAM CLOUD TRANSFER 2026`
- Rules:
  - dry run first
  - read-only CompanyCam only
  - Dropbox write only under approved Aquatrace paths
  - duplicate-safe
  - resume-safe
  - no JSON metadata in customer folders
  - manifests and logs stay under `Aquatrace/_System/CompanyCam Sync/`

## CompanyCam local runner fallback plan
- Intended path:
  `Telegram -> Railway Clawdia -> allowlisted local runner -> local CompanyCam transfer script -> local Dropbox`
- Local runner responsibilities:
  - receive only allowlisted jobs
  - run no arbitrary shell commands
  - use safe logs only
  - report completion or failure back to Telegram
  - never print secrets
- Local runner is fallback, not the long-term only route.

## Email safety workflow
- Natural email requests route into preview mode first.
- Safe internal test email can run only to the approved internal recipient if configured.
- Real send requires:
  1. preview created
  2. `pending_email_id` returned
  3. exact confirmation phrase returned by Chris
- Confirmation phrase format:
  `CONFIRM SEND EMAIL <pending_email_id>`
- No bulk sends
- No campaign sends
- No hidden sends
- No attachments unless attachment support is actually wired
- Approved attachment sources can now be attached when explicitly matched.
- If no approved file is found, Clawdia should ask for upload.

## Supported slash commands
- `/whoami`
- `/clawdia help`
- `/clawdia status`
- `/nexteam status`
- `/aquatrace status`
- `/companycam help`
- `/companycam status`
- `/companycam dryrun 2026`
- `/companycam transfer 2026`
- `/companycam recent dryrun`
- `/email help`
- `/email test`
- `/email draft`
- `/email preview`
- `/email send`
- `/clawdia blocked`
- `/clawdia atlas`
- `/clawdia approval`
- `/clawdia autonomy`

## Required Railway env vars by name only
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CLAWDIA_TELEGRAM_ALLOWED_USER_ID`
- `NEXTEAM_STUDIO_PATH`
- `AQUATRACE_DROPBOX_BASE`
- `COMPANYCAM_API_TOKEN`
- `DROPBOX_ACCESS_TOKEN`
- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_ROOT_PATH`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GMAIL_SEND_FROM`
- `GMAIL_SEND_AS_NAME`
- `CLAWDIA_EMAIL_TEST_RECIPIENT`

## What Clawdia must never do
- print secrets
- commit `.env`
- modify CompanyCam
- write outside approved Aquatrace Dropbox paths
- run real CompanyCam transfer without approval
- send email without preview and exact confirmation, except approved internal test email
- send bulk email
- send campaigns
- publish articles
- schedule articles
- fake completion

## Known blockers
- Dropbox API cloud mode is not configured in Railway yet.
- Railway does not have direct local Windows filesystem access.
- Local runner bridge is planned but not yet built.
- Bragi photo upload and attachment-driven workflows are not wired yet.
- Direct Atlas or Codex API access is not wired yet; Clawdia uses task packets and queue docs instead.

## Next build lane
- configure Dropbox API env vars for cloud dry-run capability
- or build the allowlisted local runner bridge so Telegram can enqueue local CompanyCam jobs safely
