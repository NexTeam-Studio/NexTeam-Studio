# Today Goal 1 — Gmail-independent tenant owner activation receipt

Job: `NEXTEAM-TODAY-GOAL1-GMAIL-INDEPENDENT-20260810`  
Worktree: `target-architecture-integration`  
Scope: tenant activation, Firebase owner identity/linkage, operator visibility,
and tenant isolation only.

## Result

- The authoritative platform repository transaction commits the tenant, owner
  profile, subscription, prospect/assignment transition, and membership audit
  exactly once; a compatible retry returns the existing activation.
- Firebase owner creation is passwordless and safely reuses an existing email,
  including the create-race case. Existing non-tenant claims are retained when
  tenant claims are merged.
- The existing NexCommand lifecycle projection shows authorized operators the
  owner profile and active onboarding/subscription state without provider error
  detail.
- Production tenant access now requires an explicit tenant assignment; a
  platform-operator claim no longer falls back to tenant-owner access.

## Proof

- Focused activation and route-isolation tests: 24 pass, 0 fail.
- Authenticated Firestore Admin tenant-isolation emulator: 5 pass, 0 fail,
  including cross-tenant protections in both directions.
- Full non-browser suite: 515 pass, 0 fail, 3 skipped.
- Typecheck, lint, server/web build, tenancy, worktree scope/coverage, secret
  scan, secret-history scan, and diff check passed.
- Contract: `docs/contracts/tenant-owner-activation.md`.

## Quarantined rail

No Gmail/provider configuration, invitation send, delivery verification,
browser work, deployment, real-user provisioning, payment action, or secret
output occurred. Email delivery remains a separately gated quarantined substep.
