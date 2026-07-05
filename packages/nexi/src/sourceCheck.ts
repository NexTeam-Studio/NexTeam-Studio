import type { Source } from "@nexteam/core";

const FACTUAL_RAIL_WORDS = [
  "job",
  "client",
  "photo",
  "project",
  "schedule",
  "invoice",
  "quote",
  "email",
  "inbox",
  "reply",
  "technician",
  "gallons",
  "address"
];

const META_PROMPT_PATTERNS = [
  /\bwhat\s+sources?\s+do\s+you\s+use\b/i,
  /\bwhat\s+(?:tools?|rails?|systems?)\s+do\s+you\s+use\b/i,
  /\bhow\s+do\s+you\s+(?:get|pull|verify|use)\s+(?:data|sources?|information)\b/i,
  /\bwhat\s+can\s+you\s+(?:access|see|check|do)\b/i
];

const FEEDBACK_PROMPT_PATTERNS = [
  /\b(?:wrong answer|wrong|incorrect|not correct|somewhat correct|correction|you'?re incorrect|you are incorrect)\b/i,
  /\b(?:bug|ui|thumbnail|thumbnails|clickable|savable|saveable|tap|tappable)\b/i
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

export function promptIsMetaOrFeedback(prompt: string): boolean {
  const normalized = prompt.trim();
  return [...META_PROMPT_PATTERNS, ...FEEDBACK_PROMPT_PATTERNS].some((pattern) => pattern.test(normalized));
}

export function enforceSources(answer: string, sources: Source[], userPrompt = ""): SourceCheckResult {
  if (
    !promptIsMetaOrFeedback(userPrompt)
    && answerMentionsFactualRailData(answer)
    && sources.length === 0
  ) {
    return {
      ok: false,
      answer: "I don't have a verified source for that yet.",
      failureReason: "factual_answer_without_sources"
    };
  }
  return { ok: true, answer };
}

