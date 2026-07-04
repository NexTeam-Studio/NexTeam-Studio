# CHILD_AGENT_TEMPLATE.md
> Phase-1 reusable template for defining child agents through Agent Architect.

Use this template for every new agent spec created in phase 1.

---

# AGENT_[NAME].md

## 1. Agent Name
[Name]

## 2. Agent ID
[Unique identifier — format: agt_[domain]_[name]_v[version]]

## 3. Parent Agent
[Usually Agent Architect, unless another approved orchestrator creates it]

## 4. Mission
[Single paragraph describing what this agent does and why it exists]

## 5. Domain
[The functional area this agent operates in]

## 6. Inputs
| Input | Type | Description |
|---|---|---|
| [input_name] | [type] | [description] |

## 7. Outputs
| Output | Format | Description |
|---|---|---|
| [output_name] | [format] | [description] |

## 8. Allowed Tools
- [Tool or system]
- [Tool or system]

## 9. Restricted Actions
- [What this agent must not do]
- [What this agent must not do]

## 10. Workflow
1. [Step 1]
2. [Step 2]
3. [Step 3]

## 11. Stop Conditions
- [When the agent must stop and escalate]
- [When the agent must stop and escalate]

## 12. Approval Triggers
- [Actions that require human approval]
- [Actions that require human approval]

## 13. Success Criteria
- [How success is measured]
- [How success is measured]

## 14. Error Handling
- [How the agent handles failures or missing inputs]

## 15. Status
[defined / active / deprecated]

## 16. Version
[Semantic version: major.minor.patch]

## 17. Last Updated
[YYYY-MM-DD]

---

## Phase 1 Rules

- Keep each child agent narrow in scope.
- Prefer one agent per clear responsibility.
- Do not grant broader permissions than required.
- Define approval triggers explicitly.
- Keep language practical and human-reviewable.
