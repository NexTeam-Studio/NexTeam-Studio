# Content Engine Module

This module owns M5 Content Engine for NexTeam Studio. It turns completed-job facts and approved media references into draft GBP posts, social posts, SEO articles, calendar slots, and performance summaries.

It connects to the rest of the system through `EventBus` `job.completed` events, native in-memory content state for this slice, and `ApprovalQueueService` for every generated artifact. GBP, Meta, WordPress, and any other publishing rail remain disabled here; approving an item can mark it publish-ready, but no live publish executes from this module.

When something breaks, start with `contentEngine.ts` for generated copy and cadence rules, `repository.ts` for native draft/performance state, `routes.ts` for API behavior and event subscription, and `nexiTools.ts` for assistant tool input mapping.
