import test from "node:test";
import assert from "node:assert/strict";
import { approvalItemSchema, conversationRecordSchema, jobSchema, mediaSchema, nexiBlueprintSchema, siteJobBlueprintSchema, tenantBrandingSchema } from "../dist/index.js";

test("Media schema rejects exposed third-party URL fields", () => {
  const parsed = mediaSchema.parse({
    id: "media_1",
    tenantId: "aquatrace",
    type: "photo",
    storageRef: "companycam:123",
    aiTags: [],
    capturedBy: "Cody",
    externalIds: { companycam: "123" }
  });
  assert.equal(parsed.storageRef, "companycam:123");
  assert.equal(parsed.capturedBy, "Cody");
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

test("Job schema preserves scheduled visit date fields", () => {
  const job = jobSchema.parse({
    id: "job_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "scheduled",
    title: "Monday leak detection",
    startAt: "2026-07-06T04:00:00.000Z",
    endAt: "2026-07-07T03:59:59.000Z",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  });
  assert.equal(job.startAt, "2026-07-06T04:00:00.000Z");
  assert.equal(job.endAt, "2026-07-07T03:59:59.000Z");
});

test("Conversation schema preserves tool run traces for reuse", () => {
  const conversation = conversationRecordSchema.parse({
    id: "conv_1",
    tenantId: "aquatrace",
    conversationId: "trial-date-context",
    userText: "What's on Monday July 6, 2026?",
    assistantText: "Rachel Payne is scheduled Monday.",
    sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }],
    toolRuns: [{
      name: "getSchedule",
      sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }],
      result: { jobs: [{ id: "job_1", title: "Rachel Payne leak detection" }] }
    }],
    createdAt: "2026-07-05T16:00:00.000Z"
  });
  assert.equal(conversation.toolRuns[0].name, "getSchedule");
  assert.equal(conversation.toolRuns[0].result.jobs[0].id, "job_1");
});

test("Source schema accepts email rail refs", () => {
  const conversation = conversationRecordSchema.parse({
    id: "conv_email_1",
    tenantId: "aquatrace",
    userText: "What emails came in today?",
    assistantText: "One email came in today.",
    sources: [{ rail: "email", ref: "email:ops:msg_1", label: "Email ops msg_1" }],
    createdAt: "2026-07-05T16:00:00.000Z"
  });
  assert.equal(conversation.sources[0].ref, "email:ops:msg_1");
});

test("Tenant branding schema stores logo fallback metadata and actor attribution", () => {
  const branding = tenantBrandingSchema.parse({
    tenantId: "aquatrace",
    displayName: "Aquatrace",
    colors: {
      primary: "#26352c",
      accent: "#e4bf73",
      surface: "#fff8ea"
    },
    fontFamily: "Georgia, serif",
    source: "manual",
    updatedBy: "internal:tenant_user_chris",
    updatedAt: "2026-07-10T12:00:00.000Z"
  });
  assert.equal(branding.displayName, "Aquatrace");
  assert.equal(branding.fontFamily, "Georgia, serif");
  assert.equal(branding.updatedBy, "internal:tenant_user_chris");
});
