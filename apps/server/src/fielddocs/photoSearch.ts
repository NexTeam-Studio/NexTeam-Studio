import type { Media } from "@nexteam/core";
import { maybeRunVision } from "./visionPipeline.js";

export interface PhotoSearchHit {
  media: Media;
  score: number;
  matched: string[];
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function haystack(media: Media): string[] {
  return [
    media.id,
    media.jobId,
    media.propertyId,
    media.storageRef,
    media.aiCaption,
    media.externalIds?.companycam,
    ...media.aiTags
  ].filter((value): value is string => Boolean(value));
}

export function searchMediaByMetadata(media: Media[], query: string, limit = 10): PhotoSearchHit[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) {
    return [];
  }
  return media
    .map((item) => {
      const fields = haystack(item).map((field) => field.toLowerCase());
      const matched = queryTokens.filter((token) => fields.some((field) => field.includes(token)));
      return { media: item, score: matched.length, matched };
    })
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function searchMediaWithVisionFallback(media: Media[], query: string, limit = 10, env: NodeJS.ProcessEnv = process.env): Promise<PhotoSearchHit[]> {
  const metadataHits = searchMediaByMetadata(media, query, limit);
  if (metadataHits.length > 0) {
    return metadataHits;
  }
  const enriched = await Promise.all(media.slice(0, limit).map(async (item) => (await maybeRunVision(item, env)).media));
  return searchMediaByMetadata(enriched, query, limit);
}

export interface BeforeAfterPair {
  jobId: string;
  before: Media;
  after: Media;
}

export function pairBeforeAfter(media: Media[]): BeforeAfterPair[] {
  const byJob = new Map<string, Media[]>();
  for (const item of media) {
    if (!item.jobId) {
      continue;
    }
    byJob.set(item.jobId, [...(byJob.get(item.jobId) ?? []), item]);
  }
  const pairs: BeforeAfterPair[] = [];
  for (const [jobId, items] of byJob.entries()) {
    const before = items.find((item) => item.aiTags.some((tag) => tag.toLowerCase() === "before"));
    const after = items.find((item) => item.aiTags.some((tag) => tag.toLowerCase() === "after"));
    if (before && after) {
      pairs.push({ jobId, before, after });
    }
  }
  return pairs;
}
