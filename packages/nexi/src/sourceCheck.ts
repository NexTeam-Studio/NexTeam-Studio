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
  /\b(?:bug|ui|thumbnail|thumbnails|clickable|savable|saveable|tap|tappable)\b/i,
  /\b(?:formatting feedback|response format|answer format|format should|format needs|too verbose|minimal ids?|sender\s*\+\s*subject|scannable)\b/i
];

const ACTION_PROMPT_PATTERNS = [
  /\b(?:send|draft|compose|write)\s+(?:an?\s+)?email\b/i,
  /\bemail\s+[\w.+-]+@[\w.-]+\.\w+\s+(?:saying|that|to say)\b/i
];

const HONEST_FAILURE_PATTERNS = [
  /\b(?:i\s+)?(?:couldn'?t|could not|can'?t|cannot|wasn'?t able to|am not able to)\s+(?:read|reach|access|verify|pull|check|search|open)\b/i,
  /\b(?:tool|email rail|gmail rail|provider)\s+(?:failed|returned an error|did not return|could not return)\b/i,
  /\b(?:no verified|not verified|without a verified source|no matching source|no matching email)\b/i
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

export function promptIsActionRequest(prompt: string): boolean {
  const normalized = prompt.trim();
  return ACTION_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function answerIsHonestFailure(answer: string): boolean {
  const normalized = answer.trim();
  return HONEST_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function enforceSources(answer: string, sources: Source[], userPrompt = ""): SourceCheckResult {
  if (
    !promptIsMetaOrFeedback(userPrompt)
    && !promptIsActionRequest(userPrompt)
    && !answerIsHonestFailure(answer)
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

