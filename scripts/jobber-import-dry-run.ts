import { clientSchema, jobSchema, propertySchema } from "@nexteam/core";
import { JobberAdapter } from "@nexteam/providers";

const tenantId = process.env.TENANT_ID || "aquatrace";
const adapter = JobberAdapter.fromEnv(process.env, tenantId);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

const clients = await adapter.getClients("");
const jobs = await adapter.getJobs({ from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" });
const properties = jobs
  .map((job) => "property" in job ? job.property : undefined)
  .filter((property): property is NonNullable<typeof property> => Boolean(property));

for (const client of clients.slice(0, 3)) {
  clientSchema.parse(client);
}
for (const job of jobs.slice(0, 3)) {
  jobSchema.parse(job);
}
for (const property of properties.slice(0, 3)) {
  propertySchema.parse(property);
}

const receipt = {
  ok: true,
  dryRun: true,
  destructiveWrites: false,
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
    properties: properties.length
  },
  sampledAt: new Date().toISOString()
};

console.log(JSON.stringify(receipt, null, 2));
