import type { UsageLogRecord } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";

export interface NexDocsOcrFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type NexDocsOcrFetch = (url: string, init: RequestInit) => Promise<NexDocsOcrFetchResponse>;

export interface NexDocsOcrResult {
  attempted: boolean;
  blockedBudget: boolean;
  searchText: string;
  estimatedCostUsd: number;
  usage?: UsageLogRecord["usage"] | undefined;
  reason?: string | undefined;
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_OCR_MODEL = "claude-sonnet-5";
const DEFAULT_OCR_CAP_USD = 5;
const DEFAULT_IMAGE_ESTIMATE_USD = 0.018;
const OCR_ROUTE_ACTION = "/api/nexdocs/documents";
const OCR_TASK_TYPE = "nexdocs_ocr";
const OCR_TEXT_LIMIT = 24_000;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyUsage(): UsageLogRecord["usage"] {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0
  };
}

function normalizeUsage(value: unknown): UsageLogRecord["usage"] {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const inputTokens = normalizeNumber(usage.input_tokens);
  const outputTokens = normalizeNumber(usage.output_tokens);
  const cacheCreationInputTokens = normalizeNumber(usage.cache_creation_input_tokens);
  const cacheReadInputTokens = normalizeNumber(usage.cache_read_input_tokens);
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens
  };
}

function estimateUsageCostUsd(usage: UsageLogRecord["usage"]): number {
  const input = usage.inputTokens * 3 / 1_000_000;
  const output = usage.outputTokens * 15 / 1_000_000;
  const cacheWrite = usage.cacheCreationInputTokens * 3.75 / 1_000_000;
  const cacheRead = usage.cacheReadInputTokens * 0.30 / 1_000_000;
  return Number((input + output + cacheWrite + cacheRead).toFixed(6));
}

function contentText(payload: unknown): string {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const content = Array.isArray(record.content) ? record.content : [];
  return content.map((block) => {
    const blockRecord = block && typeof block === "object" ? block as Record<string, unknown> : {};
    return typeof blockRecord.text === "string" ? blockRecord.text : "";
  }).filter(Boolean).join("\n");
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, OCR_TEXT_LIMIT);
}

function readJson(raw: string): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function ocrEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = env.NEXDOCS_OCR_ENABLED?.trim().toLowerCase();
  if (flag === "false") {
    return false;
  }
  return Boolean(env.ANTHROPIC_API_KEY?.trim()) || flag === "true";
}

function ocrCapUsd(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.NEXDOCS_OCR_BUDGET_CAP_USD);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_OCR_CAP_USD;
}

export function estimateNexDocsOcrCost(input: { mimeType: string; sizeBytes: number }, env: NodeJS.ProcessEnv = process.env): number {
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    return 0;
  }
  const configured = Number(env.NEXDOCS_OCR_IMAGE_ESTIMATE_USD);
  const estimate = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_IMAGE_ESTIMATE_USD;
  return Number(estimate.toFixed(4));
}

function ocrCandidate(input: { mimeType: string }): boolean {
  return IMAGE_MIME_TYPES.has(input.mimeType.trim().toLowerCase());
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
    provider: "anthropic",
    model: input.model,
    routeActionName: OCR_ROUTE_ACTION,
    taskType: OCR_TASK_TYPE,
    usage: input.usage,
    estimatedCostUsd: input.estimatedCostUsd,
    ok: input.ok,
    errorSummary: input.errorSummary,
    createdAt: new Date().toISOString()
  });
}

export async function maybeRunNexDocsOcr(input: {
  tenantId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: NexDocsOcrFetch | undefined;
  usageLog?: UsageLogWriter | undefined;
}): Promise<NexDocsOcrResult> {
  const env = input.env ?? process.env;
  const mimeType = input.mimeType.trim().toLowerCase();
  const model = env.NEXDOCS_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
  if (!ocrEnabled(env)) {
    return {
      attempted: false,
      blockedBudget: false,
      searchText: "",
      estimatedCostUsd: 0,
      reason: "NexDocs OCR is disabled because no approved Anthropic OCR config is present."
    };
  }
  if (!ocrCandidate({ mimeType })) {
    return {
      attempted: false,
      blockedBudget: false,
      searchText: "",
      estimatedCostUsd: 0,
      reason: "NexDocs OCR currently runs only on image uploads."
    };
  }
  const estimatedCostUsd = estimateNexDocsOcrCost({ mimeType, sizeBytes: input.bytes.byteLength }, env);
  const capUsd = ocrCapUsd(env);
  if (estimatedCostUsd > capUsd) {
    await writeUsageRecord({
      usageLog: input.usageLog,
      tenantId: input.tenantId,
      model,
      usage: emptyUsage(),
      estimatedCostUsd,
      ok: false,
      errorSummary: `NexDocs OCR blocked before provider call because estimated spend ${estimatedCostUsd.toFixed(4)} exceeded cap ${capUsd.toFixed(4)}.`
    });
    return {
      attempted: false,
      blockedBudget: true,
      searchText: "",
      estimatedCostUsd,
      reason: "NexDocs OCR stayed parked because the estimated OCR spend exceeded the tenant cap."
    };
  }
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      attempted: false,
      blockedBudget: false,
      searchText: "",
      estimatedCostUsd,
      reason: "NexDocs OCR was enabled but no Anthropic API key was available."
    };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: input.bytes.toString("base64")
              }
            },
            {
              type: "text",
              text: "Extract searchable document text from this image for a field-service office document rail. Return plain text only. If there is no useful text, return an empty string."
            }
          ]
        }
      ]
    })
  });
  const payload = readJson(await response.text());
  const usage = normalizeUsage(payload && typeof payload === "object" ? (payload as Record<string, unknown>).usage : undefined);
  const actualCostUsd = estimateUsageCostUsd(usage);
  if (!response.ok) {
    await writeUsageRecord({
      usageLog: input.usageLog,
      tenantId: input.tenantId,
      model,
      usage,
      estimatedCostUsd: actualCostUsd,
      ok: false,
      errorSummary: `NexDocs OCR provider call failed with status ${response.status}.`
    });
    return {
      attempted: true,
      blockedBudget: false,
      searchText: "",
      estimatedCostUsd: actualCostUsd,
      usage,
      reason: `NexDocs OCR provider call failed with status ${response.status}.`
    };
  }
  const searchText = normalizeSearchText(contentText(payload));
  await writeUsageRecord({
    usageLog: input.usageLog,
    tenantId: input.tenantId,
    model,
    usage,
    estimatedCostUsd: actualCostUsd,
    ok: true,
    errorSummary: ""
  });
  return {
    attempted: true,
    blockedBudget: false,
    searchText,
    estimatedCostUsd: actualCostUsd,
    usage
  };
}
