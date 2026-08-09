import { readFileSync } from "node:fs";

const requiredCompoundQueries = [
  ["usageLog", "tenantId", "createdAt"],
  ["conversations", "tenantId", "conversationId"],
  ["approvalQueue", "tenantId", "status"],
  ["contentEligibility", "tenantId", "jobId"],
  ["notificationReads", "tenantId", "tenantUserId"],
  ["properties", "tenantId", "clientId"],
  ["requestForms", "tenantId", "slug"],
  ["jobAccessLinks", "tenantId", "jobId"],
  ["sitePages", "tenantId", "slug"],
  ["leads", "tenantId", "slug"],
  ["platformOnboardingBlueprintRevisions", "blueprintId", "revisionNumber"],
  ["platformTenantBlockers", "tenantId", "updatedAt"],
  ["platformTenantMigrationRecords", "tenantId", "updatedAt"],
  ["platformSupportEscalations", "tenantId", "updatedAt"],
  ["tenantMembershipAudits", "tenantId", "createdAt"]
];

const config = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
const signatures = new Set(config.indexes.map((index) => [
  index.collectionGroup,
  ...index.fields.map((field) => field.fieldPath)
].join(":")));

const missing = requiredCompoundQueries.filter((query) => !signatures.has(query.join(":")));
if (missing.length > 0) {
  console.error("Firestore index check failed:");
  for (const query of missing) {
    console.error(`- ${query.join(" by ")}`);
  }
  process.exit(1);
}

console.log(`Firestore index check passed (${requiredCompoundQueries.length} compound query shapes).`);
