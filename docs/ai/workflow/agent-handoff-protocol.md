# Agent Handoff Protocol

This document defines how agents pass work to one another in the
Aquatrace workflow system.

## Standard Handoff Object

Every handoff should include a structured object with the following
fields:

```yaml
from: Intake Agent
to: Planner Agent
task_id: AQ-123
summary: Prepare implementation plan for offline photo sync fixes
outputs:
  - structured intake summary
  - documented constraints
next_steps:
  - break request into implementation tasks
  - identify testing requirements
```

## Required Fields

| Field | Description |
|---|---|
| `from` | Originating agent |
| `to` | Receiving agent |
| `task_id` | Stable task or issue identifier |
| `summary` | Plain-language description of what is being handed off |
| `outputs` | Artifacts created by the sending agent |
| `next_steps` | What the receiving agent is expected to do next |

## Rules

- No agent skips the Intake step for new work.
- Every handoff must preserve enough context for the next agent to work without guessing.
- If an agent changes scope or assumptions, the handoff must explicitly say so.
- Handoffs should reference existing docs when they constrain the work.

## Failed Handoffs

A handoff is considered failed when:

- required inputs are missing
- the receiving agent cannot determine the next action
- the summary conflicts with attached outputs
- task ownership is ambiguous

When a handoff fails:

1. the receiving agent should not proceed silently
2. the failure reason should be recorded
3. the work should return to the prior agent or escalate appropriately

## Logging Requirements

Every significant handoff should be traceable through:

- task identifier
- sending agent
- receiving agent
- timestamp or session context
- output artifacts referenced by path or title

The goal of logging is reproducibility and continuity across sessions,
not bureaucracy for its own sake.
