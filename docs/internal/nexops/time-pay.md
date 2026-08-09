# NexOps time and pay contract

`laborFacts` are tenant-owned, immutable clock intervals. They record job, drive, and non-job labor separately; each carries an explicit pay type (`regular`, `overtime`, `double_time`, or `unpaid`) so overtime policy may be applied upstream without rewriting history. Job labor requires a job id; drive and non-job labor may not carry one.

`compensationFacts` record commission and bonus inputs independently of labor. Both fact types are corrected only by voiding with actor, timestamp, and reason. `timePayEvents` store immutable snapshots for every create and void command.

Commands: `createLaborFact`, `voidLaborFact`, `createCompensationFact`, `voidCompensationFact`, `exportPayrollDraft`. Events: `created`, `voided`.

`GET /api/crm/time-pay/payroll-draft` returns a tenant-scoped period summary with time by pay type/category, commissions, bonuses, and productivity units. It is explicitly `draft_only`; it neither calculates statutory pay nor sends, syncs, or otherwise submits to an external payroll provider. Office authority is required for every time/pay route.
