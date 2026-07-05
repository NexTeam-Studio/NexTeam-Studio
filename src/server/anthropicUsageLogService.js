import { getFirebaseAdminDb } from "./firebaseAdminApp.js";
import { getAnthropicModelPricing } from "../lib/anthropicModels.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeAnthropicUsage(usage = {}) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const normalized = {
    input_tokens: normalizeNumber(usage.input_tokens),
    output_tokens: normalizeNumber(usage.output_tokens),
    cache_creation_input_tokens: normalizeNumber(usage.cache_creation_input_tokens),
    cache_read_input_tokens: normalizeNumber(usage.cache_read_input_tokens),
  };

  normalized.total_input_tokens =
    normalized.input_tokens +
    normalized.cache_creation_input_tokens +
    normalized.cache_read_input_tokens;
  normalized.total_tokens = normalized.total_input_tokens + normalized.output_tokens;

  return normalized;
}

export function estimateAnthropicCostUsd({ model, usage }) {
  const pricing = getAnthropicModelPricing(model);
  const normalizedUsage = normalizeAnthropicUsage(usage);
  if (!pricing || !normalizedUsage) {
    return null;
  }

  const estimate =
    (normalizedUsage.input_tokens / 1_000_000) * pricing.inputPerMillionUsd +
    (normalizedUsage.output_tokens / 1_000_000) * pricing.outputPerMillionUsd +
    (normalizedUsage.cache_creation_input_tokens / 1_000_000) * pricing.cacheWritePerMillionUsd +
    (normalizedUsage.cache_read_input_tokens / 1_000_000) * pricing.cacheReadPerMillionUsd;

  return Number(estimate.toFixed(6));
}

export function buildAnthropicUsageLogRecord({
  tenantId = "",
  routeActionName = "",
  taskType = "",
  model = "",
  usage = null,
  success = true,
  errorSummary = "",
  metadata = {},
} = {}) {
  const normalizedUsage = normalizeAnthropicUsage(usage);
  return {
    provider: "anthropic",
    tenantId: normalizeText(tenantId) || "platform",
    routeActionName: normalizeText(routeActionName) || "anthropic_request",
    taskType: normalizeText(taskType) || "unspecified",
    model: normalizeText(model),
    success: success === true,
    errorSummary: normalizeText(errorSummary),
    usage: normalizedUsage,
    estimatedCostUsd: estimateAnthropicCostUsd({ model, usage: normalizedUsage }),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: new Date().toISOString(),
  };
}

export async function writeAnthropicUsageLog({
  env = process.env,
  tenantId = "",
  routeActionName = "",
  taskType = "",
  model = "",
  usage = null,
  success = true,
  errorSummary = "",
  metadata = {},
} = {}) {
  const record = buildAnthropicUsageLogRecord({
    tenantId,
    routeActionName,
    taskType,
    model,
    usage,
    success,
    errorSummary,
    metadata,
  });

  const db = getFirebaseAdminDb(env);
  const ref = await db.collection("anthropicUsageLogs").add(record);

  return {
    id: ref.id,
    path: ref.path,
    record,
  };
}
