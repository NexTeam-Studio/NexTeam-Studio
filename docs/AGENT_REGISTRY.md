# AGENT_REGISTRY.md
> Phase-1 human-maintained registry of defined agents in the system.

This document tracks which agent specs currently exist so Agent Architect and human operators can check for duplication, conflicts, ownership, and status.

## Registry Table

| Agent ID | Agent Name | Status | Parent Agent | Domain | Spec File | Last Updated |
|---|---|---|---|---|---|---|
| agt_system_agent-architect_v1 | Agent Architect | defined | none | system / meta-agent | docs/AGENT_ARCHITECT.md | 2026-03-25 |
| agt_system_intake_v1 | Intake Agent | defined | Agent Architect | system / intake / workflow preparation | docs/AGENT_INTAKE.md | 2026-03-25 |
| agt_system_planner_v1 | Planner Agent | defined | Agent Architect | system / planning / workflow preparation | docs/AGENT_PLANNER.md | 2026-03-25 |
| agt_system_qa-review_v1 | QA / Review Agent | defined | Agent Architect | system / review / quality control | docs/AGENT_QA_REVIEW.md | 2026-03-25 |
| agt_system_documentation_v1 | Documentation Agent | defined | Agent Architect | system / documentation / knowledge maintenance | docs/AGENT_DOCUMENTATION.md | 2026-03-25 |
| agt_aquatrace_brokk_v1 | Brokk | defined | none | aquatrace / wordpress / build | docs/AQUATRACE_WEBSITE_AGENTS.md | 2026-04-17 |
| agt_aquatrace_bragi_v1 | Bragi | defined | none | aquatrace / content / seo | docs/AQUATRACE_WEBSITE_AGENTS.md | 2026-04-17 |

## Notes

- Phase 1 only: this is a manual markdown registry, not a live system registry.
- Add one new row for each new agent spec created.
- Keep agent IDs unique.
- Update Status and Last Updated when an agent spec changes.
- If an agent is deprecated, keep the row and change Status rather than deleting it.
