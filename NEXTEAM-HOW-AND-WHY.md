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

- Nexi owns the chat experience, message flow, and photo viewing.
- Scheduling owns the calendar board and scheduling information.
- Operator Context reads the signed-in person's tenant and role.
- Platform Overview owns plan and platform summary information.
- Tenant Overview owns tenant rows, service status, exports, and backups.
- The Ops Workspace places Nexi and Scheduling together without owning either product area itself.

Each feature can have its own components, data calls, local state, routes, and styling. The app entry point only starts the application; it is not where new product behavior should be added.

### Why It Is This Way

People can improve one area without needing to understand or edit every other screen. It also keeps a visual adjustment to chat from unexpectedly changing the calendar or platform administration experience.

## NexOps Areas

Clients, Quotes, Jobs, Settings, and Invoices each have their own web feature home.

### How It Works

Each area has a dedicated route, component, and style file. These are landing seams: clear places for the richer browser interfaces to arrive when that work is merged from the CRM stream. They do not yet replace the full CRM user interfaces.

### Why It Is This Way

The next person building client, quote, or job screens will not need to edit a shared platform overview file. That keeps five independently changing areas from colliding with one another.

## Server Features and Registrars

The server has a small startup file and a list of feature registrars.

### How It Works

The startup file creates the app and begins listening. Each server feature, such as CRM, scheduling, content, field documents, communications, or platform administration, has a small registrar that attaches its own routes and optional Nexi tools. A manifest gathers those registrars in one intentional list.

### Why It Is This Way

Adding a new capability should be additive. A new feature should bring its own wiring instead of growing a central server file that everyone has to touch.

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

The server now refuses to start by default until durable repositories exist for ApprovalQueue, Content, and Scheduling. Local development and staging must explicitly set `ALLOW_IN_MEMORY_PERSISTENCE=true` while they use the temporary in-memory stores. True production must not set that override.

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

ApprovalQueue, Content, and Scheduling need durable database repositories before true production mode can be enabled. Field Docs also needs the same tenant-bound server-side write protection already applied to CRM. These are tracked in [BUILDSTATE.md](BUILDSTATE.md); the detailed engineering follow-up is in [ARCHITECTURE.md](ARCHITECTURE.md).
