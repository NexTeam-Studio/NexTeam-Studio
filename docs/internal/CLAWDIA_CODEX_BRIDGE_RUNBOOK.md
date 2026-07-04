# CLAWDIA_CODEX_BRIDGE_RUNBOOK
- version: 1.1
- status: planned
- last_updated: 2026-06-17
- owner: NexTeam Studio
- scope: safe Clawdia to Codex bridge

## Purpose

Clawdia should be able to route approved builder work to Codex without Chris acting as the copy-paste middleman.

This runbook defines the safest first bridge:

- Clawdia receives the request in Telegram
- Clawdia classifies the lane and safety gates
- Clawdia creates the task packet
- a local Codex bridge service on Chris's machine consumes the packet
- Codex runs only in approved repos and worktrees
- the bridge returns a proof package
- Clawdia reviews the proof and reports back to Chris

## Current truth

- official Codex automation surfaces exist:
  - Codex CLI
  - Codex Exec for non-interactive tasks
  - Codex SDK
  - Codex App Server
- a live local file-based fallback bridge exists at:
  - `C:\Users\Peyto\.openclaw\workspace\ops-bridge`
- canonical Clawdia -> Atlas/Codex handoff target in the current setup is:
  - human lane: `agent:main:nexteam`
  - queue file: `C:\Users\Peyto\.openclaw\workspace\ops-bridge\to-codex.jsonl`
  - bridge target: `to: "atlas"`
- `Atlas` is not a visible OpenClaw session label and should not be treated as one
- Railway cannot safely run local Windows repo work
- direct Codex invocation from Railway is not wired
- local Codex authentication is present on Chris's machine
- the Windows-installed Codex CLI is present locally, but direct invocation from this current Codex desktop session returned access denied

## Safest bridge architecture

### Control plane

Railway Clawdia Telegram bot:
- owner authorization
- lane classification
- approval gates
- task packet generation
- task queue updates
- proof review
- owner-facing status replies

### Execution plane

Local Codex bridge service on Chris's machine:
- receives only allowlisted tasks
- validates shared secret
- validates repo path against allowlist
- validates task type against allowlist
- runs Codex in the approved repo
- captures proof package
- returns status to Clawdia

### Why this is safest

- Railway never gets direct filesystem access to local repos
- Clawdia never gets arbitrary shell execution
- Codex work stays inside approved local worktrees
- task packets stay auditable
- Chris stays the inspector, not the relay

## Not approved

- direct arbitrary shell execution from Telegram
- Codex work outside approved repos
- any secret values in packets or proofs
- Railway pretending it can do local Windows filesystem work

## Allowlisted repos

Source of truth:
- `docs/internal/CLAWDIA_CODEX_BRIDGE_ALLOWLIST.json`

Initial approved repos:
- `C:\Users\Peyto\NexTeam-Studio`
- `C:\Users\Peyto\clawdia-bot`

## Allowlisted task types

- `docs_update`
- `safe_code_patch`
- `test_or_smoke_run`
- `runbook_update`
- `status_audit`

Not approved without Chris review:
- destructive cleanup
- secret rotation
- external send actions
- publish or schedule actions

## Required env vars by name only

### Local bridge
- `CODEX_API_KEY`
- `CLAWDIA_CODEX_BRIDGE_SHARED_SECRET`
- `NEXTEAM_STUDIO_PATH`
- `CLAWDIA_BOT_PATH`

### Railway Clawdia
- `CLAWDIA_CODEX_BRIDGE_URL`
- `CLAWDIA_CODEX_BRIDGE_SHARED_SECRET`

## Recommended transport

Use a small local HTTPS or loopback HTTP service with:
- one `POST /codex-task` endpoint
- shared-secret validation
- strict JSON schema
- no free-form shell command field

## Proof package format

Required fields:
- `task_id`
- `status`
- `repo_path`
- `task_type`
- `files_changed`
- `tests_run`
- `tests_passed`
- `summary`
- `blocker`
- `next_action`

Allowed statuses:
- `requested`
- `running`
- `blocked`
- `complete`
- `failed`

## First safe implementation step

1. create the allowlist file
2. add a local bridge skeleton with one allowlisted test route
3. run one safe non-destructive test task against `C:\Users\Peyto\clawdia-bot`
4. confirm proof package returns to Clawdia without secrets

## First safe test task

- title: `Clawdia Codex bridge smoke test`
- repo: `C:\Users\Peyto\clawdia-bot`
- task type: `status_audit`
- allowed action:
  - syntax check selected files
  - return proof only
- not allowed:
  - deploy
  - send email
  - modify secrets

## Known blockers

- the Codex CLI cannot be executed from this current Codex desktop session because the Windows App path returned access denied
- the current live bridge is file-queue based, not a fully automated local HTTP bridge service
- Railway still cannot directly trigger local repo work until a stricter automated local bridge service exists
