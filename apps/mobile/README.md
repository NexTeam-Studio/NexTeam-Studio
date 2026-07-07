# Mobile App

M11 is the NexTeam field app. It gives techs a phone-first way to see the day, fill checklists, capture photos, close jobs, and review approvals without trusting the cell signal at the job site.

The active code here is the offline-first core that the future Expo shell will use. It is deliberately plain TypeScript so the hardest rules are testable before UI polish: every record is tenant-scoped, the day schedule is cached before the route starts, checklist edits and job close-out write locally first, photos require EXIF timestamp/GPS metadata, and reconnect sync uses last-write-wins with conflict flags for review.

It connects to the rest of NexTeam through a `MobileRemoteAdapter`. The native app will call server APIs through that adapter; tests use a fake adapter to prove the same airplane-mode workflow without touching production data.

When something breaks, look first at `src/offline/syncEngine.ts` for workflow rules, `src/offline/store.ts` for local queue/cache behavior, and `test/offline-first.test.mjs` for the receipt-grade airplane-mode scenario.

