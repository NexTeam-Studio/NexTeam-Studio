DOCUMENT_ID: DECISION-GLOBAL-CONTROL-2026-08-05
TITLE: Global Control Operating Decisions
DOCUMENT_TYPE: DECISION
STATUS: ACTIVE
CREATED_AT: 2026-08-05
UPDATED_AT: 2026-08-05
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Atlas
PRODUCT_AREA: Platform
MODULES: operations, documentation
TENANTS: all
RELATED_COMMITS: 9f1e1d96-0636-4f64-8356-4333a1c91b1a
RELATED_TESTS: none
RELATED_DOCUMENTS: docs/knowledge/standards/NEXTEAM_DOCUMENTATION_STANDARD.md
RELATED_LLM_ARTIFACTS: LLM-INDEX-001
TAGS: decisions, global-control, operations

# Global Control Operating Decisions

1. ChatGPT web is NexTeam Global Control for planning, sequencing, acceptance criteria, and evidence review.
2. Codex Atlas is the primary local builder.
3. Claude is an optional independent reviewer and is not required as a manual relay for every job.
4. The existing worktree hierarchy is intentional and is not removed merely because it contains many worktrees.
5. Worktrees provide development separation but do not prove module independence.
6. The existing Railway staging environment is the controlled target for remote and mobile testing after build identity verification.
7. Temporary Cloudflare tunnels are local previews and are not proof of a deployed staging build.
8. Codex Remote is configured and used by Chris to communicate with Atlas from mobile devices.
9. The Codex built-in Browser is not used because it is unstable in the current Windows environment.
10. Later authorized jobs may use direct HTTP tools, test runners, approved external browser-test processes, and mobile testing.
11. No AI statement alone declares work complete.
12. Completion requires machine evidence and observed behavior.
13. Documentation is part of the product and changes with each change job.
14. LLM artifacts are indexed and connected to resulting code, decisions, tests, or documentation.
15. Tenant instructions are generated from the verified internal knowledge library.

This record documents operating rules. It does not mechanically enforce them.
