# NexOps Third-Party Adapters

Last updated: 2026-07-18

Jobber and CompanyCam remain in the repo only as dormant adapter packages and manual migration tooling after the 2026-07-18 product-independence cut. Nothing on the live NexOps request path imports, instantiates, or calls those adapters by default; active tenants and defaults stay `adapters.crm = "native"` and `adapters.media = "native"`. Reviving either integration later would require an explicit per-tenant opt-in through the existing adapter-config seam, plus fresh runtime wiring, tests, and UI copy instead of silently reusing the dormant packages.
