# Day 1 reliability control-plane contract

The authoritative Global Control transport is an append-only JSONL journal. It accepts `JOB_QUEUED` and valid `JOB_TRANSITION` records; state is derived from the journal, never a second controller or mutable status document. Reconciliation requeues expired `DISPATCHED`/`RUNNING` leases, and dispatch always selects the next queued job. The duplicate guard retains active and successful jobs, but a later `JOB_QUEUED` for a failed (incomplete) job automatically resumes that same job ID. A new `JOB_QUEUED` may include `continuationOf` to record and queue a linked continuation without manual controller intervention.

Deployment evidence is staging-only and GitHub Actions-only. A green/fixed claim requires matching source, deployment, and live SHA values plus a receipt that declares `green: true`, `fixed: true`, and `productionChanged: false`.

The identity-purpose registry is typed and non-person-specific. The bootstrap runner is check-only, idempotent, environment-scoped, and audit-capable. The staging auth harness is read-only and reports browser and mobile guard results from the deployed version endpoint. Legacy Railway CLI and DPAPI helpers may remain for break-glass historical operations, but are not a deployment dependency or an accepted control-plane rail.

Run the deployed harness only with `NEXTEAM_STAGING_URL` containing a staging hostname and `NEXTEAM_EXPECTED_LIVE_SHA`; `npm run test:staging-auth:readonly` refuses any other target and makes no writes.
