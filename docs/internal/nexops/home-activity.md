# NexOps Home And Activity

Last updated: 2026-07-18  
Build piece: Home queues + activity feed + in-app notifications + documentation activity lens

## Home

### OWNER / OFFICE_ADMIN queues
- `new-requests`
- `approved-quotes`
- `action-required`
- `requires-invoicing`
- `awaiting-payment`
- `past-due`

Each row carries:
- live count
- supporting detail copy
- total value where financially relevant
- a single deep-link target into the filtered module view

### Business health strip
- `job-value-week`
- `visits-week`

Each metric shows:
- current period value
- simple period-over-period delta versus last week

### TECHNICIAN home
- does not show company financial queues
- shows:
  - today's assigned visits
  - late assigned jobs
  - upcoming assigned visits

## Activity feed

### Surface
- chronological, newest first
- tenant-wide for OWNER/OFFICE_ADMIN
- assigned-work-only for TECHNICIAN
- optional object filter:
  - `requests`
  - `quotes`
  - `jobs`
  - `invoices`
  - `payments`

### Entry shape
- actor
- action
- reference (number/id)
- title
- value when relevant
- relative timestamp
- deep-link target

## Rendered event coverage

The activity feed currently renders these persisted event types:

- `request.created`
- `request.converted_to_quote`
- `request.converted_to_job`
- `quote.created`
- `quote.sent`
- `quote.viewed`
- `quote.signed`
- `quote.approved`
- `quote.deposit_paid`
- `quote.converted_to_job`
- `job.created`
- `job.state_changed`
- `job.closed`
- `job.requires_invoicing_cleared`
- `visit.booked`
- `visit.booking_confirmation_sent`
- `visit.completed`
- `invoice.reminder_due`
- `invoice.created`
- `invoice.sent`
- `invoice.paid`
- `payment.created`
- `payment.failed`
- `refund.created`
- `invoice.voided`
- `invoice.bad_debt`
- `receipt.review_created`

## Triggers

### Routes
- `GET /api/crm/home`
- `GET /api/crm/activity`
- `GET /api/crm/documentation-activity`
- `GET /api/crm/notifications`
- `POST /api/crm/notifications/read`
- `POST /api/crm/notifications/read-all`

### Nexi tools
- `getHomeQueues`
- `getActivityFeed`
- `listRecentActivity`

## Cascades

### One source of truth
- Home queue counts are computed from live request, quote, job, and invoice data.
- Activity feed entries are built from the persisted lifecycle event bus.
- Notifications are a filtered subset of the same event rail plus pending office alerts.

### Role scoping
- TECHNICIAN never receives quote, invoice, payment, or request activity entries in the feed.
- TECHNICIAN home omits company financial queues entirely.
- TECHNICIAN notifications are limited to assigned-work events.
- Documentation activity follows the same fence:
  - OWNER / OFFICE_ADMIN can see the team-wide technician rollup
  - TECHNICIAN can only see their own row

### Queue click-through
- Each Home row links to a module + filter combination rather than a static summary page.
- This keeps the count source aligned with the list the user opens next.

### Final-visit office alert
- Completing the final visit creates both:
  - an activity event trail via lifecycle events
  - an in-app alert notification for OWNER/OFFICE_ADMIN

### Documentation activity rollup
- The Home surface now includes a documentation-activity lens built from the existing event bus, not a second tracking table.
- Counted events:
  - `media.uploaded`
  - `checklist.completed`
- Each row currently carries:
  - technician identity
  - photo upload count
  - completed checklist count
  - total documentation events
  - last activity timestamp when present

## Current deliberate limits

- Home is intentionally a queue surface, not a full reporting dashboard.
- No charts are built here.
- Push delivery is deferred; the in-app notification center is the current alert surface.
