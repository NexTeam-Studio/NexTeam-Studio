function createWordPressApiError(message, { status, statusText, detail, data, responseText } = {}) {
  const error = new Error(message);
  error.name = "WordPressApiError";
  error.status = status || 500;
  error.statusText = statusText || "";
  error.detail = detail || null;
  error.data = data ?? null;
  error.responseText = responseText ?? null;
  return error;
}

export function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export const WORDPRESS_RAIL_USER_AGENT =
  "NexTeam-Bragi/1.0 (+https://aquatraceleak.com; automated content workflow)";

export function wordpressJsonHeaders(authHeader, extra = {}) {
  const headers = {
    Accept: "application/json",
    Authorization: authHeader,
    ...extra,
  };

  // Force a consistent identifying UA on every outbound WordPress rail request.
  headers["User-Agent"] = WORDPRESS_RAIL_USER_AGENT;

  return headers;
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw createWordPressApiError(`Request failed ${response.status} ${response.statusText}: ${detail}`, {
      status: response.status,
      statusText: response.statusText,
      detail,
      data,
      responseText: text,
    });
  }

  return data;
}

export async function updateWordPressPost({ siteUrl, authHeader, postId, fields }) {
  const base = siteUrl.replace(/\/$/, "");
  return fetchJson(`${base}/wp-json/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: wordpressJsonHeaders(authHeader, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(fields),
  });
}

export async function createWordPressPost({ siteUrl, authHeader, fields }) {
  const base = siteUrl.replace(/\/$/, "");
  return fetchJson(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: wordpressJsonHeaders(authHeader, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(fields),
  });
}

export async function uploadWordPressMedia({
  siteUrl,
  authHeader,
  filename,
  mimeType,
  buffer,
  title,
  altText,
  caption,
  description,
}) {
  const base = siteUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: wordpressJsonHeaders(authHeader, {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    }),
    body: buffer,
  });

  const text = await response.text();
  let media = null;
  try {
    media = text ? JSON.parse(text) : null;
  } catch {
    media = text;
  }
  if (!response.ok) {
    throw createWordPressApiError(`Media upload failed ${response.status}: ${text}`, {
      status: response.status,
      statusText: response.statusText,
      detail: typeof media === "string" ? media : JSON.stringify(media),
      data: media,
      responseText: text,
    });
  }

  if (!title && !altText && !caption && !description) {
    return media;
  }

  return fetchJson(`${base}/wp-json/wp/v2/media/${media.id}`, {
    method: "POST",
    headers: wordpressJsonHeaders(authHeader, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      title,
      alt_text: altText,
      caption,
      description,
    }),
  });
}
