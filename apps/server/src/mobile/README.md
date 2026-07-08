# Mobile Server Rail

This module is the API boundary for the M11 native field app. It serves assigned day schedules, one-job access, offline sync, push-token registration, and owner/admin approval review.

It connects to the rest of NexTeam through `AccessContext`, `@nexteam/mobile` offline schemas, and the shared `ApprovalQueueService`. Technician users only see assigned jobs; job-link users can only open their one scoped job; owner/admin users can review approval queue state. No route sends outbound messages or writes to Jobber/CompanyCam.

When something breaks, start with `routes.ts` for request gates, `access.ts` for role/job-link enforcement, and `repository.ts` for the current in-memory receipt implementation. The offline device workflow itself lives in `apps/mobile/src/offline/syncEngine.ts`.
