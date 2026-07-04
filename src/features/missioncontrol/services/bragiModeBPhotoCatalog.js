import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export const BRAGI_MODE_B_PHOTO_CATALOG_VERSION = 1;
export const BRAGI_MODE_B_PHOTO_CATALOG_PATH = join(
  process.cwd(),
  "runtime",
  "bragi-mode-b",
  "photo-catalog",
  "companycam-photo-catalog.v1.json"
);

export const BRAGI_MODE_B_PHOTO_FACETS = {
  subject: [
    "pool-overview",
    "underwater-closeup",
    "equipment-pad",
    "filter-room",
    "broken-plumbing",
    "excavation",
    "skimmer",
    "light-niche",
    "drain-cover",
    "pressure-testing",
    "bucket-test",
  ],
  poolType: [
    "vinyl",
    "gunite",
    "fiberglass",
    "commercial-concrete",
    "residential-unknown",
    "commercial-unknown",
    "unknown",
  ],
  attributes: [
    "blue-water",
    "green-water",
    "tile-line-visible",
    "plaster-surface",
    "liner-pattern-visible",
    "muddy-water",
    "tight-closeup",
    "wide-shot",
    "daylight",
    "night-shot",
    "wet-concrete",
    "exposed-pipe",
  ],
  problemShown: [
    "seam-leak",
    "cracked-fitting",
    "liner-tear",
    "equipment-failure",
    "filter-room-water-loss",
    "light-niche-leak",
    "skimmer-leak",
    "main-drain-question",
    "broken-line",
    "underground-line-leak",
    "unknown",
  ],
};

export const BRAGI_MODE_B_PHOTO_ANALYSIS_STATES = {
  pending: "pending",
  complete: "complete",
  error: "error",
  skipped: "skipped",
};

function slugifyFacet(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeFacetArray(values, allowed = []) {
  const allowedSet = new Set(allowed);
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => slugifyFacet(value))
    .filter(Boolean)
    .filter((value) => allowedSet.size === 0 || allowedSet.has(value)))];
}

function hasFacetData(facets = {}) {
  return ["subject", "poolType", "attributes", "problemShown"]
    .some((dimension) => Array.isArray(facets[dimension]) && facets[dimension].length);
}

function normalizeAddressSnapshot(address = {}) {
  return {
    city: String(address.city || "").trim(),
    state: String(address.state || "").trim(),
    postalCode: String(address.postalCode || address.postal_code || "").trim(),
    country: String(address.country || "").trim(),
  };
}

function inferAnalysisState(entry, normalizedFacets) {
  const explicitState = String(entry.analysis?.state || "").trim();
  if (explicitState) return explicitState;
  if (entry.provenance?.analyzedAt || hasFacetData(normalizedFacets)) {
    return BRAGI_MODE_B_PHOTO_ANALYSIS_STATES.complete;
  }
  return BRAGI_MODE_B_PHOTO_ANALYSIS_STATES.pending;
}

export function createEmptyBragiModeBPhotoCatalog() {
  return {
    version: BRAGI_MODE_B_PHOTO_CATALOG_VERSION,
    provider: "companycam",
    updatedAt: null,
    photos: {},
  };
}

export function normalizePhotoCatalogEntry(entry = {}) {
  const facets = entry.facets || {};
  const normalizedFacets = {
    subject: normalizeFacetArray(facets.subject, BRAGI_MODE_B_PHOTO_FACETS.subject),
    poolType: normalizeFacetArray(facets.poolType, BRAGI_MODE_B_PHOTO_FACETS.poolType),
    attributes: normalizeFacetArray(facets.attributes, BRAGI_MODE_B_PHOTO_FACETS.attributes),
    problemShown: normalizeFacetArray(facets.problemShown, BRAGI_MODE_B_PHOTO_FACETS.problemShown),
  };
  return {
    photoId: String(entry.photoId || "").trim(),
    sourceProvider: entry.sourceProvider || "companycam",
    sourceUpdatedAt: entry.sourceUpdatedAt || null,
    capturedAt: entry.capturedAt || null,
    status: entry.status || "active",
    textSignals: {
      description: String(entry.textSignals?.description || "").trim(),
      labels: Array.isArray(entry.textSignals?.labels) ? entry.textSignals.labels.map(String) : [],
      tags: Array.isArray(entry.textSignals?.tags) ? entry.textSignals.tags.map(String) : [],
    },
    facets: normalizedFacets,
    projectContext: {
      projectId: String(entry.projectContext?.projectId || entry.projectId || "").trim(),
      address: normalizeAddressSnapshot(entry.projectContext?.address),
      documentIds: Array.isArray(entry.projectContext?.documentIds) ? entry.projectContext.documentIds.map((value) => String(value).trim()).filter(Boolean) : [],
      documentNames: Array.isArray(entry.projectContext?.documentNames) ? entry.projectContext.documentNames.map((value) => String(value).trim()).filter(Boolean) : [],
      derivedTags: Array.isArray(entry.projectContext?.derivedTags) ? entry.projectContext.derivedTags.map((value) => slugifyFacet(value)).filter(Boolean) : [],
      reportSignals: Array.isArray(entry.projectContext?.reportSignals) ? entry.projectContext.reportSignals.map((value) => String(value).trim()).filter(Boolean) : [],
      lastDocumentSyncAt: entry.projectContext?.lastDocumentSyncAt || null,
    },
    analysis: {
      state: inferAnalysisState(entry, normalizedFacets),
      source: String(entry.analysis?.source || "").trim(),
      lastAttemptAt: entry.analysis?.lastAttemptAt || null,
      error: String(entry.analysis?.error || "").trim(),
    },
    visibleSummary: String(entry.visibleSummary || "").trim(),
    confidence: {
      overall: Number(entry.confidence?.overall || 0),
      subject: Number(entry.confidence?.subject || 0),
      poolType: Number(entry.confidence?.poolType || 0),
      attributes: Number(entry.confidence?.attributes || 0),
      problemShown: Number(entry.confidence?.problemShown || 0),
    },
    provenance: {
      analyzedAt: entry.provenance?.analyzedAt || null,
      model: entry.provenance?.model || "",
      promptVersion: entry.provenance?.promptVersion || "",
      reviewStatus: entry.provenance?.reviewStatus || "unreviewed",
    },
  };
}

export function buildBragiModeBPendingPhotoCatalogEntry({ photo = {}, projectContext = {} } = {}) {
  return normalizePhotoCatalogEntry({
    photoId: photo.id,
    sourceProvider: "companycam",
    sourceUpdatedAt: photo.updated_at || photo.updatedAt || null,
    capturedAt: photo.captured_at || photo.capturedAt || null,
    status: photo.status || "active",
    textSignals: {
      description: photo.description || "",
      labels: [],
      tags: [],
    },
    projectContext: {
      projectId: projectContext.projectId || photo.project_id || photo.projectId || "",
      address: projectContext.address || {},
      documentIds: projectContext.documentIds || [],
      documentNames: projectContext.documentNames || [],
      derivedTags: projectContext.derivedTags || [],
      reportSignals: projectContext.reportSignals || [],
      lastDocumentSyncAt: projectContext.lastDocumentSyncAt || null,
    },
    analysis: {
      state: BRAGI_MODE_B_PHOTO_ANALYSIS_STATES.pending,
      source: "sync-pending",
      lastAttemptAt: null,
      error: "",
    },
    visibleSummary: "",
    confidence: {
      overall: 0,
      subject: 0,
      poolType: 0,
      attributes: 0,
      problemShown: 0,
    },
    provenance: {
      analyzedAt: null,
      model: "",
      promptVersion: "",
      reviewStatus: "unreviewed",
    },
  });
}

export function markBragiModeBPhotoCatalogEntryAnalyzed(entry = {}, analysisResult = {}) {
  const analyzedAt = analysisResult.analyzedAt || new Date().toISOString();
  return normalizePhotoCatalogEntry({
    ...entry,
    facets: analysisResult.facets || entry.facets,
    visibleSummary: analysisResult.visibleSummary ?? entry.visibleSummary,
    confidence: {
      ...entry.confidence,
      ...(analysisResult.confidence || {}),
    },
    projectContext: {
      ...entry.projectContext,
      ...(analysisResult.projectContext || {}),
    },
    analysis: {
      state: BRAGI_MODE_B_PHOTO_ANALYSIS_STATES.complete,
      source: analysisResult.source || entry.analysis?.source || "vision",
      lastAttemptAt: analyzedAt,
      error: "",
    },
    provenance: {
      ...entry.provenance,
      analyzedAt,
      model: analysisResult.model || entry.provenance?.model || "",
      promptVersion: analysisResult.promptVersion || entry.provenance?.promptVersion || "",
      reviewStatus: analysisResult.reviewStatus || entry.provenance?.reviewStatus || "unreviewed",
    },
  });
}

export function needsBragiModeBPhotoAnalysis(entry = {}) {
  const normalized = normalizePhotoCatalogEntry(entry);
  if (normalized.status !== "active") return false;
  return normalized.analysis.state !== BRAGI_MODE_B_PHOTO_ANALYSIS_STATES.complete;
}

export function isReadyBragiModeBPhotoCatalogEntry(entry = {}) {
  const normalized = normalizePhotoCatalogEntry(entry);
  return normalized.status === "active" && normalized.analysis.state === BRAGI_MODE_B_PHOTO_ANALYSIS_STATES.complete;
}

export function loadBragiModeBPhotoCatalog(path = BRAGI_MODE_B_PHOTO_CATALOG_PATH) {
  if (!existsSync(path)) {
    return createEmptyBragiModeBPhotoCatalog();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const photos = Object.fromEntries(
      Object.entries(parsed.photos || {}).map(([photoId, entry]) => [photoId, normalizePhotoCatalogEntry({ ...entry, photoId })])
    );
    return {
      version: parsed.version || BRAGI_MODE_B_PHOTO_CATALOG_VERSION,
      provider: parsed.provider || "companycam",
      updatedAt: parsed.updatedAt || null,
      photos,
    };
  } catch {
    return createEmptyBragiModeBPhotoCatalog();
  }
}

export function saveBragiModeBPhotoCatalog(catalog, path = BRAGI_MODE_B_PHOTO_CATALOG_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const normalized = {
    version: BRAGI_MODE_B_PHOTO_CATALOG_VERSION,
    provider: catalog?.provider || "companycam",
    updatedAt: new Date().toISOString(),
    photos: Object.fromEntries(
      Object.entries(catalog?.photos || {}).map(([photoId, entry]) => [photoId, normalizePhotoCatalogEntry({ ...entry, photoId })])
    ),
  };
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function buildBragiModeBPhotoQuery({ topic = "", articlePackage = {}, sectionHeading = "" }) {
  const source = `${topic} ${articlePackage?.title || ""} ${articlePackage?.focusKeyword || ""} ${sectionHeading}`.toLowerCase();
  const query = {
    subject: [],
    poolType: [],
    attributes: [],
    problemShown: [],
  };

  if (/\bunderwater|dive|scuba\b/.test(source)) query.subject.push("underwater-closeup");
  if (/\bequipment|pump|pad|valve|plumbing pressure|pressure test\b/.test(source)) query.subject.push("equipment-pad", "pressure-testing");
  if (/\bfilter room\b/.test(source)) query.subject.push("filter-room");
  if (/\bexcavat|trench|dig\b/.test(source)) query.subject.push("excavation");
  if (/\bbroken pipe|broken plumbing|exposed pipe|line break\b/.test(source)) query.subject.push("broken-plumbing");
  if (/\bpool light|light niche\b/.test(source)) query.subject.push("light-niche");
  if (/\bskimmer\b/.test(source)) query.subject.push("skimmer");
  if (/\bdrain cover|main drain|vgb\b/.test(source)) query.subject.push("drain-cover");
  if (/\bbucket test|evaporation\b/.test(source)) query.subject.push("bucket-test");
  if (!query.subject.length) query.subject.push("pool-overview");

  if (/\bvinyl\b/.test(source)) query.poolType.push("vinyl");
  if (/\bgunite|concrete|plaster\b/.test(source)) query.poolType.push("gunite");
  if (/\bfiberglass\b/.test(source)) query.poolType.push("fiberglass");
  if (/\bcommercial|hotel|hoa|property manager\b/.test(source)) query.poolType.push("commercial-unknown");

  if (/\bwide|overview|whole pool\b/.test(source)) query.attributes.push("wide-shot");
  if (/\bcloseup|detail\b/.test(source)) query.attributes.push("tight-closeup");
  if (/\bblue water\b/.test(source)) query.attributes.push("blue-water");
  if (/\bgreen water|algae\b/.test(source)) query.attributes.push("green-water");
  if (/\bliner pattern\b/.test(source)) query.attributes.push("liner-pattern-visible");
  if (/\bexposed pipe\b/.test(source)) query.attributes.push("exposed-pipe");

  if (/\bseam\b/.test(source)) query.problemShown.push("seam-leak");
  if (/\bcracked fitting|fitting\b/.test(source)) query.problemShown.push("cracked-fitting");
  if (/\bliner tear|tear\b/.test(source)) query.problemShown.push("liner-tear");
  if (/\bequipment failure|pump issue|filter issue\b/.test(source)) query.problemShown.push("equipment-failure");
  if (/\bfilter room\b/.test(source)) query.problemShown.push("filter-room-water-loss");
  if (/\blight niche\b/.test(source)) query.problemShown.push("light-niche-leak");
  if (/\bskimmer\b/.test(source)) query.problemShown.push("skimmer-leak");
  if (/\bdrain cover|main drain|vgb\b/.test(source)) query.problemShown.push("main-drain-question");
  if (/\bbroken line|line leak|plumbing line\b/.test(source)) query.problemShown.push("broken-line", "underground-line-leak");

  return query;
}

export function buildBragiModeBPhotoMatchPlan(query = {}) {
  const subject = normalizeFacetArray(query.subject, BRAGI_MODE_B_PHOTO_FACETS.subject);
  const poolType = normalizeFacetArray(query.poolType, BRAGI_MODE_B_PHOTO_FACETS.poolType);
  const attributes = normalizeFacetArray(query.attributes, BRAGI_MODE_B_PHOTO_FACETS.attributes);
  const problemShown = normalizeFacetArray(query.problemShown, BRAGI_MODE_B_PHOTO_FACETS.problemShown);

  const steps = [
    { subject, problemShown, poolType, attributes, minimumScore: 85, label: "exact-facet-match" },
    { subject, problemShown, poolType, attributes: [], minimumScore: 72, label: "drop-attributes" },
    { subject, problemShown, poolType: [], attributes: [], minimumScore: 64, label: "drop-pool-type" },
    { subject, problemShown: [], poolType: [], attributes: [], minimumScore: 45, label: "subject-only" },
    { subject: ["pool-overview"], problemShown: [], poolType: [], attributes: [], minimumScore: 30, label: "broad-overview-fallback" },
  ];

  return steps.filter((step, index, all) =>
    step.subject.length && all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(step)) === index
  );
}

function scoreFacetMatch(entry, step) {
  const facets = entry.facets || {};
  let score = 0;

  const dimensionWeights = {
    subject: 40,
    problemShown: 30,
    poolType: 20,
    attributes: 10,
  };

  for (const [dimension, weight] of Object.entries(dimensionWeights)) {
    const desired = Array.isArray(step[dimension]) ? step[dimension] : [];
    if (!desired.length) continue;
    const actual = Array.isArray(facets[dimension]) ? facets[dimension] : [];
    const hits = desired.filter((value) => actual.includes(value)).length;
    score += weight * (hits / desired.length);
  }

  score += Math.min(10, Number(entry.confidence?.overall || 0) / 10);
  return Number(score.toFixed(1));
}

export function queryBragiModeBPhotoCatalog({ catalog, query, limit = 12 }) {
  const sourceCatalog = catalog || createEmptyBragiModeBPhotoCatalog();
  const entries = Object.values(sourceCatalog.photos || {}).filter((entry) => isReadyBragiModeBPhotoCatalogEntry(entry));
  const plan = buildBragiModeBPhotoMatchPlan(query);

  for (const step of plan) {
    const matches = entries
      .map((entry) => ({
        entry,
        score: scoreFacetMatch(entry, step),
      }))
      .filter((candidate) => candidate.score >= step.minimumScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    if (matches.length) {
      return {
        strategy: step.label,
        step,
        matches,
      };
    }
  }

  return {
    strategy: "no-match",
    step: null,
    matches: [],
  };
}
