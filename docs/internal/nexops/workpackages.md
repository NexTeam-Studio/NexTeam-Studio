# NexOps WorkPackages

Last updated: 2026-07-14  
Build piece: Canonical source foundation (Track 2)

## Statuses

### `draft`
- Initial shell state when the parent job is first created or reopened for follow-up.

### `awaiting_authorization`
- Scope exists but customer authorization is still missing.
- This state is the blocker behind the job-level "activate job" action.

### `authorized`
- Customer authorization is present.
- Visits can be scheduled from here.

### `in_progress`
- At least one linked visit is actively underway.

### `work_complete`
- Visit work is complete, but closeout or financial review still remains.

### `closed`
- The WorkPackage is fully closed through one of the approved closeout paths.

### `canceled`
- The WorkPackage was explicitly canceled rather than completed.

## Transitions

### create -> `draft`
- Triggered by:
  - `job.create_linked_shell`
  - `job.reopen_for_followup`
  - `job.create_followup_visit`

### `draft` -> `awaiting_authorization`
- Triggered when scoped work exists but customer authorization has not been captured yet.

### `awaiting_authorization` -> `authorized`
- Triggered by `job.activate`.
- Requires customer authorization to exist.

### `authorized` -> `in_progress`
- Derived from a linked visit starting work.

### `in_progress` -> `work_complete`
- Derived when linked field work completes and no active visit remains.

### `work_complete` -> `closed`
- Triggered by approved closeout.
- May happen through:
  - paid closeout package
  - invoiced-unpaid work review path
  - authorized-no-invoice closeout

## Triggers

### Commands
- `job.create_linked_shell`
- `job.activate`
- `job.create_followup_visit`
- `job.reopen_for_followup`
- `job.close_and_invoice`
- `job.close_without_invoice`

## Cascades

### Quote lineage
- Every WorkPackage stores the full `quote_version_ids` rail plus `active_quote_version_id`.
- Revised quotes do not mutate the prior accepted version; they add a new version reference.

### Billing lineage
- WorkPackages own the invoice and payment-schedule version rails.
- Partial final payments are only allowed when an active payment schedule exists on the WorkPackage.

### Follow-up rule
- D18 governs here: all follow-up work stays on the same job.
- Closed jobs reopen for follow-up rather than silently moving scope into a new job.
