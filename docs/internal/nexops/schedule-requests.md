# NexOps Client Schedule Requests

Last updated: 2026-07-14  
Build piece: Canonical source foundation (Track 2)

## Statuses

### `pending`
- Client submitted a request.
- Current schedule stays exactly as-is until staff acts.

### `accepted`
- Staff accepted the request and executed the matching visit command.

### `declined`
- Staff declined the request.

### `counter_proposed`
- Staff proposed a different window or resolution.

### `withdrawn`
- Client withdrew the request.

### `expired`
- Request timed out without a valid resolution.

## Transitions

### portal create -> `pending`
- Triggered by:
  - `portal.request_reschedule`
  - `portal.request_cancellation`

### `pending` -> `accepted`
- Triggered by:
  - `client_schedule_request.accept_reschedule`
  - `client_schedule_request.accept_cancellation`

### `pending` -> `declined`
- Triggered by staff decline.

### `pending` -> `counter_proposed`
- Triggered by `client_schedule_request.counter_propose`.

### `pending` -> `withdrawn`
- Triggered by client withdrawal.

## Triggers

### Permissions
- `visit.reschedule`
- `visit.cancel`
- `schedule_request.manage`

### Communication template
- `schedule_request_resolution`

## Cascades

### D17 governing rule
- Client requests never auto-apply.
- Staff action is always required for any real visit change.

### Resolution wiring
- Accepted reschedule invokes `visit.reschedule`.
- Accepted cancellation invokes `visit.cancel`.
- Counter-propose notifies the client without changing the current schedule yet.
