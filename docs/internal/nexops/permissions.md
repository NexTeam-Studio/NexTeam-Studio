# NexOps Permissions

Last updated: 2026-07-14  
Build piece: Canonical source foundation (Track 2)

## Permission IDs

- `request.contact`
- `request.convert_to_quote`
- `request.convert_to_job`
- `request.merge`
- `quote.send`
- `quote.revise`
- `quote.decline`
- `quote.renew`
- `deposit.collect`
- `deposit.waive`
- `deposit.refund`
- `job.create`
- `job.schedule`
- `job.reschedule`
- `job.reassign`
- `job.cancel`
- `job.close`
- `job.reopen`
- `job.activate`
- `visit.start`
- `visit.complete`
- `visit.reschedule`
- `visit.cancel`
- `visit.report_edit`
- `invoice.create`
- `invoice.send`
- `invoice.void`
- `invoice.write_off`
- `payment.collect`
- `payment.refund`
- `payment.retry`
- `report.approve`
- `schedule_request.manage`
- `client.contact_view`
- `client.call`
- `client.message`
- `job.financials_view`
- `job.access_notes_view`
- `media.capture`
- `media.delete`
- `schedule.view_team`

## Role bundles

### OWNER
- Full permission set.

### OFFICE_ADMIN
- Full permission set except:
  - `deposit.waive` unless granted separately
  - `deposit.refund` unless granted separately
  - `payment.refund` unless granted separately

### TECHNICIAN
- Limited to:
  - `visit.start`
  - `visit.complete`
  - `visit.report_edit`
  - `client.contact_view`
  - `client.call`
  - `media.capture`
- No pricing or financial permissions.

## Portal authorization profile

### `portal_customer_resource_access`
- Requires:
  - tenant match
  - customer match
  - resource grant match
  - valid token
  - unexpired token
  - unrevoked token
  - resource not administratively hidden
  - correct resource type

## Command traceability

- Every canonical lifecycle command records `policyDependencies` referencing the governing decision IDs (`D1`-`D19`).
- That traceability now lives in `apps/server/src/crm/lifecycleCommandMap.ts`.
