/**
 * Njord Intent Classifier
 *
 * Deterministic natural-language classification for Mission Control chat.
 * This intentionally stays rule-based so routing remains predictable even when
 * the live Anthropic lane is unavailable or rate-limited.
 */

const INTENT_RULES = [
  {
    intent: "validation",
    patterns: [/\bverify\b/i, /\bconfirm\b/i, /\bvalid\b/i, /\bdouble-check\b/i],
    weight: 4,
  },
  {
    intent: "routing",
    patterns: [/\broute\b/i, /\bassign\b/i, /\bforward\b/i, /\bsend to\b/i],
    weight: 4,
  },
  {
    intent: "campaign",
    patterns: [/\bcampaign\b/i, /\boutreach\b/i, /\bsequence\b/i, /\bblast\b/i],
    weight: 5,
  },
  {
    intent: "email-send",
    patterns: [/\bsend (an )?email\b/i, /\bdeliver\b/i, /\bdispatch email\b/i],
    weight: 5,
  },
  {
    intent: "follow-up",
    patterns: [/\bfollow up\b/i, /\bfollow-up\b/i, /\bremind\b/i, /\bnudge\b/i, /\bcheck back\b/i],
    weight: 5,
  },
  {
    intent: "lookup",
    patterns: [/\bwho(?:'s| is)\b/i, /\blook up\b/i, /\bfind\b/i, /\bshow me\b/i, /\bstatus on\b/i],
    weight: 5,
  },
  {
    intent: "record-fetch",
    patterns: [/\breport\b/i, /\bchecklist\b/i, /\bpdf\b/i, /\bpull the gallons\b/i, /\bextract\b/i, /\bread\b/i],
    weight: 6,
  },
  {
    intent: "research",
    patterns: [/\bresearch\b/i, /\binvestigate\b/i, /\bbackground\b/i, /\bhistory\b/i],
    weight: 4,
  },
  {
    intent: "relationship",
    patterns: [/\brelationship\b/i, /\breferral\b/i, /\breview\b/i, /\bthank\b/i],
    weight: 4,
  },
  {
    intent: "sentiment",
    patterns: [/\bupset\b/i, /\bangry\b/i, /\bfrustrated\b/i, /\bfeel about\b/i, /\bsentiment\b/i],
    weight: 5,
  },
  {
    intent: "nurture",
    patterns: [/\bstay in touch\b/i, /\bwarm\b/i, /\bnurture\b/i, /\bkeep them warm\b/i],
    weight: 4,
  },
  {
    intent: "content",
    patterns: [/\bwrite\b/i, /\bdraft\b/i, /\barticle\b/i, /\bpost\b/i, /\bseo\b/i],
    weight: 5,
  },
  {
    intent: "subject-line",
    patterns: [/\bsubject line\b/i, /\bheadline\b/i, /\btitle idea\b/i],
    weight: 6,
  },
  {
    intent: "message-draft",
    patterns: [/\bdraft (an )?email\b/i, /\bcompose\b/i, /\bwrite (a )?message\b/i],
    weight: 6,
  },
  {
    intent: "intake",
    patterns: [/\bnew client\b/i, /\bsign up\b/i, /\bonboard\b/i, /\bregister\b/i, /\bnew contact\b/i],
    weight: 4,
  },
];

function normalizeText(value = "") {
  return String(value || "").trim();
}

function scoreIntent(rule, input) {
  return rule.patterns.reduce((score, pattern) => score + (pattern.test(input) ? rule.weight : 0), 0);
}

function confidenceFromScores(primaryScore, secondaryScore) {
  if (primaryScore <= 0) {
    return 0.5;
  }
  const gap = Math.max(primaryScore - secondaryScore, 0);
  if (gap >= 6) {
    return 0.96;
  }
  if (gap >= 3) {
    return 0.84;
  }
  return 0.7;
}

/**
 * @typedef {Object} ClassificationResult
 * @property {string} intent
 * @property {number} confidence
 * @property {string[]} candidates
 * @property {string} method
 */

/**
 * Classifies an input string into the most likely intent tag.
 *
 * @param {string} input
 * @returns {ClassificationResult}
 */
export function classifyIntent(input) {
  const normalized = normalizeText(input).toLowerCase();
  if (!normalized) {
    return {
      intent: "intake",
      confidence: 0.5,
      candidates: ["intake"],
      method: "rule-based",
    };
  }

  const scored = INTENT_RULES.map((rule) => ({
    intent: rule.intent,
    score: scoreIntent(rule, normalized),
  }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) {
    return {
      intent: "intake",
      confidence: 0.5,
      candidates: ["intake"],
      method: "rule-based",
    };
  }

  return {
    intent: scored[0].intent,
    confidence: confidenceFromScores(scored[0].score, scored[1]?.score || 0),
    candidates: scored.map((entry) => entry.intent),
    method: "rule-based",
  };
}

export const njordIntentClassifierInternals = {
  INTENT_RULES,
  confidenceFromScores,
  normalizeText,
  scoreIntent,
};
