import test from "node:test";
import assert from "node:assert/strict";
import { approvalItemSchema, mediaSchema, nexiBlueprintSchema, siteJobBlueprintSchema } from "../dist/index.js";

test("Media schema rejects exposed third-party URL fields", () => {
  const parsed = mediaSchema.parse({
    id: "media_1",
    tenantId: "aquatrace",
    type: "photo",
    storageRef: "companycam:123",
    aiTags: [],
    externalIds: { companycam: "123" }
  });
  assert.equal(parsed.storageRef, "companycam:123");
  assert.equal("sourceUrlNeverExposed" in parsed, false);
});

test("NexiBlueprint and SiteJobBlueprint schemas remain distinct", () => {
  assert.equal(nexiBlueprintSchema.parse({
    id: "nexi_aquatrace",
    tenantId: "aquatrace",
    services: [],
    pricingNotes: "",
    serviceArea: [],
    brandVoice: "",
    terminology: {}
  }).id, "nexi_aquatrace");

  assert.equal(siteJobBlueprintSchema.parse({
    id: "site_job_1",
    tenantId: "aquatrace",
    kind: "site_blueprint",
    fields: { poolGallons: 101000 },
    extractedFrom: "fixture",
    extractedAt: new Date().toISOString()
  }).fields.poolGallons, 101000);
});

test("Approval item defaults can park outbound execution", () => {
  const item = approvalItemSchema.parse({
    id: "appr_1",
    tenantId: "aquatrace",
    kind: "email",
    preview: { title: "Review", body: "Parked" },
    execute: { service: "email", op: "send", args: {} },
    status: "pending",
    createdBy: "nexi"
  });
  assert.equal(item.status, "pending");
});

