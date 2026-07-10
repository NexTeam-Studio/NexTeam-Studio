# M13 Platform

This folder owns NexTeam's platform layer: plan catalog, tool entitlements, tenant billing status, tenant admin data, tenant branding, multi-user access records, per-tenant cost summaries, and Firestore backup/export routes.

Start here when something breaks:
- `entitlements.ts` decides which Nexi tools a tenant plan can see. If a tenant can do too much or too little, check this first.
- `accessManagement.ts` owns tenant users, Firebase custom-claim payloads, and job-scoped access link verification. Raw magic-link tokens must not go into receipts, logs, or durable records.
- `repository.ts` switches between Firestore in staging and memory in tests. Tenant data, including `tenantBranding/{tenantId}`, must always stay tenant-scoped unless a route is explicitly platform-admin-only.
- `routes.ts` exposes the platform/operator API, tenant branding, and tenant owner/admin multi-user endpoints. User, branding, and job-link write routes must resolve `AccessContext` before writing.
- `billing.ts` only accepts Stripe test-mode keys in this build lane. A live key here is a failed receipt.
- `backup.ts` exports tenant data and writes backup records. Backups should contain tenant-scoped collections only.
- Firestore rules for these records live in `../../../firestore.rules`; job links stay server-only and tenant users are owner/admin/self-readable.
