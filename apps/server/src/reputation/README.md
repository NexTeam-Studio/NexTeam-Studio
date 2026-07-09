# Reputation

This package owns NexTeam's review and Google Business Profile work for each tenant.

It does four jobs:

- Pulls Google Business Profile reviews when that tenant's GBP OAuth is connected.
- Stores review records in the tenant-scoped `reputationReviews` collection.
- Drafts review replies, review requests, and GBP profile updates into ApprovalQueue.
- Exposes a public review widget feed for generated websites.

Nothing in this package publishes directly to Google or sends email by itself. Review replies and profile updates stop at ApprovalQueue, and review requests use the M6 campaign rail so compliance and approval rules stay in one place.

If something breaks, look here first:

- `gbpProvider.ts` for GBP connection status and fixture/live polling behavior.
- `service.ts` for review import, event emission, and approval draft creation.
- `routes.ts` for the web/API surface and OWNER/OFFICE_ADMIN access gates.
- `nexiTools.ts` for the chat tools Nexi can call.

Live GBP receipts remain blocked until the owner completes GBP OAuth and location setup. Until then, the code must return the exact blocker instead of pretending there are no reviews.
