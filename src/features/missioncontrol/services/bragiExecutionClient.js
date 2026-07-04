import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

export const DEFAULT_BRAGI_ARTICLE_PACKAGE = {
  postId: 3273,
  title: "Your Pool Leak Seems to Have Stopped – Here’s Why That’s Not Good News",
  slug: "pool-leak-seems-to-have-stopped",
  excerpt: "If your pool leak seems to have stopped, that does not mean the problem is gone. Temporary debris plugs can hide real leaks until the pressure shifts again.",
  commentStatus: "closed",
  pingStatus: "closed",
  preserveExistingFeaturedImage: true,
  preserveExistingInlineImages: true,
  contentHtml: "",
  yoast: {
    focusKeyphrase: "my pool leak seems to have stopped",
    seoTitle: "My Pool Leak Seems to Have Stopped - Should I Still Get It Inspected? | Aquatrace",
    metaDescription: "If your pool leak seems to have stopped on its own, do not cancel that inspection. Debris can temporarily plug a leak the same way a stopper seals a drain - and when it shifts, the water loss comes right back.",
    socialTitle: "Your Pool Leak \"Stopped\" - But It Probably Didn't",
    socialDescription: "Dirt, silt, and leaves can seal a leaking pool penetration just like a bathtub stopper. The leak is not gone - it is covered. Here is what is really happening and what to do before you cancel your inspection.",
  },
};

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getBrowserOrigin() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "";
  }
  return normalizeBaseUrl(window.location.origin);
}

export function getBragiExecutionUrl() {
  const configuredBase = normalizeBaseUrl(getRuntimeConfigValue("VITE_BRAGI_EXECUTION_API_BASE", ""));

  if (configuredBase) {
    return `${configuredBase}/api/bragi/wordpress/execute`;
  }

  const origin = getBrowserOrigin();
  if (/^https?:\/\/(127\.0\.0\.1|localhost):4173$/i.test(origin)) {
    return "http://127.0.0.1:3001/api/bragi/wordpress/execute";
  }

  return "/api/bragi/wordpress/execute";
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

export function buildBragiExecutionPayload(request) {
  const articlePackage = request?.articlePackage || {};
  return {
    requestId: request?.id || null,
    requestType: request?.requestType || "bragi",
    requestSummary: {
      page: request?.page || "",
      goal: request?.goal || "",
      nextStep: request?.nextStep || "",
      notes: request?.notes || "",
      change: request?.change || "",
    },
    articlePackage: {
      postId: Number(articlePackage.postId || DEFAULT_BRAGI_ARTICLE_PACKAGE.postId),
      title: articlePackage.title || DEFAULT_BRAGI_ARTICLE_PACKAGE.title,
      slug: articlePackage.slug || DEFAULT_BRAGI_ARTICLE_PACKAGE.slug,
      excerpt: articlePackage.excerpt || DEFAULT_BRAGI_ARTICLE_PACKAGE.excerpt,
      contentHtml: articlePackage.contentHtml || DEFAULT_BRAGI_ARTICLE_PACKAGE.contentHtml,
      commentStatus: articlePackage.commentStatus || DEFAULT_BRAGI_ARTICLE_PACKAGE.commentStatus,
      pingStatus: articlePackage.pingStatus || DEFAULT_BRAGI_ARTICLE_PACKAGE.pingStatus,
      preserveExistingFeaturedImage:
        articlePackage.preserveExistingFeaturedImage ?? DEFAULT_BRAGI_ARTICLE_PACKAGE.preserveExistingFeaturedImage,
      preserveExistingInlineImages:
        articlePackage.preserveExistingInlineImages ?? DEFAULT_BRAGI_ARTICLE_PACKAGE.preserveExistingInlineImages,
      yoast: {
        focusKeyphrase: articlePackage.yoast?.focusKeyphrase || DEFAULT_BRAGI_ARTICLE_PACKAGE.yoast.focusKeyphrase,
        seoTitle: articlePackage.yoast?.seoTitle || DEFAULT_BRAGI_ARTICLE_PACKAGE.yoast.seoTitle,
        metaDescription: articlePackage.yoast?.metaDescription || DEFAULT_BRAGI_ARTICLE_PACKAGE.yoast.metaDescription,
        socialTitle: articlePackage.yoast?.socialTitle || DEFAULT_BRAGI_ARTICLE_PACKAGE.yoast.socialTitle,
        socialDescription: articlePackage.yoast?.socialDescription || DEFAULT_BRAGI_ARTICLE_PACKAGE.yoast.socialDescription,
      },
    },
  };
}

export async function executeBragiRequest(request) {
  const payload = buildBragiExecutionPayload(request);
  const response = await fetch(getBragiExecutionUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await readJsonOrText(response);
  if (!response.ok || !data?.ok) {
    if (typeof data === "string") {
      throw new Error(`Bragi execution failed with status ${response.status}: ${data.slice(0, 200)}`);
    }
    throw new Error(data?.error || `Bragi execution failed with status ${response.status}`);
  }

  return data.result;
}

export const bragiExecutionClientInternals = {
  getBragiExecutionUrl,
  readJsonOrText,
};
