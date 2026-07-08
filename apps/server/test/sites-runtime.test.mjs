import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus
} from "@nexteam/core";
import { generatePoolLeakSite } from "../dist/sites/generator.js";
import { createSitesNexiTools } from "../dist/sites/nexiTools.js";
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
        mediaId: "3338800086",
        thumbRef: "companycam:3338800086",
        caption: "Return fitting dye test from a real leak detection job"
      }
    ]
  }, "2026-07-07T20:00:00.000Z");

  assert.equal(site.tenantId, "aquatrace");
  assert.equal(site.id, "site_aquatrace_aquatrace");
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
  assert.match(site.html, /\/api\/media\/3338800086/);
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

test("M8 operator UI customization is tenant-scoped and owner/admin gated", async () => {
  const app = express();
  app.use(express.json());
  const repository = new InMemorySitesRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  registerSitesRoutes(app, {
    repository,
    approvalQueue,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  await withServer(app, async (baseUrl) => {
    const patchResponse = await fetch(`${baseUrl}/api/sites/operator-ui`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        preset: "deep_water",
        density: "compact"
      })
    });
    assert.equal(patchResponse.status, 200);
    const patched = await patchResponse.json();
    assert.equal(patched.ok, true);
    assert.equal(patched.theme.tenantId, "aquatrace");
    assert.equal(patched.theme.density, "compact");
    assert.equal(patched.theme.colors.headerBackground, "#07363d");
    assert.equal(patched.actorId, "internal:local-owner");

    const getResponse = await fetch(`${baseUrl}/api/sites/operator-ui?tenantId=aquatrace`);
    assert.equal(getResponse.status, 200);
    const fetched = await getResponse.json();
    assert.equal(fetched.theme.colors.accent, "#0e7490");
  });
});

test("M8 Nexi tool changes Job Desk appearance without touching another tenant", async () => {
  const repository = new InMemorySitesRepository();
  const [tool] = createSitesNexiTools({
    repository,
    access: {
      tenantId: "aquatrace",
      tenantUserId: "owner_chris",
      role: "OWNER",
      accessKind: "internal"
    }
  });

  const tenant = {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "jobber", media: "companycam", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
  const result = await tool.handler(tenant, { preset: "sandbar", plainRequest: "change my chat colors to warm sand" });
  assert.equal(result.result.tenantScoped, true);
  assert.equal(result.result.actorId, "internal:owner_chris");
  assert.equal(result.result.theme.colors.headerBackground, "#5d3d24");
  assert.equal((await repository.getOperatorUiTheme("aquatrace")).colors.accent, "#d97706");
  assert.equal(await repository.getOperatorUiTheme("other-tenant"), null);
});
