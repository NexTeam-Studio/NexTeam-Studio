import type { Media } from "@nexteam/core";

export interface VisionPipelineResult {
  enabled: boolean;
  media: Media;
  reason?: string;
  usage?: VisionUsage | undefined;
  estimatedCostUsd?: number | undefined;
  raw?: unknown;
}

export interface VisionImageInput {
  mime: string;
  base64: string;
}

export interface VisionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
}

export interface VisionFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type VisionFetch = (url: string, init: RequestInit) => Promise<VisionFetchResponse>;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const VISION_MODEL = "claude-sonnet-5";

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUsage(value: unknown): VisionUsage {
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

function estimateCostUsd(usage: VisionUsage): number {
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
  }).filter(Boolean).join("\n").trim();
}

function parseVisionText(text: string): { aiCaption: string; aiTags: string[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    const aiCaption = typeof record.aiCaption === "string" ? record.aiCaption.trim() : text.trim();
    const aiTags = Array.isArray(record.aiTags)
      ? record.aiTags.map((tag) => typeof tag === "string" ? tag.trim().toLowerCase() : "").filter(Boolean).slice(0, 12)
      : [];
    return { aiCaption, aiTags };
  } catch {
    return { aiCaption: text.trim(), aiTags: [] };
  }
}

async function readJson(response: VisionFetchResponse): Promise<unknown> {
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

async function runAnthropicVision(media: Media, image: VisionImageInput, env: NodeJS.ProcessEnv, fetchImpl: VisionFetch): Promise<VisionPipelineResult> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { enabled: false, media, reason: "ANTHROPIC_API_KEY is not configured." };
  }
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.FIELD_DOCS_VISION_MODEL || VISION_MODEL,
      max_tokens: 180,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mime,
                data: image.base64
              }
            },
            {
              type: "text",
              text: "You are labeling a field-service pool/leak documentation photo. Return compact JSON only: {\"aiCaption\":\"one sentence\", \"aiTags\":[\"tag\"]}. Do not include URLs, client PII, or markdown."
            }
          ]
        }
      ]
    })
  });
  const payload = await readJson(response);
  const usage = normalizeUsage(payload && typeof payload === "object" ? (payload as Record<string, unknown>).usage : undefined);
  if (!response.ok) {
    const message = payload && typeof payload === "object" ? (payload as Record<string, unknown>).error : payload;
    return { enabled: true, media, reason: `Anthropic vision failed with status ${response.status}.`, usage, estimatedCostUsd: estimateCostUsd(usage), raw: message };
  }
  const parsed = parseVisionText(contentText(payload));
  return {
    enabled: true,
    media: {
      ...media,
      aiTags: parsed.aiTags.length ? parsed.aiTags : media.aiTags,
      aiCaption: parsed.aiCaption || media.aiCaption
    },
    usage,
    estimatedCostUsd: estimateCostUsd(usage),
    raw: payload
  };
}

export function visionPipelineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FIELD_DOCS_VISION_ENABLED === "true";
}

export async function maybeRunVision(
  media: Media,
  env: NodeJS.ProcessEnv = process.env,
  image?: VisionImageInput,
  fetchImpl: VisionFetch = fetch
): Promise<VisionPipelineResult> {
  if (!visionPipelineEnabled(env)) {
    return { enabled: false, media, reason: "FIELD_DOCS_VISION_ENABLED is not true." };
  }
  if (image) {
    return runAnthropicVision(media, image, env, fetchImpl);
  }
  return {
    enabled: true,
    media: {
      ...media,
      aiTags: media.aiTags.length > 0 ? media.aiTags : ["vision_pending_approval"],
      aiCaption: media.aiCaption ?? "Vision pipeline placeholder: paid live image analysis is parked until an approved receipt run."
    }
  };
}
