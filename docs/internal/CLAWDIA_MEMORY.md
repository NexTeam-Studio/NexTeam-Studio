# CLAWDIA - MEMORY.md
- version: 1.0
- status: active
- last_updated: 2026-05-03
- owner: NexTeam Studio
- scope: internal operating memory

## 1. Update Protocol

Clawdia updates `CLAWDIA_MEMORY.md`:
- after completed milestones
- after parked decisions
- after stale-truth corrections
- after major blockers are resolved

Each update records:
- date
- decision
- proof
- next step

Hard rules:
- Clawdia must not store secrets
- Clawdia must not store private credentials
- Clawdia must separate verified truth from assumptions

## 2. NexTeam Operational History

- NexTeam Studio is the parent platform.
- OpenClaw is the agent and automation framework.
- Aquatrace is client #1 and reference implementation.
- Early mistake: dashboard and UI work happened before agent foundations.
- Process reset corrected build order to `SOUL -> MEMORY -> skills -> cron -> dashboard`.
- Bragi became the first agent with a true `SOUL.md` and proof-of-life.

## 3. Current Active Lanes

### Revenue Now
- Clawdia Telegram authorization and CompanyCam command stabilization
- Clawdia general contractor operator layer for NexTeam and Aquatrace routing

### Standing SEO Garden
- Bragi weekly Aquatrace article draft continuity

### Parked
- VGB controlled campaign flow until CompanyCam and Bragi are stable
- Telegram work until CompanyCam and Bragi are stable
- dashboard or UI
- Forge
- Google Photos automation
- Telegram rebuild
- new agents without approval

## 4. Verified Completed Milestones

### Bragi
- `docs/BRAGI_SOUL.md` complete
- cron foundation complete
- WordPress draft skill complete
- proof-of-life WordPress draft created
- draft URL: `https://aquatraceleak.com/?p=3307`
- post ID: `3307`
- status: `draft`
- permanent Buncombe County VGB verification draft created
- draft URL: `https://aquatraceleak.com/?p=3320`
- post ID: `3320`
- status: `draft`
- accepted proof now requires draft URL, post ID, article title, `status=draft`, not published, not scheduled, and confirmation that content inserted successfully
- no live publish occurred
- 2026-05-03: permanent Aquatrace tone standard locked for all future Bragi and Aquatrace writing
- purpose: stop drift into stiff, corporate, legal-sounding, or generic AI copy
- reader outcome target: clear, practical, field-based authority that sounds like Chris or Aquatrace explaining what really happens in the field
- required writing rules and VGB guardrails are now durable memory, not one-off article instructions
- 2026-05-03: default Aquatrace article review workflow is now:
  - create WordPress draft through the verified Bragi route
  - keep status `draft` only
  - send Chris the review email by default after a successful draft
  - include draft URL, post ID, WordPress status, not-published confirmation, not-scheduled confirmation, internal link recommendations, and image recommendations
  - attempt Yoast field writes for focus keyphrase, SEO title, meta description, social title, and social description on the same run
  - if email or Yoast fail after draft creation, return the real blocker instead of pretending the workflow fully succeeded

### VGB / Gmail
- Gmail OAuth completed
- `GOOGLE_REFRESH_TOKEN` stored locally
- `GMAIL_SEND_FROM` set to `service@aquatraceleak.com`
- sender identity visually verified as `service@aquatraceleak.com`
- plain email send verified
- attachment send verified using Clawdia avatar at `C:\Users\Peyto\.openclaw\workspace\avatars\clawdia-full-body.png`
- no bulk send occurred

### CompanyCam / Dropbox

COMPANYCAM 2026 FULL TRANSFER - COMPLETE

- Protocol confirmation: `AGENT_BUILD_PROTOCOL.md` loaded and confirmed.
- Command run:
  `node C:\Users\Peyto\NexTeam-Studio\scripts\companycam-transfer-2026.mjs`
- Total 2026 projects found: `50`
- Total unique properties found: `48`
- Total projects transferred: `48`
- Total projects skipped as already synced: `2`
- Total unique properties synced: `48`
- Total unique properties not synced: `0`
- Total photos downloaded: `736`
- Total photos skipped: `18`
- Total documents/reports downloaded: `31`
- Total checklists downloaded: `58`
- Total errors: `0`
- Completion email sent: `yes`
- Email message ID: `19dca57b4431bbbe`

Confirmed:
- Sync manifest is stored at:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\companycam_sync_manifest.json`
- Transfer log is stored at:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\companycam_2026_transfer_log.json`
- Metadata, manifests, and logs are stored under:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\`
- No JSON metadata was placed directly into customer folders during the resumed 2026 run.
- CompanyCam was not modified.
- CompanyCam token was not printed.
- No projects outside 2026 were downloaded.

Important note:
- Legacy customer-folder JSON metadata from the earlier Michael Whelan and Kyle Brookshire tests was moved into:
  `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\_System\CompanyCam Sync\Legacy Test Metadata\`
- Customer folders no longer keep those legacy JSON metadata files.

## 5. Current Known Blockers

- Clawdia direct-send interface is not wired yet; Atlas executes sends as Clawdia's execution hand when needed.
- Telegram connection exists but does not live in the NexTeam-Studio repo.
- Telegram bot runtime is now OpenAI-wired through the isolated `clawdia-bot` service.
- Bragi Telegram scaffold exists but is parked.
- Dashboard remains parked.
- Clawdia is not yet in `AGENT_REGISTRY.md`.
- Telegram Clawdia should use OpenAI.
- Claude is advisor and pressure-testing only.
- Current Telegram blockers are approved-user authorization capture and possible duplicate polling if Railway logs continue to show fresh `409 Conflict` events.
- CompanyCam 2026 transfer is complete and is no longer the active blocker lane.
- Next CompanyCam lane is repeatable operation plus operator-safe Telegram command use.
- Bragi remains draft only; no article may be published or scheduled without Chris approval.
- VGB remains parked until CompanyCam and Bragi are stable.
- TMNT internal `SOUL.md` and `MEMORY.md` foundation is now created under `docs/internal/tmnt/`.
- Clawdia contractor registry, queue, handoff, and runbook docs are now created under `docs/internal/`.

## 6. Client Architecture Log

### Aquatrace
- first real NexTeam client
- reference implementation #1
- uses Norse client-facing agent structure
- Bragi content lane is active
- VGB campaign is parked until CompanyCam and Bragi are stable

### Future Clients
- should receive Norse-style client-facing deployments
- souls and duties may be shared by role
- memories must be client-specific and isolated

## 7. TMNT / Norse Architecture Decision

- TMNT = internal NexTeam agency, operator, consultative, and business-growth team
- Norse = client-facing skilled-service-trade deployment model
- TMNT foundation now lives at `docs/internal/tmnt/TMNT_AGENT_INDEX.md`
- permanent role authority now lives at `docs/internal/NEXTEAM_ROLE_MAP.md`
- TMNT role docs are reusable internal templates and must remain white-label ready
- Norse agents can mirror duties across clients but must keep separate client memories
- client-facing systems should not expose TMNT roles unless explicitly intended

## 8. Stale Truth Log

- Clawdia previously reported OAuth and email status as incomplete after it had already been completed.
- Clawdia previously suggested stale port `4174` / `4173` guidance after runtime had moved to `3001` / `5173`.
- Clawdia previously depended on a local temp JSON payload that was invalid because of an unescaped quote inside `contentHtml`, even though the permanent Bragi route itself still worked.

Correction rule:
- Clawdia must rely on the latest proof package, not old memory.
- For accepted Aquatrace article packages, Clawdia should prefer the permanent repo-side article payload helper and the live `3001` Bragi route over fragile temp JSON artifacts.

## 9. Lessons Learned

- dashboard last
- proof before complete
- one lane at a time
- do not let Chris become relay
- test small before scaling
- plain send before campaigns
- draft before publish
- cron can create drafts, not publish
- Telegram approval is useful but parked until routing is known

## 10. Open Decisions Pending Chris

- whether or when to wire Clawdia direct-send interface
- whether or when to route Telegram from Claude/Anthropic to OpenAI/Nova/OpenClaw
- whether or when to add Clawdia to `AGENT_REGISTRY.md`
- whether or when to build SOUL/MEMORY for Njord and remaining non-TMNT internal roles
- whether or when to build Dropbox approved photo library

## 11. Current Next Actions

1. Finish live email attachment inbox proof so Chris visibly receives the requested jpg or png attachment.
2. Keep Clawdia acting as the owner-facing general contractor and route builder work into Atlas task packets instead of using Chris as the relay.
3. Extend Bragi beyond status-only handling while keeping draft-only safety gates.
4. Keep VGB parked until CompanyCam and Bragi are stable.

## 12. Bragi Continuity Update

- Bragi standing schedule is now defined as:
  - daily topic and research check at `6:30 AM` Eastern
  - weekly draft target every Monday at `7:00 AM` Eastern
- Bragi remains draft only.
- Bragi may not publish live or schedule live without Chris approval.
- Bragi article packages now require:
  - `1,400-1,600` words
  - default public author `Chris Sears`
  - primary category `Swimming Pool Leak Detection`
  - one optional secondary category only
  - complete Yoast field set
  - internal links applied and recommended
  - backlink opportunities
  - external link recommendations only when the source quality is clear
  - one featured image recommendation plus `3-5` supporting image recommendations
- Bragi draft notification workflow is:
  - create or update WordPress draft
  - email Chris the draft package
  - keep status draft only until Chris approves
- Bragi photo workflow rules now include:
  - one clear photo type per recommendation
  - rewrite metadata to match the actual uploaded image
  - mark `needs human review` instead of guessing when the image is unclear
- permanent Aquatrace tone standard now governs:
  - articles
  - emails
  - landing pages
  - web copy
  - social posts
  - service pages
  - campaign content
- Gmail reply reading and attachment ingestion are still not wired.
- WordPress media upload helper is prepared, but photo ingestion and placement are still future workflow work.

## 13. CompanyCam / Dropbox Planning Update

- CompanyCam is operating in read-only mode only.
- CompanyCam token safety rule:
  - token belongs only in local `.env` as `COMPANYCAM_API_TOKEN`
  - never print it
  - never commit it
  - never hardcode it
- Current CompanyCam local token status is not stored in memory as a value; only presence checks are allowed.
- CompanyCam read-only target data:
  - project name
  - city
  - state
  - ZIP when available
  - general project type
  - photo timestamps
  - photo tags or labels
  - selected photo metadata
  - reports or checklists when available
- CompanyCam must not expose:
  - full street address
  - customer names unless approved
  - phone numbers
  - emails
  - faces
  - license plates
  - private homeowner details
- CompanyCam -> Dropbox 2026 full transfer is complete.
- Future repeatable sync should show:
  - CompanyCam project
  - inferred Dropbox target path
  - photo and report counts
  - duplicate skip behavior
  - whether manual review is needed

## 14. Future Telegram Photo Workflow

- Once Telegram routing is stable again, Bragi or Clawdia can send the draft URL through Telegram.
- Chris can reply with labeled photos:
  - `Featured`
  - `Photo 1`
  - `Photo 2`
  - `Photo 3`
  - `Photo 4`
  - `Photo 5`
- Bragi can later download those photos, upload them to WordPress, set the featured image, place supporting images, and rewrite metadata to match the actual photos.
- No publish or schedule should happen through that flow without Chris approval.

## 15. General Contractor Backlog

- Telegram webhook works.
- Email sending works, but final inbox proof for visible attachment delivery is still pending.
- Clawdia avatar file lookup is now configured through approved-source lookup, but Railway still cannot see arbitrary local-only assets outside approved sources.
- CompanyCam 2026 transfer is complete.
- CompanyCam API can clearly list and apply existing checklist templates, but public template creation remains unclear.
- Remote CompanyCam to Dropbox requires Dropbox API setup.
- Local runner bridge remains fallback, not primary cloud mode.
- Codex bridge research is complete; safest path is a local allowlisted bridge service, not direct Railway execution.
- Bragi must handle writing requests, not only status.
- Bragi remains draft-only.
- VGB email drafts and sends must stay gated.
- TMNT `SOUL.md` and `MEMORY.md` docs exist but still need review because extra roles may need pruning.

## 16. General Contractor Structure

- Clawdia is the general contractor.
- Chris is the owner and inspector.
- Atlas or Codex is the builder.
- Clawdia should create the task packet, review the proof, and report back to Chris.
- Chris should not be the relay between Clawdia and Atlas.
- Tool registry source of truth:
  `docs/internal/CLAWDIA_TOOL_REGISTRY.md`
- Task queue source of truth:
  `docs/internal/CLAWDIA_TASK_QUEUE.md`
- Atlas handoff packet format:
  `docs/internal/CLAWDIA_ATLAS_HANDOFFS.md`
- General contractor runbook:
  `docs/internal/CLAWDIA_GENERAL_CONTRACTOR_RUNBOOK.md`
- Codex bridge runbook:
  `docs/internal/CLAWDIA_CODEX_BRIDGE_RUNBOOK.md`

## 17. Goonies Advisory Layer

- Goonies Advisory Layer docs and registry are now created under:
  `docs/internal/goonies/`
- status: active consult bench with consult-only guardrails
- authority: consult-only
- runtime status:
  - One-Eyed Willy is now LLM-backed and live for proof review, loop breaking, and next-step judgment
  - the rest of the advisory bench remains consult-only and callable through the advisory runtime without execution authority
- execution authority: none
- client contact authority: none
- first build order:
  - Chunk
  - Mikey
  - Mouth
  - Brand
  - Data
  - Andy
- future dashboard location:
  `Agents -> Advisory Bench`
- Willy is approved as the live internal consult lane for broad Nova-like operator judgment, strategy, proof review, routing, and next-step decisions
- Clawdia may write to Goonie `MEMORY.md` and `KNOWLEDGE_BASE.md` only for approved, source-traceable, proof-backed knowledge

## 18. Railway Access Policy

- Clawdia Railway access is now scoped through the shared-brain Railway wrapper:
  - `C:\Users\Peyto\clawdia-bot\railwayAccessRuntime.js`
- source of truth policy:
  - `docs/internal/clawdia/CLAWDIA_RAILWAY_ACCESS_POLICY.md`
- allowlist source of truth:
  - `docs/internal/clawdia/CLAWDIA_RAILWAY_ACCESS_ALLOWLIST.json`
- allowed Railway work:
  - status
  - logs
  - env var name checks
  - restart approved services
  - deploy approved code from clean allowlisted repos
  - webhook health checks
- disallowed without Chris approval:
  - billing
  - destructive changes
  - secret rotation
  - unrelated project changes
- current live blocker:
  - Railway CLI auth on this machine is expired until `railway login` is run again

## 19. Role Map Permanence Lock

- permanent authority file created: `docs/internal/NEXTEAM_ROLE_MAP.md`
- Chris = owner, inspector, and final authority
- Clawdia = NexTeam general contractor and operator
- TMNT = internal NexTeam team
- Norse = client-facing team structure
- Goonies = consult-only advisory bench
- Willy = consult-only Nova-like internal operator, strategy, proof, and next-step advisor
- Donatello built and still maintains NexTeam.Studio
- Donatello owns NexTeam.Studio website and workspace build and maintenance
- Brokk duplicates Donatello's website and page-builder skill for client work
- Brokk does not own NexTeam.Studio
- Bragi owns articles, SEO, blog drafts, metadata, and content workflow
- Bragi does not own core website build or layout
- Aquatrace and future client Bragi memories must stay separate
- Norse memories must remain client-specific and isolated

## 20. Managed Durable Truth
<!-- CLAWDIA_MEMORY_AUTONOMY_START -->
<!-- MEMORY_AUTONOMY_ENTRY_START:clawdia_memory_autonomy_rule -->
### Clawdia durable memory autonomy rule
- entry_key: clawdia_memory_autonomy_rule
- entry_status: active
- material_type: clawdia_truth
- decision_mode: save
- recorded_at: 2026-05-02T19:34:14.931Z
- proof_status: accepted
- confidence: high
- reason: Chris accepted permanent memory autonomy for Clawdia and Willy.
- source_type: internal_decision
- source_name: Chris accepted durable memory autonomy rule
- source_url_or_path: docs/internal/clawdia/CLAWDIA_MEMORY_AUTONOMY_POLICY.md
- citation_ready: no
- public_source: no
- private_internal_source: yes
- supersedes: none

Accepted permanent memory autonomy rule:
- Clawdia has standing authority to save, update, supersede, remove, or ignore durable truth automatically.
- Save only proven, accepted, completed, blocked, or parked work, accepted architecture or role decisions, durable dependency rules, proof standards, and durable lane-priority decisions.
- Do not save guesses, vague status, repeated unproven blocker chatter, speculative claims, or stale state.
- Use the routing map to send Clawdia truth to CLAWDIA_MEMORY, Willy truth to Willy MEMORY, reference facts to Willy KNOWLEDGE_BASE, procedures to Willy PLAYBOOK, and core behavior to Willy SYSTEM PROMPT.
- Return proof of what changed and why whenever an automatic memory action happens.
<!-- MEMORY_AUTONOMY_ENTRY_END:clawdia_memory_autonomy_rule -->
<!-- CLAWDIA_MEMORY_AUTONOMY_END -->
