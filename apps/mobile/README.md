# Mobile App

M11 is the NexTeam field app. It gives techs a phone-first way to see the day, fill checklists, capture photos, close jobs, and review approvals without trusting the cell signal at the job site.

The active code has two layers:

- `app/` is the Expo shell. It is intentionally small and field-grade: cached day, checklists, photo queue, approvals, push, and Nexi offline state.
- `src/offline/` is the tested offline-first core. It is plain TypeScript so the hardest rules are provable: every record is tenant-scoped, the day schedule is cached before the route starts, checklist edits and job close-out write locally first, photos require EXIF timestamp/GPS metadata, and reconnect sync uses last-write-wins with conflict flags for review.
- `src/native/apiClient.ts` connects the Expo shell to the server `/api/mobile/*` routes through the same `MobileRemoteAdapter` used in tests.

It connects to the rest of NexTeam through `apps/server/src/mobile`: assigned schedule preload, sync, push-token registration, and approval review. M11 must never fetch another technician's jobs onto a technician device, and job-link/subcontractor users only get their scoped job.

When something breaks, look first at `src/offline/syncEngine.ts` for workflow rules, `src/offline/store.ts` for local queue/cache behavior, `src/native/apiClient.ts` for server calls, and `test/offline-first.test.mjs` for the receipt-grade airplane-mode scenario. A final field receipt still requires a real phone: schedule preload, airplane mode, checklist/photo/close-out, reconnect, verified sync.

