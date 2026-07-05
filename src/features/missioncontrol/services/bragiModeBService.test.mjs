import test from "node:test";
import assert from "node:assert/strict";
import { bragiModeBServiceInternals } from "./bragiModeBService.js";
import { selectBestCompanyCamPhoto } from "./bragiModeBPhotoSelector.js";
import { getBragiModeBClientConfig, normalizeBragiModeBLocation } from "./bragiModeBClientConfig.js";
import { bragiModeBArticleGeneratorInternals } from "./bragiModeBArticleGenerator.js";
import { bragiModeBGuardrailInternals, validateBragiModeBArticle } from "./bragiModeBGuardrails.js";
import {
  buildBragiModeBPendingPhotoCatalogEntry,
  buildBragiModeBPhotoMatchPlan,
  buildBragiModeBPhotoQuery,
  createEmptyBragiModeBPhotoCatalog,
  markBragiModeBPhotoCatalogEntryAnalyzed,
  needsBragiModeBPhotoAnalysis,
  queryBragiModeBPhotoCatalog,
} from "./bragiModeBPhotoCatalog.js";

const config = getBragiModeBClientConfig("aquatrace");
const location = normalizeBragiModeBLocation("Charleston SC", config);

const sampleArticlePackage = {
  title: "Charleston, SC Pool Leak Detection Before You Chase the Wrong Fix",
  slug: "charleston-sc-pool-leak-detection-before-you-chase-the-wrong-fix",
  excerpt: "Aquatrace helps Charleston pool owners sort out suspicious water loss before money goes to the wrong repair path.",
  focusKeyword: "Charleston pool leak detection",
  seoTitle: "Charleston Pool Leak Detection | Aquatrace",
  metaDescription: "Charleston pool leak detection gets easier when Aquatrace helps homeowners sort suspicious water loss before the wrong repair spend starts.",
  socialTitle: "Charleston Pool Leak Detection | Aquatrace",
  socialDescription: "Charleston pool leak detection advice from Aquatrace for homeowners trying to separate suspicious water loss from the wrong repair guess.",
  imageMeta: {
    filename: "charleston-pool-leak-detection-underwater-inspection.jpg",
    title: "Charleston pool leak detection underwater inspection",
    altText: "Charleston pool leak detection underwater inspection near a light niche",
    caption: "Underwater documentation helps Aquatrace confirm what is really happening.",
    description: "Aquatrace underwater inspection photo for Charleston pool leak detection content.",
  },
  contentHtml: [
    "<h1>Charleston, SC Pool Leak Detection Before You Chase the Wrong Fix</h1>",
    "<p>Charleston pool leak detection questions usually start when the water line drops and the easy answer feels too convenient.</p>",
    "<h2>Why Water Loss Gets Expensive Fast</h2>",
    "<p>Diagnostics-first testing keeps pool owners from throwing money at the wrong repair theory.</p>",
    "<h2>What Charleston Pool Leak Detection Looks Like Underwater</h2>",
    "<p>Underwater inspection and documentation helps Aquatrace verify what is actually happening in the pool.</p>",
    "<h2>How Equipment-Pad Testing Fits In</h2>",
    "<p>Pressure testing and equipment-pad review help isolate plumbing-side problems.</p>",
    "<h2>When Commercial Operators Need Better Records</h2>",
    "<p>Commercial sites need cleaner documentation before bigger decisions are made.</p>",
    "<h2>Start With a Diagnostic Visit</h2>",
    "<p>Aquatrace stays in the diagnostic lane and gives pool owners a clearer next step. For a broader leak-waste reference, the <a href=\"https://www.epa.gov/watersense/fix-leak-week\">EPA WaterSense leak guidance</a> is useful too.</p>",
  ].join(""),
};

const samplePhotos = [
  {
    id: "photo-1",
    status: "active",
    processing_status: "processed",
    description: "Underwater inspection near a pool light niche in Charleston",
    creator_name: "Aquatrace",
    captured_at: Math.floor(Date.now() / 1000),
    coordinates: { lat: 32.78, lon: -79.94 },
  },
  {
    id: "photo-2",
    status: "active",
    processing_status: "processed",
    description: "Technician pressure testing pool plumbing at the equipment pad",
    creator_name: "Aquatrace",
    captured_at: Math.floor(Date.now() / 1000),
    coordinates: { lat: 32.79, lon: -79.93 },
  },
  {
    id: "photo-3",
    status: "active",
    processing_status: "processed",
    description: "Commercial pool technician documenting main drain cover markings underwater",
    creator_name: "Aquatrace",
    captured_at: Math.floor(Date.now() / 1000),
    coordinates: { lat: 32.77, lon: -79.92 },
  },
  {
    id: "photo-4",
    status: "active",
    processing_status: "processed",
    description: "Equipment pad overview showing valves and leak detection setup",
    creator_name: "Aquatrace",
    captured_at: Math.floor(Date.now() / 1000),
    coordinates: { lat: 32.775, lon: -79.93 },
  },
  {
    id: "photo-5",
    status: "active",
    processing_status: "processed",
    description: "Bucket test setup beside a residential pool in Charleston",
    creator_name: "Aquatrace",
    captured_at: Math.floor(Date.now() / 1000),
    coordinates: { lat: 32.776, lon: -79.931 },
  },
];

test("selectBestCompanyCamPhoto returns one featured photo and multiple distinct inline photos", async () => {
  const result = await selectBestCompanyCamPhoto({
    photos: samplePhotos,
    topic: "Charleston pool leak detection and underwater inspection",
    articlePackage: sampleArticlePackage,
    location,
    visionScorer: async () => ({
      sectionPlans: [
        { index: 0, heading: "What Charleston Pool Leak Detection Looks Like Underwater" },
        { index: 1, heading: "How Equipment-Pad Testing Fits In" },
        { index: 2, heading: "When Commercial Operators Need Better Records" },
      ],
      shortlisted: samplePhotos.map((photo, index) => ({
        photo,
        score: 100 - index,
        combinedText: String(photo.description || "").toLowerCase(),
      })),
      assessments: [
        {
          photoId: "photo-1",
          visibleSummary: "Underwater inspection around a pool light niche",
          articleFitScore: 96,
          featuredFitScore: 90,
          sectionFits: [{ heading: "What Charleston Pool Leak Detection Looks Like Underwater", score: 98 }],
        },
        {
          photoId: "photo-2",
          visibleSummary: "Technician pressure testing pool plumbing at the equipment pad",
          articleFitScore: 89,
          featuredFitScore: 60,
          sectionFits: [{ heading: "How Equipment-Pad Testing Fits In", score: 97 }],
        },
        {
          photoId: "photo-3",
          visibleSummary: "Commercial diver documenting main drain cover markings underwater",
          articleFitScore: 88,
          featuredFitScore: 75,
          sectionFits: [{ heading: "When Commercial Operators Need Better Records", score: 95 }],
        },
        {
          photoId: "photo-4",
          visibleSummary: "Equipment pad overview showing valves and testing setup",
          articleFitScore: 60,
          featuredFitScore: 40,
          sectionFits: [{ heading: "How Equipment-Pad Testing Fits In", score: 78 }],
        },
        {
          photoId: "photo-5",
          visibleSummary: "Bucket test setup beside a residential pool",
          articleFitScore: 55,
          featuredFitScore: 35,
          sectionFits: [{ heading: "Why Water Loss Gets Expensive Fast", score: 80 }],
        },
      ],
    }),
  });

  assert.ok(result.selected?.photo?.id);
  assert.ok(result.inlineSelections.length >= 2);
  const ids = new Set([result.selected.photo.id, ...result.inlineSelections.map((entry) => entry.photo.id)]);
  assert.equal(ids.size, 1 + result.inlineSelections.length);
  assert.ok(result.inlineSelections.every((entry) => entry.placementHeading));
  assert.equal(result.selected.photo.id, "photo-1");
});

test("injectInlineImagesIntoArticle places figures after selected sections", () => {
  const updatedHtml = bragiModeBServiceInternals.injectInlineImagesIntoArticle({
    contentHtml: sampleArticlePackage.contentHtml,
    inlineMedia: [
      {
        sectionHeading: "What Charleston Pool Leak Detection Looks Like Underwater",
        url: "https://example.com/underwater.jpg",
        altText: "Underwater inspection in Charleston",
        title: "Charleston underwater inspection",
        caption: "Underwater documentation helps verify what is real.",
      },
      {
        sectionHeading: "How Equipment-Pad Testing Fits In",
        url: "https://example.com/equipment-pad.jpg",
        altText: "Equipment pad testing in Charleston",
        title: "Charleston equipment pad testing",
        caption: "Equipment-pad diagnostics can narrow the problem faster.",
      },
    ],
  });

  const imgCount = (updatedHtml.match(/<img\b/gi) || []).length;
  assert.equal(imgCount, 2);
  assert.match(updatedHtml, /What Charleston Pool Leak Detection Looks Like Underwater[\s\S]*?<img\b[\s\S]*?underwater\.jpg/i);
  assert.match(updatedHtml, /How Equipment-Pad Testing Fits In[\s\S]*?<img\b[\s\S]*?equipment-pad\.jpg/i);
});

test("buildImageSeoMeta creates descriptive location-aware metadata", () => {
  const meta = bragiModeBServiceInternals.buildImageSeoMeta({
    photo: samplePhotos[2],
    articlePackage: sampleArticlePackage,
    location,
    topic: "Charleston pool leak detection and underwater inspection",
    sectionHeading: "What Charleston Pool Leak Detection Looks Like Underwater",
    role: "inline",
    index: 1,
    vision: {
      title: "Underwater main drain documentation",
      altText: "Commercial diver documenting main drain cover markings underwater",
      caption: "A diver documents main drain cover markings underwater before anyone guesses at the next step.",
      description: "Commercial diver documenting main drain cover markings underwater during leak diagnostics.",
      visibleSummary: "Commercial diver documenting main drain cover markings underwater",
    },
  });

  assert.match(meta.filename, /charleston-sc/i);
  assert.match(meta.altText, /main drain cover markings underwater/i);
  assert.match(meta.caption, /before anyone guesses/i);
});

test("validateBragiModeBArticle still rejects forced phone numbers", () => {
  const validation = validateBragiModeBArticle({
    articlePackage: {
      ...sampleArticlePackage,
      contentHtml: `${sampleArticlePackage.contentHtml}<p>Call 888-896-2782 today.</p>`,
    },
    topic: "Charleston pool leak detection",
    location,
    config,
  });

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /Phone number detected/i);
});

test("buildPrompt includes natural-location, readability, and SEO guardrails", () => {
  const prompt = bragiModeBArticleGeneratorInternals.buildPrompt({
    topic: "Charleston pool leak detection and underwater inspection",
    location,
    config,
    linkPlan: {
      internalLinks: config.internalLinks.slice(0, 3),
      externalLinks: config.externalLinks.slice(0, 1),
    },
    topicProfile: getBragiModeBClientConfig("aquatrace").topicProfiles.at(-1),
  });

  assert.match(prompt, /Reference the location naturally and sparingly/i);
  assert.match(prompt, /Avoid robotic exact-match phrasing/i);
  assert.match(prompt, /Do not start 3 consecutive sentences with the same word/i);
  assert.match(prompt, /featured image is also the social share image/i);
  assert.match(prompt, /The image alt text must include the focus keyword naturally/i);
  assert.match(prompt, /Yoast pixel limit/i);
});

test("analyzeReadability flags repeated starts and passive-heavy copy", () => {
  const readability = bragiModeBGuardrailInternals.analyzeReadability(
    "Leaks were found by technicians. Leaks were marked by technicians. Leaks were traced by technicians. Leaks were documented by technicians."
  );

  assert.ok(readability.repeatedStartViolations > 0);
  assert.ok(readability.passiveVoiceRatio > 0.1);
});

test("photo catalog query falls back from exact facets to broader subject matches", () => {
  const catalog = createEmptyBragiModeBPhotoCatalog();
  catalog.photos["photo-a"] = {
    photoId: "photo-a",
    facets: {
      subject: ["equipment-pad", "pressure-testing"],
      poolType: ["gunite"],
      attributes: ["wide-shot"],
      problemShown: ["equipment-failure"],
    },
    confidence: { overall: 82 },
  };
  catalog.photos["photo-b"] = {
    photoId: "photo-b",
    facets: {
      subject: ["equipment-pad", "pressure-testing"],
      poolType: ["unknown"],
      attributes: ["tight-closeup"],
      problemShown: ["unknown"],
    },
    confidence: { overall: 74 },
  };

  const query = buildBragiModeBPhotoQuery({
    topic: "equipment pad leak detection for a fiberglass pool",
    articlePackage: { title: "Equipment pad leak detection", focusKeyword: "pool leak detection" },
  });

  const plan = buildBragiModeBPhotoMatchPlan(query);
  assert.equal(plan[0].label, "exact-facet-match");

  const result = queryBragiModeBPhotoCatalog({ catalog, query, limit: 5 });
  assert.equal(result.strategy, "subject-only");
  assert.equal(result.matches[0].entry.photoId, "photo-a");
});

test("validateBragiModeBArticle rejects missing image metadata and overlong excerpts", () => {
  const validation = validateBragiModeBArticle({
    articlePackage: {
      ...sampleArticlePackage,
      excerpt: "Aquatrace helps Charleston pool owners sort out suspicious water loss before money goes to the wrong repair path, and this intentionally drags beyond the approved short excerpt limit so the guardrail has something real to reject.",
      imageMeta: {
        filename: "",
        title: "",
        altText: "",
        caption: "",
        description: "",
      },
    },
    topic: "Charleston pool leak detection",
    location,
    config,
  });

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /Primary image filename is empty/i);
  assert.match(validation.errors.join("\n"), /Excerpt is too long/i);
});

test("pending photo catalog entries stay out of matches until analysis is complete", () => {
  const catalog = createEmptyBragiModeBPhotoCatalog();
  const pending = buildBragiModeBPendingPhotoCatalogEntry({
    photo: {
      id: "photo-pending",
      project_id: "project-1",
      status: "active",
      description: "Equipment pad pressure test setup",
      captured_at: 1782510000,
      updated_at: 1782513600,
    },
    projectContext: {
      address: { city: "Charleston", state: "SC", postalCode: "29401", country: "US" },
      documentIds: ["doc-1"],
      derivedTags: ["equipment-pad", "pressure-testing"],
      reportSignals: ["pressure testing noted in checklist PDF"],
    },
  });

  assert.equal(needsBragiModeBPhotoAnalysis(pending), true);
  catalog.photos[pending.photoId] = pending;

  const query = buildBragiModeBPhotoQuery({
    topic: "equipment pad leak detection for a fiberglass pool",
    articlePackage: { title: "Equipment pad leak detection", focusKeyword: "pool leak detection" },
  });

  const noMatch = queryBragiModeBPhotoCatalog({ catalog, query, limit: 5 });
  assert.equal(noMatch.strategy, "no-match");

  catalog.photos[pending.photoId] = markBragiModeBPhotoCatalogEntryAnalyzed(pending, {
    facets: {
      subject: ["equipment-pad", "pressure-testing"],
      poolType: ["unknown"],
      attributes: ["wide-shot"],
      problemShown: ["equipment-failure"],
    },
    visibleSummary: "Equipment pad pressure testing setup",
    confidence: { overall: 78, subject: 82, poolType: 40, attributes: 68, problemShown: 70 },
    source: "vision",
    model: "not-run-in-test",
    promptVersion: "catalog-v2",
  });

  const readyMatch = queryBragiModeBPhotoCatalog({ catalog, query, limit: 5 });
  assert.equal(readyMatch.strategy, "subject-only");
  assert.equal(readyMatch.matches[0].entry.photoId, "photo-pending");
});
