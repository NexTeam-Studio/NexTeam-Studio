import operationalTruthRaw from "../../../../docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md?raw";

const OPERATIONAL_TRUTH_SOURCE_PATH = "docs/internal/CLAWDIA_OPERATIONAL_TRUTH.md";

function normalizeText(value) {
  return String(value || "").trim();
}

function parseSectionHeadings(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, "").trim());
}

export function loadClawdiaOperationalTruth() {
  return {
    loaded: true,
    sourcePath: OPERATIONAL_TRUTH_SOURCE_PATH,
    content: operationalTruthRaw,
    sections: parseSectionHeadings(operationalTruthRaw),
    summary: normalizeText(
      operationalTruthRaw
        .split(/\r?\n/)
        .find((line) => line.startsWith("- 2026-05-03: Clawdia is the single front door.")) || ""
    ),
  };
}

export const clawdiaOperationalTruthServiceInternals = {
  OPERATIONAL_TRUTH_SOURCE_PATH,
  parseSectionHeadings,
};
