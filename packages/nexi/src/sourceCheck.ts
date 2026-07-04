import type { Source } from "@nexteam/core";

const FACTUAL_RAIL_WORDS = [
  "job",
  "client",
  "photo",
  "project",
  "schedule",
  "invoice",
  "quote",
  "technician",
  "gallons",
  "address"
];

export interface SourceCheckResult {
  ok: boolean;
  answer: string;
  failureReason?: string;
}

export function answerMentionsFactualRailData(answer: string): boolean {
  const lower = answer.toLowerCase();
  return FACTUAL_RAIL_WORDS.some((word) => lower.includes(word));
}

export function enforceSources(answer: string, sources: Source[]): SourceCheckResult {
  if (answerMentionsFactualRailData(answer) && sources.length === 0) {
    return {
      ok: false,
      answer: "I don't have a verified source for that yet.",
      failureReason: "factual_answer_without_sources"
    };
  }
  return { ok: true, answer };
}

