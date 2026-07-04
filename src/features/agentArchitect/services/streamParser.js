export function streamParser(chunk = "") {
  return String(chunk || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
