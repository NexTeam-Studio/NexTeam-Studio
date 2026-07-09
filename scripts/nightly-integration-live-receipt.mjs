import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createOperatorProofSession,
  fetchJson,
  resolveOperatorProofIdentity,
  resolveBaseUrl,
} from "./support/liveProofHelpers.mjs";

const expectedSha = process.env.EXPECTED_DEPLOY_SHA || "4893039992e8bddc010de6b52aa091a1d0cdfccf";
const distancePrompt =
  process.env.NIGHTLY_INTEGRATION_DISTANCE_PROMPT ||
  "how far is 181 Isbell Road, Fair Play, SC from my house";
const receiptPath =
  process.env.NIGHTLY_INTEGRATION_RECEIPT_PATH ||
  "receipts/integration/nightly-integration-live-receipt-20260709.json";
const baseUrl = resolveBaseUrl().replace(/\/$/, "");

function summarizeUsage(exportBody) {
  const records = [];
  const raw = exportBody?.usageLog || exportBody?.data?.usageLog || exportBody?.collections?.usageLog || [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      records.push(item?.data || item);
    }
  } else if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw)) {
      records.push({ id, ...(value?.data || value) });
    }
  }

  const selfRepair = records.filter((entry) => entry?.taskType === "self_repair_analysis");
  const newest = selfRepair
    .slice()
    .sort((a, b) => String(b.createdAt || b.timestamp || "").localeCompare(String(a.createdAt || a.timestamp || "")))[0];

  return {
    usageRecordCount: records.length,
    selfRepairUsageCount: selfRepair.length,
    newest: newest
      ? {
          id: newest.id || null,
          taskType: newest.taskType || null,
          model: newest.model || null,
          estimatedCostUsd: newest.estimatedCostUsd ?? newest.costUsd ?? null,
          createdAt: newest.createdAt || newest.timestamp || null,
          tenantId: newest.tenantId || null,
        }
      : null,
  };
}

async function authedFetchJson(session, path, options = {}) {
  return fetchJson(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.idToken}`,
      ...(options.headers || {}),
    },
  });
}

function compactDistance(body) {
  return {
    answer: body?.answer || body?.message || body?.text || null,
    sources: body?.sources || [],
    toolRuns: (body?.toolRuns || []).map((run) => ({
      name: run.name,
      ok: run.ok,
      sources: run.sources || run.result?.sources || [],
      provider: run.result?.provider || null,
      distanceText: run.result?.distance?.text || run.result?.distanceText || null,
      durationText: run.result?.duration?.text || run.result?.durationText || null,
    })),
  };
}

function compactSelfRepair(body) {
  const log = body?.log || body;
  return {
    id: log?.id || body?.id || null,
    tenantId: log?.tenantId || null,
    date: log?.date || null,
    checked: log?.checked ?? null,
    found: log?.found ?? null,
    autoRepaired: log?.autoRepaired ?? null,
    analysisMode: log?.analysisMode || null,
    findingClasses: (log?.findings || []).map((finding) => finding.class).filter(Boolean),
    safeRepairTypes: (log?.safeRepairs || []).map((repair) => repair.type).filter(Boolean),
    fixBriefClasses: (log?.fixBriefs || []).map((brief) => brief.class).filter(Boolean),
    morningReportApprovalIdPresent: Boolean(log?.morningReportApprovalId || body?.morningReportApprovalId),
  };
}

async function main() {
  const receipt = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    expectedSha,
    checks: {},
    ok: false,
  };

  let session;
  try {
    const identity = {
      ...resolveOperatorProofIdentity(),
      tenantId: process.env.NIGHTLY_INTEGRATION_TENANT_ID || "aquatrace",
      role: "OWNER",
    };
    session = await createOperatorProofSession({ identity });
    receipt.checks.auth = {
      mode: session.mode,
      identity: {
        uid: session.identity.uid,
        email: session.identity.email,
        role: session.identity.role,
        tenantId: session.identity.tenantId,
      },
    };

    const version = await fetchJson(`${baseUrl}/api/version`);
    receipt.checks.version = { ok: version.ok, status: version.status, body: version.json };

    const health = await fetchJson(`${baseUrl}/api/health`);
    receipt.checks.health = {
      ok: health.ok,
      status: health.status,
      body: {
        ok: health.json?.ok,
        checks: health.json?.checks,
      },
    };

    const distance = await authedFetchJson(session, "/api/nexi/message", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "aquatrace",
        conversationId: `distance-live-${Date.now()}`,
        message: distancePrompt,
      }),
    });
    receipt.checks.distancePrompt = {
      ok: distance.ok,
      status: distance.status,
      body: compactDistance(distance.json),
      error: distance.ok ? null : distance.json || distance.text || null,
    };

    const beforeExport = await authedFetchJson(session, "/api/platform/tenants/aquatrace/export");
    receipt.checks.selfRepairUsageBefore = {
      ok: beforeExport.ok,
      status: beforeExport.status,
      summary: beforeExport.ok ? summarizeUsage(beforeExport.json) : null,
      error: beforeExport.ok ? null : beforeExport.json || beforeExport.text || null,
    };

    const selfRepair = await authedFetchJson(session, "/api/self-repair/run", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "aquatrace",
        date: "2026-07-08",
        ownerEmail: "chris@aquatraceleak.com",
      }),
    });
    receipt.checks.selfRepairRun = {
      ok: selfRepair.ok,
      status: selfRepair.status,
      body: compactSelfRepair(selfRepair.json),
      error: selfRepair.ok ? null : selfRepair.json || selfRepair.text || null,
    };

    const afterExport = await authedFetchJson(session, "/api/platform/tenants/aquatrace/export");
    receipt.checks.selfRepairUsageAfter = {
      ok: afterExport.ok,
      status: afterExport.status,
      summary: afterExport.ok ? summarizeUsage(afterExport.json) : null,
      error: afterExport.ok ? null : afterExport.json || afterExport.text || null,
    };

    const toolRuns = receipt.checks.distancePrompt.body.toolRuns || [];
    const sawDistanceTool = toolRuns.some((run) => run.name === "getDistance");
    const sawGoogleMaps = toolRuns.some((run) => String(run.provider || "").toLowerCase().includes("google"));
    const beforeCount = receipt.checks.selfRepairUsageBefore.summary?.selfRepairUsageCount || 0;
    const afterCount = receipt.checks.selfRepairUsageAfter.summary?.selfRepairUsageCount || 0;

    receipt.ok = Boolean(
      receipt.checks.version.ok &&
        receipt.checks.version.body?.sha === expectedSha &&
        receipt.checks.health.ok &&
        receipt.checks.health.body?.ok === true &&
        receipt.checks.distancePrompt.ok &&
        sawDistanceTool &&
        sawGoogleMaps &&
        receipt.checks.selfRepairRun.ok &&
        receipt.checks.selfRepairRun.body.analysisMode === "anthropic-gateway" &&
        receipt.checks.selfRepairUsageAfter.ok &&
        afterCount > beforeCount
    );

    if (!receipt.ok) {
      receipt.failure = {
        sawDistanceTool,
        sawGoogleMaps,
        beforeCount,
        afterCount,
        versionMatches: receipt.checks.version.body?.sha === expectedSha,
        healthOk: receipt.checks.health.body?.ok === true,
        selfRepairMode: receipt.checks.selfRepairRun.body.analysisMode,
      };
    }
  } catch (error) {
    receipt.failure = {
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5),
    };
  } finally {
    if (session) {
      await session.dispose().catch(() => {});
    }
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: receipt.ok,
          failure: receipt.failure || null,
          versionSha: receipt.checks.version?.body?.sha || null,
          healthOk: receipt.checks.health?.body?.ok || null,
          distanceStatus: receipt.checks.distancePrompt?.status || null,
          distanceTools:
            receipt.checks.distancePrompt?.body?.toolRuns?.map((run) => `${run.name}:${run.provider || "none"}`) || [],
          selfRepairStatus: receipt.checks.selfRepairRun?.status || null,
          selfRepairMode: receipt.checks.selfRepairRun?.body?.analysisMode || null,
          beforeCount: receipt.checks.selfRepairUsageBefore?.summary?.selfRepairUsageCount || null,
          afterCount: receipt.checks.selfRepairUsageAfter?.summary?.selfRepairUsageCount || null,
          newestCost: receipt.checks.selfRepairUsageAfter?.summary?.newest?.estimatedCostUsd || null,
          receiptPath,
        },
        null,
        2
      )
    );
    process.exitCode = receipt.ok ? 0 : 1;
  }
}

await main();
