# Gmail-independent Today Goal 1 relay packet

Job boundary: tenant activation, Firebase owner identity/linkage, owner profile, NexCommand visibility, and isolation verification.

Use the authoritative `apps/server/src/platform/**` activation path and its existing platform routes/repository. Activation creates or reuses the passwordless Firebase owner, preserves non-tenant claims while merging tenant claims, persists the `tenantUsers` owner profile, and creates the tenant subscription. NexCommand remains platform-operator-only; tenant ownership is not a NexCommand authorization substitute.

Verify tenant activation and identity linkage with `apps/server/test/platform.test.mjs`, then run the P0 tenancy and admin-isolation gates. Keep all tenant reads/writes tenant-scoped and prove cross-tenant denials in both directions.

Gmail send or delivery restoration is explicitly excluded. It remains quarantined behind a separate, later gate; do not configure a provider, send an invite, or treat invite delivery as part of this job.
