DOCUMENT_ID: STANDARD-DOCS-001
TITLE: NexTeam Documentation Standard
DOCUMENT_TYPE: STANDARD
STATUS: ACTIVE
CREATED_AT: 2026-08-05
UPDATED_AT: 2026-08-05
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Atlas
PRODUCT_AREA: Platform
MODULES: documentation
TENANTS: all
RELATED_COMMITS: 0360b9e4-6cb6-4d94-af65-6da450310dce
RELATED_TESTS: none
RELATED_DOCUMENTS: docs/knowledge/README.md
RELATED_LLM_ARTIFACTS: LLM-INDEX-001
TAGS: standard, documentation, evidence

# NexTeam Documentation Standard

## 1. Purpose

Documentation is part of the product record. It makes behavior, risks, decisions, evidence, and recovery searchable without relying on memory or a chat transcript.

## 2. Required audiences

Every record identifies developer, operator, tenant administrator, support, and future-AI relevance.

## 3. Source-code documentation

Non-obvious public interfaces, security rules, schemas, and business rules require accurate source comments or docstrings. Every job creates or updates a code map with exact paths, symbols, changed line ranges, purpose, inputs, outputs, dependencies, errors, tests, risks, and rollback.

## 4. Code-map documentation

Every change has a repository-relative file map and exact changed line ranges.

## 5. API documentation

Document routes, request shapes, response shapes, errors, and access gates.

## 6. Database and persistence documentation

Document collections, ownership, retention, driver selection, and persistence failure behavior.

## 7. Tenant-isolation documentation

Document tenant identity, ownership checks, cross-tenant rejection, and tenant-visible effects.

## 8. Authentication and authorization documentation

Document authentication assumptions, roles, authorization behavior, and unauthenticated boundaries.

## 9. Environment-variable documentation

Document each variable's name, purpose, required state, secret classification, and runtime boundary.

## 10. Deployment documentation

Records identify routes, request and response shapes, collections, tenant ownership, authentication and authorization effects, environment variables, deployment target, build identity, rollback boundary, and evidence. Secret values and customer private data are never written into knowledge documents.

## 11. Test documentation

Document exact commands, pass/fail/skip counts, whether tests are synthetic or live, and the evidence date.

## 12. Failure and recovery documentation

Document observed failure behavior, recovery evidence, and known limitations.

## 13. Rollback documentation

Document exact commands, pass/fail/skip counts, whether tests are synthetic or live, known failure behavior, recovery evidence, and the exact commit or artifact used for rollback. Skipped tests are never described as passed.

## 14. LLM artifact documentation

Observed prompts, reports, screenshots, responses, receipts, and attachments receive an artifact ID and index entry.

## 15. Decision documentation

Decisions receive dated records linked to code, tests, and artifacts where observed.

## 16. Tenant user-guide documentation

Observed prompts, reports, screenshots, responses, receipts, and attachments receive an artifact ID and index entry. Decisions receive records. Tenant guides are produced only from verified internal behavior.

## 17. Screenshots and visual documentation

Visual records identify file path, ownership, privacy classification, and affected module.

## 18. Naming and tagging rules

Names use stable dates and descriptive slugs.

## 19. Search metadata

Every knowledge document begins with the metadata block used in this file.

## 20. Completion requirements

Screenshots and visual assets are indexed by path, ownership, privacy classification, and affected module. Names use stable dates and descriptive slugs. Every knowledge document begins with the metadata block used in this file. Completion requires evidence, code map updates, related-artifact links, risk and rollback information, and required tenant documentation identification.

## Mandatory change record fields

Every future change identifies: module; product area; tenant impact; files, symbols, and line ranges changed; reason; before and after behavior; tests added or changed; evidence; risks; rollback; related issue; decision; prompt or LLM artifact; and required tenant documentation.

Allowed `DOCUMENT_TYPE` values: `STANDARD`, `CODE_MAP`, `CHECKPOINT`, `DECISION`, `OPERATIONS_GUIDE`, `DEVELOPER_GUIDE`, `TENANT_GUIDE`, `LLM_ARTIFACT`, `TEST_EVIDENCE`, `RELEASE_RECORD`, `INCIDENT_REPORT`, `ARCHITECTURE_RECORD`.
