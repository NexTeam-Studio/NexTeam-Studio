# Self-Repair Rail

This module runs the tenant-scoped nightly diagnosis rail for M13. It reads the tenant export, classifies conversation/failure patterns against the Part 9 defect classes, writes a `selfRepairLog` record, drafts safe regression-wall candidates, and queues a morning report as an ApprovalQueue email draft.

Important boundary: this rail never edits code, SOUL files, schemas, deploys, or sends outbound messages. Safe repairs are limited to diagnosis metadata such as gap-label corrections and wall-entry candidates.

Look here first when something breaks:

- `analyzer.ts` decides which failure class a conversation belongs to.
- `service.ts` builds the report, queues the ApprovalQueue draft, and stores `selfRepairLog`.
- `repository.ts` is the Firestore/memory persistence boundary.
- `routes.ts` exposes owner/admin-only run and log endpoints.
