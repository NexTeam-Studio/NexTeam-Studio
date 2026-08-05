DOCUMENT_ID: CODEMAP-TARGET-ARCHITECTURE-CHECKPOINT-001
TITLE: Target Architecture Integration Current Changes
DOCUMENT_TYPE: CODE_MAP
STATUS: CHECKPOINTED
CREATED_AT: 2026-08-05
UPDATED_AT: 2026-08-05
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Atlas
PRODUCT_AREA: Nexi, NexOps, Platform
MODULES: tenant branding, client tools, conversation history, routing
TENANTS: aquatrace, owens-bluewater-wash
RELATED_COMMITS: d4a0224eee64216c8d7d3dc8e7e4eabefa0cd9cf
RELATED_TESTS: apps/server/test/nexi-job-desk.test.mjs; apps/server/test/nexi-tenant-profile.test.mjs
RELATED_DOCUMENTS: docs/knowledge/checkpoints/2026-08-05-target-architecture-integration-checkpoint.md
RELATED_LLM_ARTIFACTS: LLM-INDEX-001
TAGS: code-map, checkpoint, nexi, branding

# Target Architecture Integration Current Changes

Business reason for every entry below: **BUSINESS REASON CANNOT BE DETERMINED FROM LOCAL EVIDENCE.** Changed ranges are from `git diff --unified=0 d4a0224^ d4a0224`. Unless stated otherwise, collection, route, authentication, and tenant effects are not determinable from a diff alone; risk is unverified integration behavior; rollback is `git revert d4a0224` after review.

| Path and status before checkpoint | Changed lines / symbols | Purpose, inputs, outputs, dependencies | Effects and related tests |
|---|---|---|---|
| `apps/server/src/composeServerApp.ts` M | `384-390`, static-route order | Registers top-level Nexi redirect behavior; Express and web distribution path. | Route/UI effect; `nexi-job-desk.test.mjs`. |
| `apps/server/src/modules/nexops/areas/clients/components/contact/server/nexiTools.ts` M | `31-58`, `121-125`, `144-145`; client lookup helpers | Adds normalized/close client matching to CRM tool output. | Tenant CRM effect; `nexi-job-desk.test.mjs`. |
| `apps/server/src/nexi/nexiRepository.ts` M | `16`, `58-64`, `122-133`; repository history method | Adds conversation lookup capability to memory and Firestore repositories. | Persistence effect; `NexiRepository`; tests related: tenant profile. |
| `apps/server/src/nexi/nexiRoutes.ts` M | `180-208`; history endpoint | Adds a Nexi history route using repository access. | API/auth/persistence effect; route is affected. |
| `apps/server/src/nexi/nexiService.ts` M | `94-102`, `403-425`, `728`, `2187-2311`; prompt and client-reference helpers | Adds tenant profile language and conversation-aware client update handling. | Nexi/tenant effect; `nexi-job-desk.test.mjs`. |
| `apps/server/src/platform/routes.ts` M | `333-361`; platform branding route | Adds public tenant-branding image access behavior. | Route and tenant-branding effect. |
| `apps/server/test/nexi-job-desk.test.mjs` M | `1667-1794` | Adds client conversation test cases. | Test-only; prior audit recorded suite failures. |
| `apps/server/test/nexi-tenant-profile.test.mjs` A | `1-38` | Adds tenant-profile Nexi test coverage. | Test-only. |
| `apps/web/src/features/nexi/areas/chat/components/NexiStandaloneChat.tsx` M | `451-470`, `468-470`, `1121-1122` | Changes chat history initialization and navigation behavior. | UI/API history effect. |
| `apps/web/src/features/nexopsShell/NexOpsWorkspace.tsx` M | `1107-1108` | Changes workspace Nexi navigation destination. | UI routing effect. |
| `apps/web/src/features/nexopsShell/components/NexOpsHeader.tsx` M | `55-56`, `69-72` | Changes tenant branding presentation in header. | UI/branding effect. |
| `apps/web/src/features/nexopsShell/styles/shellCore.css` M | `82`, `90`, `95`, `105`, `109-110`, `115-116` | Adjusts shared shell visual styles. | UI-only diff evidence. |
| `apps/web/src/features/nexopsShell/styles/shellHeader.css` M | `24`, `29-37` | Adjusts header branding layout. | UI-only diff evidence. |
| `apps/web/src/shared/branding/ProductBranding.tsx` M | `40-42`; `tenantLogoSrc` | Adds tenant logo source resolution. | Branding/UI effect. |
| `apps/web/src/shared/router/AppRouter.tsx` M | `20-21` | Adds route handling. | UI routing effect. |
| `docs/internal/PLATFORM_FUTURE_ITEMS.md` A | `1-3` | Adds future-item documentation. | Documentation only. |
| `packages/core/src/schemas.ts` M | `54-58`, `1347`; tenant/conversation schemas | Adds tenant profile and conversation schema fields. | Shared data-model and persistence effect. |
| `packages/core/src/types.ts` M | `65-69`, `1472`; `Tenant`, `ConversationRecord` | Adds matching shared type fields. | Shared data-model effect. |
| `packages/nexi/src/gateway.ts` M | `708-729`, `1255-1264`, `2097-2116`, `2204-2210`, `2987-2989`, `3469-3476`, `3573-3620`, `4011`, `4140-4148` | Changes client reference selection, phone detection, deterministic tools, and response construction. | Nexi client lookup/data-change behavior; `nexi-job-desk.test.mjs`. |
| `apps/web/public/assets/brand/owens-bluewater-wash-logo-transparent.png` A | Binary | PNG, 561,324 bytes, 1263×408, SHA-256 `2479DA76440C293668DFD1700866804667908F6D0A4ADC06AD021E320EC555C0`; referenced by tenant branding resolution. | Static tenant branding asset; uncertainty: exact originating source is not established by the commit. |

Known uncertainty: this map describes checkpoint diff evidence, not observed production behavior. No additional source comments were added in this job.
