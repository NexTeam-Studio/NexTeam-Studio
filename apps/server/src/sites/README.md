# M8 Sites

This package builds tenant websites and the operator Job Desk appearance controls.

What it does:
- Generates a block-based `pool_leak` website for Aquatrace with hero, services, service area, gallery, reviews, compliance badges, article index, and lead form blocks.
- Renders the generated model into static HTML for the internal staging URL at `/sites/:slug`.
- Captures public lead form submissions into the tenant-scoped `leads` collection, emits `lead.received`, and queues an owner notification in ApprovalQueue only.
- Stores tenant-scoped Job Desk appearance settings so an owner/admin can ask Nexi to change chat colors without touching another tenant.

How it connects:
- `routes.ts` exposes site generation, static rendering, lead intake, lead review, and operator UI settings.
- `generator.ts` creates the block model and calls `renderer.ts` for static HTML.
- `repository.ts` keeps Firestore and in-memory storage behind the same interface.
- `nexiTools.ts` provides the `customizeOperatorUi` tool, registered only for OWNER/OFFICE_ADMIN AccessContext.

When something breaks, look first:
- Lead form not showing up: check `routes.ts` `/api/sites/:slug/leads`, then `repository.ts` `saveLead`.
- Site URL 404: check whether `/api/sites/:slug/generate` has run and saved a site with the same tenantId and slug.
- Owner notification missing: check the `ApprovalQueueService.create` call in `routes.ts`.
- Chat colors not changing: check `operatorUiPreferences/{tenantId}_job_desk` and the web app fetch to `/api/sites/operator-ui`.

Hard boundaries:
- Public site rendering is staging/internal only until Cloudflare/custom domain setup is approved.
- Lead follow-up never sends directly; it only creates an ApprovalQueue item.
- Site admin and Job Desk appearance writes require OWNER or OFFICE_ADMIN AccessContext.

