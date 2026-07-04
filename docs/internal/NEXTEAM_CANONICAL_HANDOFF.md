# NexTeam Canonical Handoff

Purpose: this is the single corrected handoff for a fresh human or AI session. It separates product vision from current sellable wedge from current build reality, and it only states capabilities as verified when there is repo, test, or live proof.

Last updated: 2026-07-01

## Verification Legend

- `BUILT+PROVEN` = verified from code plus tests and/or live route checks in this audit.
- `PARTIAL` = meaningful plumbing or a shell exists, but the end capability is not complete.
- `NOT BUILT` = no verified implementation for the claimed capability.
- `DOCUMENTED STRATEGY` = captured in durable docs, but not a shipped runtime capability.
- `REPORTED / UNVERIFIED` = carried forward from agreed framing or prior handoffs, but not independently re-proven here.

## 0. 2026-07-01 Readiness Delta

This handoff was rechecked against fresh live proofs on `2026-07-01`.

What changed materially:

- `Clawdia -> Atlas` is now proven end to end in the local shared-brain environment. Clawdia queued a real Atlas task, the codex bridge executed the allowlisted audit, and the proof returned to Clawdia. Proof: `C:\Users\Peyto\clawdia-bot\smoke-atlas-roundtrip.mjs`.
- `Nexi -> Clawdia -> CompanyCam -> back` is now proven against production with tenant enforcement. Aquatrace returns the real Camp Mikell gallons answer, and `tenantId=other-client` returns live `403` with `CompanyCam access is blocked for tenant "other-client".` Proof: `scripts/test-nexi-companycam-roundtrip.mjs`, live `POST /api/nexi/operator/query`.
- The local CompanyCam job-data resolver is now widened beyond the single Camp Mikell shape. It expands ambiguous project-name questions across CompanyCam candidates, scans all attached project PDFs instead of trusting the newest file, and falls back to Dropbox customer exports when CompanyCam naming alone is not enough. Proof: `src/features/missioncontrol/services/companyCamQuestionService.js`, `src/features/missioncontrol/services/companyCamQuestionService.test.mjs`, `C:\Users\Peyto\clawdia-bot\companyCamOperatorRuntime.js`, and a live rerun on `2026-07-01` where `What are the total pool gallons in the report for Statehouse Arena in L3 Campus?` returned `24,250 Gallons` from CompanyCam checklist PDF `18001710`; the same question also resolved through forced Dropbox fallback against `C:\Users\Peyto\Dropbox\Business\Aquatrace LLC\Aquatrace\Customers\2026\06 - June\L3 Campus\Statehouse Arena\ExportedCurrentAquatraceSwimmingPoolLeakDetectionChecklist06232026.pdf`.
- Mission Control fast lane and work lane are now proven live with natural-language variants, not just exact canned phrasing. Proof: `scripts/test-live-mission-control-ops.mjs`.
- Operator auth, admin gate, Firestore isolation, and blueprint lifecycle / paid-confirmed provisioning were all re-proven live after deploy. Proof: `scripts/test-live-firebase-auth-routes.mjs`, `scripts/test-live-admin-gate.mjs`, `scripts/test-live-firestore-tenant-isolation.mjs`, `scripts/test-live-blueprint-lifecycle.mjs`.
- The operator tenant registry and provisioned workspace surfaces are now proven live after the registry moved behind a server-backed Admin route. A paid-confirmed proof tenant appears in `/mission-control/clients`, and its workspace opens successfully. Proof: `server.js`, `src/features/missioncontrol/services/missionControlRegistry.js`, `scripts/test-live-provisioned-registry-ui.mjs`.
- The public Agent Architect surface is **not** fully test-ready. The UI loads, but the live Anthropic request currently fails with `credit balance is too low`. This is now an explicit blocker, not a hidden timeout. Proof: `scripts/test-live-agent-architect-public-flow.mjs`.
- Resend confirmation email is still only `PARTIAL`. The route exists, but the last live send proof in this audit hit Resend sender/domain restrictions, and the newest rerun in this continuation stopped locally because `NEXTEAM_TEST_EMAIL` was not set. Proof: `scripts/test-live-resend-send.mjs`.
- Stripe is still payment-link/manual-confirm only. There is no server-side Stripe secret/webhook automation in production yet. Proof: `server.js`, `src/server/blueprintRequestLifecycleService.js`, Railway env-name audit.

Primary rerunnable proof commands from this pass:

- `npm run test:live:readiness-e2e`
- `npm run test:live:mission-control`
- `npm run companycam:nexi-roundtrip:test`
- `npm run test:live:registry-ui`
- `npm run test:live:blueprint-lifecycle`
- `npm run test:live:firebase-auth`
- `npm run test:live:admin-gate`
- `npm run test:live:firestore-isolation`

## 1. Three Truths

### 1.1 Vision

NexTeam is a repeatable AI agency operating system for field-service businesses. The real aim is not "Nexi the assistant" as a standalone novelty. The aim is a reusable, tenant-isolated engine that can run growth, content, SEO, and eventually daily operations for a client through human-understood rails and hard safety gates.

Aquatrace is customer zero and proving ground. The system has to prove itself by helping a real field-service business generate more business and run cleaner operations before it earns the right to duplicate across other clients.

Verified durable sources:
- `docs/internal/NEXTEAM_NORTH_STAR_AND_FOUNDER_CONTEXT.md`
- `docs/internal/CLAWDIA_SOUL.md`
- `docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md`

### 1.2 Current Sellable Wedge

The current honest sellable wedge is founder-led and manual: the `Nexi Blueprint` beta plus Aquatrace proof.

What is verified:
- the public/app route exists at `/nexi-blueprint-beta`
- the surface explicitly says `$197 beta`
- the surface explicitly says `Manual and founder-led. Not live AI software yet.`

Proof:
- `src/App.jsx`
- `src/features/marketing/components/NexiBlueprintBetaPage.jsx`

Practical meaning:
- get paid manually first
- use Aquatrace as proof
- automate bottlenecks only after real demand and repeat friction show up

### 1.3 Product Destiny

The long-term product destiny is still the bigger thing: a multi-tenant platform with fast client-facing Nexi surfaces, hard-coded safety, real tenant isolation, and human-understood rails that let the owner run parts of the business by conversation.

This is broader than Bragi, broader than GBP, and broader than content.

### Warning

Do not let Bragi, GBP, SEO, or content work replace the bigger daily-ops assistant vision. Those are customer-zero proof lanes and revenue-adjacent subsystems, not the whole product.

## 2. Working With Chris

### Verified / documented operating preferences

- Lead with current status in one line.
- Give one next physical action.
- Keep replies short and concrete.
- Avoid vague "working on it" language.
- Do not claim done without proof.
- Protect Chris from becoming a relay between agents.

Proof:
- `docs/internal/CLAWDIA_SOUL.md`

### Agreed carry-forward preferences not independently codified as one rule block

- say who a prompt is for
- verify, do not trust assertions
- act instead of bouncing work back unless a real blocker exists

Status: `REPORTED / UNVERIFIED` as a single canonical phrase set, even though the spirit matches the documented operating style above.

## 3. Verified Build State

| Capability | Status | Correct truth | Proof |
| --- | --- | --- | --- |
| Clawdia -> Atlas roundtrip | `BUILT+PROVEN` | Clawdia can queue an allowlisted Atlas task through the shared brain, the codex bridge executes it safely, and proof returns to Clawdia. | `C:\\Users\\Peyto\\clawdia-bot\\brainServer.js`, `C:\\Users\\Peyto\\clawdia-bot\\sharedActionLayer.js`, `C:\\Users\\Peyto\\clawdia-bot\\codexBridgeServer.js`, `C:\\Users\\Peyto\\clawdia-bot\\smoke-atlas-roundtrip.mjs`; live rerun on `2026-07-01` completed task `atlas-roundtrip-status-audit` |
| WordPress REST publish rail | `BUILT+PROVEN` | Draft creation, media upload, featured image set with cache-busted verify, Yoast write, cleanup are real and live-tested. | `src/features/missioncontrol/services/wordpressApi.js`, `src/features/missioncontrol/services/wordpressRailService.js`, `scripts/test-wordpress-companycam-rail.mjs`; live rerun in this audit created draft `3471`, media `3473`, then cleaned both up |
| CompanyCam READ rail | `BUILT+PROVEN` | Read-only photo access is real in this repo and live-tested. | `src/features/missioncontrol/services/companyCamReadOnlyService.js`, `src/features/missioncontrol/services/companyCamRailService.js`, `scripts/companycam-test-readonly.mjs`, `scripts/test-wordpress-companycam-rail.mjs` |
| Conversational CompanyCam job-data retrieval | `BUILT+PROVEN` | A plain-English job-data question can resolve a real Aquatrace project, open the exported report PDF, and answer the requested field from live customer data. | Demonstrated live on `2026-06-30` in the authorized rail environment using Camp Mikell in Toccoa, GA. Source artifact on disk: `C:\\Users\\Peyto\\Dropbox\\Business\\Aquatrace LLC\\Aquatrace\\Customers\\2026\\06 - June\\Camp Mikell\\ExportedCurrentAquatraceSwimmingPoolLeakDetectionChecklist06052026.pdf`. Verified extracted text includes `Camp Mikell (Alex Mastej)`, `237 Camp Mikell Court, Toccoa, Georgia 30577`, and `Estimated Approximate Total Gallons` = `101,000 Gallons`. |
| Nexi -> Clawdia -> CompanyCam roundtrip | `BUILT+PROVEN` | The real product path is now proven through production: Nexi operator query -> Clawdia route -> CompanyCam rail -> answer back, with tenant-scoped denial for non-Aquatrace tenants. | `server.js`, `src/server/nexiOperatorQueryService.js`, `C:\\Users\\Peyto\\clawdia-bot\\brainServer.js`, `C:\\Users\\Peyto\\clawdia-bot\\commandRouterRuntime.js`, `C:\\Users\\Peyto\\clawdia-bot\\companyCamOperatorRuntime.js`, `scripts/test-nexi-companycam-roundtrip.mjs`; live rerun on `2026-07-01` returned Camp Mikell `101,000 Gallons` and denied `tenantId=other-client` |
| Mission Control fast lane vs work lane | `BUILT+PROVEN` | Fast lookup returns real CompanyCam project data near-instant, and work lane acknowledges immediately then completes heavy PDF/report extraction asynchronously. Natural-language variants are proven, not just one canned phrase. | `src/server/missionControlOpsService.js`, `src/server/companyCamFastLookupService.js`, `src/server/missionControlOpsService.test.mjs`, `src/server/companyCamFastLookupService.test.mjs`, `scripts/test-live-mission-control-ops.mjs`; live rerun on `2026-07-01` passed fast + work + variant phrasing |
| Localhost rail seam `127.0.0.1:3210` | `BUILT+PROVEN` | Local API seam exists, is localhost-only, and health route returns `ok`. | `src/features/missioncontrol/services/localRailApiServer.js`, `scripts/run-rail-local-api.mjs`, `scripts/test-local-rail-api.mjs`; live `GET /rail/health` returned `ok:true` |
| Public Agent Architect / Nexi intake chat | `PARTIAL` | The public UI is live and the route reaches the live Anthropic proxy, but the current production Anthropic key is out of usable balance, so the conversation fails with a provider-side credit error. | `src/features/agentArchitect/services/architectApi.js`, `scripts/test-live-agent-architect-public-flow.mjs`; live rerun on `2026-07-01` captured `400 invalid_request_error` with `Your credit balance is too low to access the Anthropic API` |
| Google GBP rail | `PARTIAL` | Layer 1 exists: OAuth connect flow, encrypted token vault, refresh logic, and account/location inventory. Post-create/publish is not present. | `src/features/missioncontrol/services/googleBusinessProfileRailService.js`, `src/features/missioncontrol/components/GoogleBusinessProfileRail.jsx`, `server.js`, `scripts/test-gbp-rail.mjs`, `HANDOFF.md` |
| "Mode A" GBP posting is done | `NOT BUILT` | Do not collapse Layer 1 plumbing into a posting engine. OAuth/token/account inventory is not posting. | Same proof set as GBP rail above; no verified post-create/publish route or service found |
| Bragi Mode B article engine | `PARTIAL` | Real article/SEO/rail engine exists, but no proven real autonomous finished article has ever been produced successfully by the AI path. | `src/features/missioncontrol/services/bragiModeBService.js`, `src/features/missioncontrol/services/bragiModeBArticleGenerator.js`, `NEXTEAM_DOC_INDEX.md` section `Mode B - Current State & Resume Plan`, `runtime/bragi-mode-b/state/latest-run.json` |
| Generic client-agnostic engine + per-client config | `PARTIAL` | Tenant/config foundation is real, but the working external connectors today are mostly Aquatrace customer-zero rails rather than a fully generalized connector layer. | `src/features/tenancy/schemas/clientConfigSchema.js`, `src/features/tenancy/services/tenantFoundationRegistry.js`, `src/features/missioncontrol/services/bragiModeBClientConfig.js` |
| Aquatrace config path `src/clients/aquatrace.js` | `NOT BUILT` | That claimed path is wrong. | `src/clients/aquatrace.js` does not exist |
| Real Aquatrace config foundation path | `BUILT+PROVEN` | Aquatrace tenant/config truth lives under `src/features/clients/aquatrace/`. | `src/features/clients/aquatrace/aquatraceTenantFoundation.js`, `src/features/clients/aquatrace/bragiModeBClientProfile.js` |
| `nexteam.studio` vs Railway app split | `BUILT+PROVEN` | `nexteam.studio` is a WordPress marketing site. `nexteam-studio-production.up.railway.app` is the live app/runtime. They are separate. | live public checks recorded in `MASTER_ASSET_INVENTORY.md`; `https://nexteam.studio/wp-json/` is WordPress, `https://nexteam-studio-production.up.railway.app/` is the app |
| `nexteam.studio` origin host is InMotion | `REPORTED / UNVERIFIED` | Public nameserver clues point that way, but the exact hosting-panel authority was not independently re-proven in this handoff. | `MASTER_ASSET_INVENTORY.md` website inventory; hosting login remains intentionally marked unverified there |
| Conversation-to-tenant provisioner | `BUILT+PROVEN` | A completed Nexi session can provision tenant artifacts, starter blueprint, onboarding session, subagents, and routes. | `src/features/tenancy/services/conversationTenantProvisioner.js`, `src/features/tenancy/services/conversationTenantProvisioner.test.mjs` |
| Blueprint request -> paid-confirmed -> tenant/client provision | `BUILT+PROVEN` | The beta path is live from public request through checkout-started, success-page-viewed, paid-confirmed, tenant provision, client organization creation, and member attachment. | `server.js`, `src/server/blueprintRequestLifecycleService.js`, `src/server/firebaseBlueprintRequestRepository.js`, `scripts/test-live-blueprint-lifecycle.mjs`; live rerun on `2026-07-01` created then cleaned proof artifacts with `cleanup: completed` |
| Operator tenant registry + provisioned workspace | `BUILT+PROVEN` | The operator registry now reads through a server-backed Admin route, and a newly provisioned proof tenant becomes visible in `/mission-control/clients` with a working workspace route. | `server.js`, `src/features/missioncontrol/services/missionControlRegistry.js`, `scripts/test-live-provisioned-registry-ui.mjs`; live rerun on `2026-07-01` passed `registry-visible` and `workspace-visible` |
| Operator auth / admin gate | `BUILT+PROVEN` | Unauthenticated access is blocked, operator bootstrap sets real platform claims, authenticated session reads correctly, and browser-level login/logout works on the admin gate. | `server.js`, `src/features/auth/services/firebaseTenantAuthService.js`, `src/features/admin/components/admingate.jsx`, `scripts/test-live-firebase-auth-routes.mjs`, `scripts/test-live-admin-gate.mjs` |
| Confirmation email rail to aquatraceleak@gmail.com | `PARTIAL` | The route exists, but delivery is not yet re-proven cleanly in this continuation. Earlier live proof in this audit hit Resend account/domain restrictions, and the newest rerun attempt stopped locally because `NEXTEAM_TEST_EMAIL` was unset. | `scripts/test-live-resend-send.mjs`; prior live proof in this audit returned `502` wrapping Resend `403 validation_error` about verifying a domain and using a matching `from` address |
| Stripe payment automation | `PARTIAL` | Current flow is payment-link/manual-confirm only. There is no verified server-side Stripe secret/webhook automation in production yet. | `src/features/agentArchitect/services/blueprintRequestClient.js`, `server.js`, `src/server/blueprintRequestLifecycleService.js`, production env-name audit showing `VITE_STRIPE_PAYMENT_LINK` present and no `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` |
| Provisioner/auth/tenant-isolation proof level | `BUILT+PROVEN` | In this audit, the targeted tenancy suite reran with `12` passing tests and `1` emulator-skipped test. Live auth bootstrap is up, and live cross-tenant denial produced `403 PERMISSION_DENIED`. | `src/features/tenancy/services/conversationTenantProvisioner.test.mjs`, `src/features/tenancy/services/tenantDocumentRepository.test.mjs`, `src/features/tenancy/services/firestoreRulesTenantIsolation.test.mjs`, `src/features/tenancy/services/firestoreTenantRuntimeEmulator.test.mjs`, `server.js`, `MASTER_ASSET_INVENTORY.md` |
| Earlier "37 tests" claim for the provisioner/auth layer | `REPORTED / UNVERIFIED` | Prior handoffs said `37 tests`. That exact count was not independently re-proven in this audit, so do not state it as fact without rerunning the full prior suite. | current rerun in this audit showed `12` pass, `1` skipped across the targeted tenancy suite |
| Auth + tenant isolation live | `BUILT+PROVEN` | `/api/internal/firebase-auth/me` and `/api/internal/firebase-auth/tenant-bootstrap` are live; cross-tenant denial is proven live. | `server.js`, `MASTER_ASSET_INVENTORY.md` |
| `criticalRule` + `humanUnderstanding` are hard-coded in NexTeam-Studio provisioner path | `REPORTED / UNVERIFIED` | Those gates are real in the wider OpenClaw ops-bridge schema, but they were not found as native fields enforced inside this repo's provisioner path. | `..\\.openclaw\\workspace\\ops-bridge\\README.md`, `..\\.openclaw\\workspace\\ops-bridge\\scripts\\bridge-packet-schema.mjs`; not found under `src/` here |

## 4. Agent / Ownership Map

### Real operating roles

- `Clawdia` = internal operator / general contractor
- `Atlas/Codex` = execution hand / builder
- `Bragi` = content, SEO, draft workflow lane
- `Nexi` = public-facing intake / blueprint guide
- `Njord` = Aquatrace Mission Control shell / host
- `Willy` = consult-only internal strategy/proof advisor

### Real but limited or stale-configured lanes

- `Nexi` public Agent Architect path = live UI and correct model path, but the current production Anthropic balance is too low for successful public conversation responses
- `Njord` fast/work Mission Control operator lane = proven live for CompanyCam lookup/report work; any Anthropic-backed specialist chat remains dependent on a funded provider key
- `Bragi` autonomous Mode B AI path = real code, not yet proven on a successful live run, and still dependent on a funded/controlled provider key

### Framework / authority roles, not independently proven autonomous runtimes

- most `TMNT` roles
- most named `Norse` specialists outside the live shell wiring
- most `Goonies` names except `Willy`
- `Brokk` is a real role authority, but not yet a separately proven autonomous builder runtime

### Isolated outside lane

- `Slade` is real, but it is not part of the NexTeam client stack and should stay isolated from NexTeam assumptions

Full authoritative roster:
- `MASTER_ASSET_INVENTORY.md`
- `docs/internal/NEXTEAM_ROLE_MAP.md`

## 5. Governing Principles

These are durable and should be applied before opening new fronts:

1. NexTeam sells one outcome: more business.
2. Aquatrace is the revenue-first proving ground, but durable work should default to reusable, config-driven structure.
3. Build for load: judge memory, token/API usage, storage, compute, and recurring cost today and at `1,000+` clients.
4. No per-client hardcoding unless it is a deliberate v1 shortcut with the scale-up path named honestly.

Verified sources:
- `docs/internal/CLAWDIA_SOUL.md`
- `docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md`
- `docs/internal/NEXTEAM_NORTH_STAR_AND_FOUNDER_CONTEXT.md`

### Client-facing speed forward requirement

The durable rule is not "move slowly." The durable rule is: move practical client-facing value forward quickly, but never by outranking truth, safety, or reusable/load-bearing design.

Proof:
- `docs/internal/CLAWDIA_SOUL.md` ranks `Client delivery` and `Revenue movement` above `Speed`, while also stating that Aquatrace deserves practical speed and real value now.

## 6. Honest Completion Read

Documented completion audit found in the OpenClaw workspace:

- Full normalized roadmap completion: `32.5%`
- Foundation / infrastructure completion: `68.0%`
- Post-purchase operator-product completion: `5.9%`

Status: `DOCUMENTED STRATEGY / ANALYSIS`

Source:
- `..\\.openclaw\\workspace\\docs\\internal\\NEXTEAM_COMPLETION_AUDIT_2026-06-30.md`

Interpretation:
- the shell and foundation are real
- the commercial/public face is farther along than the true operator product
- the actual daily-ops product promise is still mostly ahead

## 7. Wedge And Threat Read

Documented wedge memo conclusion:

- first attack should be `Conversational Job Desk for one client, one trade, one operator surface, one read path, one follow-up action`
- red threats: `ServiceTitan`, `Housecall Pro`, `Podium Larry`

Status: `DOCUMENTED STRATEGY`

Source:
- `..\\.openclaw\\workspace\\docs\\internal\\NEXTEAM_WEDGE_DECISION_MEMO_2026-06-29.md`
- `docs/internal/research/NEXTEAM_FIELD_SERVICE_AI_COMPETITIVE_LANDSCAPE_2026-06-29.md`

## 8. Proven Daily-Ops Conversational Capability

On `2026-06-30`, the system proved the first real slice of the daily-ops conversational wedge:

- plain-English request: total pool gallons for Camp Mikell in Toccoa, GA
- live answer returned from the real CompanyCam/Aquatrace report lane:
  - `Camp Mikell (Alex Mastej)`
  - `237 Camp Mikell Court, Toccoa, Georgia 30577`
  - `Estimated Approximate Total Gallons = 101,000 Gallons`
- source artifact:
  - `C:\\Users\\Peyto\\Dropbox\\Business\\Aquatrace LLC\\Aquatrace\\Customers\\2026\\06 - June\\Camp Mikell\\ExportedCurrentAquatraceSwimmingPoolLeakDetectionChecklist06052026.pdf`
- the live retrieval also surfaced a second Toccoa project and offered to pull that one too

Honest boundary:

- this proves read external system -> find job -> read exported report PDF -> answer a specific operator question
- it was proven in the authorized rail environment, not yet as the fast, branded, per-tenant Nexi experience
- turning this into the polished client-facing conversational job desk is still build-ahead work

## 9. In-Progress / Checkpointed Work

This section exists so future sessions do not mistake "code started" for "capability shipped." On `2026-06-30`, real started work existed in two separate working trees. The most important started tree was the OpenClaw workspace mirror. It is now safety-checkpointed, but it remains in-progress rather than proven product.

### 9.1 OpenClaw workspace mirror: Mission Control fast-lane work

Status: `PARTIAL`

What is true:

- a fast-lane architecture has been started for Aquatrace Mission Control
- deterministic lane routing logic exists to split fast lookups from heavier work-lane tasks
- initial tests exist and cover lookup routing plus follow-up behavior
- this is not yet a fully proven end-to-end client-facing conversational job desk

Proof:

- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\services\\njordfastlane.js`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\services\\njordfastlanecore.js`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\services\\njordrequestlane.js`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\services\\njordfastlane.test.mjs`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\services\\njordrequestlane.test.mjs`

### 9.2 OpenClaw workspace mirror: command-loop work

Status: `PARTIAL`

What is true:

- mailbox-driven command-loop scripts exist for the acknowledge -> perform -> reply pattern Nova flagged
- a mailbox probe exists to send and read back proof messages
- these scripts are substantial and real, but they were not re-proven here as a finished production loop

Proof:

- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\clawdia-command-loop.mjs`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\clawdia-mailbox-probe.mjs`

### 9.3 OpenClaw workspace mirror: Aquatrace growth-intelligence / SEO work

Status: `PARTIAL`

What is true:

- real GBP, referral-partner, SEO-digest, and outbound-email helper scripts exist in started form
- daily SEO guidance docs exist and align with the documented Google Search Central discipline
- this is growth-intelligence and operator tooling work, not yet a single proven growth engine

Proof:

- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\bragi-gbp.mjs`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\build-sc-statewide-referral-partners.mjs`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\send-aquatrace-seo-audit-email.ps1`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\send-openclaw-tutorial-email.ps1`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\scripts\\send-seo-digest-email.ps1`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\docs\\seo\\aquatrace-daily-seo-audit-prompt.md`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\docs\\seo\\google-yoast-daily-watch-prompt.md`

### 9.4 OpenClaw workspace mirror: operator UX / admin sessions / Agent Architect polish

Status: `PARTIAL`

What is true:

- there is real UI refinement work in progress across Mission Control, admin sessions, and Agent Architect surfaces
- this is meaningful started UX work, but it is not independently proven as complete or stable in this handoff

Proof:

- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\admin\\components\\sessionsview.jsx`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\components\\njordmissioncontrol.jsx`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\components\\njordsessionlog.jsx`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\missioncontrol\\components\\njordshell.jsx`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\agentArchitect\\components\\AvatarPanel.jsx`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\agentArchitect\\components\\SpecReviewPanel.jsx`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\src\\features\\agentArchitect\\components\\SuccessScreen.jsx`

### 9.5 Current repo checkout: separate local in-progress edits

Status: `PARTIAL`

What is true:

- the current `C:\\Users\\Peyto\\NexTeam-Studio` checkout also contains separate local in-progress edits around Bragi Mode B, WordPress rail hardening, local rail contract, mission control registry, and tenant-document work
- these are not the same tree as the OpenClaw mirror fast-lane work and should not be conflated with it
- only items independently verified elsewhere in this handoff should be treated as capability truth

Representative files:

- `src/features/missioncontrol/services/bragiModeBArticleGenerator.js`
- `src/features/missioncontrol/services/bragiModeBService.js`
- `src/features/missioncontrol/services/wordpressRailService.js`
- `src/features/missioncontrol/services/localRailApiServer.js`
- `src/features/missioncontrol/services/missionControlRegistry.js`
- `src/features/tenancy/services/tenantDocumentRepository.js`

## 10. Missing Layers And Important Distinctions

### Mission Control / command center

Status: `PARTIAL`

What is true:
- Mission Control shell and tenant registry routes exist
- Clawdia command-center posture is documented
- the full daily-ops conversational operator loop is not yet built

Proof:
- `src/features/missioncontrol/readme.md`
- `src/features/missioncontrol/components/MissionControlHome.jsx`
- `docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md`

### Email + Telegram command loop

Status: `PARTIAL / PARKED`

What is true:
- Telegram bot runtime exists outside this repo
- Telegram approval plumbing exists in repo
- a unified cross-surface command loop is not proven complete

Proof:
- `src/features/missioncontrol/services/bragiTelegramApprovalService.js`
- `docs/internal/CLAWDIA_TELEGRAM_OPERATOR_RUNBOOK.md`
- `docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md`
- `NEXTEAM_DOC_INDEX.md` section `Clawdia - unified cross-surface conversation continuity`

### Google Search Central SEO discipline

Status: `DOCUMENTED STRATEGY`

What is true:
- there is a standing documented discipline to treat official Google Search Central guidance as source of truth

Proof:
- `..\\.openclaw\\workspace\\skills\\google-search-central-seo\\SKILL.md`
- `..\\.openclaw\\workspace\\memory\\google-seo-yoast-digest.md`
- `..\\.openclaw\\workspace\\NexTeam-Studio\\docs\\seo\\google-yoast-daily-watch-prompt.md`

### Aquatrace growth intelligence

Status: `PARTIAL`

What is true:
- real SEO audit/digest and competitive-intelligence docs exist
- no clearly proven unified "growth intelligence engine" was found as a shipped runtime product layer

Proof:
- `docs/internal/research/NEXTEAM_FIELD_SERVICE_AI_COMPETITIVE_LANDSCAPE_2026-06-29.md`
- `..\\.openclaw\\workspace\\memory\\aquatrace-seo-daily-audit.md`
- `..\\.openclaw\\workspace\\memory\\google-seo-yoast-digest.md`

### Parked-lane contamination control

Status: `BUILT+PROVEN` as an operating rule, not a product feature

What is true:
- Aquatrace isolation is explicitly documented
- lane mixing across Aquatrace, Slade, Dive Factor, and NexTeam internal work is explicitly forbidden

Proof:
- `docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md`
- `docs/internal/CLAWDIA_SOUL.md`
- `..\\.openclaw\\workspace\\runtime\\clawdia-inbox\\reply-phone-workflow-recommendation-2026-06-27.txt`

### `25-competitor-page research rule`

Status: `REPORTED / UNVERIFIED`

What is true:
- that exact rule was not found in the durable sources inspected for this handoff

### Onboarding automation waits till client `#2-3`

Status: `DOCUMENTED STRATEGY`

Proof:
- `NEXTEAM_DOC_INDEX.md`
- `docs/internal/NEXTEAM_CLIENT_ONBOARDING_AUTOMATION_PLAYBOOK.md`

### Legal / privacy / paying-client readiness

Status: `PARTIAL`

What is true:
- the completion audit marks legal/privacy/TOS/trademark readiness as not started
- the repo/docs do not prove a complete paying-client legal/privacy package is live
- the stronger "needs human legal/privacy expert before paying clients" wording is prudent, but should be treated as agreed operator caution rather than independently proven completed policy

Proof:
- `..\\.openclaw\\workspace\\docs\\internal\\NEXTEAM_COMPLETION_AUDIT_2026-06-30.md`

## 11. Immediate Open Items

- Bragi Mode B needs one funded, controlled API key lane and a corrected live model path before the first real autonomous article run can happen.
- The next proof that matters most is not another shell. It is:
  1. first real Bragi Mode B AI run
  2. turn the now-proven CompanyCam report-answer lane into a fast, branded, per-tenant conversational job desk surface
- The recovered blueprint doc is present and indexed:
  - `docs/internal/blueprints/Aquatrace_App_Project_Plan_v4.docx`

Correction to prior loose handoffs:
- do **not** carry forward `Aquatrace_App_Project_Plan_v4.docx is missing`
- verified truth is that it exists in this repo and is indexed in `NEXTEAM_DOC_INDEX.md`

## criticalRule

Never promote plumbing to product. OAuth is not publishing. A shell is not an operator loop. A draft rail is not autonomous content. A documented strategy is not a live capability.

## humanUnderstanding

NexTeam now has real shells, real rails, real tenant isolation, and a real founder-led offer. What it does not yet have is the full daily-use conversational operator product it ultimately promises. The right next move is to finish one undeniable proof loop, not to keep broadening the blueprint.
