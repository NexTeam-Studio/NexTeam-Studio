# Example Flow: New Feature Request

This example shows how a new Aquatrace feature should move through the
agent system from request to merge.

## Example Request

"Add a technician-facing offline sync summary screen that shows pending
photos and checklist items."

## 1. Intake Agent

### Input

- raw feature request from human operator

### Output

```md
Problem:
Technicians do not have a clear screen showing what is still pending sync.

Goal:
Add a screen that summarizes pending offline items in a technician-friendly way.

Constraints:
- Must not break existing offline sync behavior
- Must work with current Firebase and local queue design
- Must be understandable in low-connectivity field conditions

Open Questions:
- Is this a new screen or part of Settings?
- Should technicians be allowed to force retries from this screen?
```

## 2. Architect Agent

### Input

- intake summary
- existing offline mode docs

### Output

- recommendation that the feature belongs in existing Settings and sync-related flows
- constraints on avoiding duplicate status surfaces
- note that queue and UI state should share a single source of truth

## 3. Planner Agent

### Input

- approved intake summary
- architecture guidance

### Output

```md
Task Plan:
1. Review current offline sync state sources
2. Define the data contract for pending item counts
3. Add UI entry in Settings
4. Add tests for summary rendering and empty-state behavior
5. Hand off to QA for regression review
```

## 4. Builder Agent

### Input

- approved task plan

### Output

- code changes implementing the sync summary
- any required documentation updates
- implementation notes describing assumptions and touched files

## 5. QA Agent

### Input

- Builder outputs
- intake summary
- task plan

### Output

```md
QA Report:
- Requirements covered: yes
- Regressions found: none
- Tests run: type check, relevant UI test coverage, manual offline flow validation
- Status: pass
```

## 6. Human Review And Merge

The human operator reviews:

- whether the feature matches intent
- whether the workflow respected documented constraints
- whether QA produced enough confidence for merge

Only after human approval should the change be merged.
