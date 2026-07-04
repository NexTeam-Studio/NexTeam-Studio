import { buildBasicAuthHeader, fetchJson, wordpressJsonHeaders } from "./wordpressApi.js";

const DEFAULT_RAIL_BASE_URL = "http://127.0.0.1:3210";

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_RAIL_BASE_URL).trim().replace(/\/+$/, "");
}

function getRailToken() {
  const token = String(process.env.RAIL_LOCAL_API_TOKEN || process.env.CLAWDIA_CODEX_BRIDGE_SHARED_SECRET || "").trim();
  if (!token) {
    throw new Error("RAIL_LOCAL_API_TOKEN is not configured.");
  }
  return token;
}

function getWordPressAuthHeader() {
  const username = String(process.env.WORDPRESS_USERNAME || "").trim();
  const password = String(process.env.WORDPRESS_APP_PASSWORD || "").trim();
  const siteUrl = String(process.env.WORDPRESS_BASE_URL || "").trim();
  if (!username || !password || !siteUrl) {
    throw new Error("WordPress credentials are not configured for taxonomy resolution.");
  }
  return {
    siteUrl: siteUrl.replace(/\/+$/, ""),
    authHeader: buildBasicAuthHeader(username, password),
  };
}

async function readJsonOrThrow(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error?.message || `Rail request failed with status ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data.result;
}

export function createBragiModeBRailClient({ baseUrl = process.env.BRAGI_RAIL_BASE_URL || DEFAULT_RAIL_BASE_URL } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const token = getRailToken();

  async function request(pathname, { method = "GET", body } = {}) {
    const response = await fetch(`${normalizedBaseUrl}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return readJsonOrThrow(response);
  }

  return {
    health: () => request("/rail/health"),
    createDraft: (payload) => request("/rail/wp/draft", { method: "POST", body: payload }),
    setYoast: (payload) => request("/rail/wp/yoast", { method: "POST", body: payload }),
    uploadMedia: (payload) => request("/rail/wp/upload-media", { method: "POST", body: payload }),
    setFeaturedImage: (payload) => request("/rail/wp/featured-image", { method: "POST", body: payload }),
    listPhotos: ({ perPage = 100, query, modifiedSince } = {}) => {
      const url = new URL(`${normalizedBaseUrl}/rail/companycam/photos`);
      url.searchParams.set("perPage", String(perPage));
      if (query) url.searchParams.set("query", query);
      if (modifiedSince) url.searchParams.set("modifiedSince", modifiedSince);
      return fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then(readJsonOrThrow);
    },
    getPhoto: (photoId) => request(`/rail/companycam/photo/${encodeURIComponent(photoId)}`),
    async resolveTermIdsByName(taxonomy, names = []) {
      const { siteUrl, authHeader } = getWordPressAuthHeader();
      const normalizedNames = [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
      const resolved = [];

      for (const name of normalizedNames) {
        const matches = await fetchJson(
          `${siteUrl}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=100&context=edit&_=${Date.now()}`,
          {
            headers: wordpressJsonHeaders(authHeader),
          }
        );
        const exact = (Array.isArray(matches) ? matches : []).find((item) =>
          String(item?.name || "").trim().toLowerCase() === name.toLowerCase()
            || String(item?.slug || "").trim().toLowerCase() === name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        );
        if (exact?.id) {
          resolved.push(Number(exact.id));
        }
      }

      return [...new Set(resolved)];
    },
  };
}
