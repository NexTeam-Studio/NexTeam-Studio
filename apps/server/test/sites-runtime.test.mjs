import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus
} from "@nexteam/core";
import { generatePoolLeakSite } from "../dist/sites/generator.js";
import { InMemorySitesRepository } from "../dist/sites/repository.js";
import { registerSitesRoutes } from "../dist/sites/routes.js";

async function withServer(app, run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.notEqual(typeof address, "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("M8 generates Aquatrace site blocks and renders static HTML", () => {
  const site = generatePoolLeakSite({
    tenantId: "aquatrace",
    slug: "aquatrace",
    gallery: [
      {
        mediaId: "media_real_job_photo",
        thumbRef: "native://media/media_real_job_photo",
        caption: "Return fitting dye test from a real leak detection job"
      }
    ]
  }, "2026-07-07T20:00:00.000Z");

  assert.equal(site.tenantId, "aquatrace");
  assert.equal(site.slug, "aquatrace");
  assert.deepEqual(site.blocks.map((block) => block.type), [
    "hero",
    "services",
    "service_area_map",
    "gallery",
    "reviews",
    "compliance_badges",
    "article_index",
    "lead_form"
  ]);
  assert.match(site.html, /Find the leak\. Keep the water\./);
  assert.match(site.html, /Return fitting dye test/);
  assert.equal(site.customDomainStatus, "pending_cloudflare");
});

test("M8 lead form creates lead, event, and approval-queued owner notification only", async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const repository = new InMemorySitesRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const eventBus = new InMemoryEventBus();
  registerSitesRoutes(app, {
    repository,
    approvalQueue,
    eventBus,
    env: { TENANT_ID: "aquatrace" }
  });

  await withServer(app, async (baseUrl) => {
    const generateResponse = await fetch(`${baseUrl}/api/sites/aquatrace/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        businessName: "Aquatrace Swimming Pool Leak Detection",
        serviceArea: ["Fair Play", "Seneca", "Bryson City"]
      })
    });
    assert.equal(generateResponse.status, 201);
    const generated = await generateResponse.json();
    assert.equal(generated.ok, true);
    assert.equal(generated.approval.kind, "site_publish");
    assert.equal(generated.approval.execute.args.noExternalPublish, true);

    const siteResponse = await fetch(`${baseUrl}/sites/aquatrace`);
    assert.equal(siteResponse.status, 200);
    assert.match(siteResponse.headers.get("content-type") ?? "", /text\/html/);
    const html = await siteResponse.text();
    assert.match(html, /Request leak help/);
    assert.match(html, /action="\/api\/sites\/aquatrace\/leads"/);

    const leadResponse = await fetch(`${baseUrl}/api/sites/aquatrace/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Rachel Payne",
        email: "rachel@example.test",
        city: "Bryson City",
        message: "Pool is losing about two inches per day.",
        consent: { email: true, sms: false }
      })
    });
    assert.equal(leadResponse.status, 201);
    const leadResult = await leadResponse.json();
    assert.equal(leadResult.ok, true);
    assert.equal(leadResult.event, "lead.received");
    assert.equal(leadResult.outboundQueuedOnly, true);
    assert.equal(leadResult.approval.kind, "email");
    assert.equal(leadResult.approval.execute.service, "sites");
    assert.equal(leadResult.approval.execute.op, "notifyOwnerOfLead");
    assert.equal(leadResult.approval.execute.args.noOutboundSend, true);

    const leadsResponse = await fetch(`${baseUrl}/api/sites/aquatrace/leads?tenantId=aquatrace`);
    assert.equal(leadsResponse.status, 200);
    const leadsResult = await leadsResponse.json();
    assert.equal(leadsResult.leads.length, 1);
    assert.equal(leadsResult.leads[0].name, "Rachel Payne");

    const events = eventBus.listEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "lead.received");
    assert.equal(events[0].payload.hasEmail, true);

    const pending = await approvalQueue.listPending("aquatrace");
    assert.deepEqual(pending.map((item) => item.kind), ["site_publish", "email"]);
  });
});
