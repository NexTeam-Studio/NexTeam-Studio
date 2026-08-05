DOCUMENT_ID: CHECKPOINT-2026-08-05-GLOBAL-CONTROL-JOB-002
TITLE: Configuration Integrity, Runtime Truth, and Job 001 Proof Closure
DATE: 2026-08-05
STATUS: COMPLETE_WITH_EXISTING_LINT_FAILURE

# Result

Job 001 commits and the external backup were verified. The backup had 14 files and all 14 SHA-256 hashes matched. AuthGate had no content diff; its line-ending-only status was restored after byte-backup verification.

COMMAND: `node --import ./tests/setup.mjs --import tsx --test apps/server/test/runtime-configuration.test.mjs`

OUTPUT BEFORE FIX: `tests 5; pass 0; fail 5; skipped 0`

OUTPUT AFTER FIX: `tests 5; pass 5; fail 0; skipped 0`

FINDING: missing tenant protection, the test-environment bypass, unauthorized memory persistence, incomplete identity output, and absent driver output were all reproduced before the fix.

COMMAND: `npm test`

OUTPUT: `tests 468; pass 451; fail 14; skipped 3; cancelled 0; duration_ms 20461.0791`

FINDING: the 14 failures equal the verified pre-job baseline. The additional five runtime tests account for the total increase from 463 to 468.

Changed files: `apps/server/src/app/runtimeIdentity.ts`, `persistencePolicy.ts`, `buildInfo.ts`, `core/systemRoutes.ts`, `health.ts`, `packages/core/src/schemas.ts`, and focused tests. Customer-capable startup now fails loudly for missing configuration. Memory is only allowed with `NODE_ENV=test|development`, `RUNTIME_MODE=isolated`, `ALLOW_IN_MEMORY_PERSISTENCE=true`, and a `test-` or `local-` tenant ID.

COMMAND: isolated local start on port 43210, followed by direct HTTP GET requests to `/api/version` and `/api/health`.

OUTPUT: `VERSION_STATUS=200; HEALTH_STATUS=200; sha=3c82866e04ae22d82cad95130c75b9301dcfa8f9; tenantId=local-runtime-proof; crmRepositoryDriver=memory; configurationStatus=valid; missingRequiredVariables=[]; PROCESS_EXITED=True; PORT_LISTENING_AFTER_STOP=False`.

FINDING: the composed isolated server returned sanitized runtime identity and was stopped. No secret values appeared.

Gates: typecheck PASS; build PASS; tenancy, admin writes, indexes, collisions, worktree scope, coverage, secret scan, provider imports, and blueprints PASS. Lint FAIL due to the pre-existing unused `tenantName` at `apps/web/src/features/nexi/areas/chat/components/NexiStandaloneChat.tsx:774`; this job did not touch it.

Tenant impact: a real tenant without Firebase Admin configuration no longer starts into an empty in-memory CRM. No deployment, Railway change, browser, database write, or remote push occurred.

Rollback commands: `git revert 3c82866e04ae22d82cad95130c75b9301dcfa8f9`; `git revert a2a9216df9f87e41db2891d76ab4a3f7febaf3b7`; `git revert f783f0de7730da7f218c0d5f3b71c1db67dbc4c3`; `git revert e2ca05230a073ec9ba67e9090055dbc8c8f936d4`.
