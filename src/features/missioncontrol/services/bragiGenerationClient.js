import { DEFAULT_BRAGI_ARTICLE_PACKAGE } from "./bragiExecutionClient.js";
import { DEFAULT_ANTHROPIC_TEXT_MODEL } from "../../../lib/anthropicModels.js";

function slugify(value) {
  return String(value || "article-draft")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join("\n");
}

function tryParseJson(raw) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : raw;
  return JSON.parse(source);
}

export async function generateBragiArticlePackage(input) {
  const prompt = `You are Bragi, an SEO article writer. Return ONLY valid JSON with this exact shape:
{
  "title": "string",
  "excerpt": "string",
  "slug": "string",
  "articleText": "plain text article with paragraphs separated by blank lines",
  "yoast": {
    "focusKeyphrase": "string",
    "seoTitle": "string",
    "metaDescription": "string",
    "socialTitle": "string",
    "socialDescription": "string"
  }
}

Write for:
- Topic: ${input.articleTopic}
- Audience: ${input.targetAudience}
- Tone: ${input.tone}
- Keywords: ${input.keywords.join(", ") || "none provided"}
- Publish date: ${input.publishDate}
- Call to action: ${input.callToAction}

Rules:
- No markdown fences unless strictly necessary.
- Keep excerpt under 200 characters.
- articleText must be a complete publishable draft.
- Include the call to action in the article body.
- Keep language clear and trustworthy.
- Do not mention internal systems, JSON, payloads, or tool names.`;

  const response = await fetch("/api/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_TEXT_MODEL,
      max_tokens: 2200,
      system: "You write clean, trustworthy article packages for business operators.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const raw = data?.content?.map((item) => item.text || "").join("\n") || "";
  const parsed = tryParseJson(raw);

  return {
    ...DEFAULT_BRAGI_ARTICLE_PACKAGE,
    title: parsed.title,
    excerpt: parsed.excerpt,
    slug: parsed.slug || slugify(parsed.title || input.articleTopic),
    contentHtml: normalizeParagraphs(parsed.articleText),
    yoast: {
      focusKeyphrase: parsed.yoast.focusKeyphrase,
      seoTitle: parsed.yoast.seoTitle,
      metaDescription: parsed.yoast.metaDescription,
      socialTitle: parsed.yoast.socialTitle,
      socialDescription: parsed.yoast.socialDescription,
    },
    publishDate: input.publishDate,
    sourceInput: input,
    articleText: parsed.articleText,
  };
}
