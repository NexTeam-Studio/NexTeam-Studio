# Enterprise future-readiness contracts

**Status:** future-readiness documentation only. This document neither enables a feature nor changes a runtime contract.

## Reality boundary

The current platform has tenant-scoped access, a fixed tenant-role/capability model, plan-to-module entitlement checks, tenant-user membership audit records, tenant data export/backup repository methods, and tenant-scoped Firestore write protections. These are usable extension seams, not evidence that the enterprise capabilities below exist.

The following are **not currently implemented**: enterprise SSO, SCIM provisioning, organization hierarchies, custom enterprise roles, a platform-wide immutable audit log, retention/legal-hold controls, regional data residency, customer-managed keys, public API credentials, outbound webhooks, and enterprise support impersonation/delegation.

No current route, UI, Firestore collection, provider adapter, background worker, or production configuration is introduced by this document.

## Verified current seams

| Current seam | Verified evidence | Boundary |
| --- | --- | --- |
| Tenant identity and isolation | `Tenant.id`; authenticated access derives `tenantId`/`tenant_id`; ordinary users are rejected for cross-tenant Nexi access. | One tenant per authenticated operator claim; no organization hierarchy. |
| Tenant membership and roles | `TenantUser` supports `OWNER`, `OFFICE_ADMIN`, and `TECHNICIAN`, plus a bounded `TenantCapability` set; membership updates and claim-application actions are persisted as `TenantMembershipAudit`. | This is not SSO, SCIM, a directory sync, or a general audit log. |
| Module entitlements | Tenant plans gate `PlatformModule` access and Nexi tools through `modulesForPlan`. | Plans are not per-user feature flags or enterprise entitlement policies. |
| Tenant portability primitives | `PlatformRepository` exposes `exportTenantData`, `recordBackup`, and `listBackups`. | No retention policy, deletion workflow, legal hold, residency guarantee, or export delivery SLA is implemented. |
| Server composition | Feature modules and the integration composition root are documented in `ARCHITECTURE.md`. | No public integration/API gateway contract is present. |

## Proposed extension contracts

Each contract below is a future design boundary. Its fields, commands, and events are intentionally declarative and must not be treated as implemented APIs or storage schemas.

### Enterprise identity federation — NOT IMPLEMENTED

**Purpose:** connect a tenant to an identity provider without weakening tenant isolation.

**Proposed records:** `IdentityConnection { id, tenantId, protocol, issuer, clientReference, status, verifiedAt, createdAt, updatedAt }`; `IdentitySubjectLink { tenantId, tenantUserId, issuer, subject, linkedAt }`. `clientReference` must be a secret-manager reference only, never a credential value.

**Proposed commands:** `identityConnection.create`, `identityConnection.verify`, `identityConnection.activate`, `identityConnection.disable`, `identitySubject.link`, `identitySubject.unlink`.

**Proposed events:** `identity_connection.verified`, `identity_connection.activated`, `identity_subject.linked`, `identity_subject.unlinked`, `federated_sign_in.rejected`.

**Required invariants:** every connection and subject link is tenant-scoped; `(issuer, subject)` maps to exactly one active tenant user; activation requires verified metadata; break-glass local access remains explicit and audited.

### Directory provisioning (SCIM) — NOT IMPLEMENTED

**Purpose:** synchronize tenant membership from an enterprise directory while preserving NexTeam authorization checks.

**Proposed records:** `DirectoryProvisioningConnection { id, tenantId, identityConnectionId, status, tokenReference, lastCursor, createdAt, updatedAt }`; `DirectoryObjectLink { tenantId, tenantUserId, externalId, objectType, lastSeenAt }`.

**Proposed commands:** `directoryProvisioning.enable`, `directoryUser.upsert`, `directoryUser.deactivate`, `directoryGroup.reconcile`, `directoryProvisioning.rotateCredential`.

**Proposed events:** `directory_user.provisioned`, `directory_user.updated`, `directory_user.deactivated`, `directory_reconciliation.failed`.

**Required invariants:** inbound provisioning maps only to tenant-scoped users; an external group cannot grant a capability absent from the tenant-approved mapping; deactivation revokes application access without deleting historical attribution; provisioning credentials are stored only by reference.

### Organization hierarchy and delegated administration — NOT IMPLEMENTED

**Purpose:** support a parent organization with isolated member tenants.

**Proposed records:** `Organization { id, displayName, status, createdAt }`; `OrganizationMembership { organizationId, tenantId, status, joinedAt }`; `DelegatedAdminGrant { id, organizationId, actorId, tenantId, capabilities, expiresAt, createdAt, revokedAt }`.

**Proposed commands:** `organization.create`, `organization.attachTenant`, `organization.detachTenant`, `delegatedAdmin.grant`, `delegatedAdmin.revoke`.

**Proposed events:** `organization_tenant.attached`, `organization_tenant.detached`, `delegated_admin.granted`, `delegated_admin.revoked`, `delegated_access.denied`.

**Required invariants:** organization membership never changes a record's `tenantId`; cross-tenant access requires a time-bounded, capability-limited grant and a target-tenant selection; all delegated actions retain actor, organization, grant, and target tenant attribution.

### Enterprise authorization and entitlement policy — NOT IMPLEMENTED

**Purpose:** evolve the current fixed role/capability and plan/module seams without breaking existing authorizers.

**Proposed records:** `RoleDefinition { id, tenantId, name, capabilities, version, status }`; `EntitlementPolicy { id, tenantId, subjectType, subjectId, module, effect, constraints, version }`.

**Proposed commands:** `roleDefinition.publish`, `roleDefinition.retire`, `roleAssignment.assign`, `roleAssignment.revoke`, `entitlementPolicy.publish`.

**Proposed events:** `role_definition.published`, `role_assignment.changed`, `entitlement_policy.published`, `authorization.denied`.

**Required invariants:** policy evaluation is deny-by-default; a custom role may only use registered capabilities; tenant policy cannot elevate a user outside the tenant; plan/module entitlement remains an upper bound on user authorization.

### Compliance audit, retention, and legal hold — NOT IMPLEMENTED

**Purpose:** provide a complete compliance trail beyond current membership audit records and domain-specific audit metadata.

**Proposed records:** `EnterpriseAuditEvent { id, tenantId, actor, action, target, occurredAt, requestId, outcome, previousHash, hash }`; `RetentionPolicy { id, tenantId, recordClass, retentionDays, disposition }`; `LegalHold { id, tenantId, scope, status, createdAt, releasedAt }`.

**Proposed commands:** `auditEvent.append`, `retentionPolicy.publish`, `legalHold.apply`, `legalHold.release`, `retentionDisposition.execute`.

**Proposed events:** `audit_event.appended`, `retention_policy.published`, `legal_hold.applied`, `legal_hold.released`, `retention_disposition.blocked`.

**Required invariants:** append-only writes with tamper-evident chain verification; audit query authorization is separate from business-record authorization; an active hold blocks disposition; retention execution is tenant-scoped, idempotent, and produces an audit event.

### Data residency, encryption, and customer-managed keys — NOT IMPLEMENTED

**Purpose:** make storage-location and key-management commitments explicit before enterprise sale or configuration.

**Proposed records:** `TenantDataResidencyPolicy { tenantId, region, status, effectiveAt }`; `TenantKeyConfiguration { tenantId, keyProvider, keyReference, status, rotatedAt }`.

**Proposed commands:** `residencyPolicy.request`, `residencyPolicy.activate`, `keyConfiguration.verify`, `keyConfiguration.rotate`, `keyConfiguration.disable`.

**Proposed events:** `residency_policy.activated`, `key_configuration.verified`, `key_rotated`, `key_configuration.disabled`.

**Required invariants:** no region or key setting is advertised until every durable store and backup path is covered; keys are referenced, never stored in application records; migration has a documented rollback and export path; the chosen region applies to backup and derived-data paths too.

### Integration API and outbound webhooks — NOT IMPLEMENTED

**Purpose:** expose tenant-controlled integration surfaces without allowing provider secrets or cross-tenant data flow.

**Proposed records:** `ApiClient { id, tenantId, name, credentialHash, scopes, status, createdAt, revokedAt }`; `WebhookSubscription { id, tenantId, endpoint, eventTypes, signingSecretReference, status, createdAt }`; `WebhookDelivery { id, tenantId, subscriptionId, eventId, attempt, outcome, deliveredAt }`.

**Proposed commands:** `apiClient.create`, `apiClient.rotate`, `apiClient.revoke`, `webhookSubscription.create`, `webhookSubscription.pause`, `webhookSubscription.delete`, `webhookDelivery.retry`.

**Proposed events:** `api_client.created`, `api_client.revoked`, `webhook_subscription.created`, `webhook_delivery.succeeded`, `webhook_delivery.failed`.

**Required invariants:** API scope checks include tenant binding; raw credentials and signing secrets are returned only at creation/rotation and never persisted in plaintext; event payloads include tenant context and schema version; delivery is retry-safe, signed, observable, and disabled after a defined failure policy.

### Support access and break-glass operations — NOT IMPLEMENTED

**Purpose:** allow controlled support intervention without silently impersonating customers.

**Proposed records:** `SupportAccessGrant { id, tenantId, supportActorId, justification, scopes, approvedBy, expiresAt, revokedAt }`; `SupportSession { id, grantId, tenantId, startedAt, endedAt }`.

**Proposed commands:** `supportAccess.request`, `supportAccess.approve`, `supportSession.start`, `supportSession.end`, `supportAccess.revoke`.

**Proposed events:** `support_access.requested`, `support_access.approved`, `support_session.started`, `support_session.ended`, `support_access.revoked`.

**Required invariants:** consent/approval, justification, least privilege, fixed expiration, visible session state, and immutable audit records are mandatory; no action is attributed to the tenant user; production data writes require a separately authorized scope.

## Adoption gate for any future contract

Before any proposed item becomes implemented, its delivery must add tenant-scoped storage; server-side validation and authorization; UI/API read, save, and error handling as applicable; reload/persistence proof; authorized-write and unauthorized-denial tests; migration/rollback behavior where persistent data changes; and a versioned contract with fields, commands, events, and deprecation policy. It must also preserve the current tenant-isolation guarantees documented in `ARCHITECTURE.md`.

## Validation sources

- `packages/core/src/types.ts` and `packages/core/src/schemas.ts` for current tenant, user, capability, membership-audit, and operating-profile contracts.
- `apps/server/src/platform/accessManagement.ts`, `apps/server/src/platform/repository.ts`, and `apps/server/src/platform/routes.ts` for current membership administration, claims preview/application, membership audit persistence, export/backup repository seams, and authorization.
- `apps/server/src/platform/entitlements.ts` for current plan/module and Nexi tool entitlements.
- `apps/server/src/nexi/access.ts` and `ARCHITECTURE.md` for current tenant claim enforcement and cross-tenant rejection boundary.

