# NexTeam Session Hierarchy

Last updated: 2026-07-10 by build/nightly-integration-20260709

This is the pinned entry point for organizing Codex/Claude work by company, tenant, and feature lane. If a future session is unsure what it owns, it should start here before touching code.

## Hierarchy

```text
NEXTEAM
  platform
    m0-core
    m13-platform
    security-and-receipts
  tenants
    aquatrace
      nexi-routing
      nexops-crm
      scheduling
      nexshot-field-docs
      comms-campaigns
      nexreach-content-marketing
      reputation-gbp
      website
      mobile
      voice
      intake
    candela
      parked-low-voltage-fire-security
```

## Session Naming

Use this convention for thread titles, worktree names, and lane files when possible:

```text
NEXTEAM / {tenant-or-platform} / {module-lane} / {specific-task}
```

Examples:

- `NEXTEAM / Aquatrace / M7 Reputation GBP / OAuth production recon`
- `NEXTEAM / Platform / M13 Multi-user / role-gate design`
- `NEXTEAM / Aquatrace / NexShot Field Docs / report attachment pipeline`

## Always-Read Master Specs

Before building, changing, or claiming done on any Phase 1 product lane, open these two files first:

- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md` - NexOps business engine, NexPortal, lifecycle lane order, and mandatory ask-list protocol.
- `docs/specs/phase1/NEXOPS-BUILD-BLUEPRINT.md` - canonical NexOps build blueprint for CRM, intake, quoting, scheduling, client hub, billing, imports, permissions, and receipts.
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md` - NexShot field documentation, checklist templates, photo organization, and reports.

Locked naming:

- NexOps = business engine: CRM, quoting, scheduling, invoicing, payments.
- NexShot = field documentation: photos, checklists, reports.
- NexPortal = client-facing hub.
- NexReach = marketing engine: content, campaigns, reputation.
- Nexi = assistant; NexTeam = company/platform.
- Internal plumbing stays unbranded unless Chris approves a name.

## Lane File Template

Every active lane gets a file under `docs/sessions/lanes/`.

```md
# {Lane Name}

Last updated: YYYY-MM-DD by {session/worktree}

## Scope
What this lane owns.

## Allowed Touches
Files, modules, data rails, and receipts this lane may change.

## Do Not Touch
Boundaries that belong to other lanes or require owner approval.

## Current State
The latest verified truth, including blockers.

## Receipt Rules
What proof is required before this lane can claim done.

## Related Files
Primary files and docs future contributors should open first.
```

## Current Active Lanes

| Lane | File | Owner Scope |
|---|---|---|
| NexOps CRM foundation | `docs/sessions/lanes/aquatrace-nexops-crm.md` | Aquatrace business-engine client records, multi-site hierarchy, and history foundation. |
| NexShot Field Docs | `docs/sessions/lanes/aquatrace-nexshot-fielddocs.md` | Aquatrace photo organization, checklist templates, reports, and field-documentation receipts. |
| GBP/M7 investigation | `docs/sessions/lanes/aquatrace-m7-reputation-gbp.md` | Aquatrace Google Business Profile OAuth/reputation rail, approval-only replies, and GBP blockers. |
| Multi-user design | `docs/sessions/lanes/platform-m13-multi-user.md` | Tenant internal roles, subcontractor links, AccessContext, and role-aware module surfaces. |

## Rules

- Session placement is advisory, not a security boundary. Code must still enforce tenant and role access server-side.
- If a task crosses lanes, name the primary lane and list secondary lanes in the lane file before editing.
- Every lane file must be updated in the same commit when a session changes the lane's verified state.
- Large receipts stay out of git; commit pointer files to Firebase Storage objects instead.
- Tenant-facing behavior must pass the Part 9 reality gate before a module is called done.
