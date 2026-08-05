DOCUMENT_ID: KNOWLEDGE-README-001
TITLE: NexTeam Knowledge Library
DOCUMENT_TYPE: ARCHITECTURE_RECORD
STATUS: ACTIVE
CREATED_AT: 2026-08-05
UPDATED_AT: 2026-08-05
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Atlas
PRODUCT_AREA: Platform
MODULES: documentation
TENANTS: all
RELATED_COMMITS: 578fe8c4-5d51-4e36-bc33-c6f9533c99f5
RELATED_TESTS: npm test prior audit
RELATED_DOCUMENTS: docs/knowledge/standards/NEXTEAM_DOCUMENTATION_STANDARD.md
RELATED_LLM_ARTIFACTS: LLM-INDEX-001
TAGS: knowledge, documentation, handoff

# NexTeam Knowledge Library

This library is the searchable internal record of how NexTeam is built, operated, tested, deployed, and recovered. It is for qualified developers, tenant administrators, support operators, and future AI agents.

Internal documents describe implementation, security, operations, decisions, tests, releases, and rollback. Tenant guides translate verified behavior into tenant-facing instructions; they do not replace technical records.

Every change job updates the relevant code map, decision record, test evidence, and tenant guide requirement in the same job. Documentation links exact repository-relative paths, symbols, changed line ranges, commits, tests, LLM artifacts, and releases.

## Directory index

- `standards/` — mandatory documentation rules.
- `checkpoints/` — preserved working-state records and restore evidence.
- `code-maps/` — file and symbol maps for code changes.
- `decisions/` — operating and product decisions.
- `llm-artifacts/` — index and handling rules for observed AI artifacts.
- `operations/` — operator and deployment procedures.
- `tenant-guides/` — tenant-facing instructions derived from verified internal records.
- `developer-guides/` — developer workflow guidance.
