import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

const DEFAULT_BRAIN_PUBLIC_URL = "http://127.0.0.1:8788";

function normalizeText(value) {
  return String(value || "").trim();
}

function getConfiguredBrainPublicUrl() {
  const runtimeValue = getRuntimeConfigValue("VITE_CLAWDIA_BRAIN_PUBLIC_URL", "");
  if (runtimeValue) {
    return normalizeText(runtimeValue);
  }
  if (typeof process !== "undefined" && process?.env?.CLAWDIA_BRAIN_PUBLIC_URL) {
    return normalizeText(process.env.CLAWDIA_BRAIN_PUBLIC_URL);
  }
  return DEFAULT_BRAIN_PUBLIC_URL;
}

function isClawdiaCommand(text) {
  return normalizeText(text).toLowerCase().startsWith("clawdia");
}

async function callPublicCommandRoute(question) {
  const response = await fetch(`${getConfiguredBrainPublicUrl()}/public/operator/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: normalizeText(question),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(normalizeText(payload?.error || payload?.message || "Public command route failed."));
  }
  return payload;
}

export async function maybeRunClawdiaOperatorAction(question, operationalTruth = null) {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion || !isClawdiaCommand(normalizedQuestion)) {
    return null;
  }

  const payload = await callPublicCommandRoute(normalizedQuestion);
  if (payload?.handled !== true) {
    return null;
  }

  return {
    handled: true,
    type: payload.mode || "route",
    response: payload.response || payload.message || "Clawdia command handled.",
    routeSummary: normalizeText(payload.route_summary),
    route: payload.route || null,
    payload,
    operationalTruthLoaded: Boolean(operationalTruth?.loaded),
  };
}

export const clawdiaOperatorServiceInternals = {
  DEFAULT_BRAIN_PUBLIC_URL,
  callPublicCommandRoute,
  getConfiguredBrainPublicUrl,
  isClawdiaCommand,
};
