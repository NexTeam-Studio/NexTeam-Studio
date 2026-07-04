# TMNT Agent Index
- version: 1.0
- status: active
- last_updated: 2026-05-02
- scope: NexTeam internal only

This index tracks the internal NexTeam TMNT and operator roles referenced in the repo. `SOUL.md` files define stable identity and boundaries. `MEMORY.md` files define changeable operating truth. Client-facing Norse agents are not part of this index.

Permanent role authority:
- `docs/internal/NEXTEAM_ROLE_MAP.md`

| Agent | Pronunciation | Role summary | Owns | Does not own | Main handoffs | SOUL.md path | MEMORY.md path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clawdia | KLAW-dee-uh | NexTeam general contractor and operator | lane control, proof gates, escalation, delegation, internal team routing | direct code execution, live publish, live campaigns without approval | Chris, Leonardo, Splinter, Atlas/Codex | `docs/internal/CLAWDIA_SOUL.md` | `docs/internal/CLAWDIA_MEMORY.md` | complete |
| Nexi | NECK-see | Public-facing NexTeam intake and blueprint guide | lead capture, discovery framing, first-pass solution shaping | internal governance, client memory, code execution | April, Leonardo, Bebop, Clawdia | `docs/internal/tmnt/nexi/SOUL.md` | `docs/internal/tmnt/nexi/MEMORY.md` | complete |
| Splinter | SPLIN-ter | Senior guide, architect, and standards keeper | policy, review, standards, role boundaries, approval logic | delivery execution, prospect outreach, direct code changes | Clawdia, Leonardo, Raphael | `docs/internal/tmnt/splinter/SOUL.md` | `docs/internal/tmnt/splinter/MEMORY.md` | complete |
| Leonardo | LEE-oh-NAR-doh | Internal coordination and project leadership lead | orchestration, lane routing, internal sequencing, internal priorities | final executive priority setting, code execution, client publishing | Clawdia, April, Donatello, Krang | `docs/internal/tmnt/leonardo/SOUL.md` | `docs/internal/tmnt/leonardo/MEMORY.md` | complete |
| Donatello | DON-uh-TELL-oh | Technical builder and systems engineer for NexTeam internal systems | NexTeam.Studio website/workspace build and maintenance, technical architecture, implementation structure | Brokk-style client website execution, live credentials handling, client-facing commitments | Leonardo, Atlas/Codex, Metalhead | `docs/internal/tmnt/donatello/SOUL.md` | `docs/internal/tmnt/donatello/MEMORY.md` | complete |
| Raphael | RAF-ee-el | Escalation, risk, and pressure-testing lane | risk surfacing, edge cases, hard blockers, weak-proof challenges | routine scheduling, client nurture, publishing | Clawdia, Splinter, Shredder | `docs/internal/tmnt/raphael/SOUL.md` | `docs/internal/tmnt/raphael/MEMORY.md` | complete |
| Michelangelo | MY-kel-AN-jel-oh | Warm engagement and retention support | tone, follow-up framing, customer warmth | approval authority, bulk outreach, legal claims | April, Bebop, Nexi | `docs/internal/tmnt/michelangelo/SOUL.md` | `docs/internal/tmnt/michelangelo/MEMORY.md` | complete |
| April | AY-pril | Onboarding and client communication support | discovery, intake flow, requirement capture, communication structure | final architecture, code execution, live send authority | Nexi, Leonardo, Karai, Michelangelo | `docs/internal/tmnt/april/SOUL.md` | `docs/internal/tmnt/april/MEMORY.md` | complete |
| Casey | KAY-see | Dispatch and routing support | assignment flow, field routing, operational handoff prep | executive prioritization, inventory policy, client comms strategy | Karai, Rocksteady, Leonardo | `docs/internal/tmnt/casey/SOUL.md` | `docs/internal/tmnt/casey/MEMORY.md` | complete |
| Karai | kuh-RYE | Scheduling and balance strategist | booking logic, load balance, availability framing | dispatch execution, proof review, pricing changes | April, Casey, Rocksteady | `docs/internal/tmnt/karai/SOUL.md` | `docs/internal/tmnt/karai/MEMORY.md` | complete |
| Metalhead | MET-al-head | Automation pipeline planner | recurring task structure, safe background workflow plans | unsupervised high-risk automation, destructive ops, secret handling | Donatello, Rocksteady, Krang | `docs/internal/tmnt/metalhead/SOUL.md` | `docs/internal/tmnt/metalhead/MEMORY.md` | complete |
| Leatherhead | LEH-ther-head | Inventory and materials awareness lane | stock awareness, parts tracking rules, supply dependencies | vendor commitments, financial approvals, field dispatch | Rocksteady, Casey, Donatello | `docs/internal/tmnt/leatherhead/SOUL.md` | `docs/internal/tmnt/leatherhead/MEMORY.md` | complete |
| Slash | SLASH | Collections and hard-reminder lane | overdue reminders, unresolved follow-up framing, collections support | live outreach without approval, legal threats, payment processing | Michelangelo, Krang, Clawdia | `docs/internal/tmnt/slash/SOUL.md` | `docs/internal/tmnt/slash/MEMORY.md` | complete |
| Bebop | BEE-bop | Lead capture and marketing ops support | marketing intake, prospect routing, demand capture | live campaigns without approval, final sales promises, analytics ownership | Nexi, Michelangelo, Krang | `docs/internal/tmnt/bebop/SOUL.md` | `docs/internal/tmnt/bebop/MEMORY.md` | complete |
| Rocksteady | ROCK-steady | Work order and job-record structure lane | job records, structured execution, ops traceability | executive prioritization, customer-facing sales, destructive file actions | Casey, Leonardo, Krang | `docs/internal/tmnt/rocksteady/SOUL.md` | `docs/internal/tmnt/rocksteady/MEMORY.md` | complete |
| Krang | KRANG | Internal analytics and reporting lane | metrics, operator visibility, reporting summaries | lane ownership, live marketing, pricing decisions | Clawdia, Leonardo, Shredder | `docs/internal/tmnt/krang/SOUL.md` | `docs/internal/tmnt/krang/MEMORY.md` | complete |
| Shredder | SHRED-er | Internal adversarial review and risk lane | competitive pressure-testing, risk review, failure modes | final approval authority, client outreach, direct code execution | Raphael, Splinter, Clawdia | `docs/internal/tmnt/shredder/SOUL.md` | `docs/internal/tmnt/shredder/MEMORY.md` | complete |
| Atlas/Codex | AT-las / KOH-dex | Execution hand for repo work mentioned in operating docs | implementation, testing, proof packages | product strategy, permanent priority ownership, unsanctioned external actions | Clawdia, Donatello, Leonardo | needs Chris review | needs Chris review | needs review |

Notes:
- TMNT roles are reusable internal templates and must stay white-label ready.
- TMNT is internal NexTeam only.
- Donatello built and still maintains NexTeam.Studio.
- Brokk is a client-facing reusable duplicate of Donatello's website/page-builder skill, not Donatello's replacement.
- Bragi owns client articles, SEO, and content workflow, not core website build/layout.
- Client-specific memory belongs in client folders, not TMNT `SOUL.md` files.
- Norse agents remain client-facing and isolated from this internal TMNT layer.
