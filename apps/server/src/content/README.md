# Content Engine Module

This module owns M5 Content Engine for NexTeam Studio. It turns completed-job facts and approved media references into draft GBP posts, social posts, SEO articles, calendar slots, and performance summaries.

It connects to the rest of the system through `EventBus` `job.completed` events, tenant-scoped content persistence (Firestore when the server has its configured database), and `ApprovalQueueService` for every generated artifact. GBP, Meta, WordPress, and any other publishing rail remain disabled here; approving an item can mark it publish-ready, but no live publish executes from this module.

When something breaks, start with `contentEngine.ts` for generated copy and cadence rules, `repository.ts` for tenant-scoped Firestore state, `nexreachService.ts` for consent, owner approval, and portfolio-preview policy, `routes.ts` for API behavior and event subscription, and `nexiTools.ts` for assistant tool input mapping.

## NexReach contract

- Commands: sync eligible closed jobs; generate/revise/discard owner-reviewed drafts; approve a draft into `publish_ready`; create a token-gated `preview_ready` showcase; issue a preview link; export consented audience CSV.
- Stored tenant-scoped records: `contentEligibility`, `contentDrafts`, `contentSettings`, `contentShowcases`, `contentCalendar`, and `contentPerformance`.
- Events: `job.closed` updates eligibility only. Content generation and approvals never call a publishing provider.
- Publishing boundary: a `publish_ready` draft and `preview_ready` showcase are not published. Provider publishing adapters remain unwired; token-gated portfolio previews are for review only.
