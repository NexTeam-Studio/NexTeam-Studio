const TITLE_CASE_SMALL_WORDS = new Set(["a", "an", "the", "and", "as", "at", "but", "by", "for", "from", "in", "of", "on", "or", "to", "with"]);

export function titleCaseInterfaceName(value: string): string {
  const words = value.trim().split(/\s+/);
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    if (index > 0 && index < words.length - 1 && TITLE_CASE_SMALL_WORDS.has(lower)) {
      return lower;
    }
    if (/^[A-Z0-9]{2,}$/.test(word)) {
      return word;
    }
    return lower.replace(/(^|[-/])([a-z])/g, (_match, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`);
  }).join(" ");
}
