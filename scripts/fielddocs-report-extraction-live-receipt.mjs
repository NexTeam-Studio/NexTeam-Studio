import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { fetchJson, signInWithCustomTokenRest } from "./support/liveProofHelpers.mjs";

const baseUrl = process.env.NEXTEAM_BASE_URL || "https://nexteam-studio-staging.up.railway.app";
const receiptPath = "receipts/m4/report-extraction-schema-receipt.json";
const expectedSha = process.env.EXPECTED_GIT_SHA || "96d57327aa373f48fdcb1e3f56394fb40acb0b33";

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function adminCredentialFromEnv() {
  return cert({
    projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
    clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
  });
}

function operatorUid() {
  return (process.env.FIREBASE_PLATFORM_OPERATOR_UIDS || "USX9Lc0M6mdRU7QxrMNjJhiV2p42")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];
}

function summarizeMessageResponse(prompt, response) {
  const body = response.json || {};
  return {
    prompt,
    status: response.status,
    ok: response.ok && body.ok === true,
    answer: body.answer || null,
    sources: Array.isArray(body.sources) ? body.sources : [],
    usage: body.usage || null,
    failureReason: body.failureReason || null,
    toolRuns: Array.isArray(body.toolRuns)
      ? body.toolRuns.map((toolRun) => ({
        name: toolRun.name,
        sourceCount: Array.isArray(toolRun.sources) ? toolRun.sources.length : 0,
        reportCount: Array.isArray(toolRun.result?.reports) ? toolRun.result.reports.length : undefined,
        parsedReportCount: Array.isArray(toolRun.result?.reports)
          ? toolRun.result.reports.filter((report) => report.parsed !== false).length
          : undefined,
      }))
      : [],
  };
}

async function main() {
  const app = initializeApp({ credential: adminCredentialFromEnv() }, `item6-live-${randomUUID()}`);
  try {
    const customToken = await getAuth(app).createCustomToken(operatorUid(), {
      tenantId: "aquatrace",
      role: "platform_operator",
    });
    const signIn = await signInWithCustomTokenRest({
      apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
      token: customToken,
    });
    const headers = {
      Authorization: `Bearer ${signIn.idToken}`,
      "Content-Type": "application/json",
    };
    const version = await fetchJson(`${baseUrl}/api/version`);
    const health = await fetchJson(`${baseUrl}/api/health`);
    const prompts = [
      "What were the leak detection findings for Valley View Condominiums from the CompanyCam report?",
      "What were the leak detection findings for Camp Mikell from the CompanyCam report?",
    ];
    const liveTranscript = [];
    for (const prompt of prompts) {
      const response = await fetchJson(`${baseUrl}/api/nexi/message`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenantId: "aquatrace",
          conversationId: `m4-report-extraction-${Date.now()}-${randomUUID()}`,
          message: prompt,
        }),
      });
      liveTranscript.push(summarizeMessageResponse(prompt, response));
    }

    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.stagingProof = {
      baseUrl,
      expectedSha,
      version: version.json || version.text,
      shaMatches: version.json?.sha === expectedSha,
      health: health.json || health.text,
    };
    receipt.liveTranscript = liveTranscript;
    const corpusOk = Array.isArray(receipt.corpus?.files)
      ? receipt.corpus.files.every((file) => file.ok === true)
      : receipt.ok === true;
    receipt.ok = corpusOk
      && receipt.stagingProof.shaMatches
      && health.ok
      && liveTranscript.length === prompts.length
      && liveTranscript.every((entry) => entry.ok && entry.sources.length > 0);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: receipt.ok,
      receiptPath,
      shaMatches: receipt.stagingProof.shaMatches,
      transcript: liveTranscript.map((entry) => ({
        prompt: entry.prompt,
        ok: entry.ok,
        sourceCount: entry.sources.length,
        answerPreview: entry.answer ? entry.answer.slice(0, 180) : null,
        failureReason: entry.failureReason,
      })),
    }, null, 2));
    if (!receipt.ok) {
      process.exitCode = 1;
    }
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
  process.exitCode = 1;
});
