# NexOps Reviews

Last updated: 2026-07-17  
Build piece: Client hub / review follow-up combined pass

## Statuses

### Review sequence statuses

#### `active`
- Sequence is live for a closed-and-paid job.
- One step is either currently due or queued for a future `nextSendAt`.

#### `stopped`
- Sequence was terminated before all steps completed.
- Current stop reasons:
  - `reviewed`
  - `opt_out`
  - `manual`

#### `completed`
- Sequence exhausted its configured steps without being stopped manually or by client action.
- This does not auto-restart later for the same job.

### Review step statuses

#### `pending`
- Step exists and has not been sent yet.

#### `sent`
- Step was delivered through the current comms adapter path.

#### `stopped`
- Step will no longer send because the parent sequence stopped or completed first.

### Provider states

#### `manual_only`
- Review completion currently depends on staff marking the review complete.

#### `gbp_pending`
- Reserved seam for a later Google Business Profile adapter.
- No live GBP detection is wired in this piece.

## Transitions

### closeout complete -> review sequence start
- Triggered by `ReviewSequenceService.maybeStartForJob(...)`.
- Hard gate:
  - job must be closed
  - linked final invoice path must be fully paid
- Result:
  - sequence record created
  - opt-out token hash stored
  - `review.sequence_started` emitted

### active step -> sent step
- Triggered by `syncDueSequences(...)` when `dueAt <= now`.
- Result:
  - step `sentAt` is stamped
  - next step becomes active when one remains
  - `review.sequence_step_sent` emitted

### active sequence -> completed sequence
- Triggered when the final configured step sends and no later pending step remains.
- Result:
  - sequence status becomes `completed`
  - stop reason becomes `exhausted`
  - `review.sequence_stopped` emitted as the closeout event for the sequence

### active sequence -> stopped sequence
- Triggered by:
  - `markReviewed(...)`
  - `optOut(...)`
  - `stopSequence(... reason = manual)`
- Result:
  - pending future steps are marked stopped
  - stop metadata is stamped
  - `review.marked` or `review.sequence_stopped` emitted

## Triggers

### Staff routes
- `GET /api/crm/review-sequences`
- `POST /api/crm/review-sequences/start`
- `POST /api/crm/review-sequences/:id/stop`
- `POST /api/crm/review-sequences/:id/mark-reviewed`

### Client route
- `GET /nexportal/reviews/opt-out`

### Service entry points
- `ReviewSequenceService.maybeStartForJob(...)`
- `ReviewSequenceService.syncDueSequences(...)`
- `ReviewSequenceService.stopSequence(...)`
- `ReviewSequenceService.markReviewed(...)`
- `ReviewSequenceService.optOut(...)`

### Nexi tools
- `getReviewSequenceStatus`
- `startReviewSequence`
- `stopReviewSequence`
- `markReviewed`

## Cascades

### Seeded default cadence
- Current seeded tenant default from the native adapter:
  - initial request at +1 day
  - nudge at +4 days
  - final nudge at +10 days
- This is the current local default, but it remains flagged for Chris’s confirmation rather than treated as immutable copy.

### Template-driven sends
- Review steps use tenant-managed communication templates:
  - `review_request_initial`
  - `review_request_nudge`
- Email/SMS/both is configured per step.
- Footer branding stays outside the editable template body and continues to come from the shared branding block.

### Stop conditions are final for the job
- The same job does not auto-start a new review sequence after:
  - reviewed
  - opt-out
  - manual stop
  - exhausted completion

### Visibility surfaces
- Sequence status shows on:
  - job detail
  - client detail
- Feed and notification surfaces receive:
  - `review.sequence_started`
  - `review.sequence_step_sent`
  - `review.sequence_stopped`
  - `review.marked`
- NexReach can consume approved/high-rating review records as a display layer:
  - owner chooses which review ids are featured in a showcase
  - the public portfolio page renders only the selected reviews, not the whole review history

### GBP seam
- The sequence engine is complete without a Google Business Profile connection.
- Review completion is first-class today through staff marking.
- GBP detection remains a provider seam, not a fake live integration.

## Current deliberate limits

- Google Business Profile OAuth and automatic review-detected completion are not built yet.
- Sequence timing is day-offset based today; there is not yet a richer send-window rules engine.
- Review opt-out is scoped to review follow-up only and is not yet merged with a broader communication-preferences center.
- NexReach review display is now live as a curated presentation layer, but it does not create a second review-request engine or bypass the existing review sequence rules.
