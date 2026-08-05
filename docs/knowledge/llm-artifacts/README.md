DOCUMENT_ID: LLM-ARTIFACT-README-001
TITLE: LLM Artifact Handling
DOCUMENT_TYPE: LLM_ARTIFACT
STATUS: ACTIVE
CREATED_AT: 2026-08-05
UPDATED_AT: 2026-08-05
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Atlas
PRODUCT_AREA: Platform
MODULES: documentation
TENANTS: all
RELATED_COMMITS: 6aa92136-4190-4155-8c53-cd2efce70f58
RELATED_TESTS: none
RELATED_DOCUMENTS: docs/knowledge/llm-artifacts/index.csv
RELATED_LLM_ARTIFACTS: LLM-INDEX-001
TAGS: llm, artifacts, evidence

# LLM Artifact Handling

An LLM artifact is an observed prompt, instruction, response, forensic report, screenshot, attachment, acceptance record, generated report, decision summary, repair receipt, or build receipt. Artifact IDs are stable, dated identifiers in `index.csv`.

Each artifact links to affected modules, commits, decisions, and documents when those links are observed. Private data and possible secrets are marked `REVIEW_REQUIRED`; values are not copied into this library. Screenshots and attachments are indexed by observed local path. Unavailable conversations are recorded as `NOT AVAILABLE TO THIS WORKTREE`.

Future Global Control prompts and Atlas receipts are indexed when observed. Indexing does not establish that an artifact's claims are true; claims require independent evidence.
