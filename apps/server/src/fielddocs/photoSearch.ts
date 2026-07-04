import type { Media } from "@nexteam/core";

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
