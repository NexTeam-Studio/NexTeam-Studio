# NexOps job costing contract

`jobCostFacts` are tenant-owned, append-only direct-cost facts linked to one existing job. A cost amount may be `null` when the cost is explicitly unknown; it is never silently treated as zero. Corrections void a fact with an actor, time, and reason rather than overwriting it. `jobCostFactEvents` retain an immutable fact snapshot for every create and void command.

Commands: `createJobCostFact`, `voidJobCostFact`. Events: `created`, `voided`.

`GET /api/crm/jobs/:jobId/profitability` derives actual revenue only from linked non-draft, non-void, non-bad-debt invoices. It uses explicit `jobReferences` for combined invoices. Actual gross profit and margin are nullable until both revenue and every active direct cost are known. All route access requires office billing authority and validates that the job belongs to the requested tenant.
