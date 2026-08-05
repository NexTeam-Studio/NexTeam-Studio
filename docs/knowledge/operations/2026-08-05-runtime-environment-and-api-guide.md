DOCUMENT_ID: OPS-RUNTIME-ENV-API-2026-08-05
TITLE: Runtime Environment and Health API Guide
DATE: 2026-08-05

# Operations guide

Do not use memory opt-in for customer, staging, or production runtimes. `GET /api/version` exposes SHA, build time, environment, tenant ID, CRM driver, configuration status, missing variable names, and isolated-memory state. `GET /api/health` returns the same identity under `runtime` plus rail status and is non-2xx when runtime configuration is invalid. Neither endpoint returns variable values.
