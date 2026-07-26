# ARCHITECTURE

This document explains the current modular architecture for the platform worktree and the rules that keep parallel feature work from colliding.

## Intent [tag: intent]

The prime directive for this refactor is simple: three people should be able to work in three different product areas without all touching the same central files.

Phase A establishes that rule by shrinking the top-level entry files and pushing feature logic back into feature-owned folders.

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

If a UI change does not belong to one of those buckets, it should usually live inside a feature folder.

### Server shared layers [tag: server-shared]

- App bootstrap: `apps/server/src/app/createServerApp.ts`
- Runtime assembly: `apps/server/src/app/runtime.ts`
- Core non-feature routes: `apps/server/src/core/registerCoreRoutes.ts`
- Module manifest: `apps/server/src/modules/*`
- Nexi tool registry seam: `apps/server/src/nexi/toolRegistry.ts`

If a route or tool belongs to a product area, the code should live in that product area's folder and connect through its `module.ts`.

## Web Composition [tag: web]

### Entry flow [tag: web-entry]

`apps/web/src/main.tsx` now does only three things:

1. Load shared base CSS and primitives.
2. Render `AppBootstrap`.
3. Hand off to shared auth and routing.

This matches the intended thin-shell pattern and removes feature logic from the entry file.

### Feature convention [tag: web-features]

Each web feature follows the same ownership shape:

- `api/` for fetch and transport code
- `components/` for rendered UI
- `hooks/` for feature state
- `routes/` for feature-owned route composition when needed
- `styles/` for co-located CSS
- `utils/` for feature-local helpers

Current Phase A features:

- `features/nexi/` owns chat, health state, photo handling, and lightbox UI.
- `features/scheduling/` owns schedule fetches, date/view state, and calendar board UI.
- `features/operatorContext/` owns the signed-in operator's tenant and role context.
- `features/platformOverview/` owns the platform hero and plan cards.
- `features/tenantOverview/` owns tenant rows, adapter badges, export links, and backup actions.
- `features/opsWorkspace/` owns the composed workspace route for the operations screen.
- `features/clients/`, `features/quotes/`, `features/jobs/`, `features/settings/`, and `features/invoices/` are now the dedicated browser landing seams for the NexOps surfaces that will follow.

### Phase B route ownership [tag: web-phase-b-routes]

Phase B pushes more routing responsibility down into features instead of keeping it in shared files.

- `features/opsWorkspace/routes/OpsWorkspaceRoute.tsx` is now only a workspace composition shell.
- `features/nexi/routes/NexiWorkspaceRoute.tsx` owns the Nexi workspace mount.
- `features/scheduling/routes/SchedulingWorkspaceRoute.tsx` owns the scheduling workspace mount.
- `features/platform/routes/PlatformRoute.tsx` is only the top-level `/platform` subtree handoff.
- `features/platform/routes/platformSubroutes.tsx` is the intentional allowlist file for choosing between `/platform`, `/platform/clients`, `/platform/quotes`, `/platform/jobs`, `/platform/settings`, and `/platform/invoices`.

This means deeper product routes can move without editing `shared/router/AppRouter.tsx`. Shared router decides only "ops surface" versus "platform surface." The platform feature owns everything under `/platform/*`.

### Styling rule [tag: web-styles]

The old global `apps/web/src/styles.css` file is gone.

The replacement strategy is:

- tiny shared base CSS for resets and tokens
- tiny shared primitives for repeated atoms
- feature CSS imported by the feature that owns it

That means a Nexi visual change lives in `features/nexi/styles/nexi.css`, not in a global style bucket that every feature has to edit.

## Server Composition [tag: server]

### Entry flow [tag: server-entry]

`apps/server/src/server.ts` now only:

1. creates the app through `createServerApp`
2. exports the app for tests
3. starts the listener outside test mode

All assembly logic moved out of the entry file.

### Runtime assembly [tag: server-runtime]

`apps/server/src/app/runtime.ts` builds the long-lived runtime pieces in one place:

- approval queue
- comms rail
- repositories
- event bus
- platform repository and storage
- web dist path

This keeps construction concerns separate from feature registration concerns.

### Module manifest [tag: server-modules]

`apps/server/src/modules/manifest.ts` is now the additive registry for server features.

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

`apps/server/src/nexi/nexiRoutes.ts` no longer carries a hardcoded `extraTools` list.

Instead:

- `modules/manifest.ts` collects feature-owned tool providers
- `nexi/toolRegistry.ts` resolves them per request and tenant
- `nexiRoutes.ts` focuses on auth, tenant load, message handling, and final tool filtering

This is the key change that stops `nexiRoutes.ts` from becoming the permanent choke point for every new capability.

## Ownership Map [tag: ownership-map]

Use this section when deciding where code belongs.

- Sign-in, Firebase session load, or auth gate copy: `apps/web/src/shared/auth/*`
- Route selection between ops and platform: `apps/web/src/shared/router/*`
- Signed-in tenant and operator claim resolution: `apps/web/src/features/operatorContext/*`
- Nexi chat UI, message flow, media lightbox: `apps/web/src/features/nexi/*`
- Schedule board UI and fetch logic: `apps/web/src/features/scheduling/*`
- Platform hero and plan summary UI: `apps/web/src/features/platformOverview/*`
- Tenant table, adapter status, export, and backup UI: `apps/web/src/features/tenantOverview/*`
- Ops workspace composition: `apps/web/src/features/opsWorkspace/*`
- Platform subtree route ownership: `apps/web/src/features/platform/routes/*`
- Client browser surface: `apps/web/src/features/clients/*`
- Quote browser surface: `apps/web/src/features/quotes/*`
- Job browser surface: `apps/web/src/features/jobs/*`
- Settings browser surface: `apps/web/src/features/settings/*`
- Invoice browser surface: `apps/web/src/features/invoices/*`
- Server bootstrap and middleware assembly: `apps/server/src/app/*`
- Non-feature server utility endpoints: `apps/server/src/core/*`
- Feature routes and Nexi tool attachments: the owning server feature folder plus its `module.ts`

## How To Extend [tag: extension-guide]

### Add a new web feature

1. Create `apps/web/src/features/<feature>/`.
2. Put fetches, hooks, components, and styles inside that folder.
3. Add a route or composition point through `shared/router` or an owning feature route.
4. Avoid adding new behavior to `main.tsx`.

### Add a new server feature

1. Build the feature inside `apps/server/src/<feature>/`.
2. Create `<feature>/module.ts`.
3. Register routes in that module.
4. If the feature contributes Nexi tools, return them from the module's `nexiToolProviders`.
5. Add the module to `apps/server/src/modules/manifest.ts`.

Do not add new feature behavior directly to `server.ts`.
Do not hardcode new tool arrays in `nexiRoutes.ts`.

## Phase A Notes [tag: phase-a-notes]

- The real end-to-end extraction proof in this phase is the Nexi chat and media UI leaving `main.tsx` and taking its styles with it.
- Any future change that expands the shared allowlist should update this document and `DECISIONS.md` in the same commit.

## Phase B Notes [tag: phase-b-notes]

- The hardcoded workspace tenant is no longer chosen inside `features/opsWorkspace/routes/OpsWorkspaceRoute.tsx`; that route now reads from `features/operatorContext/hooks/useOperatorContext.ts`.
- Scheduling is now mounted through `features/scheduling/routes/SchedulingWorkspaceRoute.tsx` so schedule routing changes do not reopen the ops workspace file.
- The old single `features/platform/components/PlatformConsole.tsx` file is gone. Platform overview and tenant overview now live in separate features with separate fetch hooks.
- The NexOps browser routes exist now as ownership seams even though the richer CRUD UIs have not been merged into this worktree yet. That is intentional. The goal is to stop future Clients, Quotes, Jobs, Settings, and Invoices work from converging back into the shared platform overview code.
- Voice UI itself still lives only in the sibling `voice` worktree today. Phase B established the operator-context seam here first so a future voice merge lands in feature-owned files instead of shared shell code.

## Phase C Notes [tag: phase-c-notes]

- `server.ts` remains listener-only. Nexi request authorization and persistence selection are now isolated in `nexi/access.ts` and `nexi/stores.ts`; `nexiRoutes.ts` composes those seams with feature tool providers.
- Tenant selection never falls back to a literal tenant. Firebase users must carry `tenantId` or `tenant_id` claims. A platform operator may explicitly select a tenant; an ordinary operator may only use the tenant in their claim. Auth-disabled development requests must include `tenantId` or an explicit `TENANT_ID` environment setting.
- CRM updates are tenant-bound at the repository boundary. The adapter passes its tenant to every update, repository reads validate the stored tenant before write, tenant-ID mutation is rejected, and write paths reject document-ID collisions owned by another tenant. This protects the high-risk admin-SDK CRM paths that bypass Firestore rules.
- The server now fails closed by default while ApprovalQueue, Content, and Scheduling are backed only by in-memory stores. Local and staging work must explicitly set `ALLOW_IN_MEMORY_PERSISTENCE=true`; true production must not set that override until durable repositories are supplied.
- Firestore compound indexes are checked in for `usageLog(tenantId, createdAt)` and `conversations(tenantId, conversationId)`. The repository's other current queries use a single equality field and require no compound index.
- `check-tenancy` remains a static guard, but direct document-read chains now require a tenant-boundary signal. Runtime proof comes from `tenant-isolation.test.mjs`, which exercises rejected cross-tenant CRM updates and rejected tenant-ID mutation.

### Phase C Remaining Work [tag: phase-c-remaining]

- Implement Firestore-backed ApprovalQueue, Content, and Scheduling repositories before any production startup can be re-enabled.
- Extend the same adapter-scoped write contract to the Field Docs repository and add emulator-backed Admin SDK boundary tests. The current CRM boundary is the completed highest-risk path; Firestore rules do not constrain Admin SDK code.
- Existing Firebase users must be provisioned with a `tenantId` (or `tenant_id`) custom claim before they can use the operations workspace. This is an operational provisioning step, not a tenant-selection fallback.
