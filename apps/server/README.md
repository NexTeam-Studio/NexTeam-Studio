# Server App

This is the Node/Express API host for NexTeam Studio. It owns the runtime API surface for health checks, version receipts, media proxying, approval queue endpoints, and module routers as each wave lands.

It connects browser/mobile clients to the shared packages: `@nexteam/core` for contracts and zod validation, `@nexteam/providers` for Jobber and CompanyCam rails, and `@nexteam/nexi` for assistant/gateway flows. Keep provider credentials in environment variables only.

When something breaks, start with `src/server.ts` for route wiring, `src/health.ts` for rail health failures, `src/firebase.ts` for Admin SDK setup, and the module folder under `src/` that owns the failing endpoint.
