# CLAWDIA_TOOL_REGISTRY
- version: 1.0
- status: active
- last_updated: 2026-04-26
- owner: NexTeam Studio
- scope: internal operator tool inventory

## Purpose

Clawdia uses this registry to decide:
- what is connected now
- what can run directly
- what needs Atlas or Codex
- what needs Chris approval
- what is blocked by missing setup

## Tool Inventory

### Telegram
- connected: yes
- env vars needed by name only:
  - `TELEGRAM_BOT_TOKEN`
  - `CLAWDIA_TELEGRAM_ALLOWED_USER_ID`
  - `CLAWDIA_TELEGRAM_WEBHOOK_PATH`
- what Clawdia can do:
  - receive owner-approved Telegram commands and natural requests
  - run webhook-mode routing
  - answer status and operator questions
  - create email previews and guarded sends
- what Clawdia cannot do yet:
  - directly execute local Windows-only tasks from Railway
- safety limits:
  - owner-only for privileged work
  - no secrets in Telegram replies
- next setup step:
  - keep webhook mode stable and expand the contractor layer

### OpenAI
- connected: yes
- env vars needed by name only:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
- what Clawdia can do:
  - generic fallback reasoning after tool routing
  - summarize operator state
- what Clawdia cannot do yet:
  - replace explicit tool flows for privileged actions
- safety limits:
  - OpenAI only
  - no silent fallback to Claude or Anthropic
- next setup step:
  - keep command routing ahead of fallback

### Gmail
- connected: yes
- env vars needed by name only:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `GMAIL_SEND_FROM`
  - `GMAIL_SEND_AS_NAME`
  - `CLAWDIA_EMAIL_TEST_RECIPIENT`
- what Clawdia can do:
  - create preview-first email drafts
  - send approved internal test mail
  - send one confirmed email
  - accept Telegram uploads for supported attachments
- what Clawdia cannot do yet:
  - bulk email
  - hidden sends
  - campaign sends
  - attachment completion cannot be called complete until Chris sees the attachment in the inbox
- safety limits:
  - Chris only
  - preview before send
  - confirmation before send
- next setup step:
  - finish live inbox proof for visible png or jpg attachment delivery

### CompanyCam
- connected: yes
- env vars needed by name only:
  - `COMPANYCAM_API_TOKEN`
- what Clawdia can do:
  - read-only project inspection
  - list photos, documents, and checklists
  - run safe transfer planning
  - apply existing checklist templates through approved scripts
- what Clawdia cannot do yet:
  - modify CompanyCam
  - clearly create checklist templates through the public API
- safety limits:
  - read-only only
- next setup step:
  - use UI-created templates and keep API use template-consumer only

### Dropbox
- connected: no
- env vars needed by name only:
  - `DROPBOX_ACCESS_TOKEN`
  - `DROPBOX_APP_KEY`
  - `DROPBOX_APP_SECRET`
  - `DROPBOX_REFRESH_TOKEN`
  - `DROPBOX_ROOT_PATH`
- what Clawdia can do:
  - remote cloud-mode planning only
- what Clawdia cannot do yet:
  - real cloud Dropbox writes from Railway
- safety limits:
  - approved Aquatrace paths only
- next setup step:
  - configure Dropbox API or use the local runner bridge

### WordPress / Bragi
- connected: yes
- env vars needed by name only:
  - `WORDPRESS_BASE_URL`
  - `WORDPRESS_USERNAME`
  - `WORDPRESS_APP_PASSWORD`
- what Clawdia can do:
  - track Bragi draft-only work
  - support status and planning
- what Clawdia cannot do yet:
  - publish or schedule without Chris approval
  - full writing-request flow is still incomplete
- safety limits:
  - draft-only
- next setup step:
  - extend Bragi beyond status while keeping draft-only gates

### Railway
- connected: yes
- env vars needed by name only:
  - `RAILWAY_PUBLIC_DOMAIN`
  - `CLAWDIA_RAILWAY_ALLOWLIST_PATH`
  - `CLAWDIA_RAILWAY_COMMAND`
- what Clawdia can do:
  - host webhook mode
  - check Railway status through the scoped wrapper
  - read Railway logs through the scoped wrapper
  - verify env var names are present without printing values
  - restart approved services
  - deploy approved code from clean allowlisted repos
  - confirm webhook or bot health for approved services
- what Clawdia cannot do yet:
  - access local Windows repo or Dropbox paths from Railway itself
  - change billing
  - rotate secrets
  - delete services
  - change unrelated projects
- safety limits:
  - allowlisted projects and services only
  - no secret printing in deploy or runtime logs
  - env names only, never env values
  - no destructive production actions without Chris approval
- next setup step:
  - keep Railway actions inside the shared-brain Railway wrapper and audit path only

### GitHub / repo
- connected: yes
- env vars needed by name only:
  - none required for local repo work
- what Clawdia can do:
  - route builder work into repo tasks
  - create docs, runbooks, and safe code packets
- what Clawdia cannot do yet:
  - use GitHub as a live cloud job runner for Clawdia
- safety limits:
  - no secret commits
  - no unrelated dirty-file commits
- next setup step:
  - keep Atlas packet scope clean and auditable

### Codex / Atlas
- connected: partial
- env vars needed by name only:
  - `CODEX_API_KEY`
  - `NEXTEAM_STUDIO_PATH`
  - `CLAWDIA_CODEX_BRIDGE_SHARED_SECRET`
- what Clawdia can do:
  - generate task packets for Atlas or Codex
  - queue builder work in docs
  - target approved repos for future bridge execution
- what Clawdia cannot do yet:
  - directly invoke Atlas or Codex through a live API adapter from Railway
  - trust Railway to run local Windows repo work
- safety limits:
  - do not fake direct access
  - allowlisted repos and task types only
  - no arbitrary shell execution
- next setup step:
  - build a local Codex bridge service that consumes task packets and runs allowlisted Codex jobs on Chris's machine

### Local runner bridge
- connected: no
- env vars needed by name only:
  - `NEXTEAM_STUDIO_PATH`
  - `AQUATRACE_DROPBOX_BASE`
- what Clawdia can do:
  - plan a local fallback route
- what Clawdia cannot do yet:
  - enqueue and consume local jobs automatically
- safety limits:
  - allowlisted jobs only
  - no arbitrary shell execution
- next setup step:
  - build the bridge if Dropbox API cloud mode remains blocked

### VGB outreach tools
- connected: partial
- env vars needed by name only:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `GMAIL_SEND_FROM`
- what Clawdia can do:
  - status
  - previews
  - guarded draft work
- what Clawdia cannot do yet:
  - live campaigns without Chris approval
- safety limits:
  - parked until CompanyCam and Bragi are stable
- next setup step:
  - keep VGB parked

### Task queue
- connected: yes
- env vars needed by name only:
  - none
- what Clawdia can do:
  - track task packets and statuses in docs
- what Clawdia cannot do yet:
  - sync cloud and local state automatically
- safety limits:
  - no secrets in task packets
- next setup step:
  - keep the contractor queue current

### Memory files
- connected: yes
- env vars needed by name only:
  - none
- what Clawdia can do:
  - store verified operating truth
  - keep runbooks and backlog current
- what Clawdia cannot do yet:
  - store secrets
  - store fake completed work
- safety limits:
  - verified truth only
- next setup step:
  - keep memory aligned with proof packages
