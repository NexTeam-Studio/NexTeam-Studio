# INTAKE_EXECUTION_WORKFLOW.md
> Smallest practical phase-2 workflow for turning rough notes into structured request drafts.

## Purpose

This workflow is the first real implementation slice of the phase-2 agent system.

It is not a live autonomous agent runtime.
It is a human-reviewed working process that uses the existing phase-1 docs to normalize rough input into a structured request draft.

## Input

A rough human note such as:
- bug note
- feature idea
- workflow issue
- documentation request
- agent request

## Output

A structured draft shaped like `docs/AGENT_REQUEST_TEMPLATE.md`.

## Workflow

1. Human provides a rough note
2. Codex or another approved assistant classifies the request type
3. Codex or another approved assistant converts the rough note into a structured request draft
4. Human reviews the draft
5. If approved, the draft can be used as Planner input or as the basis for a formal new agent request

## Phase-2 Rules

- Do not guess missing facts without flagging them
- Keep the request narrow and practical
- Flag ambiguity clearly
- Do not skip human review
- Do not treat the draft as approved until a human says so

## Supported Request Types

- bug
- feature
- workflow change
- documentation need
- agent request

## Success Criteria

- rough input becomes a clear structured draft
- ambiguity is flagged
- the output is easy to review
- the output fits the existing request template workflow
