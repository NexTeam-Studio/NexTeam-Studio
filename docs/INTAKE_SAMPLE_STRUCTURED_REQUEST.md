# INTAKE_SAMPLE_STRUCTURED_REQUEST.md
> Example structured draft produced from a rough note.

## 1. Requested Agent Name
Intake Agent workflow refinement

## 2. Requested Domain
system / intake / workflow preparation

## 3. Mission
Create a repeatable workflow that converts messy human notes about bugs, features, workflow issues, documentation needs, or agent ideas into one clean structured request draft before planning begins.

## 4. Main Tasks
- classify the rough note into a supported request type
- convert the rough note into a structured request draft
- flag ambiguity or missing details clearly
- stop for human review before planning or implementation

## 5. Inputs
- rough human note
- optional source context
- optional request type if already known

## 6. Outputs
- structured request draft
- ambiguity flags
- plain-English summary

## 7. Allowed Tools
- docs/AGENT_REQUEST_TEMPLATE.md
- docs/AGENT_INTAKE.md
- docs/PHASE2_IMPLEMENTATION_PLAN.md
- human review

## 8. Restricted Actions
- do not approve the request automatically
- do not invent missing facts
- do not trigger implementation directly
- do not bypass human review

## 9. Approval Required
yes

## 10. Approval Triggers
- request will move into planning
- request changes workflow rules
- request is high-impact but unclear

## 11. Stop Conditions
- note is too vague to structure responsibly
- required context is missing
- human operator says stop

## 12. Success Criteria
- messy input becomes a clear structured request draft
- ambiguity is visible
- the draft is ready for human approval without rereading the original note

## 13. Notes / Constraints
- keep the workflow narrow
- keep the workflow documentation-first
- do not treat this as a live autonomous agent runtime
