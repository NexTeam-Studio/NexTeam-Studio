import { CompanyCamAdapter } from "@nexteam/providers";

const adapter = CompanyCamAdapter.fromEnv(process.env);
if (!adapter.isConfigured()) {
  console.log(JSON.stringify({ ok: true, skipped: true, provider: "companycam", reason: "not_configured" }, null, 2));
  process.exit(0);
}

const projects = await adapter.findProjects("");
const media = projects[0] ? await adapter.getMedia(projects[0]) : [];

console.log(JSON.stringify({
  ok: true,
  provider: "companycam",
  readOnly: true,
  projectCount: projects.length,
  mediaCountForFirstProject: media.length,
  firstProject: projects[0] ? {
    id: projects[0].id,
    name: projects[0].name,
    source: projects[0].externalIds?.companycam ? "companycam" : "unknown"
  } : null,
  firstMedia: media[0] ? {
    id: media[0].id,
    tenantId: media[0].tenantId,
    storageRef: media[0].storageRef,
    hasExternalId: Boolean(media[0].externalIds?.companycam)
  } : null
}, null, 2));

