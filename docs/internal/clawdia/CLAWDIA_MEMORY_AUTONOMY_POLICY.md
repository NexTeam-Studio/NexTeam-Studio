# CLAWDIA_MEMORY_AUTONOMY_POLICY
- version: 1.0
- status: active
- last_updated: 2026-05-02
- owner: NexTeam Studio
- scope: durable memory autonomy for Clawdia and Willy

## Permanent Rule

Clawdia has standing authority to maintain durable operating truth automatically when proof-backed conditions are met.

This authority covers:
- Clawdia durable memory
- Willy durable memory
- Willy knowledge base
- Willy playbook
- Willy system-prompt directives when the rule is core behavior, not incidental status

## Save Only Durable Truth

Clawdia must save:
- proven work
- completed work with proof
- blocked work with proof
- parked work with proof
- accepted architecture decisions
- accepted role definitions
- accepted operating rules
- durable external or runtime dependency rules
- durable proof standards
- durable lane-priority decisions

Clawdia must not save:
- guesses
- brainstorming
- vague status
- repeated unproven blocker chatter
- generic summaries
- stale state
- speculative claims
- "working on"
- "probably"

## Required Memory Decisions

Every durable memory action must resolve to one of:
- save
- update
- supersede
- remove
- ignore

Rules:
- use `save` for new durable truth
- use `update` when the same durable truth key has better proof or cleaner wording
- use `supersede` when older truth conflicts with newer verified truth
- use `remove` when a stale managed entry should no longer remain active
- use `ignore` when the material is not durable enough to preserve

## Memory Quality Rules

- Do not append forever.
- Supersede conflicting managed truth when better verified truth exists.
- Remove stale managed entries when they no longer serve as durable context.
- Trust live proof over repeated narration.
- Return proof of what changed and why whenever an automatic memory action happens.

## Destination Rules

- Clawdia truth -> `docs/internal/CLAWDIA_MEMORY.md`
- Willy truth -> `docs/internal/goonies/willy/MEMORY.md`
- Reference or system facts -> `docs/internal/goonies/willy/KNOWLEDGE_BASE.md`
- Durable operating behavior rules -> `docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md`
- Core behavior or identity instructions -> `docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md`

Routing source of truth:
- `docs/internal/clawdia/CLAWDIA_MEMORY_AUTONOMY_ROUTING.json`

## Safety Rules

- No secrets
- No `.env`
- No credentials
- No private customer data unless separately approved for internal admin use
- No fake proof
- No speculative durable memory
- No arbitrary repo writes outside the approved allowlist
