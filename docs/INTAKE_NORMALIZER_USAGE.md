# INTAKE_NORMALIZER_USAGE.md
> Usage guide for the small repo-local intake normalizer helper.

## What This Script Does

The intake normalizer reads one rough-note markdown file and writes one structured request draft markdown file.

It is a tiny deterministic helper for the phase-2 intake workflow.
It does not call any APIs, models, or external services.
It does not approve anything automatically.

## Example Command

```bash
node scripts/intake-normalizer.js docs/INTAKE_SAMPLE_RAW_NOTE.md docs/INTAKE_SAMPLE_STRUCTURED_REQUEST_GENERATED.md
```

## Expected Input Behavior

- Input should be a markdown file containing a rough human note.
- The script uses simple keyword-based classification.
- If important information is missing, the script uses `[Needs clarification]` and adds entries to the `Ambiguity Flags` section.

## Expected Output Behavior

- Output is a markdown structured request draft.
- The output follows the same practical shape as `docs/AGENT_REQUEST_TEMPLATE.md`.
- The output includes a detected request type and an `Ambiguity Flags` section.
- The output is intended for human review, not automatic execution.

## Human Review Reminder

Human approval is still required before the generated draft is used for planning, implementation, or formal agent-definition work.
