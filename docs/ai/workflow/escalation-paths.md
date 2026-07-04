# Escalation Paths

This document records the standard escalation scenarios across the
Aquatrace multi-agent system.

| Scenario | Triggered By | Escalates To | Resolution Path |
|---|---|---|---|
| Ambiguous requirements | Intake Agent | Human developer | Ask clarifying questions, update intake summary, then continue |
| Blocked builder | Builder Agent | Intake Agent or Planner Agent | Resolve missing scope or rework task plan before implementation continues |
| QA failure | QA Agent | Builder Agent and human developer | Fix issues, rerun validation, and block merge until resolved |
| Architecture conflict | Planner Agent or Builder Agent | Architect Agent | Reconcile implementation intent with documented system rules |
| Out-of-scope request | Intake Agent or Architect Agent | Human developer | Confirm whether to reject, defer, or split into a later phase |

## Additional Guidance

- Escalation is not failure; it is a control mechanism.
- Agents should escalate early when ambiguity or risk is material.
- Resolution should be documented when it changes scope, ownership, or workflow behavior.
