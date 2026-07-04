import type { Source, UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import { enforceSources } from "./sourceCheck.js";

export const NEXI_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicUsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface UsageLogWriter {
  write(record: UsageLogRecord): Promise<void>;
}

export interface GatewayMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GatewayToolDefinition {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface GatewayRequest {
  tenantId: string;
  system: string;
  messages: GatewayMessage[];
  tools?: GatewayToolDefinition[];
  maxTokens?: number;
  routeActionName: string;
  taskType: string;
  sources: Source[];
  usageLog?: UsageLogWriter;
  env?: NodeJS.ProcessEnv;
}

export interface GatewayResponse {
  answer: string;
  sources: Source[];
  usage: UsageLogRecord["usage"];
  raw: unknown;
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUsage(usage: AnthropicUsagePayload | undefined): UsageLogRecord["usage"] {
  const inputTokens = normalizeNumber(usage?.input_tokens);
  const outputTokens = normalizeNumber(usage?.output_tokens);
  const cacheCreationInputTokens = normalizeNumber(usage?.cache_creation_input_tokens);
  const cacheReadInputTokens = normalizeNumber(usage?.cache_read_input_tokens);
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens
  };
}

function estimateCostUsd(usage: UsageLogRecord["usage"]): number {
  const input = usage.inputTokens * 3 / 1_000_000;
  const output = usage.outputTokens * 15 / 1_000_000;
  const cacheWrite = usage.cacheCreationInputTokens * 3.75 / 1_000_000;
  const cacheRead = usage.cacheReadInputTokens * 0.30 / 1_000_000;
  return Number((input + output + cacheWrite + cacheRead).toFixed(6));
}

function textFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  return content.map((block) => {
    if (!block || typeof block !== "object") {
      return "";
    }
    const blockRecord = block as Record<string, unknown>;
    return typeof blockRecord.text === "string" ? blockRecord.text : "";
  }).filter(Boolean).join("\n").trim();
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function payloadMessage(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
    const message = error?.message ?? record.message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "Anthropic request failed.";
}

export async function callNexiGateway(request: GatewayRequest): Promise<GatewayResponse> {
  const env = request.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new RailError("ANTHROPIC_API_KEY is not configured.", { provider: "anthropic", op: "messages", status: 400 });
  }

  const body = {
    model: NEXI_ANTHROPIC_MODEL,
    max_tokens: request.maxTokens ?? 1200,
    system: [
      {
        type: "text",
        text: request.system,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: request.messages,
    tools: request.tools ?? []
  };

  const startedAt = Date.now();
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  const usagePayload = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).usage as AnthropicUsagePayload | undefined
    : undefined;
  const usage = normalizeUsage(usagePayload);
  const answer = textFromPayload(payload);
  const sourceCheck = enforceSources(answer, request.sources);
  const record: UsageLogRecord = {
    tenantId: request.tenantId,
    provider: "anthropic",
    model: NEXI_ANTHROPIC_MODEL,
    routeActionName: request.routeActionName,
    taskType: request.taskType,
    usage,
    estimatedCostUsd: estimateCostUsd(usage),
    ok: response.ok && sourceCheck.ok,
    errorSummary: response.ok ? sourceCheck.failureReason ?? "" : payloadMessage(payload),
    createdAt: new Date().toISOString()
  };
  await request.usageLog?.write(record);

  if (!response.ok) {
    throw new RailError(payloadMessage(payload), {
      provider: "anthropic",
      op: "messages",
      status: response.status,
      retryable: response.status >= 500
    });
  }

  return {
    answer: sourceCheck.answer,
    sources: request.sources,
    usage,
    raw: { payload, latencyMs: Date.now() - startedAt }
  };
}

