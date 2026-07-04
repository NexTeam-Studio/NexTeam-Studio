import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_ANTHROPIC_TEXT_MODEL } from "../../../lib/anthropicModels.js";

const BRAGI_LIBRARY_ROOT = join(process.cwd(), "docs", "clients", "aquatrace", "bragi");
const DEFAULT_WEEKLY_SCHEDULE = {
  day: "Monday",
  time: "07:00",
  timezone: "America/New_York",
  expression: "Every Monday at 7:00 AM America/New_York",
};
const DEFAULT_DAILY_TOPIC_CHECK = {
  frequency: "daily",
  time: "06:30",
  timezone: "America/New_York",
  expression: "Every day at 6:30 AM America/New_York",
};
const DEFAULT_AUTHOR = "Chris Sears";
const DEFAULT_PRIMARY_CATEGORY = "Swimming Pool Leak Detection";
const DEFAULT_SECONDARY_CATEGORY = "Pool Leak Detection Tips";
const DEFAULT_WORD_COUNT = "1,400-1,600 words";

function readOptionalFile(relativePath) {
  const absolutePath = join(BRAGI_LIBRARY_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return { absolutePath, exists: false, text: "" };
  }

  return {
    absolutePath,
    exists: true,
    text: readFileSync(absolutePath, "utf8"),
  };
}

function parseSectionRecords(markdown) {
  return String(markdown || "")
    .split(/^## /m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const heading = lines.shift() || "";
      const record = { heading };

      for (const line of lines) {
        const match = line.match(/^- ([a-zA-Z0-9_]+):\s*(.+)$/);
        if (match) {
          record[match[1]] = match[2];
        }
      }

      return record;
    })
    .filter((record) => record.title || record.heading.startsWith("Topic "));
}

export function getBragiContinuitySchedule() {
  return {
    dailyTopicCheck: { ...DEFAULT_DAILY_TOPIC_CHECK },
    weeklyDraftCreation: { ...DEFAULT_WEEKLY_SCHEDULE },
  };
}

export function getBragiPackageRules() {
  return {
    wordCount: DEFAULT_WORD_COUNT,
    seoFocus: "swimming pool leak detection",
    defaultAuthor: DEFAULT_AUTHOR,
    defaultPrimaryCategory: DEFAULT_PRIMARY_CATEGORY,
    defaultSecondaryCategory: DEFAULT_SECONDARY_CATEGORY,
    draftOnly: true,
    publishRequiresApproval: true,
    scheduleRequiresApproval: true,
    yoastRequiredFields: [
      "focusKeyphrase",
      "seoTitle",
      "slug",
      "metaDescription",
      "socialTitle",
      "socialDescription",
      "suggestedExcerpt",
      "internalLinksApplied",
      "internalLinksRecommended",
      "backlinkOpportunities",
      "externalLinksRecommended",
      "imageRecommendations",
    ],
    supportedPhotoLabels: ["Featured Image", "Photo 1", "Photo 2", "Photo 3", "Photo 4", "Photo 5"],
  };
}

export function loadAquatraceBragiLibrary() {
  const memory = readOptionalFile("AQUATRACE_BRAGI_MEMORY.md");
  const knowledge = readOptionalFile("AQUATRACE_CONTENT_KNOWLEDGE.md");
  const topicBank = readOptionalFile("AQUATRACE_TOPIC_BANK.md");
  const internalLinkMap = readOptionalFile("AQUATRACE_INTERNAL_LINK_MAP.md");
  const photoGuide = readOptionalFile("AQUATRACE_PHOTO_GUIDE.md");
  const claimsBoundaries = readOptionalFile("AQUATRACE_CLAIMS_BOUNDARIES.md");
  const caseStudyLibrary = readOptionalFile("AQUATRACE_CASE_STUDY_LIBRARY.md");

  return {
    root: BRAGI_LIBRARY_ROOT,
    memory,
    knowledge,
    topicBank,
    internalLinkMap,
    photoGuide,
    claimsBoundaries,
    caseStudyLibrary,
    topicRecords: parseSectionRecords(topicBank.text),
    internalLinkRecords: parseSectionRecords(internalLinkMap.text),
  };
}

export function selectBragiTopic({ topicOverride, library } = {}) {
  if (topicOverride) {
    return {
      title: topicOverride,
      focus_keyphrase: "swimming pool leak detection",
      search_intent: "informational",
      business_value: "Supports Aquatrace authority and call intent.",
      internal_link_opportunity: "Link to Aquatrace leak detection service page.",
      customer_pain_point: "Pool owner is losing water and needs a clear next step.",
      priority: "manual_override",
    };
  }

  const topic = library?.topicRecords?.[0];
  if (!topic) {
    return {
      title: "How to Tell if You Are Losing Pool Water to Evaporation or a Leak",
      focus_keyphrase: "pool leak or evaporation",
      search_intent: "informational",
      business_value: "High-intent homeowner search and strong Aquatrace qualification topic.",
      internal_link_opportunity: "Link to Aquatrace leak detection service page and contact page.",
      customer_pain_point: "Unsure whether the pool needs professional leak detection.",
      priority: "fallback",
    };
  }

  return {
    ...topic,
    title: topic.title || topic.heading,
  };
}

export function buildBragiPackageSkeleton({ topic, library }) {
  const linkRecords = library?.internalLinkRecords || [];
  const primaryLinks = linkRecords.slice(0, 3).map((record) => ({
    title: record.heading,
    anchorText: record.anchor_text || "Aquatrace leak detection",
    url: record.url || "",
    reason: record.reason || "Relevant Aquatrace internal link.",
  }));

  return {
    title: topic.title,
    summary: `${topic.title} addresses ${topic.customer_pain_point || "a real Aquatrace customer question"} in Aquatrace's friendly, authority-building voice.`,
    excerpt: "Draft package placeholder. Final excerpt should stay under 200 characters.",
    slug: topic.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80),
    targetWordCount: DEFAULT_WORD_COUNT,
    author: DEFAULT_AUTHOR,
    category: DEFAULT_PRIMARY_CATEGORY,
    secondaryCategory: DEFAULT_SECONDARY_CATEGORY,
    whyTopicChosen: topic.business_value,
    searchIntent: topic.search_intent,
    businessValue: topic.business_value,
    focusKeyphrase: topic.focus_keyphrase || "swimming pool leak detection",
    internalLinksApplied: primaryLinks,
    internalLinksRecommended: primaryLinks,
    backlinkOpportunities: primaryLinks.map((record) => ({
      title: record.title,
      anchorText: record.anchorText,
      reason: `Recommend adding a link from ${record.title} back to this article.`,
    })),
    externalLinksRecommended: [
      {
        sourceName: "Pool leak evaporation guidance",
        url: "",
        reason: "Add only after human review of the source quality.",
      },
    ],
    imageRecommendations: [
      {
        label: "Featured Image",
        photoType: "Technician pressure testing pool plumbing at the equipment pad",
        placement: "Top of article",
        filename: "aquatrace-pool-plumbing-pressure-test.jpg",
        title: "Aquatrace Technician Pressure Testing Pool Plumbing",
        altText: "Aquatrace technician pressure testing swimming pool plumbing to locate a leak",
        caption: "Pressure testing helps isolate hidden plumbing leaks.",
        description: "Aquatrace technician pressure testing pool plumbing during leak detection.",
      },
      {
        label: "Photo 1",
        photoType: "Bucket test setup beside a residential pool",
        placement: "Section explaining evaporation versus leak loss",
        filename: "bucket-test-evaporation-vs-leak.jpg",
        title: "Bucket Test for Pool Water Loss",
        altText: "Bucket test setup used to compare evaporation and pool water loss",
        caption: "The bucket test helps separate evaporation from a likely leak.",
        description: "Bucket test setup beside a pool for comparing water-loss rates.",
      },
      {
        label: "Photo 2",
        photoType: "Technician dye testing around a skimmer throat",
        placement: "Section about skimmer leaks",
        filename: "skimmer-dye-test-leak-detection.jpg",
        title: "Dye Test Around Pool Skimmer",
        altText: "Aquatrace technician dye testing a pool skimmer for a leak",
        caption: "Dye testing can reveal movement into a leak path.",
        description: "Aquatrace technician performing a dye test around the skimmer throat.",
      },
      {
        label: "Photo 3",
        photoType: "Underwater inspection at a pool light niche",
        placement: "Section about structural or niche leak points",
        filename: "pool-light-niche-underwater-inspection.jpg",
        title: "Underwater Pool Light Niche Inspection",
        altText: "Underwater inspection of a pool light niche during leak detection",
        caption: "Light niches are a common place to investigate when water loss is persistent.",
        description: "Underwater inspection focused on the pool light niche during leak testing.",
      },
    ],
    articleText: "",
    yoast: {
      focusKeyphrase: topic.focus_keyphrase || "swimming pool leak detection",
      seoTitle: `${topic.title} | Aquatrace`,
      metaDescription: `Aquatrace explains ${topic.title.toLowerCase()} and when professional swimming pool leak detection is the right next step.`,
      socialTitle: `${topic.title} | Aquatrace`,
      socialDescription: `Aquatrace explains ${topic.customer_pain_point || "a key pool leak question"} in clear, trustworthy language.`,
      suggestedExcerpt: `Aquatrace explains ${topic.title.toLowerCase()} in plain language for pool owners who need a trustworthy next step.`,
    },
  };
}

function buildAnthropicPrompt({ topic, packageSkeleton, library }) {
  return `You are Bragi, the Aquatrace SEO content agent. Return ONLY valid JSON with this exact shape:
{
  "title": "string",
  "summary": "string",
  "excerpt": "string under 200 chars",
  "slug": "string",
  "targetWordCount": "1,400-1,600 words",
  "author": "Chris Sears",
  "category": "Swimming Pool Leak Detection",
  "secondaryCategory": "string",
  "whyTopicChosen": "string",
  "searchIntent": "string",
  "businessValue": "string",
  "articleText": "plain text article with paragraphs separated by blank lines",
  "yoast": {
    "focusKeyphrase": "string",
    "seoTitle": "string",
    "metaDescription": "string",
    "socialTitle": "string",
    "socialDescription": "string",
    "suggestedExcerpt": "string"
  },
  "internalLinksApplied": [
    { "title": "string", "anchorText": "string", "url": "string", "reason": "string" }
  ],
  "internalLinksRecommended": [
    { "title": "string", "anchorText": "string", "url": "string", "reason": "string" }
  ],
  "backlinkOpportunities": [
    { "title": "string", "anchorText": "string", "reason": "string" }
  ],
  "externalLinksRecommended": [
    { "sourceName": "string", "url": "string", "reason": "string" }
  ],
  "imageRecommendations": [
    {
      "label": "Featured Image | Photo 1 | Photo 2 | Photo 3 | Photo 4 | Photo 5",
      "photoType": "one clear photo type only",
      "placement": "string",
      "filename": "string",
      "title": "string",
      "altText": "string",
      "caption": "string",
      "description": "string",
      "needsHumanReview": false
    }
  ]
}

Topic selection:
- Title: ${topic.title}
- Focus keyphrase: ${topic.focus_keyphrase || packageSkeleton.focusKeyphrase}
- Search intent: ${topic.search_intent || packageSkeleton.searchIntent}
- Business value: ${topic.business_value || packageSkeleton.businessValue}
- Internal link opportunity: ${topic.internal_link_opportunity || ""}
- Customer pain point: ${topic.customer_pain_point || ""}

Required writing rules:
- Word count target must stay in the 1,400-1,600 word range.
- SEO focus is swimming pool leak detection.
- Gutenberg-ready and Yoast-ready.
- Casual, friendly, informative Aquatrace voice.
- Clear H2 and H3 headings.
- No fake claims.
- No unsupported legal, compliance, or pricing claims.
- No competitor links.
- Default public author is Chris Sears.
- Primary category is Swimming Pool Leak Detection.
- Add only one optional secondary category.
- Prioritize Aquatrace internal links over external links.
- Every image recommendation must describe one clear photo type only.
- If image content would be uncertain, set needsHumanReview to true.
- Do not publish or schedule anything.

Aquatrace knowledge context:
${library.knowledge.text}

Claims boundaries:
${library.claimsBoundaries.text}

Internal link map:
${library.internalLinkMap.text}

Photo guide:
${library.photoGuide.text}

Case study notes:
${library.caseStudyLibrary.text}

Return JSON only.`;
}

function safeJsonParse(raw) {
  const source = String(raw || "");
  const fenced = source.match(/```json\s*([\s\S]*?)```/i);
  return JSON.parse((fenced ? fenced[1] : source).trim());
}

export async function maybeGenerateBragiArticlePackage({
  topicOverride,
  dryRun = true,
  anthropicApiKey = process.env.ANTHROPIC_API_KEY,
} = {}) {
  const library = loadAquatraceBragiLibrary();
  const topic = selectBragiTopic({ topicOverride, library });
  const packageSkeleton = buildBragiPackageSkeleton({ topic, library });

  if (dryRun || !anthropicApiKey) {
    return {
      mode: dryRun ? "dry-run" : "skeleton-only",
      topic,
      package: packageSkeleton,
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_TEXT_MODEL,
      max_tokens: 4000,
      system: "You write clear, trustworthy Aquatrace article packages and return strict JSON only.",
      messages: [{ role: "user", content: buildAnthropicPrompt({ topic, packageSkeleton, library }) }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `Anthropic request failed with status ${response.status}.`);
  }

  const rawText = data?.content?.map((item) => item.text || "").join("\n") || "";
  return {
    mode: "generated",
    topic,
    package: {
      ...packageSkeleton,
      ...safeJsonParse(rawText),
    },
  };
}

export function buildBragiNotificationEmail({ articlePackage, draftResult }) {
  const safePackage = articlePackage || {};
  const safeDraft = draftResult || {};
  const draftUrl = safeDraft.draftUrl || safeDraft.link || "";
  const postId = safeDraft.postId || safeDraft.wordpress?.id || "";
  const internalLinksApplied = safePackage.internalLinksApplied || [];
  const internalLinksRecommended = safePackage.internalLinksRecommended || [];
  const imageRecommendations = safePackage.imageRecommendations || [];
  const articleTitle = safeOperationalEmailLine(
    safePackage.title || safeDraft.wordpress?.title || "Aquatrace Draft",
    "Aquatrace Draft"
  );
  const status = safeDraft.wordpress?.status || "draft";
  const reviewContext = safeOperationalEmailLine(
    safePackage.summary || safePackage.whyTopicChosen || safePackage.excerpt,
    "No extra review context was provided."
  );
  const subject = `Aquatrace Article Review Package - ${articleTitle}`;
  const body = [
    `Draft URL: ${safeOperationalEmailLine(draftUrl, "not available")}`,
    `Post ID: ${safeOperationalEmailLine(postId, "not available")}`,
    `WordPress status: ${status}`,
    `Published: ${status === "publish" ? "yes" : "no"}`,
    `Scheduled: ${status === "future" ? "yes" : "no"}`,
    "",
    `Article title: ${articleTitle}`,
    "",
    "Internal linking recommendations",
    ...formatNumberedLinkRecommendations(internalLinksRecommended.length ? internalLinksRecommended : internalLinksApplied),
    "",
    "Photo and image recommendations",
    ...formatNumberedImageRecommendations(imageRecommendations),
    "",
    `Review context: ${reviewContext}`,
    "",
    "Final status: Ready for Chris review - not published",
  ].join("\n");

  return {
    subject: safeOperationalEmailLine(subject, "Aquatrace Article Review Package - Aquatrace Draft"),
    body: normalizeOperationalEmailValue(body),
  };
}

function normalizeOperationalEmailValue(value) {
  return String(value || "")
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/â€‹/g, "")
    .replace(/â€™|’/g, "'")
    .replace(/â€œ|â€|“|”/g, '"')
    .replace(/â€”|â€“|—|–/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/Â/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeOperationalEmailLine(value, fallback = "not provided") {
  const cleaned = normalizeOperationalEmailValue(value);
  return cleaned || fallback;
}

function formatNumberedLinkRecommendations(items) {
  if (!items.length) {
    return ["1. Anchor text: not provided", "   URL: not provided", "   Why: no internal links were listed"];
  }

  return items.flatMap((item, index) => [
    `${index + 1}. Anchor text: ${safeOperationalEmailLine(item.anchorText || item.title)}`,
    `   URL: ${safeOperationalEmailLine(item.url)}`,
    `   Why: ${safeOperationalEmailLine(item.reason)}`,
  ]);
}

function formatNumberedImageRecommendations(items) {
  if (!items.length) {
    return [
      "1. Filename: not provided",
      "   Title: not provided",
      "   Alt text: not provided",
      "   Caption: not provided",
      "   Description: not provided",
      "   Placement: not provided",
    ];
  }

  return items.flatMap((item, index) => [
    `${index + 1}. Filename: ${safeOperationalEmailLine(item.filename)}`,
    `   Title: ${safeOperationalEmailLine(item.title)}`,
    `   Alt text: ${safeOperationalEmailLine(item.altText)}`,
    `   Caption: ${safeOperationalEmailLine(item.caption)}`,
    `   Description: ${safeOperationalEmailLine(item.description)}`,
    `   Placement: ${safeOperationalEmailLine(item.placement)}`,
  ]);
}

export function buildCompanyCamDropboxDryRun(project) {
  const updatedAt = project?.updated_at ? new Date(project.updated_at * 1000) : new Date();
  const year = String(updatedAt.getFullYear());
  const monthNumber = String(updatedAt.getMonth() + 1).padStart(2, "0");
  const monthLabel = updatedAt.toLocaleString("en-US", { month: "long" });
  const customerFolderName = sanitizeFolderSegment(project?.name || "Needs Manual Review");
  const basePath = join(
    "C:/Users/Peyto/Dropbox/Business/Aquatrace LLC/Aquatrace/Customers",
    year,
    `${monthNumber} - ${monthLabel}`,
    customerFolderName
  );

  return {
    projectId: project?.id || null,
    projectName: project?.name || "Unknown Project",
    proposedDropboxTargetPath: basePath,
    subfolders: ["CompanyCam Photos", "CompanyCam Reports", "CompanyCam Metadata"],
    manualReviewNeeded: !project?.name,
  };
}

function sanitizeFolderSegment(value) {
  return String(value || "Needs Manual Review")
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim()
    .slice(0, 80) || "Needs Manual Review";
}
