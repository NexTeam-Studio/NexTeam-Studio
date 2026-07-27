# NexTeam: How It Fits Together and Why

This guide explains the shape of NexTeam in ordinary language. It is for people who need to understand where work belongs, why the project is divided this way, and how to make a safe change without needing to read every file first.

For code-level ownership, route names, and the exact technical rules, see [ARCHITECTURE.md](ARCHITECTURE.md).

## The Big Picture

NexTeam is arranged like a set of connected work areas instead of one large application file. The web app is what people see and use. The server handles requests, data, and connections to outside services. Each product area has its own home so that improving scheduling does not accidentally disturb chat, billing, or tenant administration.

### How It Works

Most work starts in a feature folder. A feature owns its screen, the small pieces on that screen, its data requests, and its styling. On the server, a feature owns its routes and any assistant capabilities it contributes. Small central files connect those pieces together.

### Why It Is This Way

This lets several people work at the same time with fewer merge conflicts and less accidental coupling. It also makes it easier to explain where a change belongs: add it to the feature that owns the outcome, not to a catch-all file.

## Web Features

The web app groups visible product areas under `apps/web/src/features/`.

### How It Works

- Auth/Session owns sign-in and decides when a real signed-in session is ready.
- Nexi Chat owns the conversation, message flow, and photo viewing; Nexi Voice separately owns listening and speech behavior.
- Visit Core owns the calendar board and scheduling information.
- Operator Context reads the signed-in person's tenant and role once for every product area.
- NexCam owns capture; NexDocs separately owns checklists, media, and reports displayed inside the capture workspace.
- Platform Overview owns plan and platform summary information.
- Tenant Overview owns tenant rows, service status, exports, and backups.
- NexReach owns reputation work. Approval Queue and Content Queue each own their own review surface while sharing only small visual building blocks.
- The Ops Workspace places these areas together without owning their product behavior.

Each feature can have its own components, data calls, local state, routes, and styling. The app entry point is now only 18 lines and starts the application; it no longer contains product behavior.

### Why It Is This Way

People can improve one area without needing to understand or edit every other screen. It also keeps a visual adjustment to chat from unexpectedly changing the calendar or platform administration experience.

## NexOps Areas

Clients, Quotes, Jobs, Settings, and Invoices each have their own web feature home.

### How It Works

Each area now contains its real browser interface and its matching server behavior. Large business areas are divided again into components when two kinds of work change for different reasons. For example, invoice wording belongs to Invoice Structure, while taking and refunding payments belongs to Payment Rails.

### Why It Is This Way

The next person changing clients, quotes, jobs, visits, settings, or invoices starts in the owning component instead of a shared platform overview or app entry file. The checked collision gate proves those implementation file sets do not overlap.

## Server Features and Registrars

The server has a small startup file and a list of feature registrars.

### How It Works

The startup file only begins listening. A separate composition file creates repositories and services, then calls each feature registrar. System, local sign-in, media, approvals, business routes, and Nexi tool assembly have named registrars. Inside NexOps, each component supplies its own routes, assistant tools, database methods, approval operations, and lifecycle rules when it needs them.

### Why It Is This Way

Adding a new capability should be additive. A new feature should bring its own wiring instead of growing a central server file that everyone has to touch.

The server and web entry have reached this target. Some deliberately shared shell and older Request/Home styling remains on the explicit allowlist and must not be expanded by new feature work.

## The Four Ownership Levels

The migration uses four levels to describe where work belongs: Module, Area, Component, and Surface.

### How It Works

A module is a product people recognize, such as NexOps. An area is a major workspace inside it, such as Quotes or Invoices. A component is one independently changing responsibility, such as Quote Engine or Payment Rails. A surface is the actual screen, route, assistant tool, database store, document, or test through which that responsibility appears.

### Why It Is This Way

The levels prevent a folder move from being mistaken for real separation. A component is considered separated only when its visible UI and its supporting server behavior have the same owner.

## Contact

### How It Works

Contact owns client records, properties, the roster, create/edit screens, mobile and desktop profiles, its routes, assistant tools, database methods, approval handling, styles, and tests.

### Why It Is This Way

Changing a customer profile should not require touching quote, job, or billing implementation files. Shared navigation can open a contact, but Contact owns what the person sees and edits there.

## Quote Templates

### How It Works

Quote Templates owns reusable quote layouts, defaults, validation, its editor, and the server methods that load and save templates. Quote Engine consumes templates through a small typed contract.

### Why It Is This Way

A template is reusable configuration, while a quote is a customer transaction. Separating them lets one person improve template setup while another changes the quote workflow.

## Quote Engine

### How It Works

Quote Engine owns quote drafting, totals, status changes, approvals, customer wording, PDF and portal output, the real quote workspace, routes, assistant tools, and tests.

### Why It Is This Way

The full life of a quote belongs together, but reusable catalog items and template editing do not. Those enter through typed, limited seams instead of being reimplemented inside Quotes.

## Job Core

### How It Works

Job Core owns job records, job status, job actions, the Jobs workspace, approval and lifecycle policy, and job persistence. It asks Visit Core to perform scheduling work through a stable service boundary.

### Why It Is This Way

A job can exist without a scheduled visit, and visits can move many times without changing the job's core meaning. Keeping those responsibilities separate prevents calendar work from destabilizing job policy.

## Visit Core

### How It Works

Visit Core owns the Schedule workspace, visit creation and movement, completion, reminders, technician timing, visit storage, routes, tools, styles, and tests.

### Why It Is This Way

Scheduling changes frequently and has its own timing and assignment rules. It should be possible to improve the calendar or reminders without editing Job Core.

## Invoice Structure

### How It Works

Invoice Structure owns invoice lines, totals, discounts, tax, terms, payment schedules, invoice status policy, customer documents, the invoice workspace, and its server lifecycle.

### Why It Is This Way

An invoice defines what is owed and what the customer receives. The mechanics of collecting that money are a separate risk area and belong to Payment Rails.

## Payment Rails

### How It Works

Payment Rails owns Stripe, PayPal and Venmo seams, Tap to Pay, saved cards, refunds, deposits, credits, receipts, recovery actions, payment records, and payment-specific controls.

### Why It Is This Way

Provider integrations and money movement carry different risk from invoice wording or layout. A payment-provider change should not require editing the invoice document implementation.

## Catalog

### How It Works

Catalog owns reusable service and product items, their normalization, and the picker/editor components. Settings can edit the catalog; Quotes and Invoices receive a read-only picker.

### Why It Is This Way

There must be one source of reusable items. Limiting writes to Settings prevents quote and invoice screens from creating competing catalog behavior.

## Tenant Config

### How It Works

Tenant Config owns the Settings workspace, numbering preferences, communication templates, tenant settings routes, assistant tools, and settings storage. It composes the Catalog and Quote Templates editors as children.

### Why It Is This Way

Tenant-wide choices need one accountable home. Child editors can change independently while Tenant Config remains responsible for saving the combined tenant settings record safely.

## Address and Location

### How It Works

The shared Address/Location component defines one address shape, parsing and formatting, map links, geocoding results, and distance-provider seams. Business components consume it without owning duplicate address logic.

### Why It Is This Way

An address must mean the same thing in Contact, intake, jobs, visits, and mobile capture. This is intentional shared infrastructure, not an accidental shared business file.

## Document Rendering

### How It Works

Document Rendering provides safe HTML, PDF writing, and shared portal framing. Quote Engine and Invoice Structure still own their own customer wording and line layouts.

### Why It Is This Way

The low-level rendering machinery should be reused, but sharing business wording would couple quotes and invoices again. The boundary shares the engine, not the meaning.

## Numbering

### How It Works

Numbering safely reserves and formats tenant-specific request, quote, job, invoice, and receipt numbers. Tenant Config supplies prefixes and widths; Numbering owns concurrency and sequence advancement.

### Why It Is This Way

Parallel work must never issue duplicate customer-facing numbers. One shared sequence service solves that cross-area rule without making it the owner of each document.

## Auth, Session, and Operator Context

### How It Works

Auth/Session handles sign-in and waits for Firebase to establish the user. Operator Context then reads the tenant, user, and role attached to that sign-in. NexOps, Nexi, NexCam, and NexReach all use that same answer instead of interpreting access details separately.

### Why It Is This Way

Sign-in is shared infrastructure, not a product module. Resolving access in one place prevents two screens from giving the same person different permissions or silently choosing different tenants.

## Nexi Chat and Voice

### How It Works

Nexi Chat owns the conversation screen, message history, media display, and chat requests. Nexi Voice owns listening, speaking, and voice-session behavior and is composed into chat through a narrow hook.

### Why It Is This Way

Conversation design and voice technology can change independently. A voice-provider change should not require editing the full chat screen, and a chat-layout change should not disturb audio behavior.

## NexCam and NexDocs

### How It Works

NexCam owns capture and the capture workspace. NexDocs owns the checklist, media-review, and report surfaces that NexCam displays. A shared workspace controller remains an explicit composition seam because those tabs coordinate one active field session.

### Why It Is This Way

Taking field evidence and managing documents are related user journeys but different responsibilities. Separate owners let teams improve capture, checklists, media, or reports without editing the other surfaces.

## Platform and Tenant Overview

### How It Works

Platform Routing chooses the correct page below `/platform`. Platform Overview owns plan and product summaries. Tenant Overview owns tenant rows, connection status, backups, and exports.

### Why It Is This Way

Navigation, product presentation, and tenant administration change for different reasons. Keeping them separate prevents a tenant-table change from reopening the route switch or the platform landing design.

## NexReach Reputation

### How It Works

NexReach owns its reputation screen, data-loading hook, and styling. It uses the shared operator context for access but does not import implementation from NexOps or Nexi.

### Why It Is This Way

Reputation work is its own product workflow. It should be safe to improve review handling without colliding with chat, scheduling, or CRM work.

## Approval and Content Queues

### How It Works

Approval Queue owns the live approval-review screen. Content Queue owns its extracted content-review screen but remains unmounted until a product navigation decision is made. They share only a small queue-primitives stylesheet.

### Why It Is This Way

The queues have similar visual patterns but different records and actions. Sharing only the visual building blocks avoids duplicating design while keeping behavior independently editable. Leaving Content Queue unmounted avoids inventing a product route during an architecture refactor.

## Tenant Isolation

A tenant is one customer or isolated workspace. One tenant must never see or change another tenant's information.

### How It Works

Signed-in operators receive their tenant from their Firebase access claim. Normal operators can use only that tenant. Platform operators must state which tenant they are working with. Local API development can use an explicit `tenantId` or a deliberately configured `TENANT_ID`; it never guesses one.

The CRM data layer carries that tenant choice into every update. Before a direct server-side database write, it checks that the existing record belongs to the same tenant. Attempts to update another tenant's record, change a record's tenant, or reuse another tenant's document ID are rejected.

### Why It Is This Way

Firebase's server administration tools can bypass ordinary browser security rules. The server therefore needs its own tenant checks at the data boundary, not just at the screen or route level.

## Persistence and Environments

Some early modules still store information only in memory while running locally.

### How It Works

ApprovalQueue, Content, and Scheduling use Firebase storage when Firebase Admin is configured. If that durable storage is unavailable, the server refuses to start by default. A local or staging environment may deliberately opt into temporary memory storage with `ALLOW_IN_MEMORY_PERSISTENCE=true`; true production must omit that override.

### Why It Is This Way

Memory storage is useful for fast local experiments, but it disappears on restart. Refusing a true production start is safer than appearing to save approvals, content, or visits when the data would be lost.

## How To Make a Change

1. Decide which customer-facing outcome is changing: chat, calendar, tenant administration, CRM, content, or another feature.
2. Start in that feature's folder and keep the change there when possible.
3. Add a server registrar only if the feature needs a new server route or assistant capability.
4. Treat tenant information as required context, never as a convenient default.
5. Run the build and tests before handing work off.

### Why This Checklist Matters

It keeps changes small, reviewable, and safe to merge with parallel work. It also keeps the system ready to become a white-label platform rather than a collection of one-off customer-specific shortcuts.

## What Is Still Coming

Field Docs still needs the same complete tenant-bound server-side write proof already applied to the highest-risk CRM paths, including emulator-backed Admin SDK boundary tests. This is tracked in [BUILDSTATE.md](BUILDSTATE.md); the detailed engineering follow-up is in [ARCHITECTURE.md](ARCHITECTURE.md).
