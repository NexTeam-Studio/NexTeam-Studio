# NexOps Notifications

Last updated: 2026-07-17  
Build piece: Canonical source foundation + scheduling/home/activity + client hub/review follow-up

## Notification center

### Surface
- Staff notifications now consolidate into the in-app header bell.
- The bell reads from one notification stream and exposes:
  - unread badge count
  - chronological list
  - deep-link on open
  - mark one read
  - mark all read

### Role scope
- OWNER and OFFICE_ADMIN see tenant-wide event notifications plus pending final-visit action alerts.
- TECHNICIAN sees only notifications tied to assigned work.
- TECHNICIAN does not receive financial or tenant-wide office queue notifications.

## Trigger templates

The canonical communications registry still defines these 12 server templates:

1. `quote_sent`
2. `quote_approved`
3. `deposit_failure`
4. `booking_confirmation`
5. `visit_rescheduled`
6. `visit_canceled`
7. `invoice_sent`
8. `payment_reminder`
9. `payment_receipt`
10. `customer_document_package`
11. `delivery_failure`
12. `schedule_request_resolution`

## In-app notification triggers

The notification center currently renders these staff-facing event types:

### Event notifications
- `request.created`
- `quote.viewed`
- `quote.approved`
- `quote.deposit_paid`
- `payment.created`
- `payment.failed`
- `visit.confirmed`
- `review.marked`

### Alert notifications
- pending `close_or_invoice_review` job action alerts
- These appear as "Final visit completed" until staff chooses Close, Invoice, or Close and Invoice.

## Modes

### `manual`
- Staff chooses the send action deliberately.
- Used for:
  - quote sends
  - invoice sends
  - booking confirmations

### `auto`
- System sends immediately when the trigger fires.
- Used for:
  - quote approval confirmations
  - deposit failures
  - visit reschedules/cancelations
  - payment reminders
  - delivery failures
  - schedule request resolutions

### `review_gated`
- System prepares the send, but staff must review and approve before it goes out.
- Used for:
  - payment receipts
  - customer document packages

## Triggers

### Routes
- `GET /api/crm/notifications`
- `POST /api/crm/notifications/read`
- `POST /api/crm/notifications/read-all`

### Data sources
- Lifecycle event bus entries from requests, quotes, jobs, invoices, payments, refunds, and receipts
- Pending job action alerts from the job lifecycle repository
- Notification read-state rows keyed by:
  - `tenantId`
  - `tenantUserId`
  - `notificationId`

## Cascades

### Existing auto-send whitelist
- The canonical source keeps these earlier auto-send paths active outside the 12-template registry:
  - visit reminders (1-day email, 1-hour SMS)
  - request confirmation
  - quote approval confirmation
  - admin internal alerts
  - review-sequence nudges once the sequence engine decides a step is due

### Read-state handling
- Opening a notification can mark it read through the dedicated route.
- "Mark all read" writes read-state records for every currently unread entry in the tenant-scoped list.
- Read state is per user, not a global tenant toggle.

### Feed/notification separation
- Activity feed and notification center both read from the same underlying lifecycle events.
- The activity feed renders the broader audit trail.
- The notification center renders only the smaller alert-worthy subset plus final-visit office alerts.

### Portal/review events now on the shared rail
- The activity and notification system now also receives:
  - `portal.link_sent`
  - `portal.session_started`
  - `statement.sent`
  - `review.sequence_started`
  - `review.sequence_step_sent`
  - `review.sequence_stopped`
- Not every one of these becomes a bell notification, but they are now first-class events on the same feed rail and can be surfaced in client/job detail activity.

### Future push adapter seam
- OS-level push is not built yet.
- The current notification stream is intentionally shaped so a later push adapter can subscribe to the same source events without inventing a second notification registry.

## Current deliberate limits

- OS-level mobile push delivery is deferred; in-app notification center is the only implemented surface today.
- Notification grouping/bundling is not yet a separate rules engine; entries are rendered chronologically with read-state only.
