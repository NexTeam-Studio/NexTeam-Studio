// Centralized Anthropic defaults so live routes do not drift onto retired IDs
// or accidentally escalate onto higher-cost tiers.
export const DEFAULT_ANTHROPIC_TEXT_MODEL = "claude-sonnet-5";
export const DEFAULT_ANTHROPIC_VISION_MODEL = DEFAULT_ANTHROPIC_TEXT_MODEL;
export const DEFAULT_ANTHROPIC_CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

// Anthropic API pricing, verified against Anthropic docs on 2026-07-03.
// Rates are USD per million tokens.
export const ANTHROPIC_MODEL_PRICING = {
  "claude-sonnet-5": {
    inputPerMillionUsd: 2,
    outputPerMillionUsd: 10,
    cacheWritePerMillionUsd: 2.5,
    cacheReadPerMillionUsd: 0.2,
  },
  "claude-sonnet-4-6": {
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
    cacheWritePerMillionUsd: 3.75,
    cacheReadPerMillionUsd: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    inputPerMillionUsd: 1,
    outputPerMillionUsd: 5,
    cacheWritePerMillionUsd: 1.25,
    cacheReadPerMillionUsd: 0.1,
  },
};

function normalizeText(value = "") {
  return String(value || "").trim();
}

export function resolveAnthropicTextModel(env = process.env) {
  return normalizeText(env.ANTHROPIC_TEXT_MODEL) || DEFAULT_ANTHROPIC_TEXT_MODEL;
}

export function resolveAnthropicClassifierModel(env = process.env) {
  return normalizeText(env.ANTHROPIC_CLASSIFIER_MODEL) || DEFAULT_ANTHROPIC_CLASSIFIER_MODEL;
}

export function resolveAnthropicVisionModel(env = process.env) {
  return normalizeText(env.ANTHROPIC_VISION_MODEL) || resolveAnthropicTextModel(env);
}

export function resolveBragiArticleModel(env = process.env) {
  return normalizeText(env.BRAGI_MODE_B_MODEL) || resolveAnthropicTextModel(env);
}

export function resolveBragiVisionModel(env = process.env) {
  return normalizeText(env.BRAGI_MODE_B_VISION_MODEL) || resolveBragiArticleModel(env);
}

export function getAnthropicModelPricing(model) {
  return ANTHROPIC_MODEL_PRICING[normalizeText(model)] || null;
}
