import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const fromRepositoryRoot = (path) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const readRepositoryFile = (path) => readFile(fromRepositoryRoot(path), "utf8");

const proposedContracts = [
  ["Enterprise identity federation", "IdentityConnection", "identityConnection.create", "identity_connection.verified"],
  ["Directory provisioning (SCIM)", "DirectoryProvisioningConnection", "directoryProvisioning.enable", "directory_user.provisioned"],
  ["Organization hierarchy and delegated administration", "OrganizationMembership", "organization.attachTenant", "organization_tenant.attached"],
  ["Enterprise authorization and entitlement policy", "RoleDefinition", "roleDefinition.publish", "role_definition.published"],
  ["Compliance audit, retention, and legal hold", "EnterpriseAuditEvent", "auditEvent.append", "audit_event.appended"],
  ["Data residency, encryption, and customer-managed keys", "TenantDataResidencyPolicy", "residencyPolicy.request", "residency_policy.activated"],
  ["Integration API and outbound webhooks", "ApiClient", "apiClient.create", "api_client.created"],
  ["Support access and break-glass operations", "SupportAccessGrant", "supportAccess.request", "support_access.requested"]
];

test("enterprise future-readiness contract cites only current platform seams", async () => {
  const [contract, types, repository, entitlements, nexiAccess] = await Promise.all([
    readRepositoryFile("docs/contracts/enterprise-future-readiness.md"),
    readRepositoryFile("packages/core/src/types.ts"),
    readRepositoryFile("apps/server/src/platform/repository.ts"),
    readRepositoryFile("apps/server/src/platform/entitlements.ts"),
    readRepositoryFile("apps/server/src/nexi/access.ts")
  ]);

  assert.match(contract, /NEXTEAM-ENTERPRISE-FUTURE-READINESS-V1/);
  assert.match(types, /export type TenantUserRole = "OWNER" \| "OFFICE_ADMIN" \| "TECHNICIAN"/);
  assert.match(types, /export type TenantCapability =/);
  assert.match(types, /export interface TenantMembershipAudit/);
  assert.match(repository, /exportTenantData\(tenantId: string\)/);
  assert.match(repository, /recordBackup\(record: PlatformBackupRecord\)/);
  assert.match(repository, /listBackups\(tenantId: string\)/);
  assert.match(entitlements, /modulesForPlan\(tenant\.plan\)/);
  assert.match(nexiAccess, /cross-tenant/i);
});

test("every enterprise extension contract remains declarative and complete", async () => {
  const contract = await readRepositoryFile("docs/contracts/enterprise-future-readiness.md");

  for (const [title, record, command, event] of proposedContracts) {
    const start = contract.indexOf(`### ${title}`);
    const end = contract.indexOf("\n### ", start + 1);
    const section = contract.slice(start, end === -1 ? undefined : end);
    assert.match(section, /NOT IMPLEMENTED/);
    assert.match(section, /\*\*Purpose:\*\*/);
    assert.match(section, new RegExp(record));
    assert.match(section, new RegExp(command.replace(".", "\\.")));
    assert.match(section, new RegExp(event.replace(".", "\\.")));
    assert.match(section, /\*\*Required invariants:\*\*/);
  }
});

test("future enterprise capability names are not represented as current implementation", async () => {
  const contract = await readRepositoryFile("docs/contracts/enterprise-future-readiness.md");

  const notImplementedLine = contract.match(/^The following are \*\*not currently implemented\*\*:(.*)$/m)?.[1] ?? "";
  for (const capability of [
    "enterprise SSO",
    "SCIM provisioning",
    "organization hierarchies",
    "custom enterprise roles",
    "platform-wide immutable audit log",
    "retention/legal-hold controls",
    "regional data residency",
    "customer-managed keys",
    "public API credentials",
    "outbound webhooks",
    "enterprise support impersonation/delegation"
  ]) {
    assert.ok(notImplementedLine.includes(capability), `${capability} must remain explicitly not implemented`);
  }
});
