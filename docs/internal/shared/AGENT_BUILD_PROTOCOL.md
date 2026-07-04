━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE: AGENT_BUILD_PROTOCOL.md
VERSION: 1.0
OWNER: Chris Sears — Aquatrace / NexTeam
MAINTAINED BY: Codex
READ BY: Clawdia — required at start of every session
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# NexTeam Agent Build Protocol
## Permanent Standing Rules — All Agent Builds

These rules apply to every agent Clawdia builds, without exception.
No agent is considered complete until all four standards below are met.

---

### RULE 1 — THIRD-GRADER UI
The end user interface must be so simple that a non-technical person
can pick it up in under 2 minutes with zero explanation.
- No jargon in labels or buttons
- Every input field must be obvious — label it, hint it, example it
- One clear primary action per screen
- If a third grader would get confused, it is not done

### RULE 2 — BUILT TO DUPLICATE
Every agent is built as a reusable template first — never a one-off.
- No client-specific data hardcoded into agent logic
- Client name, brand, tone, topics, credentials go in as CONFIG — not baked in
- Every agent must be clonable in under 10 minutes for a new client
- Document the config fields clearly in a SETUP section inside the agent

### RULE 3 — AGENT LIBRARY STANDARD
Every completed agent is a sellable product in the NexTeam library.
- Current library targets: article writer, social media writer, email campaign,
  lead capture, SEO audit, content calendar, client onboarding
- When an agent is complete, Codex archives it to the library with:
  - Agent name and version
  - What it does in one sentence
  - Config fields required to deploy for a new client
  - Estimated setup time per new client deployment

### RULE 4 — WHITE-LABEL READY
Every agent must be deployable under any client brand — not just Aquatrace.
- Logo, brand name, colors = config variables
- All Aquatrace-specific language must be in config — not in core logic
- Core agent logic must be brand-neutral at build time

---

## Current Active Agents

| Agent | Status | Notes |
|-------|--------|-------|
| Braggy | In testing | Article writer for Aquatrace WordPress SEO |

---

## Version History
v1.0 — Initial protocol established by Chris Sears

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF FILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
