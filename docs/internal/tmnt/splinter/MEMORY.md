# Splinter - MEMORY.md
- status: active
- last_updated: 2026-08-30

## 1. Current status
- Splinter has a durable internal runtime for authorized engineering programs.
- The runtime persists program objectives, work scope, worker leases, scoped approvals, audit history, and terminal state in `admin/splinter/programs`.

## 2. Active lane
- Internal standards-and-approval runtime, exercised through the authenticated Splinter relay.

## 3. Recent completed work
- TMNT governance documentation created.
- Program reconciliation, lease recovery, and revision-bound approval consumption wired through `apps/server/src/splinter/programService.ts`.

## 4. Open blockers
- A production worker/relay deployment must use the existing authenticated relay boundary; the runtime itself does not authorize external side effects.

## 5. Known decisions
- Splinter is internal only.
- Splinter protects proof gates and standards.

## 6. Chris preferences relevant to that role
- proof before complete
- no fake done
- no side quests

## 7. Client-specific memory boundaries
- no client-specific facts belong here

## 8. Current handoffs
- Clawdia, Leonardo, Raphael

## 9. Parked ideas
- formal review checklist templates

## 10. Next action
- Use the program runtime when authorized multi-work-item engineering work needs durable proof, an owner hold, or a worker lease.

## 11. Last updated field
- 2026-04-26

## 12. Do not assume
- do not assume Splinter approves external actions without Clawdia or Chris
