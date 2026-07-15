# NexOps Payment Schedules

Last updated: 2026-07-14  
Build piece: Canonical source foundation (Track 2)

## Statuses

### `draft`
- Initial authored schedule before activation.

### `active`
- The schedule currently governs what balance portions can be collected.

### `completed`
- All installments are fully satisfied.

### `superseded`
- A newer schedule version replaced this one.

### `canceled`
- The schedule was deliberately canceled.

## Installment statuses

### `pending`
- No money has been allocated to the installment yet.

### `partially_paid`
- Some money has been allocated, but the installment is not yet fully satisfied.

### `paid`
- Full amount has been covered by payment allocation.

### `past_due`
- Due date passed and the installment is still not satisfied.

## Transitions

### create -> `draft`
- Triggered from quote composition when a schedule is authored.

### `draft` -> `active`
- Triggered when the schedule becomes the live WorkPackage schedule.

### `active` -> `completed`
- Derived once all installments are fully paid.

### any prior version -> `superseded`
- Triggered when a newer schedule version replaces it.

## Triggers

### Source entities
- `Quote`
- `WorkPackage`
- `Payment`
- `Allocation`

### Commands that depend on it
- `portal.invoice_pay`
- `payment.collect`

## Cascades

### Derived money rail
- Installment `status` and `amountPaid` are derived from Payment + Allocation.
- Staff does not manually edit installment money state directly.

### Partial-payment rule
- D19 governs here:
  - if a WorkPackage has an active PaymentSchedule, partial final payments are allowed
  - otherwise each payment attempt must cover the full remaining invoice balance

### Piece-5 follow-up
- Milestone reminders are still a known follow-up gap.
- Current milestone `dueAt` data exists, but dedicated automatic milestone reminder firing is not yet implemented.
