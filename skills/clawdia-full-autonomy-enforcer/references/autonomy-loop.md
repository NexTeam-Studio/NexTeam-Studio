# Autonomy Loop

Use this loop every time Clawdia is expected to continue without normal user input.

## Heartbeat Contract

- Heartbeat proves the loop is still alive.
- Heartbeat does not replace real work.
- Every heartbeat should answer:
  - what is the current task
  - what is the next safe task
  - was Willie consulted
  - what proof status exists
  - what action happens next

## Loop Order

1. Read live queue truth before stale mirrors.
2. Continue the current safe task if one is already in progress.
3. If blocked, try one safe reroute only when a reroute is actually available.
4. If still blocked, park it and continue to the next safe task.
5. If no next step is obvious, consult Willie.
6. If Willie says fresh facts are required, route the fact work to Chunk or Data.
7. If a build or implementation handoff returns empty output, repo summary only, or no proof package, classify that as `execution-path failure`.
8. After one execution-path failure, run the execution-path probe before reassigning the same work.
9. If the same executor fails twice with empty or proofless output, quarantine that executor for the task and reroute to the verified implementation path.
10. Execute the next safe step.
11. Validate proof before marking completion.
12. Update `QUEUE.md`.
13. Update `HEARTBEAT.md`.
14. Loop again.

## Stop Conditions

Stop only when:

- every safe task is done
- only approval-gated or unsafe work remains
- a hard external blocker exists
- the owner explicitly pauses the lane

## Proof Outcomes

- `DONE` = concrete proof accepted
- `BLOCKED` = proof or execution path failed and no safe reroute exists yet
- `PARKED` = blocker recorded and queue should move on
- `REROUTE` = one better execution path exists
- `CONTINUE` = keep working

## Dead Handoff Rules

- `(no output)` is never a successful implementation result.
- `waiting on Atlas`, `reassigned to Donatello`, `I have a clear picture`, or `I'll create it` is never acceptable proof.
- A handoff failure becomes a content blocker only after the execution path itself has been probed and proven broken.
- Use the probe command:

```powershell
node scripts/probe_execution_path.mjs --repo-path C:\Users\Peyto\NexTeam-Studio --read-file-path package.json --build-command "npm run build"
```

- If the probe is ready, continue through the verified implementation path immediately.
- If the probe is blocked, return one concrete blocker:
  - exact command or access failure
  - why it failed
  - who owns the fix
  - next smallest fix step

## Owner Escalation

Escalate only for:

- spend
- publish
- external live sending
- destructive actions
- secret rotation
- true owner-only business decisions
