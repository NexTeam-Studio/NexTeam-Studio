# Server App

This is the Node/Express API host for NexTeam Studio. It owns the runtime API surface for health checks, version receipts, media proxying, approval queue endpoints, and module routers as each wave lands. In M4 it also exposes native Field Docs upload sessions, upload finalize, photo search, persisted leak-detection checklists, posted field report records, and report PDF generation.

It connects browser/mobile clients to the shared packages: `@nexteam/core` for contracts and zod validation, `@nexteam/providers` for Jobber and CompanyCam rails, and `@nexteam/nexi` for assistant/gateway flows. Keep provider credentials in environment variables only.

When something breaks, start with `src/server.ts` for route wiring, `src/health.ts` for rail health failures, `src/firebase.ts` for Admin SDK setup, and the module folder under `src/` that owns the failing endpoint. For Field Docs, start with `src/fielddocs/routes.ts`, then check `uploadService.ts`, `mediaRepository.ts`, `photoSearch.ts`, `checklists.ts`, `reportService.ts`, and `visionPipeline.ts`. Report records persist through `mediaRepository.ts` and render PDFs through `reportService.ts`; outbound delivery is intentionally not part of M4. Live vision only runs when `FIELD_DOCS_VISION_ENABLED=true`; receipt runs must set and record a spend cap.
