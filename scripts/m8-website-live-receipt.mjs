import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl
} from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXI_BASE_URL || resolveBaseUrl()).replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_SHA || process.env.NEXTEAM_DEPLOY_SHA || "";
const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.env.M8_WEBSITE_RECEIPT || "receipts/m8/website-live-receipt-current.json";
const screenshotPath = process.env.M8_WEBSITE_SCREENSHOT || "receipts/m8/website-mobile-lead-form-current.png";
const runId = `m8-live-${Date.now()}-${randomUUID().slice(0, 8)}`;
const slug = "aquatrace";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { idToken, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const response = await fetchJson(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok || response.json?.ok === false) {
    throw new Error(`${method} ${path} failed (${response.status}): ${response.json?.error || response.text}`);
  }
  return response.json;
}

async function submitLeadWithPhoneViewport(lead) {
  try {
    const { chromium } = await import("playwright");
    mkdirSync(dirname(screenshotPath), { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3
    });
    await page.goto(`${baseUrl}/sites/${slug}?tenantId=${encodeURIComponent(tenantId)}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.fill('input[name="name"]', lead.name);
    await page.fill('input[name="email"]', lead.email);
    await page.fill('input[name="phone"]', lead.phone);
    await page.fill('input[name="city"]', lead.city);
    await page.fill('textarea[name="message"]', lead.message);
    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => {}),
      page.click('button[type="submit"]')
    ]);
    const bodyText = await page.textContent("body");
    await browser.close();
    return {
      ok: /"ok"\s*:\s*true/.test(bodyText ?? ""),
      screenshotPath,
      bodyText: String(bodyText ?? "").slice(0, 800)
    };
  } catch (error) {
    return {
      ok: false,
      screenshotPath: null,
      blocker: error instanceof Error ? error.message : String(error)
    };
  }
}

const receipt = {
  ok: false,
  receiptName: "m8-website-live-receipt-current",
  startedAt: new Date().toISOString(),
  stagingBaseUrl: baseUrl,
  expectedSha,
  tenantId,
  runId,
  checks: {},
  raw: {}
};

let proof = null;
try {
  proof = await createOperatorProofSession();
  const idToken = proof.idToken;

  const version = await request("/api/version");
  receipt.raw.version = version;
  receipt.checks.versionShaMatched = expectedSha ? version.sha === expectedSha : Boolean(version.sha);
  assert(receipt.checks.versionShaMatched, `version SHA mismatch: expected ${expectedSha}, got ${version.sha}`);

  const health = await request("/api/health");
  receipt.raw.health = health;
  receipt.checks.healthGreen = Boolean(health.ok && health.rails?.jobber?.ok && health.rails?.companycam?.ok && health.rails?.anthropic?.ok);
  assert(receipt.checks.healthGreen, "health was not green");

  const siteInput = {
    tenantId,
    businessName: "Aquatrace Swimming Pool Leak Detection",
    phone: "864-991-5444",
    serviceArea: ["Fair Play", "Seneca", "Anderson", "Greenville", "Bryson City", "Western North Carolina"],
    gallery: [
      {
        mediaId: "3338800086",
        thumbRef: "companycam:3338800086",
        caption: "Real Aquatrace field photo routed through the media proxy"
      }
    ],
    articles: [
      {
        title: "How to tell if pool water loss is normal",
        excerpt: "A plain-English leak guide drafted for Aquatrace owners and managers.",
        href: "/guides/pool-water-loss"
      }
    ]
  };
  const generated = await request(`/api/sites/${slug}/generate`, {
    idToken,
    method: "POST",
    body: siteInput
  });
  receipt.raw.generated = generated;
  receipt.checks.siteGeneratedFromTenantData = generated.site?.id === `site_${tenantId}_${slug}`
    && generated.site?.blocks?.some((block) => block.type === "gallery" && block.items?.[0]?.mediaId === "3338800086")
    && generated.approval?.kind === "site_publish"
    && generated.approval?.execute?.args?.noExternalPublish === true;
  assert(receipt.checks.siteGeneratedFromTenantData, "site generation did not include expected model, gallery, or publish boundary");

  const siteResponse = await fetchJson(`${baseUrl}/sites/${slug}?tenantId=${encodeURIComponent(tenantId)}`);
  receipt.raw.siteHtml = {
    status: siteResponse.status,
    contentType: siteResponse.headers["content-type"],
    bytes: siteResponse.text.length,
    containsLeadForm: /Request leak help/.test(siteResponse.text),
    containsMediaProxyImage: /\/api\/media\/3338800086/.test(siteResponse.text),
    containsCustomDomainNotice: /Custom domain and SSL are pending/.test(siteResponse.text)
  };
  receipt.checks.internalSiteRendered = siteResponse.ok
    && receipt.raw.siteHtml.containsLeadForm
    && receipt.raw.siteHtml.containsMediaProxyImage
    && receipt.raw.siteHtml.containsCustomDomainNotice;
  assert(receipt.checks.internalSiteRendered, "internal site HTML did not render expected M8 content");

  const directTheme = await request("/api/sites/operator-ui", {
    idToken,
    method: "PATCH",
    body: {
      tenantId,
      preset: "deep_water",
      density: "compact"
    }
  });
  receipt.raw.operatorUiDirect = directTheme;
  receipt.checks.operatorUiDirectWrite = directTheme.theme?.tenantId === tenantId
    && directTheme.theme?.density === "compact"
    && directTheme.theme?.colors?.headerBackground === "#07363d";
  assert(receipt.checks.operatorUiDirectWrite, "direct operator UI customization failed");

  const nexiTheme = await request("/api/nexi/message", {
    idToken,
    method: "POST",
    body: {
      tenantId,
      conversationId: `m8-ui-${runId}`,
      message: "Nexi, change my chat colors to warm sand and make it compact"
    }
  });
  receipt.raw.operatorUiNexi = {
    answer: nexiTheme.answer,
    sources: nexiTheme.sources,
    toolRuns: nexiTheme.toolRuns?.map((run) => ({ name: run.name, sources: run.sources }))
  };
  receipt.checks.operatorUiNexiTool = nexiTheme.toolRuns?.some((run) => run.name === "customizeOperatorUi") === true;
  assert(receipt.checks.operatorUiNexiTool, "Nexi did not run customizeOperatorUi for the chat color request");

  const lead = {
    name: `M8 Receipt Lead ${runId}`,
    email: "m8-receipt@example.test",
    phone: "8645550108",
    city: "Bryson City",
    message: "Pool is losing about two inches per day and needs an estimate."
  };
  const phoneSubmit = await submitLeadWithPhoneViewport(lead);
  receipt.raw.phoneLeadSubmit = phoneSubmit;
  receipt.checks.phoneViewportLeadSubmitted = phoneSubmit.ok;
  assert(receipt.checks.phoneViewportLeadSubmitted, `phone viewport lead submit failed: ${phoneSubmit.blocker || phoneSubmit.bodyText}`);

  const leads = await request(`/api/sites/${slug}/leads?tenantId=${encodeURIComponent(tenantId)}`, { idToken });
  receipt.raw.leads = {
    count: leads.leads?.length ?? 0,
    matchingLead: leads.leads?.find((candidate) => candidate.name === lead.name) ?? null
  };
  receipt.checks.leadVisibleInCrmIntake = Boolean(receipt.raw.leads.matchingLead?.id);
  assert(receipt.checks.leadVisibleInCrmIntake, "submitted lead was not visible in tenant CRM intake list");

  const approvals = await request(`/api/approval-queue?tenantId=${encodeURIComponent(tenantId)}`);
  receipt.raw.approvals = {
    pendingCount: approvals.items?.length ?? 0,
    sitePublishApprovalId: generated.approval?.id ?? null,
    leadNotification: approvals.items?.find((item) => item.preview?.title === `New website lead: ${lead.name}`) ?? null
  };
  receipt.checks.nexiOwnerNotificationQueuedOnly = Boolean(receipt.raw.approvals.leadNotification?.execute?.args?.noOutboundSend);
  assert(receipt.checks.nexiOwnerNotificationQueuedOnly, "lead notification was not queued as approval-only work");

  receipt.ok = true;
  receipt.finishedAt = new Date().toISOString();
  receipt.operator = {
    mode: proof.mode,
    email: proof.identity.email || null,
    uidPresent: Boolean(proof.identity.uid)
  };
  receipt.boundaries = {
    outboundExecuted: false,
    productionDeploy: false,
    customDomainDeferredForCloudflare: true,
    companyCamWrites: false,
    jobberWrites: false
  };
  receipt.ownerNeeds = {
    cloudflare: "When ready for a public launch, point the chosen Aquatrace domain/subdomain at the staging/production site service and approve SSL/custom-domain setup.",
    m11Phone: "M11 still needs the owner phone airplane-mode recording; this script only proves M8's phone-sized web lead form."
  };
} catch (error) {
  receipt.ok = false;
  receipt.error = error instanceof Error ? error.message : String(error);
  receipt.finishedAt = new Date().toISOString();
  throw error;
} finally {
  await proof?.dispose?.().catch(() => {});
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: receipt.ok,
    receiptPath,
    checks: receipt.checks,
    sha: receipt.raw.version?.sha,
    screenshotPath: receipt.raw.phoneLeadSubmit?.screenshotPath,
    error: receipt.error
  }, null, 2));
}

