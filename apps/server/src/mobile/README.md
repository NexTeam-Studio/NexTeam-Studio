# Mobile Server Rail

This module is the API boundary for the M11 native field app. It serves session bootstrap, assigned day boards, visit context, offline sync, mobile narration transcription, one-job access, push-token registration, and owner/admin approval review.

It connects to the rest of NexTeam through `AccessContext`, `@nexteam/mobile` capture schemas, the native CRM/scheduling/media repositories, `FieldDocsService`, and the shared `ApprovalQueueService`. Technician users only see assigned visits/jobs and capture batches in their scope; job-link users can only open their one scoped job; owner/admin users can review approval queue state. No route sends outbound messages or writes to dormant third-party rails.

When something breaks, start with `routes.ts` for request gates and the M11 day-board/context endpoints, `access.ts` for role/job-link enforcement, `transcription.ts` for narration cost-cap behavior, and `repository.ts` for the older in-memory receipt implementation. The offline device workflow itself lives in `apps/mobile/src/native/captureQueue.ts` and `apps/mobile/src/native/MobileCaptureApp.tsx`.
