# APPROVAL_RULES.md
> Phase-1 approval rules for the agent workflow system.

## Purpose

This document defines when human approval is required before an agent action, spec, or change is accepted.

## Approval Is Required When

- an agent requests admin-level permissions
- an agent would modify production systems
- an agent would spawn, terminate, or replace other agents
- an agent scope overlaps with an existing agent
- an agent would modify finalized specs
- an agent would affect deployment, release, or external integrations
- an agent request is unclear but still high-impact

## Approval Is Not Required When

- a human-readable draft is being prepared for review
- a documentation-only change stays within approved scope
- a narrow read-only spec draft is being generated for review

## Phase 1 Rule

In phase 1, all agent definitions remain human-reviewed before being treated as final.
