import { mediaSchema } from "@nexteam/core";
import { CompanyCamAdapter } from "@nexteam/providers";

const tenantId = process.env.TENANT_ID || "aquatrace";
const limit = Number(process.env.COMPANYCAM_IMPORT_PROJECT_LIMIT || 3);
const provider = CompanyCamAdapter.fromEnv(process.env, tenantId);

const projects = (await provider.findProjects("")).slice(0, Number.isFinite(limit) ? limit : 3);
let mediaCount = 0;
let docCount = 0;
let mappedMediaExternalIds = 0;
let mappedDocExternalIds = 0;
const projectReceipts = [];

for (const project of projects) {
  const media = await provider.getMedia(project);
  let docs = [];
  try {
    docs = await provider.getDocuments(project);
  } catch (error) {
    docs = [];
  }
  for (const item of media.slice(0, 3)) {
    mediaSchema.parse(item);
  }
  mediaCount += media.length;
  docCount += docs.length;
  mappedMediaExternalIds += media.filter((item) => Boolean(item.externalIds?.companycam)).length;
  mappedDocExternalIds += docs.filter((item) => Boolean(item.externalIds?.companycam)).length;
  projectReceipts.push({
    id: project.id,
    name: project.name,
    externalIds: project.externalIds,
    media: media.length,
    docs: docs.length
  });
}

console.log(JSON.stringify({
  ok: true,
  dryRun: true,
  destructiveWrites: false,
  tenantId,
  source: "companycam",
  projectLimit: projects.length,
  counts: {
    projects: projects.length,
    media: mediaCount,
    docs: docCount
  },
  externalIdsPreserved: {
    projects: projects.filter((project) => Boolean(project.externalIds?.companycam)).length,
    media: mappedMediaExternalIds,
    docs: mappedDocExternalIds
  },
  projects: projectReceipts,
  sampledAt: new Date().toISOString()
}, null, 2));
