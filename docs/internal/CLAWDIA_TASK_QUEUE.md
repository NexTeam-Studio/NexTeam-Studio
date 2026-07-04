# CLAWDIA_TASK_QUEUE
- version: 1.0
- status: active
- last_updated: 2026-04-26
- owner: NexTeam Studio
- scope: internal contractor task tracking

## Status Model

- requested
- scoped
- routed_to_atlas
- waiting_on_atlas
- reviewing_proof
- waiting_on_chris_inspection
- blocked
- complete
- parked

## Current Tasks

### clawdia-task-email-attachment-proof
- title: finish live Gmail attachment inbox proof for Telegram email
- lane: email
- status: waiting_on_chris_inspection
- needs_chris_approval: no
- goal: confirm that Chris receives a visible jpg or png attachment in the inbox
- next_action: Chris inspects the inbox and confirms attachment visibility

### clawdia-task-dropbox-cloud-plan
- title: prepare remote CompanyCam to Dropbox cloud route
- lane: companycam_dropbox
- status: blocked
- needs_chris_approval: no
- goal: enable Railway-safe cloud mode for CompanyCam to Dropbox operations
- next_action: configure Dropbox API env vars or choose the local runner bridge

### clawdia-task-bragi-request-routing
- title: extend Bragi from status-only into safe writing-request handling
- lane: bragi
- status: scoped
- needs_chris_approval: no
- goal: let Clawdia route safe Bragi requests while keeping draft-only gates
- next_action: create the Atlas packet when this lane becomes active

### clawdia-task-codex-bridge
- title: build the allowlisted Clawdia to Codex local bridge
- lane: nexteam_build
- status: scoped
- needs_chris_approval: no
- goal: let Clawdia route approved build packets into Codex without Chris acting as relay
- next_action: build the local bridge skeleton and run one safe status-audit task in `C:\Users\Peyto\clawdia-bot`

### clawdia-task-tmnt-review
- title: review TMNT role docs and prune extra roles if needed
- lane: agent_build
- status: parked
- needs_chris_approval: yes
- goal: keep internal TMNT docs accurate and intentional
- next_action: wait for Chris and Nova review before changing TMNT docs

## Queue Rules

- Clawdia creates the task packet
- Atlas or Codex is the builder when direct execution is needed
- Chris is the inspector, not the relay
- proof must be reviewed before a task is called complete

### clawdia-task-2a2d88
- title: Clawdia, route this to Atlas: build the next safe CompanyCam dry run tas
- lane: companycam_dropbox
- status: routed_to_atlas
- needs_chris_approval: no
- goal: Clawdia, route this to Atlas: build the next safe CompanyCam dry run task.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-4bd689
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-3b016a
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-474943
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-4c3806
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-1ff8b4
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-c0cf2f
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-a34b18
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-41cead
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-5335de
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-171c7e
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-46f121
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-684ca5
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-a116c7
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-05ea01
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-fa4386
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-81d1fc
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-28cec1
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-0aaa47
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-40cfd4
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-be033c
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-508b81
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-2e77c6
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-919386
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-f8e607
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-7874ef
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-4200ac
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-92e6ec
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-0be9ef
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-06d092
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-0e3457
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-4b05eb
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-e115bc
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-11bae2
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-ed3ae7
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-aa77ee
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-d7fe0f
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-3081ac
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-74b240
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-a35d2e
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-86a59a
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-8f80a8
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-c7e88b
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-5f41f5
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.

### clawdia-task-8e8fc2
- title: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, 
- lane: companycam_dropbox
- status: scoped
- needs_chris_approval: no
- goal: Build the next safe CompanyCam dry run task: keep CompanyCam read-only, perform no Dropbox writes, perform no email delivery, and return a proof package with files changed, tests run, pass/fail status, and blockers.
- next_action: Route to Atlas or execute safe direct step.
