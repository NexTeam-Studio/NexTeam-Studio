# Agent Schema

This document defines the canonical schema for all agents in the
Aquatrace multi-agent workflow system. Every agent definition should be
expressed using the same core metadata fields so that agents can be
reviewed, compared, versioned, and extended consistently.

## Required Metadata Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique agent name |
| `version` | string | Yes | Semantic or repository-controlled version identifier |
| `role` | string | Yes | The agent's primary function in the system |
| `summary` | string | Yes | Short human-readable description |
| `responsibilities` | array of strings | Yes | Core responsibilities the agent owns |
| `inputs` | array of strings | Yes | Required upstream materials the agent consumes |
| `outputs` | array of strings | Yes | Deliverables the agent must produce |
| `dependencies` | array of strings | Yes | Upstream docs, tools, or agents the agent relies on |
| `escalation_paths` | array of objects | Yes | Conditions under which the agent must escalate |
| `owner` | string | No | Human or system owner responsible for maintaining the agent definition |
| `status` | string | No | Draft, active, deprecated, or archived |
| `notes` | array of strings | No | Additional guidance or implementation notes |

## Escalation Path Object

Each item in `escalation_paths` should define:

| Field | Type | Required | Description |
|---|---|---|---|
| `trigger` | string | Yes | Condition that causes escalation |
| `escalates_to` | string | Yes | Agent or human role that receives the escalation |
| `expected_action` | string | Yes | What should happen after escalation |

## Canonical YAML Example

```yaml
name: Planner Agent
version: 1.0.0
role: planning
summary: Converts structured intake outputs into sequenced task plans.
responsibilities:
  - Break work into actionable steps
  - Identify dependencies and risk areas
  - Assign work to Builder or QA
inputs:
  - Approved intake summary
  - Relevant architecture and feature docs
outputs:
  - Task plan
  - Dependency map
  - Complexity estimate
dependencies:
  - docs/ai/agent-schema.md
  - docs/architecture/
  - docs/features/
escalation_paths:
  - trigger: Conflicting requirements across sources
    escalates_to: Architect Agent
    expected_action: Resolve conflict before implementation planning
status: active
notes:
  - Plans must be clear enough for Builder to execute without reinterpreting scope
```

## Canonical JSON Example

```json
{
  "name": "Planner Agent",
  "version": "1.0.0",
  "role": "planning",
  "summary": "Converts structured intake outputs into sequenced task plans.",
  "responsibilities": [
    "Break work into actionable steps",
    "Identify dependencies and risk areas",
    "Assign work to Builder or QA"
  ],
  "inputs": [
    "Approved intake summary",
    "Relevant architecture and feature docs"
  ],
  "outputs": [
    "Task plan",
    "Dependency map",
    "Complexity estimate"
  ],
  "dependencies": [
    "docs/ai/agent-schema.md",
    "docs/architecture/",
    "docs/features/"
  ],
  "escalation_paths": [
    {
      "trigger": "Conflicting requirements across sources",
      "escalates_to": "Architect Agent",
      "expected_action": "Resolve conflict before implementation planning"
    }
  ],
  "status": "active"
}
```

## Versioning Rules

Agent definitions should be versioned intentionally.

Use the following guidance:

- patch version: clarify wording, fix typos, improve examples, or refine non-behavioral notes
- minor version: add responsibilities, outputs, guardrails, or process detail without changing the agent's core role
- major version: change the agent's role boundary, handoff behavior, escalation behavior, or expected deliverables

When an agent changes materially:

- update its version field
- record the reason for the change in the relevant documentation or decision log
- ensure downstream workflow docs still match the new behavior

## Registering A New Agent

To add a new agent:

1. Confirm the new role cannot be handled by an existing agent without creating overlap or ambiguity.
2. Create a new agent definition document in `docs/ai/`.
3. Populate the definition using the canonical schema.
4. Add the new agent to `AGENTS.md`.
5. Update workflow documentation if handoffs or escalation paths change.
6. Add any system-level reasoning behind the new agent to context or decision logs where appropriate.

No new agent should be treated as active until its role, inputs,
outputs, and escalation behavior are documented and reviewed.
