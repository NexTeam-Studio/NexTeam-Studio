import type { UsageLogRecord } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";

export interface MobileTranscriptionFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type MobileTranscriptionFetch = (
  url: string,
  init: RequestInit
) => Promise<MobileTranscriptionFetchResponse>;

export interface MobileTranscriptionResult {
  attempted: boolean;
  blockedBudget: boolean;
  transcript: string;
  estimatedCostUsd: number;
  usage?: UsageLogRecord["usage"] | undefined;
  reason?: string | undefined;
}

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_TRANSCRIPTION_CAP_USD = 5;
const DEFAULT_TRANSCRIPTION_MINUTE_RATE_USD = 0.006;
const TRANSCRIPTION_ROUTE_ACTION = "/api/mobile/transcribe";
const TRANSCRIPTION_TASK_TYPE = "m11_mobile_transcription";
const TRANSCRIPT_LIMIT = 24_000;

function emptyUsage(audioBytes = 0): UsageLogRecord["usage"] {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    audioBytes
  };
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, TRANSCRIPT_LIMIT);
}

function transcriptionEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = env.M11_TRANSCRIPTION_ENABLED?.trim().toLowerCase();
  if (flag === "false") {
    return false;
  }
  return Boolean(env.OPENAI_API_KEY?.trim()) || flag === "true";
}

function transcriptionCapUsd(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.M11_TRANSCRIPTION_CAP_USD);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TRANSCRIPTION_CAP_USD;
}

function transcriptionRatePerMinuteUsd(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.M11_TRANSCRIPTION_RATE_PER_MINUTE_USD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRANSCRIPTION_MINUTE_RATE_USD;
}

export function estimateMobileTranscriptionCost(input: {
  durationMs?: number | undefined;
  audioBytes: number;
}, env: NodeJS.ProcessEnv = process.env): number {
  const durationMs = Number.isFinite(input.durationMs) && (input.durationMs ?? 0) > 0
    ? Number(input.durationMs)
    : Math.max(Math.ceil(input.audioBytes / 16_000), 1_000);
  const minutes = durationMs / 60_000;
  return Number((minutes * transcriptionRatePerMinuteUsd(env)).toFixed(6));
}

async function writeUsageRecord(input: {
  usageLog?: UsageLogWriter | undefined;
  tenantId: string;
  model: string;
  usage: UsageLogRecord["usage"];
  estimatedCostUsd: number;
  ok: boolean;
  errorSummary: string;
}): Promise<void> {
  await input.usageLog?.write({
    tenantId: input.tenantId,
    provider: "openai",
    model: input.model,
    routeActionName: TRANSCRIPTION_ROUTE_ACTION,
    taskType: TRANSCRIPTION_TASK_TYPE,
    usage: input.usage,
    estimatedCostUsd: input.estimatedCostUsd,
    ok: input.ok,
    errorSummary: input.errorSummary,
    createdAt: new Date().toISOString()
  });
}

export async function maybeTranscribeMobileNarration(input: {
  tenantId: string;
  fileName: string;
  mimeType: string;
  audioBase64: string;
  durationMs?: number | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: MobileTranscriptionFetch | undefined;
  usageLog?: UsageLogWriter | undefined;
}): Promise<MobileTranscriptionResult> {
  const env = input.env ?? process.env;
  const model = env.OPENAI_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
  if (!transcriptionEnabled(env)) {
    return {
      attempted: false,
      blockedBudget: false,
      transcript: "",
      estimatedCostUsd: 0,
      reason: "Mobile transcription is disabled because no approved OpenAI transcription config is present."
    };
  }
  const bytes = Buffer.from(input.audioBase64, "base64");
  const estimatedCostUsd = estimateMobileTranscriptionCost({
    durationMs: input.durationMs,
    audioBytes: bytes.byteLength
  }, env);
  const capUsd = transcriptionCapUsd(env);
  if (estimatedCostUsd > capUsd) {
    await writeUsageRecord({
      usageLog: input.usageLog,
      tenantId: input.tenantId,
      model,
      usage: emptyUsage(bytes.byteLength),
      estimatedCostUsd,
      ok: false,
      errorSummary: `M11 transcription blocked before provider call because estimated spend ${estimatedCostUsd.toFixed(6)} exceeded cap ${capUsd.toFixed(6)}.`
    });
    return {
      attempted: false,
      blockedBudget: true,
      transcript: "",
      estimatedCostUsd,
      reason: "Mobile transcription stayed parked because the estimated transcription spend exceeded the tenant cap."
    };
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      attempted: false,
      blockedBudget: false,
      transcript: "",
      estimatedCostUsd,
      reason: "Mobile transcription was enabled but no OpenAI API key was available."
    };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const formData = new FormData();
  const blob = new Blob([bytes], { type: input.mimeType });
  formData.append("file", blob, input.fileName);
  formData.append("model", model);
  formData.append("response_format", "json");
  const response = await fetchImpl(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    body: formData
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    payload = { text: raw };
  }
  const usage = emptyUsage(bytes.byteLength);
  if (!response.ok) {
    await writeUsageRecord({
      usageLog: input.usageLog,
      tenantId: input.tenantId,
      model,
      usage,
      estimatedCostUsd,
      ok: false,
      errorSummary: `Mobile transcription provider call failed with status ${response.status}.`
    });
    return {
      attempted: true,
      blockedBudget: false,
      transcript: "",
      estimatedCostUsd,
      usage,
      reason: `Mobile transcription provider call failed with status ${response.status}.`
    };
  }
  const transcript = normalizeSearchText(typeof payload.text === "string" ? payload.text : "");
  await writeUsageRecord({
    usageLog: input.usageLog,
    tenantId: input.tenantId,
    model,
    usage,
    estimatedCostUsd,
    ok: true,
    errorSummary: ""
  });
  return {
    attempted: true,
    blockedBudget: false,
    transcript,
    estimatedCostUsd,
    usage
  };
}
