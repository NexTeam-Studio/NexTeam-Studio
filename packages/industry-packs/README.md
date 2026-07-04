# @nexteam/industry-packs

This package holds reusable, white-label industry data that other modules can depend on without hardcoding Aquatrace-specific facts. M2 uses it for the pool-leak line-item catalog seeded from the read-only Jobber Products & Services pull, and later modules will use it for checklist templates, report blocks, and service defaults.

If quote drafting breaks, start with `src/poolLeakVgbCatalog.ts` to confirm the requested catalog code exists, then check the CRM quote builder in `apps/server/src/crm/quoteBuilder.ts`. The raw source receipt is `receipts/m2/jobber-catalog-pull.json`; do not hand-edit catalog prices without a new Jobber pull receipt.
