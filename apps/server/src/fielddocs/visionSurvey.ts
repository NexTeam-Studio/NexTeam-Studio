import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Media } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import type { MediaRepository } from "./mediaRepository.js";

export const visionEvidenceTierSchema = z.enum(["VISIBLE", "SUGGESTS", "INSUFFICIENT"]);
export const visionComponentSchema = z.enum([
  "skimmer",
  "return",
  "light",
  "drain",
  "plumbing",
  "pad",
  "surface",
  "unknown"
]);
export const visionConditionSchema = z.enum([
  "normal",
  "crack",
  "gap",
  "stain",
  "active_leak",
  "repair",
  "unknown"
]);
export const visionRelevanceSchema = z.enum(["high", "medium", "low", "unknown"]);
export const visionReportUsefulnessSchema = z.enum(["report_ready", "needs_context", "not_useful", "unknown"]);
export const visionSurfaceSchema = z.enum(["plaster", "vinyl", "fiberglass", "tile", "concrete", "unknown"]);

export const AQUATRACE_VISION_TAG_TAXONOMY = {
  components: [
    "component:skimmer",
    "component:return",
    "component:light",
    "component:drain",
    "component:plumbing",
    "component:pad",
    "component:surface",
    "component:unknown"
  ],
  evidence: [
    "evidence:visible",
    "evidence:suggests",
    "evidence:insufficient"
  ],
  conditions: [
    "condition:normal",
    "condition:crack",
    "condition:gap",
    "condition:stain",
    "condition:active_leak",
    "condition:repair",
    "condition:unknown"
  ],
  surfaces: [
    "surface:plaster",
    "surface:vinyl",
    "surface:fiberglass",
    "surface:tile",
    "surface:concrete",
    "surface:unknown"
  ],
  usefulness: [
    "report:ready",
    "report:needs_context",
    "report:not_useful",
    "review:needs_human_label",
    "review:human_confirmed"
  ]
} as const;

export const visionSurveyBatchInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  folderRef: z.string().min(1).optional(),
  mediaIds: z.array(z.string().min(1)).optional(),
  maxPhotos: z.coerce.number().int().min(1).max(100).default(25),
  budgetCapUsd: z.coerce.number().min(0).default(5),
  dryRun: z.boolean().default(false)
}).refine((value) => value.folderRef || (value.mediaIds && value.mediaIds.length > 0), {
  message: "Provide folderRef or mediaIds for a vision survey batch."
});

export const visionSurveyCorrectionInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  mediaId: z.string().min(1),
  component: visionComponentSchema.optional(),
  evidenceTier: visionEvidenceTierSchema.optional(),
  condition: visionConditionSchema.optional(),
  note: z.string().min(1).max(1000).optional(),
  tags: z.array(z.string().min(1)).default([])
});

export interface VisionSurveyCostEstimate {
  estimatedCostUsd: number;
  capUsd: number;
  exceedsCap: boolean;
  perPhotoUsd: number;
}

export interface VisionSurveyReview {
  mediaId: string;
  storageRef: string;
  component: z.infer<typeof visionComponentSchema>;
  poolSurfaceType: z.infer<typeof visionSurfaceSchema>;
  condition: z.infer<typeof visionConditionSchema>;
  leakRelevance: z.infer<typeof visionRelevanceSchema>;
  reportUsefulness: z.infer<typeof visionReportUsefulnessSchema>;
  evidenceTier: z.infer<typeof visionEvidenceTierSchema>;
  confidence: number;
  reason: string;
  tags: string[];
}

export interface VisionSurveyBatchResult {
  batchId: string;
  tenantId: string;
  folderRef: string | null;
  status: "reviewed" | "blocked_budget" | "empty";
  photoCount: number;
  costEstimate: VisionSurveyCostEstimate;
  reviews: VisionSurveyReview[];
  lowConfidencePrompts: string[];
  updatedMediaIds: string[];
  taxonomy: typeof AQUATRACE_VISION_TAG_TAXONOMY;
}

const PER_PHOTO_ESTIMATE_USD = 0.018;

function normalizedText(media: Media): string {
  return [
    media.storageRef,
    media.thumbRef ?? "",
    media.aiCaption ?? "",
    media.capturedBy ?? "",
    media.jobId ?? "",
    media.propertyId ?? "",
    media.externalIds?.companycam ?? "",
    ...media.aiTags
  ].join(" ").toLowerCase();
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function detectComponent(text: string): VisionSurveyReview["component"] {
  if (hasAny(text, ["skimmer", "skim rail", "skim-rail", "equalizer"])) return "skimmer";
  if (hasAny(text, ["return", "wall return", "floor return", "jet"])) return "return";
  if (hasAny(text, ["light", "niche"])) return "light";
  if (hasAny(text, ["main drain", "drain cover", "drain"])) return "drain";
  if (hasAny(text, ["plumbing", "pipe", "line", "pressure test", "suction", "return line"])) return "plumbing";
  if (hasAny(text, ["pad", "pump", "filter", "heater", "equipment"])) return "pad";
  if (hasAny(text, ["shell", "surface", "plaster", "vinyl", "fiberglass", "tile", "coping"])) return "surface";
  return "unknown";
}

function detectSurface(text: string): VisionSurveyReview["poolSurfaceType"] {
  if (text.includes("plaster")) return "plaster";
  if (text.includes("vinyl")) return "vinyl";
  if (text.includes("fiberglass")) return "fiberglass";
  if (text.includes("tile")) return "tile";
  if (text.includes("concrete")) return "concrete";
  return "unknown";
}

function detectCondition(text: string): VisionSurveyReview["condition"] {
  if (hasAny(text, ["active leak", "dye", "water loss", "leaking", "leak found"])) return "active_leak";
  if (hasAny(text, ["crack", "split", "fracture"])) return "crack";
  if (hasAny(text, ["gap", "void", "separation"])) return "gap";
  if (hasAny(text, ["stain", "rust", "discolor"])) return "stain";
  if (hasAny(text, ["repair", "patched", "sealed", "after"])) return "repair";
  if (hasAny(text, ["normal", "ok", "pass"])) return "normal";
  return "unknown";
}

function evidenceTier(media: Media, text: string, component: VisionSurveyReview["component"]): { tier: VisionSurveyReview["evidenceTier"]; confidence: number; reason: string } {
  const hasCaption = Boolean(media.aiCaption?.trim());
  const hasTags = media.aiTags.length > 0;
  if (component === "unknown" && !hasCaption && !hasTags) {
    return {
      tier: "INSUFFICIENT",
      confidence: 0.25,
      reason: "No caption, tags, or recognizable component wording were available."
    };
  }
  if (hasCaption || hasTags) {
    return {
      tier: component === "unknown" ? "SUGGESTS" : "VISIBLE",
      confidence: component === "unknown" ? 0.55 : 0.82,
      reason: "Existing caption/tags provide review signal."
    };
  }
  if (component !== "unknown" || hasAny(text, ["photo", "image", "pool"])) {
    return {
      tier: "SUGGESTS",
      confidence: 0.52,
      reason: "Only filename/storage metadata suggests the content."
    };
  }
  return {
    tier: "INSUFFICIENT",
    confidence: 0.25,
    reason: "No reliable visual or metadata signal was available."
  };
}

function leakRelevance(component: VisionSurveyReview["component"], condition: VisionSurveyReview["condition"], tier: VisionSurveyReview["evidenceTier"]): VisionSurveyReview["leakRelevance"] {
  if (tier === "INSUFFICIENT") return "unknown";
  if (condition === "active_leak") return "high";
  if (["skimmer", "return", "light", "drain", "plumbing"].includes(component)) return "high";
  if (["pad", "surface"].includes(component)) return "medium";
  return "low";
}

function reportUsefulness(tier: VisionSurveyReview["evidenceTier"], confidence: number): VisionSurveyReview["reportUsefulness"] {
  if (tier === "VISIBLE" && confidence >= 0.7) return "report_ready";
  if (tier === "SUGGESTS" || tier === "INSUFFICIENT") return "needs_context";
  return "unknown";
}

function tagFor(prefix: string, value: string): string {
  return `${prefix}:${value.toLowerCase()}`;
}

function confidenceBucket(confidence: number): string {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function estimateVisionSurveyCost(photoCount: number, capUsd = 5, perPhotoUsd = PER_PHOTO_ESTIMATE_USD): VisionSurveyCostEstimate {
  const estimatedCostUsd = Number((photoCount * perPhotoUsd).toFixed(4));
  return {
    estimatedCostUsd,
    capUsd,
    exceedsCap: estimatedCostUsd > capUsd,
    perPhotoUsd
  };
}

export function reviewMediaMetadata(media: Media): VisionSurveyReview {
  const text = normalizedText(media);
  const component = detectComponent(text);
  const surface = detectSurface(text);
  const condition = detectCondition(text);
  const evidence = evidenceTier(media, text, component);
  const relevance = leakRelevance(component, condition, evidence.tier);
  const usefulness = reportUsefulness(evidence.tier, evidence.confidence);
  const tags = unique([
    tagFor("vision:component", component),
    tagFor("vision:evidence", evidence.tier),
    tagFor("vision:confidence", confidenceBucket(evidence.confidence)),
    tagFor("vision:condition", condition),
    tagFor("vision:surface", surface),
    tagFor("vision:leak_relevance", relevance),
    usefulness === "report_ready" ? "vision:report_ready" : "",
    usefulness === "needs_context" ? "vision:needs_context" : "",
    evidence.tier === "INSUFFICIENT" || evidence.confidence < 0.5 ? "vision:needs_human_label" : ""
  ]);

  return {
    mediaId: media.id,
    storageRef: media.storageRef,
    component,
    poolSurfaceType: surface,
    condition,
    leakRelevance: relevance,
    reportUsefulness: usefulness,
    evidenceTier: evidence.tier,
    confidence: evidence.confidence,
    reason: evidence.reason,
    tags
  };
}

function matchesFolder(media: Media, folderRef: string | undefined): boolean {
  if (!folderRef) return true;
  const needle = folderRef.toLowerCase();
  return [
    media.id,
    media.jobId ?? "",
    media.propertyId ?? "",
    media.storageRef,
    media.externalIds?.companycam ?? ""
  ].some((value) => value.toLowerCase().includes(needle));
}

function photoBatch(records: Media[], input: z.infer<typeof visionSurveyBatchInputSchema>): Media[] {
  const ids = new Set(input.mediaIds ?? []);
  return records
    .filter((media) => media.type === "photo")
    .filter((media) => ids.size > 0 ? ids.has(media.id) : matchesFolder(media, input.folderRef))
    .slice(0, input.maxPhotos);
}

function lowConfidencePrompt(review: VisionSurveyReview): string {
  return `What was this photo? ${review.mediaId} (${review.storageRef}) was marked ${review.evidenceTier.toLowerCase()} at ${Math.round(review.confidence * 100)}% confidence.`;
}

export async function runVisionSurveyBatch(
  repository: MediaRepository,
  tenantId: string,
  rawInput: z.input<typeof visionSurveyBatchInputSchema>
): Promise<VisionSurveyBatchResult> {
  const input = visionSurveyBatchInputSchema.parse(rawInput);
  const records = await repository.listMedia(tenantId);
  const photos = photoBatch(records, input);
  const costEstimate = estimateVisionSurveyCost(photos.length, input.budgetCapUsd);
  const batchId = `vision_survey_${randomUUID()}`;

  if (photos.length === 0) {
    return {
      batchId,
      tenantId,
      folderRef: input.folderRef ?? null,
      status: "empty",
      photoCount: 0,
      costEstimate,
      reviews: [],
      lowConfidencePrompts: [],
      updatedMediaIds: [],
      taxonomy: AQUATRACE_VISION_TAG_TAXONOMY
    };
  }

  const reviews = photos.map(reviewMediaMetadata);
  const lowConfidencePrompts = reviews
    .filter((review) => review.evidenceTier === "INSUFFICIENT" || review.confidence < 0.5)
    .map(lowConfidencePrompt);

  if (costEstimate.exceedsCap) {
    return {
      batchId,
      tenantId,
      folderRef: input.folderRef ?? null,
      status: "blocked_budget",
      photoCount: photos.length,
      costEstimate,
      reviews,
      lowConfidencePrompts,
      updatedMediaIds: [],
      taxonomy: AQUATRACE_VISION_TAG_TAXONOMY
    };
  }

  const updatedMediaIds: string[] = [];
  if (!input.dryRun) {
    for (const media of photos) {
      const review = reviews.find((candidate) => candidate.mediaId === media.id);
      if (!review) continue;
      await repository.updateMedia(media.id, {
        aiTags: unique([...media.aiTags, ...review.tags])
      });
      updatedMediaIds.push(media.id);
    }
  }

  return {
    batchId,
    tenantId,
    folderRef: input.folderRef ?? null,
    status: "reviewed",
    photoCount: photos.length,
    costEstimate,
    reviews,
    lowConfidencePrompts,
    updatedMediaIds,
    taxonomy: AQUATRACE_VISION_TAG_TAXONOMY
  };
}

export async function applyVisionSurveyCorrection(
  repository: MediaRepository,
  tenantId: string,
  rawInput: z.input<typeof visionSurveyCorrectionInputSchema>
): Promise<Media> {
  const input = visionSurveyCorrectionInputSchema.parse(rawInput);
  const media = await repository.getMedia(tenantId, input.mediaId);
  if (!media) {
    throw new RailError(`Native media ${input.mediaId} was not found.`, { provider: "native", op: "visionSurveyCorrection", status: 404 });
  }
  const correctionTags = unique([
    "vision:human_confirmed",
    input.component ? tagFor("human:component", input.component) : "",
    input.evidenceTier ? tagFor("human:evidence", input.evidenceTier) : "",
    input.condition ? tagFor("human:condition", input.condition) : "",
    ...input.tags.map((tag) => `human:${tag}`)
  ]);
  const note = input.note ? `Human correction: ${input.note}` : media.aiCaption;
  return repository.updateMedia(media.id, {
    aiCaption: note,
    aiTags: unique([...media.aiTags, ...correctionTags])
  });
}
