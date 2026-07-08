# M13 Multi-User Tenant Access Design

Status: design approved for future M13 implementation. Do not build until M13 resumes.

## Problem

NexTeam tenants cannot stay single-operator. Real tenants need multiple internal users and narrower external/subcontractor access without weakening tenant isolation.

This design extends the existing M13 plan entitlement pattern with role-tier enforcement inside a tenant.

## Tier 1: Internal Tenant Roles

Internal users are Firebase Auth users with custom claims and a native `tenantUsers` record.

Firebase custom claims:

```json
{
  "tenantId": "aquatrace",
  "tenantRole": "OWNER",
  "tenantUserId": "tenant_user_chris"
}
```

Native collection: `tenantUsers`

```ts
type TenantUser = {
  id: string;
  tenantId: string;
  authUid: string;
  email: string;
  displayName: string;
  role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Role meanings:

- OWNER: full tenant access, billing/config, all modules allowed by tenant plan.
- OFFICE_ADMIN: CRM, scheduling, quotes, client communication draft/approval work; no platform billing/config or financial account setup.
- TECHNICIAN: assigned schedule, assigned job checklists, assigned-job media capture, own job notes/status; no pricing, no tenant-wide client list, no email/campaign access.

Aquatrace seed users:

- Chris: OWNER.
- Catherine: TECHNICIAN unless owner changes it.
- Logan: TECHNICIAN unless owner changes it.

## Tier 2: External/Subcontractor Access

Subcontractor access is not an internal role. It uses a separate job-scoped access pattern closer to the client portal.

Native collection: `jobAccessLinks`

```ts
type JobAccessLink = {
  id: string;
  tenantId: string;
  jobId: string;
  propertyId?: string;
  externalName: string;
  externalEmail?: string;
  tokenHash: string;
  scopes: Array<"job.read" | "checklist.write" | "media.upload" | "notes.write">;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
};
```

Rules:

- Magic-link token grants access to exactly one tenant/job/property tuple.
- No client list, pricing, invoices, campaigns, email, tenant settings, or other jobs.
- Uploads and checklists must stamp `jobAccessLinkId` and stay tenant/job scoped.
- Expired or revoked links fail closed.

## Enforcement Pattern

Every authenticated request resolves an `AccessContext` before any module code runs.

```ts
type AccessContext =
  | {
      kind: "internal";
      tenantId: string;
      authUid: string;
      tenantUserId: string;
      role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
      planModules: Set<PlatformModule>;
    }
  | {
      kind: "job_link";
      tenantId: string;
      jobId: string;
      propertyId?: string;
      scopes: Set<JobAccessScope>;
      linkId: string;
    };
```

Server authorization becomes two gates:

- Plan gate: tenant subscription permits the module.
- Role/scope gate: this specific user/link can perform the action on this object.

Role checks live beside the existing M13 entitlement registry, not in prompts or UI conditionals.

Example:

```ts
can(access, "jobs.read", { tenantId, jobId })
can(access, "pricing.read", { tenantId })
can(access, "campaigns.sendApproval.create", { tenantId })
```

## Required Role Matrix

| Capability | OWNER | OFFICE_ADMIN | TECHNICIAN | SUBCONTRACTOR |
|---|---:|---:|---:|---:|
| Tenant settings/billing | yes | no | no | no |
| CRM client list | yes | yes | no | no |
| Quotes/pricing | yes | yes | no | no |
| Schedule all jobs | yes | yes | no | no |
| Assigned schedule | yes | yes | yes | one assigned job only |
| Checklist write | yes | yes | assigned jobs only | linked job only |
| Photo/video upload | yes | yes | assigned jobs only | linked job only |
| Email/campaigns | yes | yes, if granted | no | no |
| Platform admin | yes | no | no | no |

## Firestore Rules Shape

Rules should require both tenant match and role/scope match.

Internal examples:

- `tenantUsers/{id}` readable by OWNER and by the user's own `authUid`.
- `jobs/{id}` readable by OWNER/OFFICE_ADMIN, or TECHNICIAN when `assignedTo` contains the user's `tenantUserId`.
- `media/{id}` writable by TECHNICIAN only when `jobId` is assigned to them.

External examples:

- `jobAccessLinks` never directly readable by clients.
- Magic-link sessions exchange token for a short-lived server-issued session claim limited to `tenantId/jobId/linkId/scopes`.
- Firestore writes from external users include `jobAccessLinkId` and must match that claim.

## Wave 3 Assumption Flags

M6 Campaigns:

- Current campaign work is tenant-scoped and approval-gated, but not role-gated yet.
- Future role gate must block TECHNICIAN and job-link users from every campaign/audience/send path.

M8 Website:

- Lead form is public-by-design and tenant-scoped; no user role assumption.
- Future admin site-builder UI must require OWNER or OFFICE_ADMIN.

M11 Mobile:

- Offline cache must preload only jobs visible to the current user.
- TECHNICIAN cache is assigned jobs only.
- Subcontractor cache is exactly the linked job/property only.
- Local queue items must store `actorTenantUserId` or `jobAccessLinkId` so sync can re-check access on reconnect.
- Conflict review is OWNER/OFFICE_ADMIN only; techs can see that a conflict exists on their job but cannot resolve tenant-wide data conflicts unless explicitly granted.

## Build Order When M13 Resumes

1. Add `tenantUsers`, role schemas, and access-context resolver.
2. Extend entitlement registry from plan-only to plan-plus-role.
3. Add server middleware/helpers and planted negative tests.
4. Add Firebase custom-claim admin tooling.
5. Add Firestore rules for role-scoped reads/writes.
6. Add job magic-link access collection and token exchange.
7. Retrofit M6, M8, and M11 endpoints to require `AccessContext`.
8. Add regression tests proving OWNER, OFFICE_ADMIN, TECHNICIAN, and SUBCONTRACTOR boundaries.
