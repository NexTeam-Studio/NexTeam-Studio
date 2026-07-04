import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAcceptedBuncombeVgbDraftPayload } from "../src/features/missioncontrol/services/bragiAcceptedArticlePayloads.js";
import { buildBasicAuthHeader, fetchJson, wordpressJsonHeaders } from "../src/features/missioncontrol/services/wordpressApi.js";

const SERVER_BASE_URL = "http://127.0.0.1:3001";
const EXECUTE_URL = `${SERVER_BASE_URL}/api/bragi/wordpress/execute`;
const DEFAULT_SITE_URL = "https://aquatraceleak.com";

function normalizeText(value) {
  return String(value || "").trim();
}

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = value;
  }
}

function readNamedEnv(name) {
  return normalizeText(process.env[name]);
}

function readReferenceCredentials() {
  const appPasswordPath = "docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-application-password.txt";
  const editorLoginPath = "docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-editor-login.txt";

  const appPasswordRaw = readFileSync(appPasswordPath, "utf8");
  const editorLoginRaw = readFileSync(editorLoginPath, "utf8");

  return {
    apiPassword: editorLoginRaw.includes("Password")
      ? appPasswordRaw.match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || ""
      : "",
    editorUsername: editorLoginRaw.match(/Username\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "",
    editorPassword: editorLoginRaw.match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "",
  };
}

function resolveCredentials() {
  const siteUrl = readNamedEnv("WORDPRESS_BASE_URL") || DEFAULT_SITE_URL;
  const apiUsername = readNamedEnv("WORDPRESS_USERNAME");
  const apiPassword = readNamedEnv("WORDPRESS_APP_PASSWORD");
  const editorUsername = readNamedEnv("WORDPRESS_EDITOR_USERNAME");
  const editorPassword = readNamedEnv("WORDPRESS_EDITOR_PASSWORD");

  if (siteUrl && apiUsername && apiPassword) {
    return {
      siteUrl,
      apiUsername,
      apiPassword,
      editorUsername: editorUsername || apiUsername,
      editorPassword,
      credentialPath: "named_env_vars",
    };
  }

  const fallback = readReferenceCredentials();
  return {
    siteUrl: DEFAULT_SITE_URL,
    apiUsername: fallback.editorUsername,
    apiPassword: fallback.apiPassword,
    editorUsername: fallback.editorUsername,
    editorPassword: fallback.editorPassword,
    credentialPath: "reference_files_fallback",
  };
}

async function readJsonOrText(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function verifyServerReachable() {
  const response = await fetch(`${SERVER_BASE_URL}/api/internal/clawdia/reference-files`);
  if (!response.ok) {
    throw new Error(`Local Bragi server is not reachable at ${SERVER_BASE_URL}.`);
  }
}

async function createDraft() {
  const payload = buildAcceptedBuncombeVgbDraftPayload();
  const response = await fetch(EXECUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      notifyTelegram: false,
      notifyEmail: false,
    }),
  });

  const data = await readJsonOrText(response);
  if (!response.ok || !data?.ok) {
    const detail =
      typeof data === "string"
        ? data.slice(0, 200)
        : normalizeText(data?.error || `Bragi endpoint failed with status ${response.status}.`);
    throw new Error(detail);
  }

  return data.result;
}

async function readWordpressPost(result, credentials) {
  const authHeader = buildBasicAuthHeader(credentials.apiUsername, credentials.apiPassword);
  return fetchJson(`${credentials.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${result.postId}?context=edit`, {
    headers: wordpressJsonHeaders(authHeader),
  });
}

const localPayloadPath = "C:\\Users\\Peyto\\.openclaw\\workspace\\tmp_aquatrace_article_payload.json";
loadLocalEnv();
const credentials = resolveCredentials();

await verifyServerReachable();
const result = await createDraft();
const post = await readWordpressPost(result, credentials);
const expected = buildAcceptedBuncombeVgbDraftPayload().articlePackage;
const proofPaths = result?.proof || {};

const verification = {
  action: "createAquatraceBragiDraft",
  route: EXECUTE_URL,
  localPayloadPath,
  localPayloadExists: existsSync(localPayloadPath),
  credentialPath: credentials.credentialPath,
  routeCredentialPath: result?.credentialSource || "unknown",
  result: {
    draftUrl: result.draftUrl,
    postId: result.postId,
    status: result.wordpress?.status || post?.status || "",
    title: post?.title?.raw || post?.title?.rendered || result.wordpress?.title || "",
    notPublished: (result.wordpress?.status || post?.status || "") === "draft",
    notScheduled: (result.wordpress?.status || post?.status || "") !== "future",
    contentInserted:
      normalizeText(post?.content?.raw || post?.content?.rendered).includes("Buncombe County") &&
      normalizeText(post?.content?.raw || post?.content?.rendered).includes("2-person dive safety approach"),
    contentLength: normalizeText(post?.content?.raw || post?.content?.rendered).length,
    slug: post?.slug || result.wordpress?.slug || "",
  },
  expected: {
    title: expected.title,
    slug: expected.slug,
  },
  screenshots: {
    beforeSave: proofPaths.beforeSave || "",
    afterSave: proofPaths.afterSave || "",
  },
};

console.log(JSON.stringify(verification, null, 2));
