import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

const DEFAULT_BRAIN_PUBLIC_URL = "http://127.0.0.1:8788";
const GOONIE_META = {
  chunk: { id: "chunk", name: "Chunk", role: "Research / Facts / Case Studies", consult_lane: "research_facts" },
  mikey: { id: "mikey", name: "Mikey", role: "Executive Strategy / Leverage / Sequencing", consult_lane: "strategy_sequence" },
  mouth: { id: "mouth", name: "Mouth", role: "Sales / Messaging / Customer Communication", consult_lane: "messaging_sales" },
  brand: { id: "brand", name: "Brand", role: "Field Operations / Real-World Service Workflow", consult_lane: "field_operations" },
  data: { id: "data", name: "Data", role: "Technical Systems / Architecture / Integration", consult_lane: "systems_architecture" },
  andy: { id: "andy", name: "Andy", role: "Local Growth / SEO / Visibility", consult_lane: "local_growth_seo" },
  willy: {
    id: "willy",
    name: "One-Eyed Willy",
    role: "Nova-like Internal Operator / Strategy / Proof / Next-Step Advisor",
    consult_lane: "operator_strategy_proof_next_step",
  },
};

const WILLY_AUTO_KEYWORDS = [
  "stepping away",
  "step away",
  "next clue",
  "next step",
  "what should you do next",
  "what should i do next",
  "what should we do next",
  "proof is good",
  "is this proof good",
  "proof review",
  "park or reroute",
  "reroute or park",
  "same blocker",
  "blocked again",
  "truth conflict",
  "stale status",
  "queue conflict",
  "who should we target first",
  "who we should target first",
  "target first",
  "first 25 names",
  "what should chunk research",
  "chunk should research",
  "what should mouth write",
  "mouth should write",
  "what should mikey decide",
  "mikey should decide",
  "what should atlas build",
  "atlas should build",
  "what should be parked",
  "should be parked",
  "what should be prioritized",
  "should be prioritized",
  "best outreach strategy",
  "best offer",
  "next profitable action",
  "research direction",
  "agent assignment",
  "atlas task packet",
  "target market",
];

const GOONIE_KEYWORDS = {
  chunk: ["chunk", "research", "fact", "facts", "source", "sources", "citation", "citations", "compliance", "regulation", "docs", "case study"],
  mikey: ["mikey", "strategy", "leverage", "sequence", "sequencing", "priority", "prioritize", "order", "roadmap", "bottleneck"],
  mouth: ["mouth", "sales", "messaging", "message", "email", "copy", "subject", "opening", "wording", "outreach"],
  brand: ["brand", "field", "workflow", "technician", "operations", "service", "job flow", "practical"],
  data: ["data", "system", "systems", "architecture", "api", "bridge", "telegram", "codex", "railway", "integration", "runtime"],
  andy: ["andy", "seo", "visibility", "local growth", "google business", "gbp", "search", "organic", "service-area"],
  willy: [
    "willy",
    "one-eyed willy",
    "one eyed willy",
    "proof",
    "blocker",
    "reroute",
    "park",
    "next clue",
    "next step",
    "stepping away",
    "truth conflict",
    "stale status",
    "queue conflict",
    "target first",
    "first 25 names",
    "outreach strategy",
    "best offer",
    "profitable action",
    "atlas build",
    "prioritize",
  ],
};

function normalizeText(value) {
  return String(value || "").trim();
}

function buildNamedGoonieRegex(agentId) {
  return new RegExp(`\\b${agentId}(?:'s|s)?\\b`, "i");
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

function scoreAgentMatch(question, agentId) {
  const lower = normalizeText(question).toLowerCase();
  return (GOONIE_KEYWORDS[agentId] || []).reduce(
    (score, keyword) => score + (lower.includes(keyword) ? 1 : 0),
    0
  );
}

function identifyNamedGoonieId(question) {
  const lower = normalizeText(question).toLowerCase();
  if (
    lower.includes("ask willy") ||
    lower.includes("ask one-eyed willy") ||
    lower.includes("ask one eyed willy")
  ) {
    return "willy";
  }
  for (const agentId of Object.keys(GOONIE_KEYWORDS)) {
    const aliases = GOONIE_KEYWORDS[agentId].filter((keyword) =>
      ["chunk", "mikey", "mouth", "brand", "data", "andy", "willy", "one-eyed willy", "one eyed willy"].includes(keyword)
    );
    if (aliases.some((alias) => buildNamedGoonieRegex(alias).test(lower))) {
      return agentId;
    }
    if (
      aliases.some(
        (alias) =>
          lower.includes(`ask ${alias}`) ||
          lower.includes(` ${alias} `) ||
          lower.endsWith(alias)
      )
    ) {
      return agentId;
    }
  }
  return "";
}

function identifyBestGoonieId(question) {
  if (shouldPreferWilly(question)) {
    return "willy";
  }

  const named = identifyNamedGoonieId(question);
  if (named) {
    return named;
  }

  let bestAgentId = "";
  let bestScore = 0;
  for (const agentId of Object.keys(GOONIE_KEYWORDS)) {
    const score = scoreAgentMatch(question, agentId);
    if (score > bestScore) {
      bestScore = score;
      bestAgentId = agentId;
    }
  }
  return bestScore > 0 ? bestAgentId : "";
}

function shouldPreferWilly(question) {
  const lower = normalizeText(question).toLowerCase();
  if (!lower) {
    return false;
  }

  if (identifyNamedGoonieId(question) === "willy") {
    return true;
  }

  return WILLY_AUTO_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isConsultRequest(question) {
  const lower = normalizeText(question).toLowerCase();
  if (!lower) {
    return false;
  }

  if (
    (Boolean(identifyNamedGoonieId(question)) &&
      /\b(what is|what's|who is|who's|what does|job|role|responsibilit|best at|what do)\b/i.test(lower)) ||
    lower.includes("ask chunk") ||
    lower.includes("ask mikey") ||
    lower.includes("ask mouth") ||
    lower.includes("ask brand") ||
    lower.includes("ask data") ||
    lower.includes("ask andy") ||
    lower.includes("ask willy") ||
    lower.includes("ask one-eyed willy") ||
    lower.includes("ask one eyed willy") ||
    lower.includes("which goonie should answer") ||
    lower.includes("which goonie") ||
    lower.includes("advisory bench") ||
    lower.includes("consult ") ||
    lower.includes("i am stepping away") ||
    lower.includes("i'm stepping away") ||
    lower.includes("step away") ||
    lower.includes("next clue") ||
    lower.includes("is this proof good") ||
    lower.includes("proof is good") ||
    lower.includes("park or reroute") ||
    lower.includes("reroute or park") ||
    shouldPreferWilly(question)
  ) {
    return true;
  }

  return lower.startsWith("clawdia,") && Boolean(identifyBestGoonieId(question));
}

function buildRuntimeUnavailableResponse(question, errorMessage) {
  return {
    handled: true,
    goonie: null,
    confidence: "LOW",
    response: [
      "GOONIE CONSULT RESPONSE",
      "",
      "GOONIE:",
      "- unavailable",
      "QUESTION:",
      `- ${normalizeText(question) || "No consult question provided."}`,
      "RECOMMENDATION:",
      "- Restore the local Clawdia shared-brain consult runtime before trusting a Goonie advisory result from this dashboard session.",
      "REASONING:",
      "- The dashboard tried to call the real shared-brain consult path, but the runtime was unavailable or returned an invalid response.",
      "CONFIDENCE:",
      "- LOW",
      "CONFIDENCE REASON:",
      "- A real named Goonie runtime response was not returned, so Clawdia should not pretend the consult succeeded.",
      "SOURCES USED:",
      "- internal | public_source: no | citation_ready: no | source_type: runtime_status | source_name: Shared brain consult runtime | source_url_or_path: http://127.0.0.1:8788/public/consult/goonie",
      "RISKS:",
      "- Falling back to a pretend consult would recreate the exact split-brain behavior we are trying to remove.",
      "WHAT CLAWDIA SHOULD DO NEXT:",
      "- Start or restore the local shared brain, then retry the consult through the live runtime path.",
      "ESCALATE TO CHRIS:",
      "- no",
      `- reason: runtime blocker only: ${normalizeText(errorMessage) || "unknown runtime failure"}`,
    ].join("\n"),
    runtimeAvailable: false,
  };
}

async function callConsultRuntime(question, explicitAgentId = "") {
  const response = await fetch(`${getConfiguredBrainPublicUrl()}/public/consult/goonie`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: normalizeText(question),
      agent_id: normalizeText(explicitAgentId).toLowerCase() || undefined,
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload?.ok !== true || !normalizeText(payload?.response)) {
    throw new Error(normalizeText(payload?.error || payload?.message || "Consult runtime did not return a valid advisory response."));
  }

  return {
    handled: true,
    goonie: payload.goonie || null,
    confidence: payload.confidence || "LOW",
    response: payload.response,
    runtimeLoaded: payload.runtime_loaded || null,
    consultOnly: payload.consult_only === true,
    citationReady: payload.citation_ready === true,
    sourcesUsed: Array.isArray(payload.sources_used) ? payload.sources_used : [],
  };
}

export async function runNamedGoonieConsult(question, explicitAgentId = null) {
  const normalizedQuestion = normalizeText(question);
  const chosenAgentId = normalizeText(explicitAgentId).toLowerCase() || identifyBestGoonieId(normalizedQuestion);

  try {
    return await callConsultRuntime(normalizedQuestion, chosenAgentId);
  } catch (error) {
    return buildRuntimeUnavailableResponse(normalizedQuestion, error?.message || "Consult runtime failed.");
  }
}

export async function maybeRunGoonieConsult(question) {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion || !isConsultRequest(normalizedQuestion)) {
    return null;
  }
  return runNamedGoonieConsult(normalizedQuestion);
}

export function identifyBestGoonie(question) {
  const agentId = identifyBestGoonieId(normalizeText(question));
  return agentId ? GOONIE_META[agentId] || null : null;
}

export const goonieConsultServiceInternals = {
  DEFAULT_BRAIN_PUBLIC_URL,
  buildNamedGoonieRegex,
  callConsultRuntime,
  getConfiguredBrainPublicUrl,
  identifyBestGoonieId,
  identifyNamedGoonieId,
  isConsultRequest,
};
