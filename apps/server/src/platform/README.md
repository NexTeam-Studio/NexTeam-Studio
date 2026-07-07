# M13 Platform

This folder owns NexTeam's platform layer: plan catalog, tool entitlements, tenant billing status, tenant admin data, per-tenant cost summaries, and Firestore backup/export routes.

Start here when something breaks:
- `entitlements.ts` decides which Nexi tools a tenant plan can see. If a tenant can do too much or too little, check this first.
- `repository.ts` switches between Firestore in staging and memory in tests. Tenant data must always stay tenant-scoped unless a route is explicitly platform-admin-only.
- `routes.ts` exposes the operator console API. These routes are for platform operators, not customers.
- `billing.ts` only accepts Stripe test-mode keys in this build lane. A live key here is a failed receipt.
- `backup.ts` exports tenant data and writes backup records. Backups should contain tenant-scoped collections only.
