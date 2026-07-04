# PLANNER_HELPER_USAGE.md
> Usage guide for the small repo-local planner helper.

## What This Script Does

The planner helper reads one structured request markdown file and writes one simple implementation-plan markdown file.

It is a tiny deterministic helper for the phase-2 planning workflow.
It does not call any APIs, models, or external services.
It does not approve anything automatically.

## Example Command

```bash
node scripts/planner-helper.js docs/INTAKE_SAMPLE_STRUCTURED_REQUEST_GENERATED.md docs/PLANNER_SAMPLE_PLAN_GENERATED.md
```

## Expected Input Behavior

- Input should be a markdown structured request draft.
- The script uses simple heading and bullet parsing.
- If important information is missing, the script carries forward `[Needs clarification]` and related risks.

## Expected Output Behavior

- Output is a markdown implementation-plan draft.
- The output includes a request summary, suggested steps, risks, dependencies, and human review reminders.
- The output is intended for human review, not automatic execution.

## Human Review Reminder

Human approval is still required before the generated plan is used for implementation work.
