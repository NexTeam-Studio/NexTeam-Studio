# NexOps Schedule

Last updated: 2026-07-16  
Build piece: Scheduling/calendar + multi-visit one-off jobs

## Surfaces

### Views
- `day`
- `week`
- `month`
- `list`

Desktop defaults to `week`.  
Mobile defaults to `list`.

### Scope rails
- `all`
- `today`
- `upcoming`

### Data shown on every visit
- arrival window
- client name
- property address
- assigned team member(s)
- job title
- derived job status tone

## Transitions

### unscheduled job -> scheduled visit(s)
- Triggered by:
  - choosing an item from the unscheduled rail in Schedule
  - `POST /api/crm/jobs/:id/visits`
  - `POST /api/crm/jobs/:id/visits/batch`
  - Nexi `scheduleUnscheduledJob`
- This moves work from `Unscheduled` into visit-derived schedule status without creating a second job.

### scheduled visit -> moved visit
- Triggered by:
  - desktop drag/drop onto a day/week slot
  - mobile/desktop edit panel save
  - `POST /api/crm/jobs/visits/:id/move`
  - Nexi `shiftJobVisitSeries`
- The move path is the same one used by the job lifecycle engine, so reminder cancellation/regeneration stays centralized.

### one visit moved -> remaining visits shifted
- Triggered by `shiftRemaining=true` on the move route or approval execution.
- The system computes an offset from the anchored visit and applies that same offset to later visits on the same job.

### multi-visit create -> saved visit series
- Triggered by:
  - Schedule overlay batch composer
  - `POST /api/crm/jobs/:id/visits/batch`
  - Nexi `scheduleJobVisits`
- A one-off job can now receive many visits in one action.
- Current implementation allows 25+ visits in one flow; there is no visible 20-visit cap in the tenant UI.

## Triggers

### Routes
- `GET /api/crm/schedule/workspace`
- `POST /api/crm/jobs/:id/visits`
- `POST /api/crm/jobs/:id/visits/batch`
- `POST /api/crm/jobs/visits/:id/move`

### Nexi tools
- `getSchedule`
- `listVisits`
- `scheduleUnscheduledJob`
- `scheduleJobVisits`
- `shiftJobVisitSeries`

## Cascades

### Team filtering
- OWNER/OFFICE_ADMIN can filter by one or many team members.
- TECHNICIAN is always scoped to assigned visits only, even if the client tries to broaden the filter.

### Arrival windows
- Schedule rendering shows the visit window (`start - end`) rather than only a single timestamp.
- The same arrival-window values feed booking confirmations and visit reminders.

### Reminder rail reuse
- Scheduling does not own its own reminder logic.
- Every create/move path routes through the job lifecycle service so:
  - old reminder timers are canceled
  - new reminder timers are generated
  - visit completion can cancel pending reminder timers

### Unscheduled queue
- Jobs in derived `Unscheduled` state remain visible in the schedule workspace until placed.
- This is the bridge between approved work and the live calendar board.

## Current deliberate limits

- Timesheets/clock-in are not part of this module yet.
- Route optimization is deferred.
- Map dispatch is deferred.
- Bulk-create conflict detection for multi-visit one-off jobs is deferred; current series planning assumes office review rather than automatic blocking.
- Multi-visit templates tied to quote templates are deferred.
