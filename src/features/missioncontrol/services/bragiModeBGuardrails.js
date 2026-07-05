const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
const SENTENCE_SPLIT_PATTERN = /(?<=[.!?])\s+/;
const COMMON_FUNCTION_WORDS = new Set(["a", "an", "and", "but", "for", "if", "of", "or", "so", "the", "to"]);

function countSyllables(word) {
  const normalized = String(word || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!normalized) return 0;
  if (normalized.length <= 3) return 1;
  const stripped = normalized
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const matches = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function splitSentences(value) {
  return String(value || "")
    .split(SENTENCE_SPLIT_PATTERN)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9']+/g) || [];
}

function getSentenceLeadWord(sentence) {
  const words = tokenizeWords(sentence);
  return words.find((word) => !COMMON_FUNCTION_WORDS.has(word)) || words[0] || "";
}

function analyzeReadability(value) {
  const plainText = String(value || "");
  const sentences = splitSentences(plainText);
  const words = tokenizeWords(plainText);
  const totalWords = words.length;
  const totalSentences = sentences.length || 1;
  const syllableCount = words.reduce((total, word) => total + countSyllables(word), 0);
  const longSentenceCount = sentences.filter((sentence) => tokenizeWords(sentence).length > 20).length;
  const passiveSentenceCount = sentences.filter((sentence) =>
    /\b(am|is|are|was|were|be|been|being)\b\s+\w+(ed|en)\b/i.test(sentence)
  ).length;

  let repeatedStartRun = 1;
  let repeatedStartViolations = 0;
  let maxRepeatedStartRun = 1;
  let previousLeadWord = "";

  for (const sentence of sentences) {
    const leadWord = getSentenceLeadWord(sentence);
    if (leadWord && leadWord === previousLeadWord) {
      repeatedStartRun += 1;
    } else {
      repeatedStartRun = 1;
      previousLeadWord = leadWord;
    }
    maxRepeatedStartRun = Math.max(maxRepeatedStartRun, repeatedStartRun);
    if (repeatedStartRun >= 3) {
      repeatedStartViolations += 1;
    }
  }

  const fleschReadingEase = totalWords && totalSentences
    ? 206.835 - (1.015 * (totalWords / totalSentences)) - (84.6 * (syllableCount / totalWords))
    : 0;

  return {
    sentenceCount: sentences.length,
    wordCount: totalWords,
    longSentenceCount,
    longSentenceRatio: totalSentences ? longSentenceCount / totalSentences : 0,
    passiveSentenceCount,
    passiveVoiceRatio: totalSentences ? passiveSentenceCount / totalSentences : 0,
    repeatedStartViolations,
    maxRepeatedStartRun,
    fleschReadingEase,
  };
}

function estimateTitlePixelWidth(value) {
  const widths = {
    default: 9.2,
    narrow: 4.8,
    wide: 11.5,
    space: 4.2,
  };

  return [...String(value || "")].reduce((total, char) => {
    if (char === " ") return total + widths.space;
    if (/[iltfjrI1]/.test(char)) return total + widths.narrow;
    if (/[A-ZMW@%&QOG]/.test(char)) return total + widths.wide;
    return total + widths.default;
  }, 0);
}

export function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateBragiModeBArticle({ articlePackage, topic, location, config }) {
  const errors = [];
  const warnings = [];
  const title = String(articlePackage?.title || "").trim();
  const excerpt = String(articlePackage?.excerpt || "").trim();
  const focusKeyword = String(articlePackage?.focusKeyword || "").trim();
  const seoTitle = String(articlePackage?.seoTitle || "").trim();
  const metaDescription = String(articlePackage?.metaDescription || "").trim();
  const socialTitle = String(articlePackage?.socialTitle || "").trim();
  const socialDescription = String(articlePackage?.socialDescription || "").trim();
  const contentHtml = String(articlePackage?.contentHtml || "").trim();
  const imageFilename = String(articlePackage?.imageMeta?.filename || "").trim();
  const imageTitle = String(articlePackage?.imageMeta?.title || "").trim();
  const imageAltText = String(articlePackage?.imageMeta?.altText || "").trim();
  const imageCaption = String(articlePackage?.imageMeta?.caption || "").trim();
  const imageDescription = String(articlePackage?.imageMeta?.description || "").trim();
  const plainText = stripHtml(contentHtml);
  const firstParagraph = String(contentHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
  const headingText = [...contentHtml.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((match) => stripHtml(match[1]))
    .join(" ");
  const headingList = [...contentHtml.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((match) => stripHtml(match[1]));
  const outboundLinkMatches = [...contentHtml.matchAll(/<a\b[^>]+href=["'](https?:\/\/[^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((url) => !/aquatraceleak\.com/i.test(url));
  const readability = analyzeReadability(plainText);

  if (!title) {
    errors.push("Article title is empty.");
  }
  if (!excerpt) {
    errors.push("Article excerpt is empty.");
  }
  if (!contentHtml) {
    errors.push("Article HTML body is empty.");
  }
  if (!focusKeyword) {
    errors.push("Focus keyword is empty.");
  }
  if ((contentHtml.match(/<h1\b/gi) || []).length !== 1) {
    errors.push("Article must contain exactly one H1.");
  }
  if ((contentHtml.match(/<h2\b/gi) || []).length < 3) {
    errors.push("Article must contain at least three H2 sections.");
  }
  if (!plainText.toLowerCase().includes(location.display.toLowerCase())) {
    errors.push(`Article must mention the target location: ${location.display}`);
  }

  const phoneSurface = [
    title,
    excerpt,
    seoTitle,
    metaDescription,
    socialTitle,
    socialDescription,
    plainText,
    imageTitle,
    imageAltText,
    imageCaption,
    imageDescription,
  ].join(" ");
  const phoneMatches = phoneSurface.match(PHONE_PATTERN) || [];
  if (phoneMatches.length) {
    errors.push(`Phone number detected: ${phoneMatches[0]}`);
  }

  if (focusKeyword) {
    const focusKeywordPattern = new RegExp(focusKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const focusKeywordHeadingPattern = new RegExp(focusKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const introMatches = stripHtml(firstParagraph).match(focusKeywordPattern) || [];
    const bodyMatches = plainText.match(focusKeywordPattern) || [];
    const headingMatches = headingText.match(focusKeywordPattern) || [];
    const headingCount = headingList.filter((heading) => focusKeywordHeadingPattern.test(heading)).length;
    const keywordDensity = plainText ? bodyMatches.length / Math.max(1, tokenizeWords(plainText).length) : 0;

    if (introMatches.length < 1) {
      errors.push("Focus keyword must appear in the first paragraph.");
    }
    if (bodyMatches.length < 2) {
      errors.push("Focus keyword must appear at least twice in the article body.");
    }
    if (headingMatches.length < 1) {
      errors.push("Focus keyword must appear in at least one H2 or H3.");
    }
    if (!metaDescription.toLowerCase().includes(focusKeyword.toLowerCase())) {
      errors.push("Meta description must include the focus keyword.");
    }
    if (!imageAltText.toLowerCase().includes(focusKeyword.toLowerCase())) {
      errors.push("Primary image alt text must include the focus keyword naturally.");
    }
    if (headingCount > 1) {
      errors.push("Focus keyword appears in too many H2/H3 headings. Keep heading usage natural.");
    }
    if (bodyMatches.length > 5 || keywordDensity > 0.03) {
      errors.push("Focus keyword appears too often and reads as stuffed.");
    }
  }

  if (!seoTitle) {
    errors.push("SEO title is empty.");
  } else if (seoTitle.length > 60) {
    errors.push(`SEO title is too long at ${seoTitle.length} characters.`);
  } else if (estimateTitlePixelWidth(seoTitle) > 580) {
    errors.push(`SEO title is too wide for Yoast at an estimated ${Math.round(estimateTitlePixelWidth(seoTitle))} pixels.`);
  }

  if (!metaDescription) {
    errors.push("Meta description is empty.");
  } else if (metaDescription.length > 160) {
    errors.push(`Meta description is too long at ${metaDescription.length} characters.`);
  }

  if (!socialTitle) {
    errors.push("Social title is empty.");
  }
  if (!socialDescription) {
    errors.push("Social description is empty.");
  }
  if (!imageFilename) {
    errors.push("Primary image filename is empty.");
  }
  if (!imageTitle) {
    errors.push("Primary image title is empty.");
  }
  if (!imageAltText) {
    errors.push("Primary image alt text is empty.");
  }
  if (!imageCaption) {
    errors.push("Primary image caption is empty.");
  }
  if (!imageDescription) {
    errors.push("Primary image description is empty.");
  }
  if (!outboundLinkMatches.length) {
    errors.push("Article must include at least one outbound link.");
  }

  for (const pattern of config.guardrails.blockedScopePatterns || []) {
    if (pattern.test(plainText)) {
      errors.push(`Blocked claim detected: ${pattern}`);
      break;
    }
  }

  if (!/\bdiagnostic|diagnostics|document|inspection|pressure test|acoustic|hydrophone|underwater\b/i.test(plainText)) {
    warnings.push("Article does not mention a strong diagnostic proof point.");
  }

  if (readability.repeatedStartViolations > 0) {
    errors.push("Article has 3 or more consecutive sentences starting with the same lead word.");
  }
  if (readability.passiveVoiceRatio > 0.1) {
    errors.push(`Passive voice is too high at ${(readability.passiveVoiceRatio * 100).toFixed(1)}%.`);
  }
  if (readability.longSentenceRatio > 0.25) {
    errors.push(`Too many long sentences at ${(readability.longSentenceRatio * 100).toFixed(1)}% over 20 words.`);
  }
  if (readability.fleschReadingEase < 60) {
    errors.push(`Readability is too difficult at Flesch ${readability.fleschReadingEase.toFixed(1)}.`);
  }

  if (/\b(vgb|virginia graeme baker|drain cover|main drain)\b/i.test(`${topic} ${plainText}`)) {
    if (!/\bunderside\b/i.test(plainText)) {
      errors.push("VGB article is missing the required underside detail.");
    }
    if (!/\bund(er)?water documentation\b/i.test(plainText) && !/\bund(er)?water photo\b/i.test(plainText)) {
      errors.push("VGB article must mention underwater documentation or underwater photo confirmation.");
    }
    if (/\b(confirmed|visible|checked) from (above water|the deck)\b/i.test(plainText)) {
      errors.push("VGB article implies above-water confirmation, which is not allowed.");
    }
  }

  if (excerpt.length > 200) {
    errors.push(`Excerpt is too long at ${excerpt.length} characters.`);
  }
  if (socialTitle && seoTitle && socialTitle.toLowerCase() === seoTitle.toLowerCase()) {
    warnings.push("Social title matches the SEO title exactly. Consider a more share-friendly variant.");
  }
  if (socialDescription && metaDescription && socialDescription.toLowerCase() === metaDescription.toLowerCase()) {
    warnings.push("Social description matches the meta description exactly. Consider a more share-friendly variant.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    plainText,
    readability,
  };
}

export const bragiModeBGuardrailInternals = {
  analyzeReadability,
  estimateTitlePixelWidth,
  splitSentences,
};
