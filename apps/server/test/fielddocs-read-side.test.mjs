import test from "node:test";
import assert from "node:assert/strict";
import { mediaSchema } from "@nexteam/core";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { searchMediaByMetadata } from "../dist/fielddocs/photoSearch.js";
import { createFieldDocsReadTools } from "../dist/fielddocs/nexiTools.js";
import { maybeRunVision } from "../dist/fielddocs/visionPipeline.js";

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "jobber", media: "native", email: "gmail_relay" },
  approval: {},
  timezone: "America/New_York",
  plan: "suite"
};

const skimmerPhoto = mediaSchema.parse({
  id: "media_1",
  tenantId: "aquatrace",
  jobId: "job_1",
  type: "photo",
  storageRef: "companycam:333",
  aiTags: ["skimmer", "pool"],
  aiCaption: "Skimmer throat dye test before repair.",
  externalIds: { companycam: "333" }
});

test("natural-language photo search matches imported metadata", () => {
  const hits = searchMediaByMetadata([skimmerPhoto], "show me the skimmer photo", 5);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].media.id, "media_1");
});

test("vision pipeline stub is wired off by default", async () => {
  const result = await maybeRunVision(skimmerPhoto, {});
  assert.equal(result.enabled, false);
  assert.equal(result.media.aiCaption, "Skimmer throat dye test before repair.");
});

test("Field Docs read tool searches native media repository", async () => {
  const repository = new MemoryMediaRepository([skimmerPhoto]);
  const tool = createFieldDocsReadTools(repository).find((candidate) => candidate.name === "photoSearch");
  assert.ok(tool);
  const result = await tool.handler(tenant, { query: "skimmer", limit: 3 });
  assert.equal(result.sources[0].rail, "native");
  assert.equal(result.result.hits[0].media.id, "media_1");
});
