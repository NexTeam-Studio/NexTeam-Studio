import {
  assertAquatraceCompanyCamTenantScope,
  buildProjectSearchQueries,
  scoreProjectAgainstQuestion,
} from "../features/missioncontrol/services/companyCamQuestionService.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function tokenizeQuestion(question = "") {
  return Array.from(
    new Set(
      normalizeText(question)
        .toLowerCase()
        .match(/[a-z0-9]+/g) || []
    )
  ).filter((token) => token.length >= 3);
}

function sanitizeSearchFragment(value = "") {
  return normalizeText(value).replace(/[?.!,;:]+$/g, "").trim();
}

const LOW_SIGNAL_TOKENS = new Set([
  "account",
  "address",
  "at",
  "can",
  "client",
  "companycam",
  "customer",
  "detail",
  "details",
  "find",
  "for",
  "homeowner",
  "is",
  "job",
  "look",
  "lookup",
  "me",
  "owner",
  "pool",
  "project",
  "square",
  "footage",
  "show",
  "status",
  "technician",
  "tech",
  "tell",
  "the",
  "up",
  "was",
  "were",
  "what",
  "who",
  "you",
]);

function isUsefulCandidateQuery(value = "") {
  const normalized = sanitizeSearchFragment(value);
  if (!normalized) {
    return false;
  }

  if (/^(?:who|what|can|tell|show|find|look)\b/i.test(normalized)) {
    return false;
  }

  if (/^(?:the\s+)?(?:customer|client|homeowner|owner|project|job|account)\s+(?:is\s+)?at\b/i.test(normalized)) {
    return false;
  }

  const tokens = tokenizeQuestion(normalized);
  if (tokens.length === 0) {
    return false;
  }

  if (tokens.some((token) => /\d/.test(token))) {
    return true;
  }

  const meaningfulTokens = tokens.filter((token) => !LOW_SIGNAL_TOKENS.has(token));
  return meaningfulTokens.length >= 2;
}

function splitAddressAndLocation(fragment = "") {
  const normalized = sanitizeSearchFragment(fragment);
  if (!normalized) {
    return {
      full: "",
      streetOnly: "",
      streetWithLocation: "",
    };
  }

  const inLocationMatch = normalized.match(/^(.+?)\s+\bin\b\s+(.+)$/i);
  if (inLocationMatch?.[1]) {
    return {
      full: normalized,
      streetOnly: sanitizeSearchFragment(inLocationMatch[1]),
      streetWithLocation: normalized,
    };
  }

  return {
    full: normalized,
    streetOnly: normalized,
    streetWithLocation: normalized,
  };
}

function deriveSearchQuery(question = "") {
  const text = normalizeText(question);
  const forAtMatch = text.match(/\b(?:customer|client|homeowner|owner|project|job|account)\s+(?:at|for|is at)\s+(.+)$/i);
  if (forAtMatch?.[1]) {
    return splitAddressAndLocation(forAtMatch[1]).streetWithLocation;
  }

  const addressLeadMatch = text.match(
    /\b(?:who(?:'s| is)|can you tell me who(?:'s| is)?|tell me who(?:'s| is)?|show me who(?:'s| is)?|find who(?:'s| is)?|what'?s the status on)\b.*?\bat\s+(.+)$/i
  );
  if (addressLeadMatch?.[1]) {
    return splitAddressAndLocation(addressLeadMatch[1]).streetWithLocation;
  }

  const usefulTokens = tokenizeQuestion(text).filter(
    (token) =>
      ![
        "customer",
        "client",
        "homeowner",
        "owner",
        "account",
        "project",
        "lookup",
        "look",
        "find",
        "show",
        "customer",
        "who",
        "whos",
        "the",
        "for",
        "status",
        "at",
        "job",
        "companycam",
        "me",
      ].includes(token)
  );

  return sanitizeSearchFragment(usefulTokens.slice(0, 5).join(" "));
}

function buildCandidateQueries(question = "") {
  const normalized = normalizeText(question);
  const derivedQuery = deriveSearchQuery(normalized);
  const derivedAddressParts = splitAddressAndLocation(derivedQuery);
  const candidates = new Set(buildProjectSearchQueries(normalized));

  if (isUsefulCandidateQuery(derivedQuery)) {
    candidates.add(derivedQuery);
  }

  if (derivedAddressParts.streetOnly) {
    candidates.add(derivedAddressParts.streetOnly);
  }
  if (derivedAddressParts.streetWithLocation) {
    candidates.add(derivedAddressParts.streetWithLocation);
  }

  const noLeadVerb = sanitizeSearchFragment(
    normalized.replace(
      /^(?:can you tell me who(?:'s| is)?|tell me who(?:'s| is)?|show me who(?:'s| is)?|find who(?:'s| is)?|who(?:'s| is)|find|look up|show me|show|status on|what'?s the status on)\s+/i,
      ""
    )
  );
  if (noLeadVerb) {
    candidates.add(noLeadVerb);
  }

  const compactTokens = tokenizeQuestion(normalized).filter(
    (token) =>
      ![
        "customer",
        "project",
        "lookup",
        "look",
        "find",
        "show",
        "status",
        "job",
        "companycam",
        "pool",
        "square",
        "footage",
        "technician",
        "tech",
        "was",
        "were",
      ].includes(token)
  );
  if (compactTokens.length) {
    candidates.add(sanitizeSearchFragment(compactTokens.slice(0, 3).join(" ")));
  }

  return [...candidates].filter((candidate) => isUsefulCandidateQuery(candidate));
}

function formatAddress(address = {}) {
  return [
    address.street_address_1,
    address.street_address_2,
    address.city,
    address.state,
    address.postal_code,
  ]
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .join(", ");
}

function formatFastLookupAnswer(project) {
  const address = formatAddress(project.address || {});
  return [
    "MISSION CONTROL FAST LOOKUP",
    `- project: ${project.name || "unknown"}`,
    `- address: ${address || "unknown"}`,
    `- job status: ${normalizeText(project.status || "unknown") || "unknown"}`,
    `- project id: ${project.id || "unknown"}`,
    `- mode: real CompanyCam project search`,
  ].join("\n");
}

export async function resolveCompanyCamFastLookup({
  companyCamRail,
  tenantId,
  question,
} = {}) {
  const scopedTenantId = assertAquatraceCompanyCamTenantScope(tenantId);
  const normalizedQuestion = normalizeText(question);
  if (!companyCamRail) {
    throw new Error("companyCamRail is required for CompanyCam fast lookup.");
  }
  if (!normalizedQuestion) {
    throw new Error("question is required for CompanyCam fast lookup.");
  }

  const candidateQueries = buildCandidateQueries(normalizedQuestion);
  let query = candidateQueries[0] || normalizedQuestion;
  let projects = [];

  for (const candidateQuery of candidateQueries.length ? candidateQueries : [normalizedQuestion]) {
    query = candidateQuery;
    projects = await companyCamRail.searchProjects({
      query: candidateQuery,
      perPage: 10,
    });
    if (Array.isArray(projects) && projects.length > 0) {
      break;
    }
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    return {
      ok: false,
      handled: false,
      tenantId: scopedTenantId,
      reason: "project_not_found",
      query,
    };
  }

  const ranked = [...projects]
    .map((project) => ({
      ...project,
      _score: scoreProjectAgainstQuestion(project, normalizedQuestion),
    }))
    .sort((left, right) => right._score - left._score);

  const project = ranked[0];
  return {
    ok: true,
    handled: true,
    tenantId: scopedTenantId,
    lane: "fast",
    action: "companycam-project-lookup",
    query,
    project: {
      id: project.id,
      name: project.name,
      status: project.status || null,
      address: project.address || null,
      publicUrl: project.public_url || "",
      projectUrl: project.project_url || "",
    },
    answerText: formatFastLookupAnswer(project),
    alternativeProjects: ranked.slice(1, 3).map((entry) => ({
      id: entry.id,
      name: entry.name,
      score: entry._score,
      address: entry.address || null,
    })),
  };
}

export const companyCamFastLookupServiceInternals = {
  buildCandidateQueries,
  deriveSearchQuery,
  formatAddress,
  formatFastLookupAnswer,
  isUsefulCandidateQuery,
  sanitizeSearchFragment,
  splitAddressAndLocation,
  tokenizeQuestion,
};
