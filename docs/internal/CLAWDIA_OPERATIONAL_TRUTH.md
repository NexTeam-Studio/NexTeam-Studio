# CLAWDIA_OPERATIONAL_TRUTH
- version: 1.1
- status: active
- last_updated: 2026-06-28
- owner: Chris Sears
- scope: durable Clawdia operational truth

## ARCHITECTURE DECISIONS

- 2026-05-03: Clawdia must read this file at the start of every dashboard session and treat it as the durable truth index before trusting chat-local context.
- 2026-05-03: Clawdia is the single front door. She must check the action registry before telling Chris a route is unavailable.
- 2026-05-03: Shared-brain runtime in `C:\Users\Peyto\clawdia-bot` is the live operator engine for queue, proof, Willie, and shared actions.
- 2026-05-03: Empty child output such as `(no output)`, repo summaries, `working`, `waiting`, or `reassigned` is never implementation proof. Treat it as execution-path failure.
- 2026-05-03: After one proofless implementation handoff, Clawdia must run `probeExecutionPath` against the target repo before reassigning the same work.
- 2026-05-03: After two empty or proofless returns from the same executor on the same task, Clawdia must quarantine that executor for that task and reroute through the verified implementation path such as `routeTaskToCodex` or return one real blocker.
- 2026-05-03: Aquatrace is hard-isolated from NexTeam internal work. Do not mix client memory, routes, proof, or task context across those lanes.
- 2026-05-03: Bragi WordPress draft creation remains draft-only. No publish or schedule without explicit Chris approval.
- 2026-05-03: Successful Aquatrace Bragi article drafts now default to draft creation + Chris review email + Yoast field write attempt on the same verified route. If email or Yoast fail, Clawdia must return the real blocker instead of pretending the route is fully complete.
- 2026-06-17: `Atlas` is a builder role, not an OpenClaw session label. Clawdia must not search for a visible session named `Atlas` or invent `agent:main:atlas`.
- 2026-06-17: The canonical Clawdia -> Atlas/Codex handoff path is the local ops bridge queue at `C:\Users\Peyto\.openclaw\workspace\ops-bridge\to-codex.jsonl` with bridge target `to: "atlas"`.
- 2026-06-28: NexTeam sells one outcome: more business. Website, SEO, intake, GBP, social, and content are coordinated subsystems inside one AI-run growth engine, not separate end products to optimize in isolation.
- 2026-06-28: Aquatrace is the revenue-first proving ground, but durable builds must default to reusable, config-driven structure unless Chris explicitly approves a one-off.
- 2026-06-28: Every meaningful architecture or build recommendation must include a load profile covering memory, token/API usage, storage, compute, and recurring cost today and at 1,000+ clients.
- 2026-06-28: If the fastest safe move is a deliberate v1 shortcut that would not scale cleanly, Clawdia must label it honestly and include the scale-up path.

## BUILD REVIEW FILTER

Before Clawdia approves, routes, or recommends meaningful build work, she must state:
- whether it serves the "we generate business" vision
- whether it is reusable/config-driven across clients
- what weight it adds in memory, token/API usage, storage, compute, and recurring cost
- whether it holds at 1,000+ clients or is a declared v1 shortcut
- if it is a shortcut, what the scale-up path is

## ACTIVE LANES

- Clawdia main:
  - operator lane for queue, proof, routing, Willie judgment, and memory maintenance
- Splinter:
  - oversight, standards, role boundaries, and operating coherence
- Aquatrace:
  - isolated client lane for Bragi, Njord, Norse agents, approved service workflows, and client-facing draft work only
  - permanent Aquatrace tone standard is locked for all future Bragi and Aquatrace copy

## AGENT ROSTER

- Clawdia:
  - general contractor / operator / shared-brain front door
- Nexi:
  - public-facing blueprint / lead-capture persona
- Atlas:
  - repo builder / repair executor / code-path fixer
- Bragi:
  - Aquatrace articles / SEO / draft workflow / content lane
- Njord:
  - Aquatrace host / routing / case-study workspace shell
- Heimdall:
  - intake / lead watch / scheduling gatekeeper
- Thor:
  - field operations / execution support
- Mimir:
  - reports / findings / documentation memory
- Freyja:
  - follow-up / reviews / referrals
- Splinter:
  - standards / structure / long-term coherence
- Willy:
  - internal Nova-like advisor for next-step strategy, proof review, routing, and loop breaking
- Goonies:
  - consult-only advisory bench; no execution authority

## KNOWN WORKING ROUTES

- Bragi WordPress draft route:
  - function/file/route: `executeBragiWordpressDraft` in `src/features/missioncontrol/services/bragiWordpressService.js` via `POST /api/bragi/wordpress/execute` in `server.js`
  - runtime: Clawdia command center -> Bragi -> `createAquatraceBragiDraft` -> shared brain -> NexTeam local server on port `3001` -> WordPress draft route
  - default post-draft behavior:
    - send review email to `chris@aquatraceleak.com`
    - include draft URL, post ID, WordPress status, not-published confirmation, not-scheduled confirmation, internal link recommendations, and image recommendations
    - attempt Yoast field write through the approved editor path on the same run
  - safe fallback:
    - if edit-existing is blocked by WordPress permissions, create a new replacement draft and return the new draft URL, post ID, and `status=draft`
  - env vars by name:
    - `WORDPRESS_BASE_URL`
    - `WORDPRESS_USERNAME`
    - `WORDPRESS_APP_PASSWORD`
  - primary credential path:
    - `named_env_vars`
  - editor credential path:
    - `reference_editor_fallback` when `WORDPRESS_EDITOR_USERNAME` / `WORDPRESS_EDITOR_PASSWORD` are not set
  - fallback credentials source:
    - `docs/internal/clawdia/reference/aquatrace/*` for emergency fallback only
  - last proof date: 2026-05-03
  - proof artifact:
    - `https://aquatraceleak.com/?p=3307`
    - post ID `3307`
    - status `draft`
    - `https://aquatraceleak.com/?p=3316`
    - post ID `3316`
    - status `draft`
    - `https://aquatraceleak.com/?p=3320`
    - post ID `3320`
    - status `draft`
    - `https://aquatraceleak.com/?p=3332`
    - post ID `3332`
    - status `draft`
    - `https://aquatraceleak.com/?p=3343`
    - post ID `3343`
    - status `draft`
    - review email sent to `chris@aquatraceleak.com`
    - Yoast fields written successfully through the editor path
- Shared brain:
  - function/file/route: `createClawdiaBrainServer` in `C:\Users\Peyto\clawdia-bot\brainServer.js`
  - runtime: local shared-brain server on `127.0.0.1:8788`
  - env vars by name:
    - `CLAWDIA_BRAIN_SHARED_SECRET`
    - `CLAWDIA_CODEX_BRIDGE_SHARED_SECRET`
    - `CLAWDIA_BRAIN_URL`
  - last proof date: 2026-05-02
- Clawdia single command router:
  - function/file/route: `routeClawdiaCommand` in `C:\Users\Peyto\clawdia-bot\commandRouterRuntime.js` via `POST /public/operator/route` in `C:\Users\Peyto\clawdia-bot\brainServer.js`
  - runtime: dashboard chat -> shared brain command router -> action registry / Willy / Bragi / Railway wrapper
  - env vars by name:
  - none for route preview
  - last proof date: 2026-05-03
- Execution-path probe:
  - function/file/route: `probeExecutionPath` in `C:\Users\Peyto\clawdia-bot\executionPathProbeRuntime.js` via shared-brain action `probeExecutionPath`
  - runtime: dashboard/shared brain -> local repo probe -> verified reroute or real blocker
  - env vars by name:
    - none
  - last proof date: 2026-05-03
- Willie consult runtime:
  - function/file/route: `consultWilly` in `C:\Users\Peyto\clawdia-bot\willyConsultRuntime.js`
  - runtime: shared-brain action layer / public consult route
  - env vars by name:
    - `WILLY_ENABLED`
    - `WILLY_LLM_PROVIDER`
    - `WILLY_MODEL`
    - `WILLY_SYSTEM_PROMPT_PATH`
    - `WILLY_MEMORY_PATH`
    - `OPENAI_API_KEY`
  - last proof date: 2026-05-02
- Clawdia -> Atlas/Codex local ops bridge:
  - function/file/route:
    - `C:\Users\Peyto\.openclaw\workspace\ops-bridge\scripts\enqueue-to-atlas.ps1`
    - `C:\Users\Peyto\.openclaw\workspace\ops-bridge\scripts\enqueue-to-codex.ps1`
    - `C:\Users\Peyto\.openclaw\workspace\ops-bridge\scripts\poll-to-codex.ps1`
  - runtime:
    - Clawdia human-facing lane in `agent:main:nexteam` -> write handoff packet to `to-codex.jsonl` -> Atlas/Codex polls queue
  - last proof date: 2026-06-17

## KNOWN BROKEN/PARKED ROUTES

- 2026-05-03 historical repair:
  - Bragi route was temporarily disconnected from the shared action layer and the Vite `/api/bragi` proxy was missing.
  - both were repaired on 2026-05-03.
  - keep this note so future sessions do not misdiagnose the issue as never having existed.
- 2026-05-03 local payload failure:
  - the latest accepted Aquatrace article draft attempt failed before posting because `C:\Users\Peyto\.openclaw\workspace\tmp_aquatrace_article_payload.json` was invalid JSON
  - exact failure cause: an unescaped quote inside the `contentHtml` JSON string broke local parsing
  - secondary failure mode: preview-port testing against `4173` could return HTML instead of the live Bragi JSON route
  - permanent fix: accepted article payload moved into `src/features/missioncontrol/services/bragiAcceptedArticlePayloads.js`, the execution client now prefers the stable `3001` route when needed, and the end-to-end verifier posts directly to the real server route
- 2026-05-03 edit-existing permission block:
  - WordPress returned `401`, `rest_cannot_edit`, and `Sorry, you are not allowed to edit this post.` on direct edit of existing post `3329`
  - this appears to be post-level edit permission, capability, or ownership related rather than loss of overall WordPress access
  - delivery rule: if create-new-draft succeeds, treat the article as delivered and return the replacement draft proof instead of blocking the lane
  - short follow-up inspection on the current named-env route no longer reproduced that block on post `3329`, which suggests the earlier failure was likely tied to credential path, capability context, or runtime identity

## PROOF LOG

- 2026-04-25:
  - task: Bragi proof-of-life draft
  - artifact: `https://aquatraceleak.com/?p=3307`
  - accepted: yes
- 2026-05-03:
  - task: Bragi shared-brain route repair and live draft proof
  - artifact: `https://aquatraceleak.com/?p=3316`
  - accepted: yes
  - note: `createAquatraceBragiDraft` now runs through the shared action layer and returns real draft proof
- 2026-05-03:
  - task: Bragi Buncombe County VGB draft permanence verification
  - artifact: `https://aquatraceleak.com/?p=3320`
  - accepted: yes
  - note: verified title, post ID, `status=draft`, not published, not scheduled, and content insertion for the accepted VGB article package
- 2026-05-03:
  - task: Clawdia single command center route proof
  - artifact: dashboard chat routed Bragi, Nexi Blueprint, and Railway/runtime questions through one command router
  - accepted: yes
- 2026-05-03:
  - task: Permanent Aquatrace tone standard lock
  - artifact: `docs/BRAGI_SOUL.md` and `docs/clients/aquatrace/bragi/AQUATRACE_BRAGI_MEMORY.md`
  - accepted: yes
  - note: all future Aquatrace and Bragi articles, web copy, landing pages, service pages, social posts, emails, and campaign content must follow the saved tone standard and VGB guardrails
- 2026-05-03:
  - task: Bragi replacement draft fallback delivery
  - artifact: `https://aquatraceleak.com/?p=3332`
  - accepted: yes
  - note: when edit-existing is blocked or uncertain, create-new-draft is the safe delivery fallback and article delivery remains successful when the replacement draft is verified
- 2026-05-03:
  - task: Bragi default review-email and Yoast workflow verification
  - artifact: `https://aquatraceleak.com/?p=3343`
  - accepted: yes
  - note: the verified draft route now sends Chris the default review email after a successful draft and writes the Yoast focus keyphrase, SEO title, meta description, social title, and social description on the same run

## ACTIVE BLOCKERS

- Clawdia public dashboard action execution is intentionally limited to the safe allowlist; non-public operator actions should auto-route Atlas repair tasks instead of stalling.
- Historical dead handoff rule:
  - if Atlas/Donatello returns empty or proofless output, that is a broken executor result, not a completed attempt
  - Clawdia must probe the repo path and reroute instead of looping on the same handoff

## AQUATRACE CONTENT RULES

- Permanent Aquatrace tone standard is locked.
- All future Aquatrace and Bragi articles, web copy, landing pages, service pages, social posts, emails, and campaign content must follow the saved tone standard in `docs/BRAGI_SOUL.md` and `docs/clients/aquatrace/bragi/AQUATRACE_BRAGI_MEMORY.md`.
- Aquatrace copy must stay plain-English, field-based, calm, practical, sales-aware, and non-legalistic.
- Aquatrace may position itself as the specialist but must not imply compliance certification, legal advice, engineering determination, regulatory determination, guaranteed approval, or drain-cover replacement as part of the documentation service.

## SAFETY RULES

- No publish without Chris approval.
- No external email send without Chris approval.
- No env values in chat or proof.
- No `.env` commits.
- No fake completion.
- No fake draft URL.
- No claiming a route is available without callable proof.
- Aquatrace stays completely isolated from NexTeam internal lanes at all times.
- NexTeam repo:
  - `https://github.com/Chris1BATA/NexTeam-Studio.git`
