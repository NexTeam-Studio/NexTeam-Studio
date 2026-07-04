import { JobberAdapter } from "@nexteam/providers";

const adapter = JobberAdapter.fromEnv(process.env);
if (!adapter.isConfigured()) {
  console.log(JSON.stringify({ ok: true, skipped: true, provider: "jobber", reason: "not_configured" }, null, 2));
  process.exit(0);
}

const jobs = await adapter.getJobs({
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
});

console.log(JSON.stringify({
  ok: true,
  provider: "jobber",
  readOnly: true,
  jobCount: jobs.length,
  firstJob: jobs[0] ? {
    id: jobs[0].id,
    tenantId: jobs[0].tenantId,
    status: jobs[0].status,
    source: jobs[0].externalIds?.jobber ? "jobber" : "unknown"
  } : null
}, null, 2));

