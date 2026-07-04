import { writeAnthropicUsageLog } from "./anthropicUsageLogService.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function modelSupportsTemperature(model = "") {
  const normalized = normalizeText(model).toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "claude-sonnet-5" || normalized.startsWith("claude-sonnet-5-")) {
    return false;
  }

  return true;
}

function buildSystemBlocks(system) {
  if (Array.isArray(system)) {
    return system;
  }

  const text = normalizeText(system);
  if (!text) {
    return [];
  }

  return [
    {
      type: "text",
      text,
      cache_control: {
        type: "ephemeral",
      },
    },
  ];
}

async function readJsonResponseSafely(response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

export async function callAnthropicMessages({
  env = process.env,
  model,
  system,
  messages,
  tools = [],
  maxTokens,
  temperature,
  routeActionName,
  taskType,
  tenantId,
  metadata = {},
  fetchImpl = fetch,
  usageLogger = writeAnthropicUsageLog,
} = {}) {
  const apiKey = normalizeText(env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages,
  };

  const systemBlocks = buildSystemBlocks(system);
  if (systemBlocks.length) {
    requestBody.system = systemBlocks;
  }

  if (Array.isArray(tools) && tools.length) {
    requestBody.tools = tools;
  }

  if (typeof temperature === "number" && modelSupportsTemperature(model)) {
    requestBody.temperature = temperature;
  }

  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await readJsonResponseSafely(response);

  if (typeof usageLogger === "function") {
    try {
      await usageLogger({
        env,
        tenantId,
        routeActionName,
        taskType,
        model,
        usage: payload?.usage || null,
        success: response.ok,
        errorSummary: response.ok
          ? ""
          : normalizeText(payload?.error?.message || payload?.error || payload?.message),
        metadata,
      });
    } catch {
      // Usage logging must not break the main request path.
    }
  }

  if (!response.ok) {
    const error = new Error(
      normalizeText(payload?.error?.message || payload?.error || payload?.message) ||
        `Anthropic request failed with status ${response.status}.`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const anthropicClientInternals = {
  buildSystemBlocks,
  modelSupportsTemperature,
  readJsonResponseSafely,
};
