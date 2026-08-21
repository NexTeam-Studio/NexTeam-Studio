# Splinter durable program continuation

Splinter owns the lifecycle of authorized engineering programs. Conversational agents, worker sessions, tool calls, and reviewer results provide durable evidence; none owns program termination.

Programs persist their objective, selected work, active job, worker lease, scoped owner-action queue, sticky approvals, next action, terminal reason, and audit trail in `admin/splinter/programs`. The relay exposes authenticated program creation, reconciliation, and worker-claim boundaries. The existing local bridge remains the execution adapter: it consumes a dispatched job, reports results to Splinter, and does not decide whether the program ends.

Reconciliation keeps a program `ACTIVE` after a worker returns while review, integration, deployment, browser acceptance, or other work remains. Owner-required work is queued to its dependent item; independent approved work can still dispatch. Only a persisted program-level terminal state may end the program.

Worker leases are durable. A relay or worker restart calls recovery reconciliation after lease expiry; retryable work is not treated as complete. Side-effecting work remains subject to its existing idempotency and approval controls.
