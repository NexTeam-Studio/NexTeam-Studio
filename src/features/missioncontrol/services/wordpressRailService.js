import {
  buildBasicAuthHeader,
  createWordPressPost,
  fetchJson,
  updateWordPressPost,
  uploadWordPressMedia,
  wordpressJsonHeaders,
} from "./wordpressApi.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeYoastFieldsInEditor } from "./wordpressYoastEditor.js";

const DEFAULT_COMMENT_STATUS = "closed";
const DEFAULT_PING_STATUS = "closed";
const WORDPRESS_YOAST_META_KEYS = {
  focusKeyword: "_yoast_wpseo_focuskw",
  seoTitle: "_yoast_wpseo_title",
  metaDescription: "_yoast_wpseo_metadesc",
};
const EDITOR_LOGIN_REFERENCE_PATH = "docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-editor-login.txt";

function getReferenceText(relativePath) {
  const filePath = join(process.cwd(), relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8").replace(/^\uFEFF/, "") : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSiteUrl(value) {
  const siteUrl = normalizeText(value).replace(/\/+$/, "");
  if (!siteUrl) {
    throw new Error("A WordPress site URL is required.");
  }

  return siteUrl;
}

function sanitizeTaxonomyIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function buildWordPressRailContext(credentials = {}) {
  const siteUrl = normalizeSiteUrl(credentials.siteUrl || process.env.WORDPRESS_BASE_URL);
  const username = normalizeText(credentials.username || credentials.apiUsername || process.env.WORDPRESS_USERNAME);
  const appPassword = normalizeText(
    credentials.appPassword || credentials.apiPassword || process.env.WORDPRESS_APP_PASSWORD
  );

  if (!username || !appPassword) {
    throw new Error("WordPress Application Password credentials are required.");
  }

  return {
    siteUrl,
    username,
    appPassword,
    authHeader: buildBasicAuthHeader(username, appPassword),
  };
}

function resolveWordPressEditorCredentials(credentials = {}, railContext) {
  const editorLoginRaw = getReferenceText(EDITOR_LOGIN_REFERENCE_PATH);
  const fallbackEditorUsername = editorLoginRaw.match(/Username\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "";
  const fallbackEditorPassword = editorLoginRaw.match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "";

  const username = normalizeText(
    credentials.editorUsername || process.env.WORDPRESS_EDITOR_USERNAME || fallbackEditorUsername || railContext?.username
  );
  const password = normalizeText(
    credentials.editorPassword || process.env.WORDPRESS_EDITOR_PASSWORD || fallbackEditorPassword
  );

  if (!username || !password) {
    return null;
  }

  return {
    username,
    password,
  };
}

function buildWordPressRestUrl(siteUrl, pathname, query = {}) {
  const normalizedPath = String(pathname || "").startsWith("/")
    ? String(pathname)
    : `/${String(pathname || "")}`;
  const url = new URL(`${siteUrl}${normalizedPath}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function buildWordPressEditUrl(siteUrl, postId) {
  return `${siteUrl}/wp-admin/post.php?post=${postId}&action=edit`;
}

function countHeadingTags(contentHtml, tagName) {
  return (String(contentHtml || "").match(new RegExp(`<${tagName}\\b`, "gi")) || []).length;
}

function mapDraftResult(post, siteUrl, headingSummary) {
  return {
    postId: post?.id || null,
    postUrl: post?.link || `${siteUrl}/?p=${post?.id || ""}`,
    editUrl: post?.id ? buildWordPressEditUrl(siteUrl, post.id) : "",
    status: post?.status || "",
    slug: post?.slug || "",
    title: post?.title?.raw || post?.title?.rendered || "",
    categories: Array.isArray(post?.categories) ? post.categories : [],
    tags: Array.isArray(post?.tags) ? post.tags : [],
    headingSummary,
  };
}

async function readWordPressJson(pathname, { context, query = {}, credentials } = {}) {
  const railContext = buildWordPressRailContext(credentials);
  return fetchJson(buildWordPressRestUrl(railContext.siteUrl, pathname, { ...query, context }), {
    headers: wordpressJsonHeaders(railContext.authHeader),
  });
}

async function readWordPressJsonWithCacheBust(pathname, { context, query = {}, credentials } = {}) {
  const railContext = buildWordPressRailContext(credentials);
  return fetchJson(
    buildWordPressRestUrl(railContext.siteUrl, pathname, {
      ...query,
      context,
      _: Date.now(),
    }),
    {
      headers: wordpressJsonHeaders(railContext.authHeader),
    }
  );
}

function normalizeYoastMeta(values = {}) {
  return {
    [WORDPRESS_YOAST_META_KEYS.focusKeyword]: values.focusKeyword ?? "",
    [WORDPRESS_YOAST_META_KEYS.seoTitle]: values.seoTitle ?? "",
    [WORDPRESS_YOAST_META_KEYS.metaDescription]: values.metaDescription ?? "",
  };
}

function ensureUploadFileDescriptor(file = {}) {
  const descriptor = {
    filename: normalizeText(file.filename || file.name),
    mimeType: normalizeText(file.mimeType || file.type),
    buffer: file.buffer || null,
    title: file.title,
    altText: file.altText,
    caption: file.caption,
    description: file.description,
  };

  if (!descriptor.filename || !descriptor.mimeType || !descriptor.buffer) {
    throw new Error("uploadMedia(file) requires filename, mimeType, and buffer.");
  }

  return descriptor;
}

export function setHeadingsStructure({ contentHtml }) {
  const normalizedContent = String(contentHtml || "").trim();
  if (!normalizedContent) {
    throw new Error("contentHtml is required.");
  }

  return {
    contentHtml: normalizedContent,
    preserved: true,
    headingSummary: {
      h1: countHeadingTags(normalizedContent, "h1"),
      h2: countHeadingTags(normalizedContent, "h2"),
      h3: countHeadingTags(normalizedContent, "h3"),
    },
  };
}

export async function fetchWordPressJsonWithCacheBust({ pathname, context = "edit", query = {}, credentials } = {}) {
  if (!pathname) {
    throw new Error("A WordPress REST pathname is required.");
  }

  return readWordPressJsonWithCacheBust(pathname, {
    context,
    query,
    credentials,
  });
}

export async function createDraft(
  { title, contentHtml, categories = [], tags = [], slug, excerpt, commentStatus, pingStatus } = {},
  { credentials } = {}
) {
  const railContext = buildWordPressRailContext(credentials);
  const structuredContent = setHeadingsStructure({ contentHtml });

  const createdPost = await createWordPressPost({
    siteUrl: railContext.siteUrl,
    authHeader: railContext.authHeader,
    fields: {
      title,
      content: structuredContent.contentHtml,
      categories: sanitizeTaxonomyIds(categories),
      tags: sanitizeTaxonomyIds(tags),
      slug: normalizeText(slug) || undefined,
      excerpt: normalizeText(excerpt) || undefined,
      status: "draft",
      comment_status: normalizeText(commentStatus) || DEFAULT_COMMENT_STATUS,
      ping_status: normalizeText(pingStatus) || DEFAULT_PING_STATUS,
    },
  });

  const verifiedPost = await readWordPressJsonWithCacheBust(`/wp-json/wp/v2/posts/${createdPost.id}`, {
    context: "edit",
    credentials: railContext,
  });

  return mapDraftResult(verifiedPost, railContext.siteUrl, structuredContent.headingSummary);
}

export async function setYoastFields(postId, values = {}, { credentials } = {}) {
  const normalizedPostId = Number(postId);
  if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
    throw new Error("A valid WordPress post ID is required.");
  }

  const railContext = buildWordPressRailContext(credentials);
  await updateWordPressPost({
    siteUrl: railContext.siteUrl,
    authHeader: railContext.authHeader,
    postId: normalizedPostId,
    fields: {
      meta: normalizeYoastMeta(values),
    },
  });

  const verifiedPost = await readWordPressJsonWithCacheBust(`/wp-json/wp/v2/posts/${normalizedPostId}`, {
    context: "edit",
    credentials: railContext,
  });
  const verifiedMeta = verifiedPost?.meta || {};
  const editorCredentials = resolveWordPressEditorCredentials(credentials, railContext);
  const needsEditorSocialWrite = Boolean(
    values?.socialTitle || values?.socialDescription || values?.socialImageUrl || values?.twitterTitle || values?.twitterDescription || values?.twitterImageUrl
  );

  let editorStored = {
    socialTitle: values?.socialTitle || "",
    socialDescription: values?.socialDescription || "",
    socialImageUrl: values?.socialImageUrl || "",
    twitterTitle: values?.twitterTitle || values?.socialTitle || "",
    twitterDescription: values?.twitterDescription || values?.socialDescription || "",
    twitterImageUrl: values?.twitterImageUrl || values?.socialImageUrl || "",
    editorVisible: {
      focusKeyphrase: false,
      seoTitle: false,
      metaDescription: false,
      socialTitle: false,
      socialDescription: false,
      socialImageUrl: false,
      twitterTitle: false,
      twitterDescription: false,
      twitterImageUrl: false,
    },
    skipped: needsEditorSocialWrite,
    reason: needsEditorSocialWrite && !editorCredentials
      ? "WordPress editor credentials are unavailable for Yoast social field writes."
      : "",
  };

  if (needsEditorSocialWrite && editorCredentials) {
    const editorResult = await writeYoastFieldsInEditor({
      loginUrl: `${railContext.siteUrl}/wp-login.php`,
      editUrl: buildWordPressEditUrl(railContext.siteUrl, normalizedPostId),
      username: editorCredentials.username,
      password: editorCredentials.password,
      values: {
        focusKeyphrase: values.focusKeyword ?? "",
        seoTitle: values.seoTitle ?? "",
        metaDescription: values.metaDescription ?? "",
        socialTitle: values.socialTitle ?? "",
        socialDescription: values.socialDescription ?? "",
        socialImageUrl: values.socialImageUrl ?? "",
        twitterTitle: values.twitterTitle ?? values.socialTitle ?? "",
        twitterDescription: values.twitterDescription ?? values.socialDescription ?? "",
        twitterImageUrl: values.twitterImageUrl ?? values.socialImageUrl ?? "",
      },
    });
    editorStored = {
      ...editorResult.stored,
      skipped: false,
      reason: "",
    };
  }

  return {
    postId: normalizedPostId,
    stored: {
      focusKeyword: verifiedMeta[WORDPRESS_YOAST_META_KEYS.focusKeyword] ?? "",
      seoTitle: verifiedMeta[WORDPRESS_YOAST_META_KEYS.seoTitle] ?? "",
      metaDescription: verifiedMeta[WORDPRESS_YOAST_META_KEYS.metaDescription] ?? "",
      socialTitle: editorStored.socialTitle ?? "",
      socialDescription: editorStored.socialDescription ?? "",
      socialImageUrl: editorStored.socialImageUrl ?? "",
      twitterTitle: editorStored.twitterTitle ?? "",
      twitterDescription: editorStored.twitterDescription ?? "",
      twitterImageUrl: editorStored.twitterImageUrl ?? "",
      editorVisible: editorStored.editorVisible,
      skipped: editorStored.skipped,
      reason: editorStored.reason,
    },
    yoastHeadJson: {
      title: verifiedPost?.yoast_head_json?.title || "",
      description: verifiedPost?.yoast_head_json?.description || "",
      ogTitle: verifiedPost?.yoast_head_json?.og_title || "",
      ogDescription: verifiedPost?.yoast_head_json?.og_description || "",
      ogImage: verifiedPost?.yoast_head_json?.og_image || [],
    },
  };
}

export async function setFeaturedImage(postId, mediaId, { credentials } = {}) {
  const normalizedPostId = Number(postId);
  const normalizedMediaId = Number(mediaId);
  if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
    throw new Error("A valid WordPress post ID is required.");
  }
  if (!Number.isFinite(normalizedMediaId) || normalizedMediaId <= 0) {
    throw new Error("A valid WordPress media ID is required.");
  }

  const railContext = buildWordPressRailContext(credentials);
  await updateWordPressPost({
    siteUrl: railContext.siteUrl,
    authHeader: railContext.authHeader,
    postId: normalizedPostId,
    fields: {
      featured_media: normalizedMediaId,
    },
  });

  const verifiedPost = await readWordPressJsonWithCacheBust(`/wp-json/wp/v2/posts/${normalizedPostId}`, {
    context: "edit",
    credentials: railContext,
  });
  const persistedMediaId = Number(verifiedPost?.featured_media || 0);

  if (persistedMediaId !== normalizedMediaId) {
    throw new Error(
      `WordPress featured_media verification failed. Expected ${normalizedMediaId}, got ${persistedMediaId}.`
    );
  }

  return {
    postId: normalizedPostId,
    featuredMediaId: persistedMediaId,
    verifiedWithCacheBust: true,
  };
}

export async function uploadMedia(file, { credentials } = {}) {
  const railContext = buildWordPressRailContext(credentials);
  const descriptor = ensureUploadFileDescriptor(file);

  return uploadWordPressMedia({
    siteUrl: railContext.siteUrl,
    authHeader: railContext.authHeader,
    filename: descriptor.filename,
    mimeType: descriptor.mimeType,
    buffer: descriptor.buffer,
    title: descriptor.title,
    altText: descriptor.altText,
    caption: descriptor.caption,
    description: descriptor.description,
  });
}

export function createWordPressRail(credentials = {}) {
  const railCredentials = buildWordPressRailContext(credentials);

  return {
    createDraft: (args) => createDraft(args, { credentials: railCredentials }),
    setHeadingsStructure,
    setYoastFields: (postId, values) => setYoastFields(postId, values, { credentials: railCredentials }),
    setFeaturedImage: (postId, mediaId) => setFeaturedImage(postId, mediaId, { credentials: railCredentials }),
    fetchJsonWithCacheBust: (args) =>
      fetchWordPressJsonWithCacheBust({
        ...args,
        credentials: railCredentials,
      }),
    uploadMedia: (file, options = {}) =>
      uploadMedia(file, {
        ...options,
        credentials: railCredentials,
      }),
    readPost: (postId) =>
      readWordPressJson(`/wp-json/wp/v2/posts/${postId}`, {
        context: "edit",
        credentials: railCredentials,
      }),
  };
}
