# @nexteam/industry-packs

This package holds reusable, white-label industry data that other modules can depend on without hardcoding Aquatrace-specific facts. M2 uses it for the pool-leak VGB line-item catalog, and later modules will use it for checklist templates, report blocks, and service defaults.

If quote drafting breaks, start with `src/poolLeakVgbCatalog.ts` to confirm the requested catalog code exists, then check the CRM quote builder in `apps/server/src/crm/quoteBuilder.ts`.
