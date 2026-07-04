# PHASE2_IMPLEMENTATION_PLAN.md
> Practical plan for moving from phase-1 agent documentation into real implementation work.

## Purpose

Phase 1 created a documentation-first foundation for the agent workflow system.

Phase 2 defines how these specs will be used in practice to create real working implementations through Codex and human-reviewed repo work.

This is still not a live autonomous agent runtime.
It is an implementation workflow plan.

## Phase 2 Goals

- Use approved agent specs as build instructions
- Turn selected specs into practical implementation tasks
- Keep all work human-reviewed
- Avoid mixing documentation assumptions with live runtime behavior
- Start with narrow, testable workflow slices

## Recommended Order

1. Choose one approved child agent or workflow slice
2. Convert the approved spec into a scoped implementation request
3. Have Codex propose the implementation plan
4. Review the plan before code changes
5. Implement in small controlled steps
6. Review diffs before commit
7. Test the workflow
8. Document what was actually built

## First Recommended Implementation Target

The first practical implementation target should be a narrow workflow slice, not the full multi-agent system.

Recommended early target:
- structured intake workflow
- request classification
- planning handoff
- human approval checkpoint

## Codex Role In Phase 2

Codex should be used for:
- turning approved specs into implementation plans
- creating scoped code or docs changes
- showing diffs before commit
- following repo rules in AGENTS.md
- avoiding unrelated file changes

## Human Role In Phase 2

Human review is still required for:
- approving implementation scope
- reviewing diffs
- approving commits
- validating whether the result matches the intended workflow
- deciding when a documentation concept becomes real runtime behavior

## Phase 2 Rules

- do not treat specs as live runtime systems
- do not implement broad agent teams at once
- start with one narrow workflow at a time
- keep approval gates in place
- document what is actually implemented
- prefer practical progress over theoretical completeness

## Definition of Done

Phase 2 is working correctly when:
- one approved workflow slice has a clear implementation plan
- Codex can execute that plan in controlled steps
- human review remains in the loop
- repo docs stay aligned with what is actually built
