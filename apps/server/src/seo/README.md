# SEO Module

M9 is the search visibility rail for tenant websites. It tracks keyword rankings, audits generated M8 sites, queues safe site fixes through ApprovalQueue, drafts keyword-gap article briefs, and creates a plain-English monthly SEO report.

It connects to the rest of NexTeam through:

- `sitesRepository`: reads and rewrites tenant-scoped generated site models.
- `ApprovalQueue`: parks SEO fixes and article briefs before anything changes or publishes.
- `DataForSEO`: optional live rank provider using `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.
- Nexi tools: `rankSnapshot`, `auditSiteSeo`, `seoQueue`, `draftSeoArticleBrief`, and `seoReport`.

When something breaks, start with `service.ts` for module behavior, `auditEngine.ts` for on-page checks and fixes, `dataForSeoProvider.ts` for rank snapshots, and `routes.ts` or `nexiTools.ts` depending on whether the failure is API/UI or chat-facing.

Important boundaries:

- No SEO fix publishes externally. Site changes are approval-gated and remain internal unless a later publishing step is explicitly approved.
- Missing DataForSEO credentials return a blocker, not a fake empty ranking.
- Google Rich Results validation is a live manual receipt and cannot be claimed from local tests.
