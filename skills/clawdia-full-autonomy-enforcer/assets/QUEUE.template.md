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
<!-- AUTONOMY_QUEUE_TABLE_END -->

## Event Log
<!-- AUTONOMY_QUEUE_EVENTS_START -->
<!-- AUTONOMY_QUEUE_EVENTS_END -->
