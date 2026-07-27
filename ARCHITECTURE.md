# ARCHITECTURE

This document explains the current modular architecture for the target integration worktree and the rules that keep parallel feature work from colliding.

## Intent [tag: intent]

The prime directive for this refactor is simple: three people should be able to work in three different product areas without all touching the same central files.

Phase A established that rule on the platform stream. The target integration branch now applies it to the server, the twelve migrated business/shared components, and the remaining live web modules. The web entry is now an 18-line bootstrap; auth, routing, Nexi, NexCam/NexDocs, Platform, NexReach, and queue surfaces have named owners.

## Phase A Shape [tag: phase-a]

- `apps/web/src/main.tsx` is bootstrap-only.
- `apps/server/src/server.ts` is bootstrap-only.
- Web features live under `apps/web/src/features/<feature>/...`.
- Server features register themselves through feature-owned `module.ts` files.
- Shared edits are limited to a small allowlist instead of the old "everything lands in main/server" pattern.

## Shared Allowlist [tag: shared-allowlist]

These are the files and layers that are allowed to be shared on purpose.

### Web shared layers [tag: web-shared]

- Auth and session: `apps/web/src/shared/auth/*`
- Router: `apps/web/src/shared/router/*`
- App shell: `apps/web/src/shared/shell/*`
- Design tokens and primitives: `apps/web/src/shared/styles/*`, `apps/web/src/shared/ui/*`
- Telemetry seam: `apps/web/src/shared/telemetry/*`
- Typed contracts: `apps/web/src/shared/contracts/*`
- Legacy root-level NexOps composition/helpers: the exact files printed by `scripts/check-component-collisions.mjs`; these include Home, Requests, deferred overlays, navigation/header, branding, intake, communications, NexDocs composition, and UI-kit files. This allowlist is debt, not a destination, and the gate fails if a new root-level web file is added without classification.

If a UI change does not belong to one of those buckets, it should usually live inside a feature folder.

### Server shared layers [tag: server-shared]

- Executable listener: `apps/server/src/server.ts`
- Integrated dependency composition: `apps/server/src/composeServerApp.ts`
- Persistence policy and reusable runtime assembly: `apps/server/src/app/*`
- Core non-feature registrars: `apps/server/src/core/*`, `apps/server/src/auth/localDevRoutes.ts`
- Component route/tool manifests: `apps/server/src/modules/nexops/areas/*/components/*/server/*`
- Integrated Nexi registration: `apps/server/src/nexi/integratedRoutes.ts`

If a route or tool belongs to a product area, the code should live in that product area's folder and connect through its `module.ts`.

## Web Composition [tag: web]

### Entry flow [tag: web-entry]

The intended `apps/web/src/main.tsx` flow does only three things:

1. Load shared base CSS and primitives.
2. Render `AppBootstrap`.
3. Hand off to shared auth and routing.

The integrated branch now has this shape. `main.tsx` is 18 lines and contains no feature implementation. `shared/app/AppBootstrap.tsx` starts the session boundary and `shared/router/AppRouter.tsx` selects the owning route. Product subroutes stay with their product feature.

### Feature convention [tag: web-features]

Each web feature follows the same ownership shape:

- `api/` for fetch and transport code
- `components/` for rendered UI
- `hooks/` for feature state
- `routes/` for feature-owned route composition when needed
- `styles/` for co-located CSS
- `utils/` for feature-local helpers

Current web owners include:

- `shared/auth/` owns sign-in, Firebase session loading, and access gating.
- `features/operatorContext/` owns signed-in tenant/user/role claim resolution shared by product modules.
- `features/nexi/areas/chat/` and `features/nexi/areas/voice/` independently own chat and voice behavior.
- `features/nexcam/areas/*` owns capture and NexCam overview; `features/nexdocs/areas/*` owns checklist, media, and report surfaces composed into that workspace.
- `features/visits/components/visitCore/` is the single schedule/visit owner.
- `features/platform/`, `features/platformOverview/`, and `features/tenantOverview/` separately own routing, plan summary, and tenant administration.
- `features/nexreach/areas/reputation/` owns the live reputation UI.
- `features/approvalQueue/`, `features/contentQueue/`, and `features/queueShared/` own the two queue surfaces and their deliberately shared visual primitives.
- `features/clients/`, `features/quotes/`, `features/jobs/`, `features/visits/`, `features/settings/`, and `features/invoices/` contain the real migrated NexOps component surfaces, not placeholder landings.

### Phase B route ownership [tag: web-phase-b-routes]

Phase B pushes more routing responsibility down into features instead of keeping it in shared files.

- `shared/router/AppRouter.tsx` selects the top-level authenticated product route and contains no product implementation.
- `features/nexi/areas/chat/components/NexiStandaloneChat.tsx` owns the Nexi workspace mount and composes the voice hook.
- `features/visits/components/visitCore/NexOpsSchedulePage.tsx` owns the scheduling workspace mount.
- `features/platform/routes/PlatformRoute.tsx` is only the top-level `/platform` subtree handoff.
- `features/platform/routes/platformSubroutes.tsx` is the intentional allowlist file for choosing between `/platform`, `/platform/clients`, `/platform/quotes`, `/platform/jobs`, `/platform/settings`, and `/platform/invoices`.

This means deeper product routes can move without editing `shared/router/AppRouter.tsx`. Shared router decides only "ops surface" versus "platform surface." The platform feature owns everything under `/platform/*`.

### Styling rule [tag: web-styles]

The target is to stop product components from adding rules to the global `apps/web/src/styles.css` file and to shrink it as legacy shared shell rules are touched.

The replacement strategy is:

- tiny shared base CSS for resets and tokens
- tiny shared primitives for repeated atoms
- feature CSS imported by the feature that owns it

The migrated components and eight continuation areas now own their component-specific CSS. The integrated branch still carries 4,468 lines of shared/legacy NexOps shell styling, including older Request and Home rules outside this continuation's extraction list. New component styling belongs in the owner folder; the global file is an explicit shared allowlist debt, not evidence that the extracted owners share implementation files.

## Server Composition [tag: server]

### Entry flow [tag: server-entry]

`apps/server/src/server.ts` now only:

1. imports the composed app
2. exports the app for tests
3. starts the listener outside test mode

`apps/server/src/composeServerApp.ts` constructs dependencies and invokes registrars. It does not own feature handler bodies.

Each component registrar accepts the shared runtime context type but destructures only the dependencies used by that component's handlers. The context is the composition boundary; it is not permission to copy the complete dependency list into every registrar. This keeps local coupling visible and repository lint clean.

### Runtime assembly [tag: server-runtime]

The integrated composition root builds the long-lived runtime pieces in one place. `apps/server/src/app/persistencePolicy.ts` is the shared fail-closed policy, while `apps/server/src/app/runtime.ts` remains the reusable smaller runtime for manifest-driven surfaces and tests.

- approval queue
- comms rail
- repositories
- event bus
- platform repository and storage
- web dist path

This keeps construction concerns separate from feature registration concerns.

### Module manifest [tag: server-modules]

`apps/server/src/modules/manifest.ts` is the additive registry for the smaller manifest-driven server surface. The integrated composition root invokes feature registrars directly because it carries the complete dependency graph. CRM itself is further decomposed through component manifests, so route, tool, repository, approval, and lifecycle implementations remain component-owned.

Each feature owns a `module.ts` file that can do two things:

- register Express routes
- provide Nexi tools for that feature

Current server modules:

- `crm/module.ts`
- `content/module.ts`
- `scheduling/module.ts`
- `fielddocs/module.ts`
- `platform/module.ts`
- `comms/module.ts`

### Nexi tool registration [tag: nexi-tools]

`apps/server/src/nexi/nexiRoutes.ts` no longer carries feature tool implementations or the integrated tool list.

Instead:

- CRM component manifests collect component-owned tools.
- `nexi/integratedRoutes.ts` assembles feature providers for each authorized request.
- `nexiRoutes.ts` focuses on message handling and final tool execution.

This is the key change that stops `nexiRoutes.ts` from becoming the permanent choke point for every new capability.

## Ownership Map [tag: ownership-map]

Use this section when deciding where code belongs.

- Sign-in, Firebase session load, or auth gate copy: `apps/web/src/shared/auth/*`
- Route selection between ops and platform: `apps/web/src/shared/router/*`
- Signed-in tenant and operator claim resolution: `apps/web/src/features/operatorContext/*`
- Nexi chat UI, message flow, media lightbox: `apps/web/src/features/nexi/areas/chat/*`
- Nexi voice state and controls: `apps/web/src/features/nexi/areas/voice/*`
- NexCam capture and workspace controller: `apps/web/src/features/nexcam/areas/capture/*`
- NexCam overview: `apps/web/src/features/nexcam/areas/overview/*`
- NexDocs checklist, media, and reports: `apps/web/src/features/nexdocs/areas/{checklists,media,reports}/*`
- Schedule board UI and fetch logic: `apps/web/src/features/visits/components/visitCore/*`
- Platform hero and plan summary UI: `apps/web/src/features/platformOverview/*`
- Tenant table, adapter status, export, and backup UI: `apps/web/src/features/tenantOverview/*`
- Ops workspace composition: `apps/web/src/features/nexopsShell/*` (shared allowlist only)
- Platform subtree route ownership: `apps/web/src/features/platform/routes/*`
- NexReach reputation UI: `apps/web/src/features/nexreach/areas/reputation/*`
- Approval and Content queue UI: `apps/web/src/features/{approvalQueue,contentQueue}/*`
- Shared queue visual primitives: `apps/web/src/features/queueShared/*`
- Client browser surface: `apps/web/src/features/clients/*`
- Quote browser surface: `apps/web/src/features/quotes/*`
- Job browser surface: `apps/web/src/features/jobs/*`
- Settings browser surface: `apps/web/src/features/settings/*`
- Invoice browser surface: `apps/web/src/features/invoices/*`
- Contact implementation: `apps/{web,server}/src/**/components/contact/*`
- Quote Templates implementation: `apps/{web,server}/src/**/components/quoteTemplates/*`
- Quote Engine implementation: `apps/{web,server}/src/**/components/quoteEngine/*`
- Job Core implementation: `apps/{web,server}/src/**/components/jobCore/*`
- Visit Core implementation: `apps/{web,server}/src/**/components/visitCore/*`
- Invoice Structure implementation: `apps/{web,server}/src/**/components/invoiceStructure/*`
- Payment Rails implementation: `apps/{web,server}/src/**/components/paymentRails/*`
- Catalog implementation: `apps/{web,server}/src/**/components/catalog/*`
- Tenant Config implementation: `apps/{web,server}/src/**/components/tenantConfig/*`
- Shared Address/Location: `packages/shared/src/addressLocation.ts`, `apps/server/src/shared/addressLocation/*`
- Shared Document Rendering: `apps/server/src/shared/documentRendering/*`
- Shared Numbering: `packages/shared/src/numbering.ts`, `apps/server/src/shared/numbering/*`
- Server executable and composition: `apps/server/src/server.ts`, `apps/server/src/composeServerApp.ts`
- Non-feature server utility endpoints: `apps/server/src/core/*`
- Feature routes and Nexi tool attachments: the owning server feature folder plus its `module.ts`

## How To Extend [tag: extension-guide]

### Add a new web feature

1. Create `apps/web/src/features/<feature>/`.
2. Put fetches, hooks, components, and styles inside that folder.
3. Add a route or composition point through `shared/router` or an owning feature route.
4. Do not add feature behavior to `main.tsx`; it is a bootstrap-only boundary.

### Add a new server feature

1. Build the feature inside `apps/server/src/<feature>/`.
2. Create `<feature>/module.ts`.
3. Register routes in that module.
4. If the feature contributes Nexi tools, return them from the module's `nexiToolProviders`.
5. Add the module to `apps/server/src/modules/manifest.ts`.

Do not add new feature behavior directly to `server.ts`.
Do not hardcode new tool arrays in `nexiRoutes.ts`.

## Phase A Notes [tag: phase-a-notes]

- The end-to-end proof includes Nexi chat/media leaving `main.tsx`, the entry shrinking to 18 lines, and all 28 component ownership sets passing 378 pairwise collision checks.
- Any future change that expands the shared allowlist should update this document and `DECISIONS.md` in the same commit.

## Phase B Notes [tag: phase-b-notes]

- Tenant and role claims are resolved once by `features/operatorContext/resolveOperatorContext.ts`; NexOps, Nexi, NexCam, and NexReach consume that shared result.
- Scheduling is mounted through Visit Core so schedule routing changes do not reopen the ops workspace file.
- The old single `features/platform/components/PlatformConsole.tsx` file is gone. Platform overview and tenant overview now live in separate features with separate fetch hooks.
- Historical note: Phase B first created placeholder ownership seams. E4 has now replaced those placeholders with the integrated CRM surfaces for Contact, Quotes, Jobs, Visits, Settings, and Invoices.
- Nexi voice behavior now lives under `features/nexi/areas/voice/` and is composed by chat without sharing implementation files.

## Phase C Notes [tag: phase-c-notes]

- `server.ts` remains listener-only. Nexi request authorization and persistence selection are now isolated in `nexi/access.ts` and `nexi/stores.ts`; `nexiRoutes.ts` composes those seams with feature tool providers.
- Tenant selection never falls back to a literal tenant. Firebase users must carry `tenantId` or `tenant_id` claims. A platform operator may explicitly select a tenant; an ordinary operator may only use the tenant in their claim. Auth-disabled development requests must include `tenantId` or an explicit `TENANT_ID` environment setting.
- CRM updates are tenant-bound at the repository boundary. The adapter passes its tenant to every update, repository reads validate the stored tenant before write, tenant-ID mutation is rejected, and write paths reject document-ID collisions owned by another tenant. This protects the high-risk admin-SDK CRM paths that bypass Firestore rules.
- The executable `server.ts` is listener-only. `composeServerApp.ts` constructs dependencies and invokes owner registrars; system, local-auth, native-media, ApprovalQueue, feature routes, and integrated Nexi tool composition live in their owning registrar files.
- ApprovalQueue, Content, and Scheduling use their Firestore repositories whenever Firebase Admin is configured. If any required durable repository is unavailable, startup fails closed unless an explicitly non-production runtime sets `ALLOW_IN_MEMORY_PERSISTENCE=true`. Production must omit that override.
- Firestore compound indexes are checked in for all ten current multi-field query shapes. `scripts/check-firestore-indexes.mjs` makes that deployment contract a static verification gate.
- `check-tenancy` remains a static guard, but direct document-read chains now require a tenant-boundary signal. Runtime proof comes from `tenant-isolation.test.mjs`, which exercises rejected cross-tenant CRM updates, tenant-ID mutation, and a mismatched Tenant Config document.

### Phase C Remaining Work [tag: phase-c-remaining]

- Extend the same adapter-scoped write contract to the Field Docs repository and add emulator-backed Admin SDK boundary tests. The current CRM boundary is the completed highest-risk path; Firestore rules do not constrain Admin SDK code.
- Existing Firebase users must be provisioned with a `tenantId` (or `tenant_id`) custom claim before they can use the operations workspace. This is an operational provisioning step, not a tenant-selection fallback.
