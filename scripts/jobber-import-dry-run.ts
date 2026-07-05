import { clientSchema, jobSchema, propertySchema, type JobDetail, type Property } from "@nexteam/core";
import { JobberAdapter } from "@nexteam/providers";
import { FirestoreNativeCrmRepository } from "../apps/server/src/crm/nativeRepository.js";
import { getAdminDb } from "../apps/server/src/firebase.js";

const tenantId = process.env.TENANT_ID || "aquatrace";
const adapter = JobberAdapter.fromEnv(process.env, tenantId);
const writeNative = process.argv.includes("--write-native") || process.env.JOBBER_IMPORT_WRITE_NATIVE === "true";

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
    await repository.upsertClient(client);
    nativeWriteCounts.clients += 1;
  }
  for (const property of properties) {
    await repository.upsertProperty(property);
    nativeWriteCounts.properties += 1;
  }
  for (const job of jobs) {
    await repository.upsertJob(job);
    nativeWriteCounts.jobs += 1;
  }
}

const receipt = {
  ok: true,
  dryRun: !writeNative,
  nativeWrites: writeNative,
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
  nativeWriteCounts,
  sampledAt: new Date().toISOString()
};

console.log(JSON.stringify(receipt, null, 2));
