# NexOps Notifications

Last updated: 2026-07-14  
Build piece: Canonical source foundation (Track 2)

## Communications registry

The canonical server registry currently defines these 12 required templates:

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

## Cascades

### Existing auto-send whitelist
- The canonical source keeps these prior auto-send paths active outside the 12-template registry:
  - visit reminders (1-day email, 1-hour SMS)
  - request confirmation
  - quote approval confirmation
  - admin internal alerts

### Failure handling
- Customer-facing delivery failures create internal attention work.
- Financial success never auto-sends a receipt; receipt review remains the pause step before delivery.
