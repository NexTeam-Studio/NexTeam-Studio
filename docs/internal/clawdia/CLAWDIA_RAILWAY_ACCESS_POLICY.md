# CLAWDIA_RAILWAY_ACCESS_POLICY
- version: 1.0
- status: active
- last_updated: 2026-04-28
- owner: NexTeam Studio
- scope: scoped Railway operations for Clawdia

## Purpose

This policy gives Clawdia a safe, scoped Railway operating path for approved NexTeam and Aquatrace work.

This policy does not give Clawdia open-ended admin authority.

Clawdia may only use the approved wrapper path and allowlist:

- `C:\Users\Peyto\clawdia-bot\railwayAccessRuntime.js`
- `C:\Users\Peyto\NexTeam-Studio\docs\internal\clawdia\CLAWDIA_RAILWAY_ACCESS_ALLOWLIST.json`

Clawdia may not run raw Railway admin work outside that path.

## Access Model

Clawdia accesses Railway through the shared-brain worker action layer.

Safe path:

1. Clawdia receives an approved Railway operator request.
2. Clawdia routes the request into the shared action layer.
3. The Railway wrapper:
   - checks Railway CLI auth first
   - checks the approved project and service allowlist
   - checks the approved action allowlist
   - runs the exact Railway CLI command with fixed arguments only
   - redacts sensitive output
   - writes a safe audit log
4. Clawdia returns the scoped result or blocker.

This keeps Railway access:

- local
- scoped
- allowlisted
- logged
- secret-safe

## Approved Services and Projects

Currently wired:

- project: `clawdia-bot`
  - service: `clawdia-bot`
- project: `NexTeam-Studio`
  - service: `NexTeam-Studio`

Future NexTeam or Aquatrace services may only be added by updating the allowlist file above.

No unrelated Railway project may be touched through this path.

## Allowed Actions

Clawdia may do these actions only through the allowlisted wrapper:

- check Railway status
- read Railway logs
- verify env var names are present
- restart an approved service
- deploy approved code from an allowlisted clean repo
- confirm webhook or bot health for the approved Telegram bot service
- report blockers

## Disallowed Actions

Clawdia may not do these actions through this path:

- billing changes
- plan upgrades
- deleting services
- deleting databases
- creating paid resources
- changing domains
- rotating secrets
- printing secret values
- changing unrelated projects
- destructive production changes

## Approval-Gated Actions

Chris approval is still required for:

- billing or plan changes
- destructive production changes
- deleting or downing services
- domain changes
- creating new paid resources
- rotating or changing secrets
- modifying unrelated projects
- any action outside the allowlist

## Secrets Handling Rule

Exact rule:

- Clawdia may verify env var names exist.
- Clawdia may not print env var values.
- Clawdia may not paste secrets into chat.
- Clawdia may not commit secrets.
- Clawdia must redact suspicious log output before returning it.

## Deploy Rule

Approved code deploys may run only when:

- the project is in the Railway allowlist
- the service is in the Railway allowlist
- the deploy action is allowlisted
- Railway CLI auth is valid
- the local repo worktree is clean
- the deploy runs from the exact allowlisted repo path

If the repo is dirty, the deploy must block.

## Logging Rule

Every Railway wrapper action writes a safe audit line to:

- `runtime/railway-access-audit.jsonl`

Audit lines may include:

- timestamp
- action name
- project
- service
- success or blocked state
- safe summary

Audit lines may not include:

- secret values
- token values
- env var values

## Recommended Auth Path

Safest practical auth path:

- Railway CLI login on Chris's machine
- shared-brain wrapper checks `railway whoami --json` before any action
- if auth is expired, Clawdia must return a blocker instead of guessing

## Safest Command Path

Use the shared action layer only:

- `checkRailwayStatus`
- `readRailwayLogs`
- `verifyRailwayEnvNames`
- `restartRailwayService`
- `deployRailwayService`
- `confirmRailwayWebhookHealth`

These are exposed through:

- `C:\Users\Peyto\clawdia-bot\sharedActionLayer.js`

and implemented by:

- `C:\Users\Peyto\clawdia-bot\railwayAccessRuntime.js`

## What Clawdia Can Do After This Change

If Railway CLI auth is valid, Clawdia can now:

- read status for `clawdia-bot`
- read logs for `clawdia-bot`
- verify required env var names for `clawdia-bot`
- restart `clawdia-bot`
- deploy `clawdia-bot` from the clean allowlisted repo
- confirm webhook health for `clawdia-bot`
- read status for `NexTeam-Studio`
- read logs for `NexTeam-Studio`
- verify env var names for `NexTeam-Studio`
- restart `NexTeam-Studio`
- deploy `NexTeam-Studio` from the clean allowlisted repo

## What Still Requires Chris

- anything outside the allowlist
- billing, plan, spend, or paid resource changes
- destructive production actions
- secret rotation
- domain changes
- new Railway project or service approval

## Operational Reporting Format

Clawdia should report Railway work using:

- action attempted
- project
- service
- allowed or blocked
- safe result summary
- next action

Clawdia should never dump raw secret-bearing output into chat.
