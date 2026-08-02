import { clientSchema, jobSchema, propertySchema, type JobDetail, type Property } from "@nexteam/core";
import { JobberAdapter } from "@nexteam/providers";
import { FirestoreNativeCrmRepository } from "../apps/server/src/crm/nativeRepository.js";
import { getAdminDb } from "../apps/server/src/firebase.js";

const tenantId = process.env.TENANT_ID || "aquatrace";
const writeRequested = process.argv.includes("--write-native") || process.env.JOBBER_IMPORT_WRITE_NATIVE === "true";
const writeConfirmed = process.argv.includes("--confirm-import") || process.env.JOBBER_IMPORT_CONFIRM === "true";
const writeNative = writeRequested && writeConfirmed;
const importedHistoryClassification = "imported_history";

if (writeRequested && !writeConfirmed) {
  throw new Error("Native import write was requested, but confirmation is missing. Re-run with --confirm-import after reviewing the dry-run receipt.");
}

const adapter = JobberAdapter.fromEnv(process.env, tenantId);

function markImportedHistory<T extends { customFields?: Record<string, string | number | boolean> }>(record: T): T {
  return {
    ...record,
    customFields: {
      ...(record.customFields ?? {}),
      recordClassification: importedHistoryClassification
    }
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) {
      return false;
    }
    seen.add(value.id);
    return true;
  });
}

const clients = await adapter.getClients("");
const jobSummaries = await adapter.getJobs({ from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" });
const jobs = uniqueById(jobSummaries as JobDetail[]);
const properties = uniqueById(jobs
  .map((job) => "property" in job ? job.property : undefined)
  .filter((property): property is Property => Boolean(property)));

for (const client of clients.slice(0, 3)) {
  clientSchema.parse(client);
}
for (const job of jobs.slice(0, 3)) {
  jobSchema.parse(job);
}
for (const property of properties.slice(0, 3)) {
  propertySchema.parse(property);
}

const nativeWriteCounts = { clients: 0, properties: 0, jobs: 0 };
if (writeNative) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is required for --write-native imports.");
  }
  const repository = new FirestoreNativeCrmRepository(db);
  for (const client of clients) {
    await repository.upsertClient(markImportedHistory(client));
    nativeWriteCounts.clients += 1;
  }
  for (const property of properties) {
    await repository.upsertProperty(markImportedHistory(property));
    nativeWriteCounts.properties += 1;
  }
  for (const job of jobs) {
    await repository.upsertJob(markImportedHistory(job));
    nativeWriteCounts.jobs += 1;
  }
}

const receipt = {
  ok: true,
  dryRun: !writeNative,
  nativeWrites: writeNative,
  writeConfirmationRequired: true,
  destructiveWrites: false,
  jobberWrites: false,
  tenantId,
  source: "jobber",
  pageLimit: 25,
  counts: {
    clients: clients.length,
    jobs: jobs.length,
    properties: unique(properties.map((property) => property.id)).length
  },
  externalIdsPreserved: {
    clients: clients.filter((client) => Boolean(client.externalIds?.jobber)).length,
    jobs: jobs.filter((job) => Boolean(job.externalIds?.jobber)).length,
    properties: properties.filter((property) => Boolean(property.externalIds?.jobber)).length
  },
  importedHistoryClassification,
  nativeWriteCounts,
  sampledAt: new Date().toISOString()
};

console.log(JSON.stringify(receipt, null, 2));
