# QUEUE

Use this file as the durable queue mirror for high-enforcement autonomy.

## Rules

- Keep statuses explicit.
- Reject vague progress language.
- Upsert task truth when better verified truth exists.
- Supersede stale truth instead of appending contradictory noise.

## Active Queue
<!-- AUTONOMY_QUEUE_TABLE_START -->
| Task ID | Lane | Title | Status | Priority | Owner | Proof | Last Update | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| job-17 | aquatrace_bragi | Strict proof review | SUPERSEDED | P1 | Clawdia | proof required | 2026-05-03T18:49:46.386Z | Superseded by corrected proof path |
<!-- AUTONOMY_QUEUE_TABLE_END -->

## Event Log
<!-- AUTONOMY_QUEUE_EVENTS_START -->
- 2026-05-03T18:49:46.295Z | job-17 | WORKING | Willie consulted
- 2026-05-03T18:49:46.387Z | job-17 | SUPERSEDED | Superseded by corrected proof path
<!-- AUTONOMY_QUEUE_EVENTS_END -->
