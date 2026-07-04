# AGENT_REQUEST_TEMPLATE.md
> Phase-1 human request template for defining a new agent through Agent Architect.

Use this template when requesting a new agent spec.

---

## 1. Requested Agent Name
[Name]

## 2. Requested Domain
[What functional area the agent belongs to]

## 3. Mission
[What the agent should do and why it should exist]

## 4. Main Tasks
- [Task 1]
- [Task 2]
- [Task 3]

## 5. Inputs
- [What information the agent receives]

## 6. Outputs
- [What the agent should produce]

## 7. Allowed Tools
- [List tools or systems the agent may use]

## 8. Restricted Actions
- [List what the agent must not do]

## 9. Approval Required
[yes / no]

## 10. Approval Triggers
- [What actions require human sign-off]

## 11. Stop Conditions
- [When the agent must stop and escalate]

## 12. Success Criteria
- [How we know the agent did its job correctly]

## 13. Notes / Constraints
- [Optional extra rules, limits, or context]

---

## Example Use

This template is completed by a human operator first.
Agent Architect then uses the completed request to generate a formal child-agent spec.

---

## Phase 1 Rules

- Keep requests practical and narrow in scope.
- Do not request broad all-powerful agents.
- Prefer one agent per clear responsibility.
- Define tools and restrictions explicitly.
- Require approval for any agent with elevated permissions.
