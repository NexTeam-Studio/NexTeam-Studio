import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fetchJson } from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXTEAM_BASE_URL || "https://nexteam-studio-staging.up.railway.app").replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_GIT_SHA;
const receiptPath = process.env.M12A_VOICE_RECEIPT || "receipts/m12a/m12a-voice-live-receipt.json";
const tenantId = process.env.M12A_TENANT_ID || "aquatrace";
const voiceText = process.env.M12A_VOICE_TEXT || "Nexi voice receipt. I can speak this answer and log the cost.";

function credentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return {
      ...parsed,
      project_id: parsed.project_id || parsed.projectId,
      client_email: parsed.client_email || parsed.clientEmail,
      private_key: parsed.private_key || parsed.privateKey
    };
  }
  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    private_key: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function headerNumber(headers, name) {
  const value = headers.get(name);
  return value === null ? null : Number(value);
}

async function latestVoiceUsageLog() {
  const app = initializeApp({ credential: cert(credentials()) }, `m12a-voice-receipt-${Date.now()}`);
  try {
    const snapshot = await getFirestore(app).collection("usageLog").orderBy("createdAt", "desc").limit(50).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .find((doc) => doc.tenantId === tenantId && doc.provider === "elevenlabs" && doc.routeActionName === "/api/voice/tts");
  } finally {
    await deleteApp(app);
  }
}

const receipt = {
  ok: false,
  baseUrl,
  expectedSha,
  tenantId,
  createdAt: new Date().toISOString(),
  checks: {}
};

try {
  const version = await fetchJson(`${baseUrl}/api/version`);
  receipt.checks.version = { status: version.status, body: version.json };
  assert(version.ok, "version endpoint failed");
  if (expectedSha) {
    assert(version.json?.sha === expectedSha, `version SHA mismatch: expected ${expectedSha}, got ${version.json?.sha}`);
  }

  const health = await fetchJson(`${baseUrl}/api/health`);
  receipt.checks.health = { status: health.status, body: health.json };
  assert(health.ok && health.json?.ok, "health endpoint was not green");

  const response = await fetch(`${baseUrl}/api/voice/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantId, text: voiceText })
  });
  const audio = Buffer.from(await response.arrayBuffer());
  receipt.checks.tts = {
    status: response.status,
    ok: response.ok,
    provider: response.headers.get("x-voice-provider"),
    voiceIdPresent: Boolean(response.headers.get("x-voice-id")),
    characterCount: headerNumber(response.headers, "x-voice-character-count"),
    audioBytesHeader: headerNumber(response.headers, "x-voice-audio-bytes"),
    estimatedCostUsd: headerNumber(response.headers, "x-voice-estimated-cost-usd"),
    audioBytesActual: audio.byteLength,
    contentType: response.headers.get("content-type")
  };
  assert(response.ok, `voice TTS failed with status ${response.status}`);
  assert(receipt.checks.tts.provider === "elevenlabs", "voice provider header was not elevenlabs");
  assert(audio.byteLength > 0, "voice TTS returned no audio bytes");

  const usageLog = await latestVoiceUsageLog();
  receipt.checks.usageLog = usageLog ? {
    found: true,
    id: usageLog.id,
    tenantId: usageLog.tenantId,
    provider: usageLog.provider,
    model: usageLog.model,
    routeActionName: usageLog.routeActionName,
    taskType: usageLog.taskType,
    usage: usageLog.usage,
    estimatedCostUsd: usageLog.estimatedCostUsd,
    ok: usageLog.ok,
    errorSummary: usageLog.errorSummary,
    createdAt: usageLog.createdAt
  } : { found: false };
  assert(usageLog, "matching ElevenLabs usageLog entry was not found");
  assert(usageLog.ok === true, "ElevenLabs usageLog entry was not ok");
  assert(usageLog.usage?.characters === receipt.checks.tts.characterCount, "usageLog character count did not match response header");
  assert(usageLog.usage?.audioBytes === receipt.checks.tts.audioBytesHeader, "usageLog audio bytes did not match response header");
  assert(usageLog.estimatedCostUsd === receipt.checks.tts.estimatedCostUsd, "usageLog cost did not match response header");

  receipt.ok = true;
} catch (error) {
  receipt.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  receipt.completedAt = new Date().toISOString();
  receipt.redaction = "No API keys, tokens, passwords, audio content, or email bodies are recorded. Receipt stores only endpoint metadata and usageLog cost fields.";
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  await Promise.all(getApps().map((app) => deleteApp(app).catch(() => undefined)));
}

console.log(JSON.stringify({
  ok: receipt.ok,
  receiptPath,
  sha: receipt.checks.version?.body?.sha,
  audioBytes: receipt.checks.tts?.audioBytesActual,
  estimatedCostUsd: receipt.checks.tts?.estimatedCostUsd,
  usageLogFound: receipt.checks.usageLog?.found
}, null, 2));
