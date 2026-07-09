import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { runNexiToolLoop } from "../../../packages/nexi/dist/gateway.js";
import { generatePoolLeakSite } from "../dist/sites/generator.js";
import { InMemorySitesRepository } from "../dist/sites/repository.js";
import { auditSiteSeo } from "../dist/seo/auditEngine.js";
import { DataForSeoRankProvider } from "../dist/seo/dataForSeoProvider.js";
import { createSeoNexiTools } from "../dist/seo/nexiTools.js";
import { InMemorySeoRepository } from "../dist/seo/repository.js";
import { registerSeoRoutes } from "../dist/seo/routes.js";
import { SeoService } from "../dist/seo/service.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function access(role = "OWNER") {
  return {
    tenantId: "aquatrace",
    tenantUserId: "owner_chris",
    role,
    accessKind: "internal"
  };
}

function badSeoSite() {
  const site = generatePoolLeakSite({ tenantId: "aquatrace", slug: "aquatrace" }, "2026-07-08T20:00:00.000Z");
  return {
    ...site,
    html: site.html
      .replace(/\s*<meta name="description"[^>]+\/>/i, "")
      .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/i, "")
  };
}

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

test("M8 generated sites include LocalBusiness and Service JSON-LD by default", () => {
  const site = generatePoolLeakSite({ tenantId: "aquatrace", slug: "aquatrace" }, "2026-07-08T20:00:00.000Z");
  assert.match(site.html, /application\/ld\+json/);
  assert.match(site.html, /"@type":"LocalBusiness"/);
  assert.match(site.html, /"@type":"Service"/);
  assert.equal(auditSiteSeo(site).filter((issue) => issue.severity === "error").length, 0);
});

test("M9 audit drafts a site fix through ApprovalQueue and applies only after approval", async () => {
  const sitesRepository = new InMemorySitesRepository();
  const seoRepository = new InMemorySeoRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  await sitesRepository.saveSite(badSeoSite());
  const service = new SeoService({
    repository: seoRepository,
    sitesRepository,
    approvalQueue,
    env: { TENANT_ID: "aquatrace" }
  });

  const audit = await service.auditSite("aquatrace", "aquatrace");
  assert.equal(audit.audit.passed, false);
  assert.equal(audit.audit.issues.some((issue) => issue.code === "missing_localbusiness_json_ld"), true);

  const fix = await service.draftSiteFix({ tenantId: "aquatrace", slug: "aquatrace", actorId: "internal:owner_chris" });
  assert.equal(fix.approval.kind, "seo_fix");
  assert.equal(fix.approval.execute.args.noExternalPublish, true);
  assert.equal(fix.approval.execute.args.actorId, "internal:owner_chris");

  const beforeApproval = await sitesRepository.getSiteBySlug("aquatrace", "aquatrace");
  assert.equal(/application\/ld\+json/.test(beforeApproval.html), false);

  const applied = await service.approveAndApplySiteFix({
    tenantId: "aquatrace",
    slug: "aquatrace",
    approvalId: fix.approval.id
  });
  assert.equal(applied.approval.status, "approved");
  assert.match(applied.site.html, /"@type":"LocalBusiness"/);
  assert.match(applied.site.html, /"@type":"Service"/);
  assert.equal(applied.remainingAudit.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("M9 DataForSEO provider returns an explicit blocker when credentials are missing", async () => {
  const provider = new DataForSeoRankProvider({});
  const snapshots = await provider.fetchSnapshots({
    tenantId: "aquatrace",
    targetDomain: "aquatraceleak.com",
    now: "2026-07-08T20:00:00.000Z",
    keywords: [
      { keyword: "pool leak detection", geo: "Fair Play, SC", device: "desktop" },
      { keyword: "pool pressure testing", geo: "Seneca, SC", device: "desktop" }
    ]
  });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots.every((snapshot) => snapshot.provider === "unconfigured"), true);
  assert.equal(snapshots.every((snapshot) => snapshot.configured === false), true);
  assert.match(snapshots[0].blocker, /DATAFORSEO_LOGIN\/PASSWORD/);
});

test("M9 fixture rank snapshot stores ten Aquatrace keyword results", async () => {
  const fixture = Array.from({ length: 10 }, (_, index) => ({
    keyword: `fixture keyword ${index + 1}`,
    geo: "Fair Play, SC",
    rank: index + 1,
    url: `https://aquatraceleak.com/result-${index + 1}`
  }));
  const repository = new InMemorySeoRepository();
  const sitesRepository = new InMemorySitesRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const service = new SeoService({
    repository,
    sitesRepository,
    approvalQueue,
    rankProvider: new DataForSeoRankProvider({ M9_DATAFORSEO_FIXTURE_JSON: JSON.stringify(fixture) }),
    env: { M9_DATAFORSEO_FIXTURE_JSON: JSON.stringify(fixture) }
  });
  const snapshots = await service.rankSnapshot({
    tenantId: "aquatrace",
    targetDomain: "aquatraceleak.com",
    now: "2026-07-08T20:00:00.000Z",
    keywords: fixture.map((entry) => ({ keyword: entry.keyword, geo: entry.geo, device: "desktop" }))
  });
  assert.equal(snapshots.length, 10);
  assert.equal(snapshots.every((snapshot) => snapshot.provider === "fixture"), true);
  assert.equal((await repository.listRankSnapshots("aquatrace")).length, 10);
});

test("M9 routes expose audit, approval-gated fix, keyword brief, queue, and report", async () => {
  const app = express();
  app.use(express.json());
  const sitesRepository = new InMemorySitesRepository();
  const seoRepository = new InMemorySeoRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  await sitesRepository.saveSite(badSeoSite());
  registerSeoRoutes(app, {
    repository: seoRepository,
    sitesRepository,
    approvalQueue,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  await withServer(app, async (baseUrl) => {
    const auditResponse = await fetch(`${baseUrl}/api/seo/sites/aquatrace/audit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(auditResponse.ok, true);
    assert.equal(auditResponse.audit.passed, false);

    const fixResponse = await fetch(`${baseUrl}/api/seo/sites/aquatrace/fix`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(fixResponse.ok, true);
    assert.equal(fixResponse.approval.kind, "seo_fix");

    const applyResponse = await fetch(`${baseUrl}/api/seo/sites/aquatrace/fixes/${fixResponse.approval.id}/approve-apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(applyResponse.ok, true);
    assert.equal(applyResponse.remainingAudit.issues.filter((issue) => issue.severity === "error").length, 0);

    const briefResponse = await fetch(`${baseUrl}/api/seo/keyword-gap/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", keyword: "pool leak detection", geo: "Fair Play, SC" })
    }).then((response) => response.json());
    assert.equal(briefResponse.ok, true);
    assert.equal(briefResponse.approval.kind, "article");
    assert.equal(briefResponse.publishingDeferred, true);

    const queueResponse = await fetch(`${baseUrl}/api/seo/queue?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(queueResponse.ok, true);
    assert.equal(queueResponse.queue.articleBriefs.length, 1);

    const reportResponse = await fetch(`${baseUrl}/api/seo/report/monthly`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(reportResponse.ok, true);
    assert.equal(Buffer.from(reportResponse.pdfBase64, "base64").subarray(0, 4).toString(), "%PDF");
  });
});

test("M9 Nexi tools are routeable and return sourced SEO queue data", async () => {
  const sitesRepository = new InMemorySitesRepository();
  const seoRepository = new InMemorySeoRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  await sitesRepository.saveSite(badSeoSite());
  const tools = createSeoNexiTools({
    repository: seoRepository,
    sitesRepository,
    approvalQueue,
    access: access(),
    env: { DATAFORSEO_LOGIN: "", DATAFORSEO_PASSWORD: "" }
  });
  const auditTool = tools.find((tool) => tool.name === "auditSiteSeo");
  const queueTool = tools.find((tool) => tool.name === "seoQueue");
  const auditOutput = await auditTool.handler(tenant(), { slug: "aquatrace", queueFix: true });
  assert.equal(auditOutput.result.approval.kind, "seo_fix");

  const queueOutput = await queueTool.handler(tenant(), {});
  assert.equal(queueOutput.result.approvals.length, 1);
  assert.equal(queueOutput.sources.some((source) => source.ref === auditOutput.result.approval.id), true);

  const fetchFn = async () => new Response(JSON.stringify({
    content: [{ type: "text", text: "I checked the SEO queue. There is 1 pending site fix." }],
    usage: { input_tokens: 1, output_tokens: 1 }
  }), { status: 200, headers: { "content-type": "application/json" } });
  const loop = await runNexiToolLoop({
    tenant: tenant(),
    system: "Answer briefly.",
    messages: [{ role: "user", content: "show me the SEO queue" }],
    tools,
    routeActionName: "test",
    taskType: "seo",
    env: { ANTHROPIC_API_KEY: "test" },
    fetchFn
  });
  assert.equal(loop.toolRuns[0].name, "seoQueue");
  assert.match(loop.answer, /SEO queue/);
});
