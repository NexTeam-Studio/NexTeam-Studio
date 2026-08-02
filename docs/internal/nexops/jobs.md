# NexOps Jobs

Last updated: 2026-07-16  
Build piece: Reminder-driven job-state engine + close/invoice/payment flow + scheduling/home/activity

## Statuses

## Imported history

- Historical jobs remain tenant data. They are not deleted just because they came from an earlier system.
- Completed or stale historical jobs use `Archived` so they stay searchable without appearing in the current scheduling and office-action queues.
- The Jobs workspace identifies those records as **Historical record** and lets an authorized office user start a new active job for the same client.
- Starting new work preserves the historical record. It creates a separate current job instead of reopening or rewriting old history.
- A future shared contract may add a durable parent-history link. Until then, the safe carry-forward is the matched client and a new independently auditable job.

### `Upcoming`
- At least one active visit exists in the future.
- No pending office action alert and no active invoice reminder are overriding the rail.

### `Today`
- At least one active visit starts on the current day.
- This is derived from scheduled visits, not written directly by staff.

### `Late`
- At least one active visit start date is before today.
- This is a derived scheduling exception state.

### `Unscheduled`
- No active visits remain and no action alert or invoice reminder is active.
- New manually created jobs land here until a visit is booked.
- Approved quote conversions also land here until the office places at least one visit on the board.

### `Action Required`
- Used when the last scheduled visit is completed and office review is still pending.
- This is driven by a `jobActionAlert`, not by a freehand status edit.

### `Requires Invoicing`
- Used when the invoice-reminder rail is active.
- This includes the recurring close-without-invoice nag that starts immediately, then re-fires every day at 9:00 AM until resolved or dismissed.

### `Archived`
- Closed/archive-end state when no active invoice reminder remains.
- Dismissing a pending invoice reminder also lands the job here without creating an invoice.

## Transitions

### create -> `Unscheduled` or visit-derived schedule state
- Triggered by:
  - `POST /api/crm/jobs`
  - Nexi `createJob` approval execution
- New jobs are written with line items, totals, optional request/quote links, optional intake, and optional payment schedule.
- The derived status becomes `Unscheduled` until visits exist.

### `Unscheduled|Upcoming|Today|Late` -> visit-derived schedule state
- Triggered by:
  - `POST /api/crm/jobs/:id/visits`
  - `POST /api/crm/jobs/:id/visits/batch`
  - `POST /api/crm/jobs/visits/:id/move`
  - Nexi `scheduleJobVisits`
  - Nexi `scheduleUnscheduledJob`
- Booking or moving a visit regenerates the visit-reminder set for that visit.
- The job state then derives again from the active visit window.

### multi-visit one-off planning -> visit-derived schedule state
- Triggered by:
  - `POST /api/crm/jobs/:id/visits/batch`
  - Nexi `scheduleJobVisits` approval execution
- A single one-off job can now carry many visits in one create flow.
- Each visit stores its own:
  - date
  - start/end time
  - arrival window
  - assigned team
  - per-visit details
- The job itself stays one job record; only the visit rail multiplies.

### visit shift cascade -> rescheduled visit-derived state
- Triggered by:
  - `POST /api/crm/jobs/visits/:id/move` with `shiftRemaining=true`
  - Nexi `shiftJobVisitSeries` approval execution
- Moving one anchored visit can shift all remaining visits on the same job by the same offset.
- The offset can be applied from:
  - the schedule UI reschedule panel
  - drag/drop confirmation on desktop schedule grids
  - Nexi conversational scheduling
- This reuses the same lifecycle mechanic instead of creating separate series-only records.

### final visit completion -> `Action Required`
- Triggered by `POST /api/crm/jobs/visits/:id/complete`.
- When no active visits remain and there is not already an invoice reminder:
  - a `jobActionAlert` is created with kind `close_or_invoice_review`
  - OWNER/OFFICE_ADMIN notification email is sent
- TECHNICIAN visit completion never closes the job or creates the invoice directly.

### `Action Required` -> `Requires Invoicing`
- Triggered by `close` when staff closes the job without creating an invoice.
- The reminder model here is:
  - immediate first fire at close
  - recurrence becomes `daily_9am`
  - `nextDueAt` advances to the next 9:00 AM tick

### `Action Required` -> invoice-draft follow-on
- Triggered by:
  - `invoice`
  - `close_and_invoice`
- `invoice` creates the draft invoice now and leaves close/archive follow-on for later state derivation.
- `close_and_invoice` closes the job and creates the draft invoice in one step.
- Any pending action alert is resolved when one of these actions executes.

### `Requires Invoicing` -> cleared
- Triggered by:
  - `invoice`
  - `close_and_invoice`
  - `dismiss_invoice_reminder`
- `invoice` and `close_and_invoice` resolve the reminder with `resolvedByAction = "invoice_created"`.
- `dismiss_invoice_reminder` resolves the reminder with `resolvedByAction = "dismissed"` and archives the job without creating an invoice.

### recurring `Requires Invoicing` reminder -> next day `Requires Invoicing`
- Triggered when the reminder comes due and the job is read/listed after the due time.
- The current reminder is advanced instead of replaced:
  - `lastTriggeredAt` is updated
  - `dueAt` moves forward
  - `nextDueAt` is recalculated for the next 9:00 AM cycle

## Triggers

### Job routes
- `GET /api/crm/jobs`
- `GET /api/crm/jobs/:id`
- `POST /api/crm/jobs`
- `PATCH /api/crm/jobs/:id`

### Visit scheduling routes
- `POST /api/crm/jobs/:id/visits`
- `POST /api/crm/jobs/:id/visits/batch`
- `POST /api/crm/jobs/visits/:id/move`
- `POST /api/crm/jobs/visits/:id/complete`

### Office action routes
- `POST /api/crm/jobs/:id/action-preview`
- `POST /api/crm/jobs/:id/actions`
- Supported actions:
  - `close`
  - `invoice`
  - `close_and_invoice`
  - `dismiss_invoice_reminder`

### Schedule workspace and queue consumers
- `GET /api/crm/schedule/workspace`
- `GET /api/crm/home`
- `GET /api/crm/activity`
- `GET /api/crm/notifications`
- `POST /api/crm/notifications/read`
- `POST /api/crm/notifications/read-all`

### Nexi tools
- `createJob`
- `listJobs`
- `getJobDetail`
- `queueJobAction`
- `scheduleJobVisits`
- `shiftJobVisitSeries`
- `scheduleUnscheduledJob`
- `getSchedule`
- `listVisits`
- `getHomeQueues`
- `getActivityFeed`
- `listRecentActivity`
- `revisePendingJobCreateApproval`
- `revisePendingJobActionApproval`
- `approvePendingApproval`

### Role gates
- `completeVisit` allows:
  - `OWNER`
  - `OFFICE_ADMIN`
  - `TECHNICIAN`
- Close/invoice/dismiss reminder actions allow:
  - `OWNER`
  - `OFFICE_ADMIN`
- TECHNICIAN cannot close a job, create an invoice, or dismiss the invoice reminder.
- TECHNICIAN schedule/home/activity views are scoped to assigned work only.

## Cascades

### Derived state rail
- Job status is not meant to be hand-maintained.
- Current status is recalculated from:
  - active visits
  - pending visit reminders
  - pending invoice reminders
  - pending office action alerts
  - invoice presence
  - archived/closed timestamps

### Legacy-job normalization
- Older persisted jobs with legacy direct-enum scheduling values are accepted and normalized onto the derived lifecycle rail on read.
- Legacy stored `startAt`/`endAt` values are treated as a read-only synthetic visit when no native visit record exists yet.

### Visit reminders
- Every scheduled visit can produce:
  - day-before email reminder
  - hour-before SMS reminder
- Rescheduling regenerates the reminder set.
- Completing the visit cancels any still-pending reminders for that visit.
- Multi-visit one-off jobs use the same reminder rail per visit; there is no sequence-specific reminder system.

### Office review alert
- Completing the last scheduled visit creates a `close_or_invoice_review` alert.
- OWNER/OFFICE_ADMIN email notification is sent immediately so office staff can choose:
  - Close
  - Invoice
  - Close and Invoice

### Close-without-invoice recurrence
- Current behavior is a repeating nag object:
  - immediate first fire at close time
  - daily recurrence at 9:00 AM
  - repeats until invoiced or dismissed

### Job -> invoice carry-forward
- Invoice creation from a job carries forward:
  - job title
  - line items
  - totals
  - `quoteId` when present
  - `requestId` when present
  - `intake` when present
  - `paymentSchedule` when present

### Scheduling workspace
- The Schedule module reads jobs through a real workspace model:
  - `visits`
  - `unscheduledJobs`
  - `teamMembers`
- OWNER/OFFICE_ADMIN see the full tenant board and the unscheduled rail.
- TECHNICIAN sees only assigned visits and never sees the unscheduled office rail.

### Home and activity consumers
- Job state now feeds three downstream operational surfaces:
  - Home queues
  - Activity feed
  - Notification center
- `Action Required` and `Requires Invoicing` are rendered from live lifecycle state, not copied into a second dashboard-only status store.

## Current deliberate limits

- Recurring invoice reminders are modeled only for the close-without-invoice path right now.
- Recurring-job support is still not a separate scheduling domain; current coverage is one-off and multi-visit jobs, not a recurring service contract engine.
- `invoice` creates the draft invoice and clears the reminder/alert path, but detailed collection and receipt behavior lives in the invoice/payment domains documented separately.
- One-off multi-visit jobs do not yet run bulk conflict detection or capacity blocking during the whole series create. That was deliberately deferred on 2026-07-16 rather than silently guessed.
- Multi-visit sequence templates tied to quote templates are also deferred; visit reuse is manual for now.
