import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl
} from "./support/liveProofHelpers.mjs";
import { nexiTrialRegressionSessions } from "../tests/fixtures/nexi-trial-regression-cases.mjs";
import { nexiOwnerReportedRegressionSessions } from "../tests/fixtures/nexi-owner-reported-regression-cases.mjs";

const baseUrl = process.env.NEXI_BASE_URL || resolveBaseUrl();
const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.env.NEXI_REGRESSION_RECEIPT || "receipts/m1/nexi-regression-wall-live.json";
const runId = `regression-wall-${Date.now()}-${randomUUID().slice(0, 8)}`;
const caseFilter = process.env.NEXI_REGRESSION_CASE || "";
const limit = Number(process.env.NEXI_REGRESSION_LIMIT || "0");
const caseDelayMs = Number(process.env.NEXI_REGRESSION_CASE_DELAY_MS || "750");
const quotaRetryLimit = Number(process.env.NEXI_REGRESSION_QUOTA_RETRIES || "6");
const allRegressionSessions = [
  ...nexiTrialRegressionSessions,
  ...nexiOwnerReportedRegressionSessions
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectedSessions() {
  let remaining = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
  const sessions = [];
  for (const session of allRegressionSessions) {
    const cases = session.cases.filter((testCase) => !caseFilter || testCase.id.includes(caseFilter) || testCase.question.includes(caseFilter));
    if (cases.length === 0) {
      continue;
    }
    const selected = cases.slice(0, remaining);
    if (selected.length > 0) {
      sessions.push({ ...session, cases: selected });
      remaining -= selected.length;
    }
    if (remaining <= 0) {
      break;
    }
  }
  return sessions;
}

function answerText(result) {
  return String(result?.answer || "");
}

function toolNames(result) {
  return Array.isArray(result?.toolRuns) ? result.toolRuns.map((run) => run.name) : [];
}

function missingRequiredTools(testCase, names) {
  return testCase.requiredTools.filter((name) => !names.includes(name));
}

function presentForbiddenTools(testCase, names) {
  return testCase.forbiddenTools.filter((name) => names.includes(name));
}

function runAssertions(testCase, result) {
  const failures = [];
  const answer = answerText(result);
  const lower = answer.toLowerCase();
  const names = toolNames(result);
  const missing = missingRequiredTools(testCase, names);
  if (missing.length > 0) {
    failures.push(`missing required tools: ${missing.join(", ")}`);
  }
  const forbidden = presentForbiddenTools(testCase, names);
  if (forbidden.length > 0) {
    failures.push(`forbidden tools used: ${forbidden.join(", ")}`);
  }
  if (testCase.assertions.includes("noRawToolError") && /invalid time value|\\[object object\\]|zoderror|typeerror|referenceerror/i.test(answer)) {
    failures.push("raw tool/runtime error leaked");
  }
  if (testCase.assertions.includes("noJan2024") && !/2024/.test(testCase.question) && /jan(?:uary)?\\s+1|jan(?:uary)?\\s+2|2024/i.test(answer)) {
    failures.push("untraceable Jan 2024 date appeared");
  }
  if (testCase.assertions.includes("noNoSourceStonewall") && /verified source|written down anywhere yet|matching email for that query/i.test(answer)) {
    failures.push("source/missing-data stonewall on non-fact/action/capability turn");
  }
  if (testCase.assertions.includes("capabilityGap") && !/(can't|cannot|not wired|not able|not built|capability_not_available|need .* tool)/i.test(answer)) {
    failures.push("capability gap was not surfaced plainly");
  }
  if (testCase.assertions.includes("capabilityGap") && /written down anywhere yet|verified source/i.test(answer)) {
    failures.push("capability gap used missing-data/source wording");
  }
  if (testCase.assertions.includes("draftQueued") && !/(draft|queued|approval|pending)/i.test(answer)) {
    failures.push("email action did not queue an approval draft");
  }
  if (testCase.assertions.includes("noSingleRailPaymentConclusion")) {
    if (!names.includes("invoiceStatus") || !names.includes("searchEmail")) {
      failures.push("payment answer did not exhaust invoice and email rails");
    }
    if (/lead status.*not.*paid|still showing as a lead.*not.*paid/i.test(answer)) {
      failures.push("payment answer treated lead status as unpaid proof");
    }
  }
  if (testCase.expectedIntent === "payment_status_cross_rail" && lower.includes("i don't have") && names.length < 3) {
    failures.push("payment fallback occurred before required rails were exhausted");
  }
  return failures;
}

async function postNexiMessage({ idToken, conversationId, message }) {
  const response = await fetchJson(`${baseUrl.replace(/\/$/, "")}/api/nexi/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({ tenantId, conversationId, message })
  });
  if (!response.ok || !response.json?.ok) {
    throw new Error(`Nexi message failed (${response.status}): ${response.json?.error || response.text}`);
  }
  return response.json;
}

async function postNexiMessageWithQuotaRetry(input) {
  let lastError = null;
  for (let attempt = 0; attempt <= quotaRetryLimit; attempt += 1) {
    try {
      return await postNexiMessage(input);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      lastError = caught;
      if (!/RESOURCE_EXHAUSTED|quota exceeded/i.test(message) || attempt >= quotaRetryLimit) {
        throw caught;
      }
      await sleep(Math.min(60_000, 5_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

const sessions = selectedSessions();
const results = [];
let passed = 0;
let failed = 0;
const proofSession = await createOperatorProofSession();

try {
  for (const session of sessions) {
    let conversationId = `${runId}-${session.conversationId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 48)}`;
    for (const testCase of session.cases) {
      const startedAt = Date.now();
      let result = null;
      let error = "";
      let assertionFailures = [];
      try {
        result = await postNexiMessageWithQuotaRetry({
          idToken: proofSession.idToken,
          conversationId,
          message: testCase.question
        });
        conversationId = result.conversationId || conversationId;
        assertionFailures = runAssertions(testCase, result);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        assertionFailures = [error];
      }
      const ok = assertionFailures.length === 0;
      if (ok) {
        passed += 1;
      } else {
        failed += 1;
      }
      results.push({
        id: testCase.id,
        createdAt: testCase.createdAt,
        expectedIntent: testCase.expectedIntent,
        ok,
        failures: assertionFailures,
        tools: result ? toolNames(result) : [],
        answerSample: result ? answerText(result).replace(/\s+/g, " ").slice(0, 240) : "",
        latencyMs: Date.now() - startedAt
      });
      if (caseDelayMs > 0) {
        await sleep(caseDelayMs);
      }
    }
  }
} finally {
  await proofSession.dispose();
}

const receipt = {
  ok: failed === 0,
  runId,
  baseUrl,
  tenantId,
  total: passed + failed,
  passed,
  failed,
  caseFilter: caseFilter || null,
  limit: Number.isFinite(limit) && limit > 0 ? limit : null,
  results
};

mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: receipt.ok,
  receiptPath,
  total: receipt.total,
  passed,
  failed,
  failures: results.filter((result) => !result.ok).map((result) => ({ id: result.id, failures: result.failures })).slice(0, 20)
}, null, 2));

if (!receipt.ok) {
  process.exit(1);
}
