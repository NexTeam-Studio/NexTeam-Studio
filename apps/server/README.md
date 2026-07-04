# Server App

This is the Node/Express API host for NexTeam Studio. It owns the runtime API surface for health checks, version receipts, media proxying, approval queue endpoints, and module routers as each wave lands. In M2 it also exposes the native CRM client, quote draft, quote PDF, quote portal signing, invoice PDF, Stripe checkout, and Stripe webhook routes.

It connects browser/mobile clients to the shared packages: `@nexteam/core` for contracts and zod validation, `@nexteam/providers` for Jobber, CompanyCam, and native CRM rails, `@nexteam/industry-packs` for catalog data, and `@nexteam/nexi` for assistant/gateway flows. Keep provider credentials in environment variables only.

When something breaks, start with `src/server.ts` for route wiring, `src/health.ts` for rail health failures, `src/firebase.ts` for Admin SDK setup, and the module folder under `src/` that owns the failing endpoint. For CRM quote or invoice issues, check `src/crm/routes.ts`, `src/crm/quoteBuilder.ts`, `src/crm/nativeRepository.ts`, `src/crm/quotePdf.ts`, and `src/crm/stripe.ts` in that order.
