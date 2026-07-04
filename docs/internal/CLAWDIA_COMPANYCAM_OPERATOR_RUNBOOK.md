# CLAWDIA CompanyCam Operator Runbook
- version: 1.0
- status: active
- last_updated: 2026-04-26
- scope: internal operator use only

## Current architecture
- Telegram bot runtime lives in `C:\Users\Peyto\clawdia-bot`.
- Approved CompanyCam transfer logic lives in `C:\Users\Peyto\NexTeam-Studio\scripts\companycam-transfer-2026.mjs`.
- CompanyCam access is read-only only.
- Dropbox writes are local only under the Aquatrace Dropbox tree.
- Sync manifests and logs live under:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\`

## Required Railway env vars
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CLAWDIA_TELEGRAM_ALLOWED_USER_ID`
- `NEXTEAM_STUDIO_PATH`
- `AQUATRACE_DROPBOX_BASE`

Do not store secret values in repo files. Use local `.env` or Railway variables only.

## How to authorize Chris
1. Deploy the bot with `/whoami` enabled.
2. Chris sends `/whoami` to `@NexTeamStudioBot`.
3. Read only Chris's returned Telegram user ID.
4. Set Railway variable `CLAWDIA_TELEGRAM_ALLOWED_USER_ID` to that user ID.
5. Restart or redeploy the Railway service.

## How to fix Telegram 409 duplicate poller
1. Use Railway logs as the source of truth.
2. Only treat a duplicate poller as confirmed if Railway shows fresh `409 Conflict` polling errors after restart while no direct `getUpdates` test is running.
3. If fresh `409` errors continue:
   - inspect local OpenClaw config at `C:\Users\Peyto\.openclaw\openclaw.json`
   - confirm whether Telegram polling is enabled there
   - stop or disable the duplicate poller in a reversible way
4. Do not delete Telegram token files.

## How to run CompanyCam dry-run
- Local terminal command:
  `node C:\Users\Peyto\NexTeam-Studio\scripts\companycam-transfer-2026.mjs --dry-run --year 2026`
- Telegram command:
  `/companycam dryrun 2026`

Dry run must not download files, modify CompanyCam, or alter Dropbox customer folders.

## How to run the 2026 transfer
- Local terminal command:
  `node C:\Users\Peyto\NexTeam-Studio\scripts\companycam-transfer-2026.mjs`
- Telegram request flow:
  1. `/companycam transfer 2026`
  2. `CONFIRM COMPANYCAM TRANSFER 2026`

Real transfer is allowed only after the exact confirmation phrase.

## How to verify Dropbox output
- Customer folders go under:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\Customers\YYYY\MM - Month\...`
- Photos go in `CompanyCam Photos`
- Reports and documents go in `CompanyCam Reports`
- Checklists go in `CompanyCam Checklists`
- JSON manifests and metadata must stay under:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\`

## What not to commit
- `.env`
- API keys or tokens
- Dropbox customer photos
- Dropbox customer reports
- Dropbox customer checklists
- generated manifests or transfer logs from Dropbox
- unrelated dirty files

## Emergency rollback steps
1. Stop sending Telegram CompanyCam commands.
2. Disable or stop the active Telegram poller if it is unstable.
3. Revert only the isolated `clawdia-bot` repo changes if needed.
4. Do not delete Dropbox customer files during rollback.
5. Use the sync manifest and transfer log to understand the last completed state before retrying.
