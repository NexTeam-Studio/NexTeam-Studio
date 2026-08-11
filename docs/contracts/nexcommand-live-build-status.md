# NexCommand Live Build Status contract

Scope: read-only, staging-only NexCommand control-plane status. It does not dispatch work, write controller state, deploy, or touch production.

## Durable records

An authorized external controller owns these Firestore records:

- `nexcommandControllerStates/current`: the current `runId`, state, heartbeat, progress timestamp, build/task text, blocker, and activity.
- `nexcommandControllerRuns/{runId}`: immutable run identity and result fields, including PID, task lists, and optional deployment evidence.
- `nexcommandControllerEvents/{eventId}`: append-only event ledger with `runId`, `type`, `at`, and sanitized `detail`.

State values are `IDLE`, `QUEUED`, `DISPATCHED`, `RUNNING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`. A `DISPATCHED` or `RUNNING` record is active only with a heartbeat no older than two minutes. A lack of progress for at least 30 minutes raises `noProgressWarning` without changing controller state. The API returns at most the ten newest events.

## Deployment evidence

The status response exposes deployment evidence only where `environment` is `staging`, `sourceSha`, `deploymentSha`, and `liveSha` are identical valid SHAs, and `liveSha` equals the SHA reported by the running server. Otherwise deployment evidence is `null` rather than inferred.

## Read surface and authorization

`GET /api/platform/admin/live-build-status` remains the only surface. It requires the server-verified NexCommand platform capability for code visibility; tenant users are denied. There is deliberately no status-writing HTTP endpoint. The UI refreshes this read-only projection every 30 seconds.
