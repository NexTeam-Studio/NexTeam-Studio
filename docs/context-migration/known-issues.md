# Known Issues

This file is a running log of known issues, limitations, and technical
debt related to the Aquatrace multi-agent system.

## Logging Template

Use the following format for each new issue:

```md
### Issue ID: AI-000
- Date:
- Description:
- Affected agent/component:
- Status:
- Resolution notes:
```

## Current Known Issues

### Issue ID: AI-001
- Date: 2026-03-25
- Description: Context can still be lost between independent sessions if key decisions are not migrated into repository docs quickly enough.
- Affected agent/component: All agents / context preservation
- Status: Open
- Resolution notes: Continue expanding `docs/context-migration/` and require critical decisions to be logged promptly.

### Issue ID: AI-002
- Date: 2026-03-25
- Description: Codex and Claude do not have persistent memory across runs, so undocumented workflow assumptions can drift over time.
- Affected agent/component: Claude, Codex, handoff continuity
- Status: Open
- Resolution notes: Use `AGENTS.md`, `CLAUDE.md`, and the workflow docs as canonical references before acting.

### Issue ID: AI-003
- Date: 2026-03-25
- Description: The handoff object schema is documented but not yet programmatically enforced across agent tooling.
- Affected agent/component: Agent handoff protocol
- Status: Open
- Resolution notes: Future phases should add validation or templating support to standardize handoff payloads.
