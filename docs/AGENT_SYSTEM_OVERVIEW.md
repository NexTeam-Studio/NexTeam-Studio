# AGENT_SYSTEM_OVERVIEW.md
> Phase-1 overview of the Aquatrace agent workflow system.

## Purpose

This document explains the basic structure of the phase-1 agent system.

The system is being built to support a practical multi-agent workflow for planning, defining, reviewing, and later implementing structured AI agents around the Aquatrace app and related workflows.

Phase 1 is documentation-first.
This is not yet a live autonomous orchestration system.

## Core Principles

- Keep the system practical
- Keep the system human-reviewable
- Keep each agent narrow in scope
- Separate core agent logic from avatar/presentation
- Require human approval for elevated actions
- Prefer reusable templates over one-off improvisation

## Current Phase-1 Documents

- docs/AGENT_ARCHITECT.md
- docs/AGENT_REGISTRY.md
- docs/AGENT_REQUEST_TEMPLATE.md
- docs/CHILD_AGENT_TEMPLATE.md
- docs/PHASE1_ROADMAP.md
- docs/APPROVAL_RULES.md
- docs/CONTEXT_MIGRATION_PLAN.md
- docs/HANDOFF_WORKFLOW.md

## Phase-1 Goals

- Define the first meta-agent: Agent Architect
- Create a manual registry of agents
- Create reusable request and child-agent templates
- Define approval and handoff rules
- Document the migration path from chat-based context into repo-based docs

## Current Agent Priority

1. Agent Architect
2. Intake Agent
3. Planner Agent
4. QA / Review Agent
5. Documentation Agent

Builder behavior currently remains primarily handled by Codex through human-directed workflow rather than a separate live agent.
