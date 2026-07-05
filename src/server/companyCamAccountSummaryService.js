function normalizeText(value = "") {
  return String(value || "").trim();
}

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 500;

let cachedAccountSummary = null;

async function countPaginatedCollection(fetchPage, { perPage = DEFAULT_PER_PAGE, maxPages = DEFAULT_MAX_PAGES } = {}) {
  let page = 1;
  let total = 0;

  while (page <= maxPages) {
    const items = await fetchPage({ page, perPage });
    const batch = Array.isArray(items) ? items : [];
    total += batch.length;
    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }

  return total;
}

async function buildLiveAccountSummary({ companyCamRail }) {
  const currentProjects = await countPaginatedCollection(
    ({ page, perPage }) =>
      companyCamRail.searchProjects({
        page,
        perPage,
      }),
    {}
  );

  return {
    currentProjects,
    generatedAt: new Date().toISOString(),
  };
}

function buildAccountSummaryAnswer(summary = {}) {
  return [
    "COMPANYCAM ACCOUNT SUMMARY",
    `- current projects visible: ${Number(summary.currentProjects || 0)}`,
    `- generated at: ${normalizeText(summary.generatedAt) || "unknown"}`,
    "- source: live CompanyCam /projects read-only pagination",
  ].join("\n");
}

export async function resolveCompanyCamAccountSummaryQuestion({
  companyCamRail,
  forceRefresh = false,
} = {}) {
  if (!companyCamRail) {
    throw new Error("companyCamRail is required for CompanyCam account summary lookup.");
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    cachedAccountSummary &&
    now - cachedAccountSummary.cachedAt < DEFAULT_CACHE_TTL_MS
  ) {
    return {
      ok: true,
      handled: true,
      lane: "work",
      action: "companycam-account-summary",
      summary: cachedAccountSummary.summary,
      answerText: buildAccountSummaryAnswer(cachedAccountSummary.summary),
      cached: true,
    };
  }

  const summary = await buildLiveAccountSummary({ companyCamRail });
  cachedAccountSummary = {
    cachedAt: now,
    summary,
  };

  return {
    ok: true,
    handled: true,
    lane: "work",
    action: "companycam-account-summary",
    summary,
    answerText: buildAccountSummaryAnswer(summary),
    cached: false,
  };
}

export const companyCamAccountSummaryServiceInternals = {
  buildAccountSummaryAnswer,
  countPaginatedCollection,
  buildLiveAccountSummary,
};
