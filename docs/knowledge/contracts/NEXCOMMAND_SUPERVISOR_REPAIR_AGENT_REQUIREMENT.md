# NexCommand Supervisor / Repair Agent Requirement

Status: queued control-plane capability. This document records the requirement; it does not implement a new autonomous agent.

## Purpose

The Supervisor / Repair Agent must supervise an authorized NexTeam outcome rather than treating a live process, a commit, or a single failed command as completion.

## Required behavior

For each authorized job, it must retain the desired outcome, the active run identity, task state, heartbeat, measurable work delta, evidence, blockers, and the original continuation point.

When a blocker is detected, it must follow this sequence:

1. Diagnose from run, task, error, and evidence records.
2. Identify a safe authorized repair or alternate rail.
3. Dispatch and supervise the repair task.
4. Verify the repaired result against the original desired outcome.
5. Resume the original job from its safe continuation point.

It must distinguish a current heartbeat from productive progress. A run with no measurable code, test, deployment, or evidence delta for the configured stall threshold is STALLED, not WORKING.

## Guardrails

The Supervisor must not perform or authorize production changes, destructive operations, credential disclosure, customer communications, or data changes outside the active job authority. It may request human action only when authentication, approval, credentials, irreversible action, or another genuine external boundary prevents a safe repair.

## Required evidence

Each repair decision must retain the original outcome, the blocking evidence, selected repair path, verification result, and whether the original job resumed. A failed deployment API, test, route, or provider call is a repair task, not a terminal completion claim.
