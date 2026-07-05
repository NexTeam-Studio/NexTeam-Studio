# CLAWDIA_ATLAS_HANDOFFS
- version: 1.1
- status: active
- last_updated: 2026-06-17
- owner: NexTeam Studio
- scope: Clawdia to Atlas or Codex build packet format

## Role Split

- Chris = owner and inspector
- Clawdia = general contractor
- Atlas or Codex = builder

## Handoff Rule

Clawdia should create the build packet herself whenever:
- repo work is needed
- code changes are needed
- tests are needed
- Railway or runtime debugging is needed
- a safe proof package is required from a builder

Clawdia must not pretend she has direct Atlas or Codex API access if that connection is not actually wired.

## Current Durable Route

Atlas is not a visible OpenClaw chat lane or session label in the current local setup.

Clawdia should not look for `Atlas` in the OpenClaw session list.

Canonical next-time target:

- human-facing lane: `agent:main:nexteam`
- bridge file: `C:\Users\Peyto\.openclaw\workspace\ops-bridge\to-codex.jsonl`
- bridge target field: `to: "atlas"`
- helper script: `C:\Users\Peyto\.openclaw\workspace\ops-bridge\scripts\enqueue-to-atlas.ps1`

If Clawdia cannot reach Atlas by queue, that is a bridge problem, not a missing session-label problem.

## Required Task Packet Fields

- `task_id`
- `title`
- `lane`
- `goal`
- `current truth`
- `files likely involved`
- `exact work requested`
- `safety rules`
- `tests required`
- `proof package required`
- `what not to do`

## Example Packet Shape

```text
TASK PACKET: clawdia-task-abc123
- title: finish live Gmail attachment inbox proof
- lane: email
- goal: verify Telegram-triggered email reaches Chris with visible attachment
- current truth: preview works | send works | attachment inbox proof pending
- files likely involved: operatorCommands.js ; intentRouter.js ; CLAWDIA_MEMORY.md
- exact work requested: inspect attachment assembly and prove visible delivery
- safety rules: no secrets | no customer email | preview before send
- tests required: preview path | attachment path | cleanup path
- proof package required: files changed | tests passed | blocker if any
- what not to do: no bulk sends | no hidden sends | no fake complete
```

## Review Outcomes

Clawdia reviews builder proof and sorts it into:
- DONE
- BLOCKED
- WRONG DIRECTION
- NEEDS CHRIS INSPECTION
- NEEDS RETEST
- NEXT ACTION

## One-Question Rule

If Chris is needed, Clawdia asks one simple question only.

## 2026-06-17 Routing Repair Proof

- broken behavior:
  - Clawdia attempted to find a visible session labeled `Atlas`
  - no such session exists in the current OpenClaw session store
- root cause:
  - Atlas is a builder role, not an OpenClaw agent id or canonical session key
  - the bridge docs did not clearly override the false assumption that Atlas should appear as a chat lane
- durable fix:
  - session docs now explicitly state that `Atlas` is not a session target
  - ops-bridge docs now define the exact file-based Atlas route
  - `enqueue-to-atlas.ps1` and `enqueue-to-codex.ps1` provide a repeatable handoff path
