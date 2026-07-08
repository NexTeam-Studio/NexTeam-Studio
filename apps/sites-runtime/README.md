# Sites Runtime

M8 is the tenant website builder. The active runtime is server-owned for now: `apps/server/src/sites` generates block-based static HTML, stores tenant-scoped site records, serves internal staging pages at `/sites/:slug`, and accepts lead forms through `/api/sites/:slug/leads`.

Aquatrace's first target site uses the `pool_leak` theme and blocks for hero, services, service-area map, gallery, reviews, compliance badges, article index, and lead form. Custom domain and SSL work stay parked until the owner finishes Cloudflare setup.

Lead forms create native `leads` records, emit `lead.received`, and queue an owner notification for approval. They must not send email or SMS directly.

When something breaks, start with `apps/server/src/sites/routes.ts` for API behavior, `generator.ts` for block content, `renderer.ts` for HTML/CSS output, and `repository.ts` for Firestore or memory persistence.

