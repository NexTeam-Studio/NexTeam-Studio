import { resolveBragiVisionModel } from "../../../lib/anthropicModels.js";
import { callAnthropicMessages } from "../../../server/anthropicClient.js";
const MAX_VISION_CANDIDATES = 18;
const VISION_BATCH_SIZE = 6;

function getBrandName(config) {
  return String(config?.displayName || config?.brandName || config?.profile?.brandName || "the client").trim();
}

function tokenize(value) {
  return [...new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 2)
  )];
}

function flattenPhotoText(photo) {
  const values = [
    photo?.description,
    photo?.creator_name,
    photo?.project?.name,
    photo?.project_name,
    photo?.address?.city,
    photo?.address?.state,
    photo?.address?.postal_code,
    photo?.project?.address?.city,
    photo?.project?.address?.state,
    photo?.project?.address?.postal_code,
    ...(Array.isArray(photo?.labels) ? photo.labels.map((label) => label?.name || label) : []),
    ...(Array.isArray(photo?.tags) ? photo.tags.map((tag) => tag?.name || tag) : []),
  ];

  return values
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(" ")
    .toLowerCase();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractSectionHeadings(contentHtml) {
  const matches = [...String(contentHtml || "").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  return matches.map((match) => stripHtml(match[1])).filter(Boolean);
}

function desiredInlineImageCount(contentHtml) {
  const h2Count = extractSectionHeadings(contentHtml).length;
  if (h2Count >= 7) return 4;
  if (h2Count >= 5) return 3;
  return 2;
}

function parseJsonBlock(raw) {
  const fenced = String(raw || "").match(/```json\s*([\s\S]*?)```/i);
  return JSON.parse((fenced ? fenced[1] : raw).trim());
}

function summarizeArticleContext(articlePackage) {
  return stripHtml(articlePackage?.contentHtml || "").slice(0, 1200);
}

function buildSectionPlans({ articlePackage, topic, location }) {
  const headings = extractSectionHeadings(articlePackage?.contentHtml || "");
  const targetCount = desiredInlineImageCount(articlePackage?.contentHtml || "");
  const plans = [];

  if (!headings.length) {
    return plans;
  }

  for (let index = 0; index < targetCount; index += 1) {
    const headingIndex = Math.min(
      headings.length - 1,
      Math.max(0, Math.floor(((index + 1) * headings.length) / (targetCount + 1)))
    );
    const heading = headings[headingIndex];
    plans.push({
      index,
      heading,
      keywords: tokenize([topic, articlePackage?.focusKeyword, articlePackage?.title, location?.display, heading].join(" ")),
    });
  }

  return plans;
}

function buildVisionSectionSummary(sectionPlans) {
  return sectionPlans.map((plan, index) => `${index + 1}. ${plan.heading}`).join("\n");
}

function baseCandidateScore({ photo, keywords }) {
  const combinedText = flattenPhotoText(photo);
  let score = 0;

  if (photo?.status === "active") score += 20;
  if (photo?.processing_status === "processed") score += 20;
  if (photo?.description) score += 10;
  if (photo?.uris?.length) score += 10;

  let keywordHits = 0;
  for (const keyword of keywords) {
    if (combinedText.includes(keyword)) {
      keywordHits += 1;
    }
  }

  score += keywordHits * 8;

  const recencyDays = photo?.captured_at
    ? (Date.now() - (Number(photo.captured_at) * 1000)) / (1000 * 60 * 60 * 24)
    : 3650;
  score += Math.max(0, 12 - (recencyDays / 30));

  return {
    photo,
    score: Number(score.toFixed(2)),
    keywordHits,
    recencyDays: Number.isFinite(recencyDays) ? Number(recencyDays.toFixed(1)) : null,
    combinedText,
  };
}

function shortlistVisionCandidates({ photos, topic, articlePackage, location, limit = MAX_VISION_CANDIDATES }) {
  const keywords = tokenize([
    topic,
    articlePackage?.title,
    articlePackage?.focusKeyword,
    location?.display,
    ...extractSectionHeadings(articlePackage?.contentHtml || ""),
  ].join(" "));

  return (Array.isArray(photos) ? photos : [])
    .map((photo) => baseCandidateScore({ photo, keywords }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function normalizeVisionText(value, fallback = "") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeVisionAssessment(raw = {}, sectionPlans = []) {
  const sectionMap = new Map(
    (Array.isArray(raw?.sectionFits) ? raw.sectionFits : [])
      .map((entry) => [normalizeVisionText(entry?.heading || "").toLowerCase(), entry])
  );

  return {
    photoId: String(raw?.photoId || "").trim(),
    visibleSummary: normalizeVisionText(raw?.visibleSummary),
    contentTags: [...new Set((Array.isArray(raw?.contentTags) ? raw.contentTags : []).map((tag) => normalizeVisionText(tag).toLowerCase()).filter(Boolean))],
    articleFitScore: Math.max(0, Math.min(100, Number(raw?.articleFitScore || 0) || 0)),
    featuredFitScore: Math.max(0, Math.min(100, Number(raw?.featuredFitScore || 0) || 0)),
    exclude: Boolean(raw?.exclude),
    excludeReason: normalizeVisionText(raw?.excludeReason),
    rationale: normalizeVisionText(raw?.rationale),
    title: normalizeVisionText(raw?.title),
    altText: normalizeVisionText(raw?.altText),
    caption: normalizeVisionText(raw?.caption),
    description: normalizeVisionText(raw?.description),
    sectionFits: sectionPlans.map((plan) => {
      const match = sectionMap.get(plan.heading.toLowerCase()) || {};
      return {
        heading: plan.heading,
        score: Math.max(0, Math.min(100, Number(match?.score || 0) || 0)),
        reason: normalizeVisionText(match?.reason),
      };
    }),
  };
}

function chooseVisionAssetUrl(photo) {
  const uris = Array.isArray(photo?.uris) ? photo.uris : [];
  const preferredOrder = ["web", "web_annotation", "thumbnail", "original", "original_annotation"];

  for (const type of preferredOrder) {
    const hit = uris.find((entry) => entry?.type === type && entry?.url);
    if (hit?.url) {
      return hit.url;
    }
  }

  return photo?.photo_url || "";
}

async function analyzePhotoBatchWithVision({ batch, topic, articlePackage, sectionPlans, config, clientId = "aquatrace" }) {
  const brandName = getBrandName(config);
  const content = [
    {
      type: "text",
      text: [
        `You are grading CompanyCam jobsite photos for a ${brandName} article.`,
        `Article topic: ${topic}`,
        `Article title: ${articlePackage?.title || ""}`,
        `Focus keyword: ${articlePackage?.focusKeyword || ""}`,
        `Article context: ${summarizeArticleContext(articlePackage)}`,
        "Choose photos by what they visibly SHOW, not by where they were taken.",
        "Relevant visuals include pool overview shots, underwater leak evidence, plumbing/equipment references, visible water loss, broken/exposed lines, and excavation-for-repair scenes.",
        "If a photo does not look useful for this article, mark it excluded.",
        "Write natural image metadata. Do not use placeholders, generic stubs, or fake location claims that are not visible in the photo.",
        "Return ONLY valid JSON with this exact shape:",
        "{",
        '  "assessments": [',
        "    {",
        '      "photoId": "string",',
        '      "visibleSummary": "string",',
        '      "contentTags": ["string"],',
        '      "articleFitScore": 0,',
        '      "featuredFitScore": 0,',
        '      "exclude": false,',
        '      "excludeReason": "string",',
        '      "rationale": "string",',
        '      "title": "string",',
        '      "altText": "string",',
        '      "caption": "string",',
        '      "description": "string",',
        '      "sectionFits": [',
        '        { "heading": "string", "score": 0, "reason": "string" }',
        "      ]",
        "    }",
        "  ]",
        "}",
        "Section targets:",
        buildVisionSectionSummary(sectionPlans),
      ].join("\n"),
    },
  ];

  for (const entry of batch) {
    const visionUrl = chooseVisionAssetUrl(entry.photo);
    const asset = await downloadCompanyCamPhotoAsset(visionUrl);
    content.push({
      type: "text",
      text: [
        `Photo ID: ${entry.photo.id}`,
        `Metadata hint: ${normalizeVisionText(entry.photo.description || entry.combinedText || "No useful metadata.")}`,
      ].join("\n"),
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: asset.mimeType,
        data: asset.buffer.toString("base64"),
      },
    });
  }

  const data = await callAnthropicMessages({
    env: process.env,
    tenantId: clientId,
    routeActionName: "bragiModeBPhotoVision",
    taskType: "vision_grading",
    model: resolveBragiVisionModel(process.env),
    maxTokens: 2200,
    temperature: 0.1,
    system: "Return JSON only.",
    messages: [{ role: "user", content }],
    metadata: {
      topic,
      articleTitle: articlePackage?.title || "",
      batchPhotoCount: batch.length,
    },
  });

  const raw = (data?.content || []).map((item) => item?.text || "").join("\n").trim();
  const parsed = parseJsonBlock(raw);
  const assessments = Array.isArray(parsed?.assessments) ? parsed.assessments : [];
  return assessments.map((assessment) => normalizeVisionAssessment(assessment, sectionPlans));
}

export async function analyzeCompanyCamPhotosWithVision({ photos, topic, articlePackage, location, config, clientId = "aquatrace" }) {
  const sectionPlans = buildSectionPlans({ articlePackage, topic, location });
  const shortlisted = shortlistVisionCandidates({ photos, topic, articlePackage, location });
  const assessments = [];

  for (let index = 0; index < shortlisted.length; index += VISION_BATCH_SIZE) {
    const batch = shortlisted.slice(index, index + VISION_BATCH_SIZE);
    const batchAssessments = await analyzePhotoBatchWithVision({
      batch,
      topic,
      articlePackage,
      sectionPlans,
      config,
      clientId,
    });
    assessments.push(...batchAssessments);
  }

  return {
    sectionPlans,
    shortlisted,
    assessments,
  };
}

function chooseFeaturedSelection(rankedEntries) {
  return rankedEntries
    .filter((entry) => !entry.vision.exclude)
    .sort((left, right) => {
      const leftScore = (left.vision.featuredFitScore * 2) + left.vision.articleFitScore + left.base.score;
      const rightScore = (right.vision.featuredFitScore * 2) + right.vision.articleFitScore + right.base.score;
      return rightScore - leftScore;
    })[0] || null;
}

function chooseInlineSelections({ rankedEntries, sectionPlans, usedPhotoIds }) {
  const selections = [];

  for (const plan of sectionPlans) {
    const match = rankedEntries
      .filter((entry) => !entry.vision.exclude)
      .filter((entry) => !usedPhotoIds.has(String(entry.photo.id)))
      .map((entry) => {
        const sectionFit = entry.vision.sectionFits.find((item) => item.heading === plan.heading) || { score: 0, reason: "" };
        return {
          ...entry,
          sectionFit,
          weightedSectionScore: (sectionFit.score * 2) + entry.vision.articleFitScore + entry.base.score,
        };
      })
      .sort((left, right) => right.weightedSectionScore - left.weightedSectionScore)[0];

    if (!match || match.sectionFit.score < 40) {
      continue;
    }

    usedPhotoIds.add(String(match.photo.id));
    selections.push({
      ...match,
      placementHeading: plan.heading,
      placementIndex: plan.index,
    });
  }

  return selections;
}

export async function selectBestCompanyCamPhoto({
  photos,
  topic,
  articlePackage,
  location,
  config,
  clientId = "aquatrace",
  visionScorer = analyzeCompanyCamPhotosWithVision,
}) {
  const visionResult = await visionScorer({
    photos,
    topic,
    articlePackage,
    location,
    config,
    clientId,
  });

  const assessmentMap = new Map(
    (visionResult.assessments || [])
      .filter((entry) => entry?.photoId)
      .map((entry) => [String(entry.photoId), entry])
  );

  const rankedEntries = (visionResult.shortlisted || [])
    .map((base) => ({
      base,
      photo: base.photo,
      vision: assessmentMap.get(String(base.photo.id)) || normalizeVisionAssessment({ photoId: base.photo.id }, visionResult.sectionPlans || []),
    }))
    .sort((left, right) => {
      const leftScore = left.vision.articleFitScore + left.base.score;
      const rightScore = right.vision.articleFitScore + right.base.score;
      return rightScore - leftScore;
    });

  const featured = chooseFeaturedSelection(rankedEntries);
  const usedPhotoIds = new Set(featured?.photo?.id ? [String(featured.photo.id)] : []);
  const inlineSelections = chooseInlineSelections({
    rankedEntries,
    sectionPlans: visionResult.sectionPlans || [],
    usedPhotoIds,
  });

  return {
    selected: featured,
    inlineSelections,
    topCandidates: rankedEntries.slice(0, 8),
    desiredInlineImageCount: (visionResult.sectionPlans || []).length,
    visionSummary: {
      shortlistedCount: (visionResult.shortlisted || []).length,
      assessedCount: (visionResult.assessments || []).length,
      model: resolveBragiVisionModel(process.env),
    },
  };
}

export function chooseBestCompanyCamPhotoAssetUrl(photo) {
  const uris = Array.isArray(photo?.uris) ? photo.uris : [];
  const preferredOrder = ["original", "original_annotation", "web", "web_annotation", "thumbnail"];

  for (const type of preferredOrder) {
    const hit = uris.find((entry) => entry?.type === type && entry?.url);
    if (hit?.url) {
      return hit.url;
    }
  }

  return photo?.photo_url || "";
}

export const chooseBestPhotoAssetUrl = chooseBestCompanyCamPhotoAssetUrl;

export async function downloadCompanyCamPhotoAsset(url) {
  if (!url) {
    throw new Error("CompanyCam photo asset URL is missing.");
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    throw new Error(`Photo download failed with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType.split(";")[0].trim() || "image/jpeg",
  };
}
