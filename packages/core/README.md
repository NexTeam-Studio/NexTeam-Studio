# Core Package

This package is the shared contract layer for NexTeam Studio. It defines TypeScript interfaces, zod schemas, typed errors, logging helpers, the event bus contract, and the approval queue primitives. M2 quote records also carry approval IDs, PDF refs, portal token hashes, and typed-signature metadata so quote delivery stays approval-gated and auditable. M2 invoice records carry Stripe external IDs only; card data stays entirely inside Stripe. M4 Field Docs relies on the `Media` contract to keep native media tenant-scoped and to prevent raw vendor URLs from reaching clients.

All apps and feature packages depend on `@nexteam/core` instead of redefining tenant, CRM, media, approval, source, and usageLog shapes. Changes here ripple across the whole monorepo, so update tests and schemas together.

When something breaks, start with `src/types.ts` for interface drift, `src/schemas.ts` for validation failures, `src/errors.ts` for rail errors, `src/eventBus.ts` for event flow, and `src/approvalQueue.ts` for parked outbound work.
