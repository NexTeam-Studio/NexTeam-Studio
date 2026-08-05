DOCUMENT_ID: CODEMAP-RUNTIME-CONFIGURATION-2026-08-05
TITLE: Runtime Configuration and Persistence Map
DATE: 2026-08-05

# Map

`apps/server/src/app/runtimeIdentity.ts` selects the CRM driver and produces sanitized configuration status. `persistencePolicy.ts` fails invalid startup before composition. `composeServerApp.ts` and `app/runtime.ts` invoke that policy. `core/systemRoutes.ts` exposes identity. `health.ts` makes invalid configuration unhealthy.

Durable customer runtime requires `TENANT_ID` and either `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY`. Isolated memory requires `NODE_ENV=test|development`, `RUNTIME_MODE=isolated`, `ALLOW_IN_MEMORY_PERSISTENCE=true`, and a `test-` or `local-` tenant ID.
