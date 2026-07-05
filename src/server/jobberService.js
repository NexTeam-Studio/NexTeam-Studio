const JOBBER_GRAPHQL_ENDPOINT = "https://api.getjobber.com/api/graphql";
const JOBBER_OAUTH_TOKEN_ENDPOINT = "https://api.getjobber.com/api/oauth/token";
const DEFAULT_JOBBER_GRAPHQL_VERSION = "2026-03-10";
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MAX_PAGES = 2;

const DETAIL_STOP_WORDS = new Set([
  "a",
  "address",
  "all",
  "appointment",
  "appointments",
  "at",
  "client",
  "details",
  "do",
  "find",
  "for",
  "have",
  "i",
  "job",
  "jobs",
  "me",
  "named",
  "notes",
  "of",
  "open",
  "project",
  "pull",
  "quote",
  "schedule",
  "show",
  "status",
  "tell",
  "the",
  "this",
  "today",
  "up",
  "week",
  "what",
]);

const JOBBER_JOBS_QUERY = `
  query NexiJobberJobsPage($first: Int!, $after: String) {
    jobs(first: $first, after: $after) {
      nodes {
        id
        jobNumber
        title
        jobStatus
        jobType
        startAt
        endAt
        createdAt
        updatedAt
        instructions
        defaultVisitTitle
        total
        jobberWebUri
        client {
          id
          name
          firstName
          lastName
          companyName
          jobberWebUri
        }
        property {
          id
          street1
          street2
          city
          province
          postalCode
          country
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeComparableText(value = "") {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenizeComparableText(value = "") {
  return normalizeComparableText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

async function readJsonResponseSafely(response) {
  if (typeof response?.text !== "function") {
    if (typeof response?.json === "function") {
      return response.json();
    }
    return {};
  }

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

function parseJobberExpiry(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue > 10_000_000_000 ? rawValue : rawValue * 1000;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return 0;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function buildJobberConfig(env = process.env) {
  return {
    clientId: normalizeText(env.JOBBER_CLIENT_ID),
    clientSecret: normalizeText(env.JOBBER_CLIENT_SECRET),
    redirectUri: normalizeText(env.JOBBER_REDIRECT_URI),
    graphqlVersion: normalizeText(env.JOBBER_GRAPHQL_VERSION) || DEFAULT_JOBBER_GRAPHQL_VERSION,
    accessToken: normalizeText(env.JOBBER_ACCESS_TOKEN || env.JOBBER_API_TOKEN),
    accessTokenExpiresAt: parseJobberExpiry(env.JOBBER_ACCESS_TOKEN_EXPIRES_AT || env.JOBBER_EXPIRES_AT),
    refreshToken: normalizeText(env.JOBBER_REFRESH_TOKEN),
  };
}

export function buildJobberAuthorizeUrl({ env = process.env, state = "" } = {}) {
  const config = buildJobberConfig(env);
  if (!config.clientId || !config.redirectUri) {
    throw new Error("Jobber OAuth authorize URL cannot be built because client ID or redirect URI is missing.");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });

  const normalizedState = normalizeText(state);
  if (normalizedState) {
    params.set("state", normalizedState);
  }

  return `https://api.getjobber.com/api/oauth/authorize?${params.toString()}`;
}

export async function exchangeJobberAuthorizationCode({
  code,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    throw new Error("Jobber authorization code is required.");
  }

  const config = buildJobberConfig(env);
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error("Jobber OAuth exchange is not configured. Missing client ID, client secret, or redirect URI.");
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code: normalizedCode,
    redirect_uri: config.redirectUri,
  }).toString();

  const response = await fetchImpl(JOBBER_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "user-agent": "NexTeam-Nexi/1.0 (+https://nexteam.studio; Jobber OAuth callback)",
    },
    body,
  });

  const payload = await readJsonResponseSafely(response);
  if (!response.ok) {
    const error = new Error(
      normalizeText(payload?.error_description || payload?.error || payload?.message) ||
        `Jobber OAuth exchange failed with status ${response.status}.`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return {
    accessToken: normalizeText(payload?.access_token),
    refreshToken: normalizeText(payload?.refresh_token),
    expiresIn: Number(payload?.expires_in || 0) || 0,
    tokenType: normalizeText(payload?.token_type || "Bearer"),
    scope: normalizeText(payload?.scope),
    raw: payload,
  };
}

export function hasUsableJobberConfig(env = process.env) {
  const config = buildJobberConfig(env);
  return Boolean(
    config.accessToken ||
      (config.clientId && config.clientSecret && config.refreshToken)
  );
}

function formatDateTime(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "unscheduled";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function describeJobWhen(job = {}) {
  if (normalizeText(job.startAt)) {
    return formatDateTime(job.startAt);
  }
  if (normalizeText(job.endAt)) {
    return formatDateTime(job.endAt);
  }
  return formatDateTime(job.createdAt);
}

function formatJobAddress(job = {}) {
  const property = job.property || {};
  return [
    property.street1,
    property.street2,
    [property.city, property.province].filter(Boolean).join(", "),
    property.postalCode,
    property.country,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(", ");
}

function selectRelevantDate(job = {}) {
  const candidates = [job.startAt, job.endAt, job.createdAt, job.updatedAt]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

  return candidates[0] || null;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function resolveScheduleWindow(question = "", now = new Date()) {
  const lower = normalizeText(question).toLowerCase();
  if (lower.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      kind: "tomorrow",
      label: "tomorrow",
      start: startOfDay(tomorrow),
      end: endOfDay(tomorrow),
    };
  }

  if (lower.includes("this week")) {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      kind: "this_week",
      label: "this week",
      start: startOfDay(monday),
      end: endOfDay(sunday),
    };
  }

  return {
    kind: "today",
    label: "today",
    start: startOfDay(now),
    end: endOfDay(now),
  };
}

export function isJobInWindow(job = {}, window) {
  const relevant = selectRelevantDate(job);
  if (!relevant || !window?.start || !window?.end) {
    return false;
  }
  return relevant >= window.start && relevant <= window.end;
}

export async function refreshJobberAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = fetch,
}) {
  if (!normalizeText(clientId) || !normalizeText(clientSecret) || !normalizeText(refreshToken)) {
    const error = new Error("Jobber refresh requires client ID, client secret, and refresh token.");
    error.status = 400;
    throw error;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetchImpl(JOBBER_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const payload = await readJsonResponseSafely(response);
  if (!response.ok) {
    const error = new Error(
      normalizeText(payload?.error_description || payload?.message || payload?.error) ||
        `Jobber token refresh failed with status ${response.status}.`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  const accessToken = normalizeText(payload.access_token || payload.accessToken);
  const rotatedRefreshToken = normalizeText(payload.refresh_token || payload.refreshToken) || refreshToken;
  const expiresInSeconds = Number(payload.expires_in || payload.expiresIn || 3600) || 3600;

  return {
    accessToken,
    refreshToken: rotatedRefreshToken,
    accessTokenExpiresAt: Date.now() + expiresInSeconds * 1000,
    raw: payload,
  };
}

export async function resolveJobberAccessToken({
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = buildJobberConfig(env);
  const hasFreshAccessToken =
    Boolean(config.accessToken) &&
    (!config.accessTokenExpiresAt || Date.now() < config.accessTokenExpiresAt - 60_000);

  if (hasFreshAccessToken) {
    return {
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      accessTokenExpiresAt: config.accessTokenExpiresAt,
      refreshed: false,
    };
  }

  if (!config.refreshToken) {
    const error = new Error("Jobber access token is missing or expired and no refresh token is configured.");
    error.status = 400;
    throw error;
  }

  const refreshed = await refreshJobberAccessToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: config.refreshToken,
    fetchImpl,
  });

  return {
    ...refreshed,
    refreshed: true,
    graphqlVersion: config.graphqlVersion,
  };
}

export async function runJobberGraphQL({
  query,
  variables = {},
  env = process.env,
  accessToken = "",
  fetchImpl = fetch,
}) {
  const config = buildJobberConfig(env);
  const response = await fetchImpl(JOBBER_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": config.graphqlVersion,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await readJsonResponseSafely(response);
  if (!response.ok || Array.isArray(payload?.errors)) {
    const graphQLError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
    const error = new Error(
      normalizeText(graphQLError?.message || payload?.message || payload?.error) ||
        `Jobber GraphQL request failed with status ${response.status}.`
    );
    error.status = response.ok ? 400 : response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function listJobberJobs({
  env = process.env,
  fetchImpl = fetch,
  first = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
}) {
  const tokenState = await resolveJobberAccessToken({ env, fetchImpl });
  const jobs = [];
  let after = null;
  let pages = 0;

  while (pages < maxPages) {
    const payload = await runJobberGraphQL({
      query: JOBBER_JOBS_QUERY,
      variables: { first, after },
      env,
      accessToken: tokenState.accessToken,
      fetchImpl,
    });

    const connection = payload?.data?.jobs || {};
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
    jobs.push(...nodes);
    pages += 1;

    if (!connection?.pageInfo?.hasNextPage || !normalizeText(connection?.pageInfo?.endCursor)) {
      break;
    }
    after = connection.pageInfo.endCursor;
  }

  return {
    jobs,
    tokenState,
  };
}

function buildScheduleAnswer(jobs = [], window) {
  if (!jobs.length) {
    return `No live Jobber jobs were found for ${window.label}.`;
  }

  const lines = [
    `Jobber schedule for ${window.label}: ${jobs.length} job${jobs.length === 1 ? "" : "s"}.`,
  ];

  for (const job of jobs.slice(0, 6)) {
    const clientName = normalizeText(job?.client?.name || job?.client?.companyName || job?.title || "Unnamed client");
    const address = formatJobAddress(job);
    lines.push(
      `- #${job.jobNumber || "?"} ${clientName} - ${normalizeText(job.title || job.defaultVisitTitle || "Untitled job")} (${normalizeText(job.jobStatus || "unknown")})`
    );
    lines.push(`  when: ${describeJobWhen(job)}`);
    if (address) {
      lines.push(`  address: ${address}`);
    }
  }

  if (jobs.length > 6) {
    lines.push(`- ${jobs.length - 6} additional job(s) omitted for brevity.`);
  }

  lines.push("source: Jobber GraphQL jobs query");
  return lines.join("\n");
}

function buildDetailQueryTokens(question = "") {
  return tokenizeComparableText(question).filter(
    (token) => token.length > 1 && !DETAIL_STOP_WORDS.has(token)
  );
}

function scoreJobMatch(job = {}, tokens = []) {
  if (!tokens.length) {
    return 0;
  }

  const haystacks = [
    job.title,
    job.defaultVisitTitle,
    job.client?.name,
    job.client?.companyName,
    job.property?.street1,
    job.property?.street2,
    job.property?.city,
    job.property?.province,
    job.property?.postalCode,
    job.quote?.title,
    String(job.jobNumber || ""),
  ]
    .map((value) => normalizeComparableText(value))
    .filter(Boolean);

  let score = 0;
  for (const token of tokens) {
    for (const haystack of haystacks) {
      if (haystack === token) {
        score += 12;
      } else if (haystack.includes(token)) {
        score += 5;
      }
    }
  }

  const combined = haystacks.join(" ");
  const exactPhrase = normalizeComparableText(questionTokensToPhrase(tokens));
  if (exactPhrase && combined.includes(exactPhrase)) {
    score += 18;
  }

  if (normalizeComparableText(job.client?.name) && combined.includes(normalizeComparableText(job.client?.name))) {
    score += 1;
  }

  return score;
}

function questionTokensToPhrase(tokens = []) {
  return tokens.join(" ");
}

function buildJobDetailAnswer(job = {}) {
  const clientName = normalizeText(job?.client?.name || job?.client?.companyName || "Unknown client");
  const jobTitle = normalizeText(job?.title || job?.defaultVisitTitle || "Untitled job");
  const address = formatJobAddress(job) || "not exposed on this Jobber record";
  const instructions = normalizeText(job?.instructions || "");
  const quoteStatus = normalizeText(job?.quote?.quoteStatus);
  const quoteStatusText = quoteStatus || "not exposed by the current Jobber read-only permissions";
  const lines = [
    `Jobber match: ${clientName}.`,
    `- job #: ${job.jobNumber || "unknown"}`,
    `- title: ${jobTitle}`,
    `- status: ${normalizeText(job.jobStatus || "unknown")}`,
    `- when: ${describeJobWhen(job)}`,
    `- address: ${address}`,
    `- quote status: ${quoteStatusText}`,
    `- notes: ${instructions || "no job instructions on this record"}`,
  ];

  if (normalizeText(job?.jobberWebUri)) {
    lines.push(`- jobber: ${job.jobberWebUri}`);
  }
  lines.push("source: Jobber GraphQL jobs query");
  return lines.join("\n");
}

export function sortJobsByRelevantDateDescending(jobs = []) {
  return [...jobs].sort((left, right) => {
    const leftDate = selectRelevantDate(left)?.getTime() || 0;
    const rightDate = selectRelevantDate(right)?.getTime() || 0;
    return rightDate - leftDate;
  });
}

export function createJobberService({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return {
    async answerScheduleQuestion({ tenantId = "aquatrace", question }) {
      const window = resolveScheduleWindow(question);
      const { jobs, tokenState } = await listJobberJobs({ env, fetchImpl });
      const matchingJobs = sortJobsByRelevantDateDescending(jobs).filter((job) => isJobInWindow(job, window));
      return {
        ok: true,
        handled: true,
        tenantId,
        window,
        jobs: matchingJobs,
        tokenState,
        source: "jobber",
        answerText: buildScheduleAnswer(matchingJobs, window),
        route: { kind: "jobber_schedule", lane: "fast", resourceProvider: "jobber" },
      };
    },

    async answerJobDetailQuestion({ tenantId = "aquatrace", question }) {
      const tokens = buildDetailQueryTokens(question);
      if (!tokens.length) {
        return {
          ok: false,
          handled: true,
          tenantId,
          source: "jobber",
          answerText: "I need a client name, address, or job number to pull the Jobber record.",
          route: { kind: "jobber_job_detail", lane: "work", resourceProvider: "jobber" },
        };
      }

      const { jobs, tokenState } = await listJobberJobs({ env, fetchImpl });
      const scored = sortJobsByRelevantDateDescending(jobs)
        .map((job) => ({ job, score: scoreJobMatch(job, tokens) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);

      if (!scored.length) {
        return {
          ok: false,
          handled: true,
          tenantId,
          source: "jobber",
          answerText: "I could not find a matching Jobber job from the connected Aquatrace account.",
          route: { kind: "jobber_job_detail", lane: "work", resourceProvider: "jobber" },
          tokenState,
        };
      }

      return {
        ok: true,
        handled: true,
        tenantId,
        source: "jobber",
        tokenState,
        job: scored[0].job,
        answerText: buildJobDetailAnswer(scored[0].job),
        route: { kind: "jobber_job_detail", lane: "work", resourceProvider: "jobber" },
      };
    },
  };
}

export const jobberServiceInternals = {
  buildDetailQueryTokens,
  buildJobDetailAnswer,
  buildJobberConfig,
  buildScheduleAnswer,
  describeJobWhen,
  formatJobAddress,
  hasUsableJobberConfig,
  isJobInWindow,
  parseJobberExpiry,
  questionTokensToPhrase,
  readJsonResponseSafely,
  resolveScheduleWindow,
  scoreJobMatch,
  selectRelevantDate,
  sortJobsByRelevantDateDescending,
};
