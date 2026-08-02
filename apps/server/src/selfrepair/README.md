# Self-Repair Rail

This module runs the tenant-scoped diagnosis rail for M13. It reads the tenant export, classifies conversation/failure patterns against the Part 9 defect classes, writes a `selfRepairLog` record, drafts safe regression-wall candidates, and queues a report as an ApprovalQueue email draft.

The analysis path is deterministic-first. Known classes are caught locally, then the Anthropic review pass can add unflagged findings and watch items when `ANTHROPIC_API_KEY` is configured; that provider call writes a `self_repair_analysis` usageLog record.

Important boundary: this rail never edits code, SOUL files, schemas, deploys, or customer records. Safe repairs are limited to diagnosis metadata such as gap-label corrections and wall-entry candidates.

## Hourly development review

Set `SELF_REPAIR_HOURLY_ENABLED=true` to run one review at server start and then at minute `00` of every hour. Each pass uses its saved review window, so only new timestamped conversations and runtime records are analyzed. When hourly email delivery is enabled, every pass sends a report, including a short healthy report when no new issue is found.

To email each hourly report, configure the already-approved dedicated Nexi sender and set both `SELF_REPAIR_HOURLY_EMAIL_ENABLED=true` and either `SELF_REPAIR_REPORT_EMAIL` or the configured operator email. The message is tenant-scoped and contains only the diagnosis summary; it never changes customer data or code.

Look here first when something breaks:

- `analyzer.ts` decides which failure class a conversation belongs to.
- `anthropicAnalyzer.ts` performs the optional live review pass and usage logging.
- `service.ts` builds the report, queues the ApprovalQueue draft, and stores `selfRepairLog`.
- `hourlyScheduler.ts` provides the opt-in, once-per-hour new-record review loop.
- `repository.ts` is the Firestore/memory persistence boundary.
- `routes.ts` exposes owner/admin-only run and log endpoints.
