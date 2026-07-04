# Core Package

This package is the shared contract layer for NexTeam Studio. It defines TypeScript interfaces, zod schemas, typed errors, logging helpers, the event bus contract, and the approval queue primitives.

All apps and feature packages depend on `@nexteam/core` instead of redefining tenant, CRM, media, approval, source, and usageLog shapes. Changes here ripple across the whole monorepo, so update tests and schemas together.

When something breaks, start with `src/types.ts` for interface drift, `src/schemas.ts` for validation failures, `src/errors.ts` for rail errors, `src/eventBus.ts` for event flow, and `src/approvalQueue.ts` for parked outbound work.
