import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { PDFParse } from "pdf-parse";

const DEFAULT_COMPANYCAM_TENANT_ID = "aquatrace";
const ALLOWED_COMPANYCAM_TENANT_IDS = new Set(["aquatrace", "aquatrace-case-study"]);
const TOTAL_GALLONS_LABEL = "Estimated Approximate Total Gallons";
const SQUARE_FOOTAGE_LABEL = "Square Footage (Surface Area)";
const AVERAGE_DEPTH_LABEL = "Estimated Average Depth (Inches)";
const GALLONS_PER_INCH_LABEL = "Estimated Approximate Gallons / Inch (Square Footage x .625)";
const SWIMMING_POOL_MEASUREMENTS_LABEL = "Swimming Pool Measurements";
const SPA_MEASUREMENTS_LABEL = "Spa Measurements";
const CATCH_BASIN_MEASUREMENTS_LABEL = "Catch Basin Measurements";
const FINDINGS_SECTION_LABEL = "Swimming Pool Leak Detection Details /Results";
const DEFAULT_AQUATRACE_DROPBOX_BASE =
  process.env.AQUATRACE_DROPBOX_BASE || "C:\\Users\\Peyto\\Dropbox\\Business\\Aquatrace LLC\\Aquatrace";
const GENERIC_QUESTION_TOKENS = new Set([
  "at",
  "what",
  "which",
  "where",
  "when",
  "who",
  "the",
  "total",
  "pool",
  "pools",
  "gallon",
  "gallons",
  "report",
  "reports",
  "checklist",
  "companycam",
  "question",
  "answer",
  "show",
  "find",
  "tell",
  "give",
  "need",
  "we",
  "of",
  "from",
  "square",
  "footage",
  "surface",
  "area",
  "average",
  "depth",
  "inch",
  "inches",
  "measurement",
  "measurements",
  "dimension",
  "dimensions",
  "detail",
  "details",
  "today",
  "yesterday",
  "tomorrow",
  "did",
  "done",
  "size",
  "was",
  "were",
  "technician",
  "tech",
  "issue",
  "issues",
  "present",
  "on",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCompanyCamTenantId(value) {
  return normalizeText(value || DEFAULT_COMPANYCAM_TENANT_ID).toLowerCase();
}

function createCompanyCamQuestionError(message, { status = 400, code = "COMPANYCAM_QUERY_ERROR", detail = "" } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.detail = detail || "";
  return error;
}

function normalizeAnswerNumber(rawValue) {
  const match = String(rawValue || "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function tokenizeQuestion(question) {
  return Array.from(
    new Set(
      normalizeText(question)
        .toLowerCase()
        .match(/[a-z0-9]+/g) || []
    )
  ).filter((token) => token.length >= 2);
}

function buildUsefulQuestionTokens(question) {
  return tokenizeQuestion(question).filter((token) => !GENERIC_QUESTION_TOKENS.has(token));
}

function buildProjectMatchText(project = {}) {
  return [
    project?.name,
    project?.address?.street_address_1,
    project?.address?.street_address_2,
    project?.address?.city,
    project?.address?.state,
    project?.address?.postal_code,
  ]
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function dedupeNonEmptyStrings(values = []) {
  const seen = new Set();
  const ordered = [];

  for (const value of values) {
    const normalized = normalizeText(value).replace(/\s+/g, " ");
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    ordered.push(normalized);
  }

  return ordered;
}

function sanitizeProjectSearchPhrase(value) {
  return normalizeText(value)
    .replace(/^(?:what|which|where|when|who)\s+(?:was|were|is|are)\s+/i, " ")
    .replace(/^(?:what|which|where|when|who)\s+/i, " ")
    .replace(/^(?:the\s+)?technician\s+on\s+/i, " ")
    .replace(/\b(?:square footage|surface area|average depth|gallons per inch|measurements?|dimensions?)\s+of\b/gi, " ")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\b(?:we did today|done today|from today|today|this week|this morning|this afternoon|we did)\b/gi, " ")
    .replace(/\b(?:pool|project|job|client|customer|report|checklist)\b/gi, " ")
    .replace(/\b(?:was|were|is|are)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildProjectSearchQueries(question, explicitProjectQuery = "") {
  const normalizedQuestion = normalizeText(question);
  const normalizedLower = normalizedQuestion.toLowerCase();
  const usefulTokens = buildUsefulQuestionTokens(question);
  const phrases = [explicitProjectQuery];

  const forInMatch = normalizedQuestion.match(/\bfor\s+(.+?)\s+in\s+(.+?)(?:[?.!]|$)/i);
  if (forInMatch?.[1]) {
    phrases.push(forInMatch[1]);
  }
  if (forInMatch?.[2]) {
    phrases.push(forInMatch[2]);
    phrases.push(`${forInMatch[2]} ${forInMatch[1] || ""}`);
  }

  const forOnlyMatch = normalizedQuestion.match(/\bfor\s+(.+?)(?:[?.!]|$)/i);
  if (forOnlyMatch?.[1]) {
    phrases.push(forOnlyMatch[1]);
  }

  const atOnlyMatch = normalizedQuestion.match(/\bat\s+(.+?)(?:[?.!]|$)/i);
  if (atOnlyMatch?.[1]) {
    phrases.push(atOnlyMatch[1]);
  }

  const namedAssetMatch = normalizedQuestion.match(/\b(?:the|for)\s+(.+?)\s+(?:pool|project|job)\b/i);
  if (namedAssetMatch?.[1]) {
    phrases.push(namedAssetMatch[1]);
  }

  const onAssetMatch = normalizedQuestion.match(/\bon\s+(.+?)\s+(?:pool|project|job)\b/i);
  if (onAssetMatch?.[1]) {
    phrases.push(onAssetMatch[1]);
  }

  if (normalizedLower.includes("camp mikell")) {
    phrases.push("Camp Mikell");
  }

  if (usefulTokens.length > 0) {
    phrases.push(usefulTokens.slice(0, 4).join(" "));
    if (usefulTokens.length >= 2) {
      phrases.push(usefulTokens.slice(0, 2).join(" "));
    }
  }

  return dedupeNonEmptyStrings(phrases.map((phrase) => sanitizeProjectSearchPhrase(phrase))).filter(
    (phrase) => phrase.length >= 3
  );
}

function detectCompanyCamQuestionType(question) {
  const lower = normalizeText(question).toLowerCase();
  if (
    lower.includes("issues") ||
    lower.includes("issue") ||
    lower.includes("findings") ||
    lower.includes("problem") ||
    lower.includes("problems") ||
    lower.includes("what was found") ||
    lower.includes("what was wrong")
  ) {
    return "report_findings";
  }

  if (
    lower.includes("square footage") ||
    lower.includes("square foot") ||
    lower.includes("sq ft") ||
    lower.includes("surface area")
  ) {
    return "square_footage";
  }

  if (lower.includes("gallons per inch") || lower.includes("gallon per inch") || lower.includes("gallons / inch")) {
    return "gallons_per_inch";
  }

  if (lower.includes("average depth") || lower.includes("depth")) {
    return "average_depth";
  }

  if (
    lower.includes("measurement") ||
    lower.includes("measurements") ||
    lower.includes("dimension") ||
    lower.includes("dimensions")
  ) {
    return "measurement_summary";
  }

  if (lower.includes("gallon")) {
    return "total_gallons";
  }

  throw createCompanyCamQuestionError(
    "Only CompanyCam pool-measurement questions are supported right now.",
    {
      status: 400,
      code: "COMPANYCAM_UNSUPPORTED_QUESTION",
    }
  );
}

function detectMeasurementSubject(question) {
  const lower = normalizeText(question).toLowerCase();
  if (lower.includes("catch basin")) {
    return "catch_basin";
  }
  if (lower.includes("spa")) {
    return "spa";
  }
  if (lower.includes("pool")) {
    return "swimming_pool";
  }
  return "any";
}

function getMeasurementSectionLabel(subject) {
  switch (subject) {
    case "swimming_pool":
      return SWIMMING_POOL_MEASUREMENTS_LABEL;
    case "spa":
      return SPA_MEASUREMENTS_LABEL;
    case "catch_basin":
      return CATCH_BASIN_MEASUREMENTS_LABEL;
    default:
      return "";
  }
}

function extractMeasurementSection(text, subject) {
  const normalized = normalizeText(text);
  const label = getMeasurementSectionLabel(subject);
  if (!normalized || !label) {
    return "";
  }

  const startIndex = normalized.toLowerCase().indexOf(label.toLowerCase());
  if (startIndex === -1) {
    return "";
  }

  const nextLabels = [
    SWIMMING_POOL_MEASUREMENTS_LABEL,
    SPA_MEASUREMENTS_LABEL,
    CATCH_BASIN_MEASUREMENTS_LABEL,
  ]
    .filter((entry) => entry !== label)
    .map((entry) => {
      const index = normalized.toLowerCase().indexOf(entry.toLowerCase(), startIndex + label.length);
      return index >= 0 ? index : Number.POSITIVE_INFINITY;
    });

  const endIndex = Math.min(...nextLabels);
  return normalized.slice(startIndex, Number.isFinite(endIndex) ? endIndex : undefined);
}

async function extractPdfTextFromBuffer(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: normalizeText(result?.text),
      byteLength: buffer.byteLength,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractPdfTextFromUrl(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/pdf",
      "User-Agent": "NexTeam-Studio/CompanyCam-Report-Reader",
    },
  });

  if (!response.ok) {
    throw createCompanyCamQuestionError(
      `CompanyCam report download failed with status ${response.status}.`,
      {
        status: 502,
        code: "COMPANYCAM_REPORT_DOWNLOAD_FAILED",
      }
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return extractPdfTextFromBuffer(buffer);
}

async function extractPdfTextFromFile(filePath) {
  const buffer = readFileSync(filePath);
  return extractPdfTextFromBuffer(buffer);
}

function scoreTextAgainstQuestion(text, question) {
  const normalizedText = normalizeText(text).toLowerCase();
  if (!normalizedText) {
    return 0;
  }

  return buildUsefulQuestionTokens(question).reduce((score, token) => {
    if (!normalizedText.includes(token)) {
      return score;
    }

    if (normalizedText.includes(` ${token} `)) {
      return score + 3;
    }

    return score + 2;
  }, 0);
}

export function scoreProjectAgainstQuestion(project, question) {
  const matchText = buildProjectMatchText(project);
  if (!matchText) {
    return 0;
  }

  return buildUsefulQuestionTokens(question).reduce((score, token) => {
    if (!matchText.includes(token)) {
      return score;
    }

    if (normalizeText(project?.name).toLowerCase().includes(token)) {
      return score + 5;
    }

    if (normalizeText(project?.address?.city).toLowerCase().includes(token)) {
      return score + 3;
    }

    if (
      normalizeText(project?.address?.street_address_1).toLowerCase().includes(token) ||
      normalizeText(project?.address?.street_address_2).toLowerCase().includes(token)
    ) {
      return score + 4;
    }

    return score + 2;
  }, 0);
}

function isPdfDocument(document = {}) {
  return String(document?.content_type || "").toLowerCase().includes("pdf");
}

function isChecklistLikeDocument(document = {}) {
  const lower = normalizeText(document?.name).toLowerCase();
  return lower.includes("checklist") || lower.includes("exported");
}

function isLowValueReferenceDocument(document = {}) {
  const lower = normalizeText(document?.name).toLowerCase();
  return lower.includes("evaporation") || lower.includes("moasure");
}

function scoreDocumentAgainstQuestion(document, question) {
  let score = scoreTextAgainstQuestion(document?.name, question) * 2;
  if (isChecklistLikeDocument(document)) {
    score += 10;
  }
  if (isLowValueReferenceDocument(document)) {
    score -= 6;
  }
  return score;
}

function buildEvidenceSnippet(normalized, label, match) {
  const labelIndex = normalized.toLowerCase().indexOf(String(label || "").toLowerCase());
  const matchIndex = Number(match?.index);
  const anchorIndex = Number.isFinite(matchIndex) && matchIndex >= 0 ? matchIndex : labelIndex;
  if (anchorIndex >= 0) {
    return normalized.slice(Math.max(0, anchorIndex - 120), anchorIndex + 240);
  }
  return `${label} ${normalizeText(match?.[1] || "")}`.trim();
}

function extractLabeledNumericAnswer(text, { label, regex, unit, displayValueBuilder, notFoundCode }) {
  const normalized = normalizeText(text);
  const match = normalized.match(regex);
  if (!match?.[1]) {
    throw createCompanyCamQuestionError(
      `Could not find "${label}" in the exported CompanyCam report.`,
      {
        status: 422,
        code: notFoundCode,
      }
    );
  }

  const rawValue = normalizeText(match[1]);
  return {
    fieldLabel: label,
    rawValue,
    numericValue: normalizeAnswerNumber(rawValue),
    unit,
    displayValue: displayValueBuilder ? displayValueBuilder(rawValue) : unit ? `${rawValue} ${unit}` : rawValue,
    evidenceSnippet: buildEvidenceSnippet(normalized, label, match),
  };
}

export function extractTotalGallonsFromText(text) {
  return extractLabeledNumericAnswer(text, {
    label: TOTAL_GALLONS_LABEL,
    regex: /Estimated Approximate Total Gallons\s*([\d,.]+)\s*Gallon[s]?/i,
    unit: "Gallons",
    displayValueBuilder: (rawValue) => `${rawValue} Gallons`,
    notFoundCode: "COMPANYCAM_TOTAL_GALLONS_NOT_FOUND",
  });
}

export function extractSquareFootageFromText(text) {
  return extractLabeledNumericAnswer(text, {
    label: SQUARE_FOOTAGE_LABEL,
    regex: /Square Footage \(Surface Area\)\s*([\d,.]+)\s*(?:ft²|sq\s*ft|square\s*feet?|ft2)/i,
    unit: "ft²",
    displayValueBuilder: (rawValue) => `${rawValue} ft²`,
    notFoundCode: "COMPANYCAM_SQUARE_FOOTAGE_NOT_FOUND",
  });
}

export function extractAverageDepthFromText(text) {
  return extractLabeledNumericAnswer(text, {
    label: AVERAGE_DEPTH_LABEL,
    regex: /Estimated Average Depth \(Inches\)\s*([\d,.]+)\s*(?:\"|in\b|inches\b)/i,
    unit: "in",
    displayValueBuilder: (rawValue) => `${rawValue} in`,
    notFoundCode: "COMPANYCAM_AVERAGE_DEPTH_NOT_FOUND",
  });
}

export function extractGallonsPerInchFromText(text) {
  return extractLabeledNumericAnswer(text, {
    label: GALLONS_PER_INCH_LABEL,
    regex: /Estimated Approximate Gallons\s*\/\s*Inch \(Square Footage x \.625\)\s*([\d,.]+)\s*Gallons\s*\/?\s*Inch/i,
    unit: "Gallons/Inch",
    displayValueBuilder: (rawValue) => `${rawValue} Gallons/Inch`,
    notFoundCode: "COMPANYCAM_GALLONS_PER_INCH_NOT_FOUND",
  });
}

export function extractMeasurementSummaryFromText(text) {
  const squareFootage = extractSquareFootageFromText(text);
  const averageDepth = extractAverageDepthFromText(text);
  const gallonsPerInch = extractGallonsPerInchFromText(text);
  const totalGallons = extractTotalGallonsFromText(text);

  return {
    fieldLabel: "Swimming Pool Measurements",
    rawValue: [
      squareFootage.displayValue,
      averageDepth.displayValue,
      gallonsPerInch.displayValue,
      totalGallons.displayValue,
    ].join("; "),
    numericValue: null,
    unit: "",
    displayValue: [
      `${squareFootage.fieldLabel}: ${squareFootage.displayValue}`,
      `${averageDepth.fieldLabel}: ${averageDepth.displayValue}`,
      `${gallonsPerInch.fieldLabel}: ${gallonsPerInch.displayValue}`,
      `${totalGallons.fieldLabel}: ${totalGallons.displayValue}`,
    ].join("; "),
    evidenceSnippet: squareFootage.evidenceSnippet,
  };
}

function extractAnswerFromText(questionType, text) {
  switch (questionType) {
    case "report_findings":
      return extractReportFindingsFromText(text);
    case "square_footage":
      return extractSquareFootageFromText(text);
    case "average_depth":
      return extractAverageDepthFromText(text);
    case "gallons_per_inch":
      return extractGallonsPerInchFromText(text);
    case "measurement_summary":
      return extractMeasurementSummaryFromText(text);
    case "total_gallons":
      return extractTotalGallonsFromText(text);
    default:
      throw createCompanyCamQuestionError(
        `Unsupported CompanyCam question type "${questionType}".`,
        {
          status: 400,
          code: "COMPANYCAM_UNSUPPORTED_QUESTION",
        }
      );
  }
}

export function extractReportFindingsFromText(text) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  if (!normalized) {
    throw createCompanyCamQuestionError("CompanyCam report findings were not found in the available text.", {
      status: 404,
      code: "COMPANYCAM_REPORT_FINDINGS_NOT_FOUND",
    });
  }

  const lower = normalized.toLowerCase();
  const startIndex = lower.indexOf(FINDINGS_SECTION_LABEL.toLowerCase());
  if (startIndex === -1) {
    throw createCompanyCamQuestionError("CompanyCam report findings section was not found.", {
      status: 404,
      code: "COMPANYCAM_REPORT_FINDINGS_NOT_FOUND",
    });
  }

  const afterLabel = normalized
    .slice(startIndex + FINDINGS_SECTION_LABEL.length)
    .replace(/^--\s+\d+\s+of\s+\d+\s+--\s*/i, "")
    .replace(new RegExp(`^${FINDINGS_SECTION_LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .trim();
  const nextPageMatch = afterLabel.match(/\s--\s+\d+\s+of\s+\d+\s+--/i);
  const findings = (nextPageMatch
    ? afterLabel.slice(0, nextPageMatch.index)
    : afterLabel)
    .replace(/\s+/g, " ")
    .trim();

  if (!findings) {
    throw createCompanyCamQuestionError("CompanyCam report findings section was empty.", {
      status: 404,
      code: "COMPANYCAM_REPORT_FINDINGS_NOT_FOUND",
    });
  }

  const conciseFindings = findings.length > 900 ? `${findings.slice(0, 900).trim()}...` : findings;

  return {
    fieldLabel: "Report findings",
    rawValue: conciseFindings,
    numericValue: null,
    unit: "",
    displayValue: conciseFindings,
    evidenceSnippet: conciseFindings.slice(0, 220),
  };
}

function buildScopedMeasurementMissingAnswer(questionType, scopedLabel, fallbackAnswer) {
  const displayNames = {
    square_footage: "square footage",
    average_depth: "average depth",
    gallons_per_inch: "gallons per inch",
    measurement_summary: "measurements",
    total_gallons: "total gallons",
  };
  const requestedThing = displayNames[questionType] || "measurement";
  return {
    fieldLabel: `${scopedLabel} ${requestedThing}`,
    rawValue: "",
    numericValue: null,
    unit: "",
    displayValue: `No ${scopedLabel.toLowerCase()} ${requestedThing} was present. ${SPA_MEASUREMENTS_LABEL} shows ${fallbackAnswer.displayValue}.`,
    evidenceSnippet: fallbackAnswer.evidenceSnippet,
  };
}

function extractAnswerFromQuestionText(questionType, question, text) {
  if (questionType === "report_findings") {
    return extractAnswerFromText(questionType, text);
  }

  const subject = detectMeasurementSubject(question);
  if (subject === "any") {
    return extractAnswerFromText(questionType, text);
  }

  const scopedText = extractMeasurementSection(text, subject);
  if (scopedText) {
    try {
      return extractAnswerFromText(questionType, scopedText);
    } catch (error) {
      if (!String(error?.code || "").endsWith("_NOT_FOUND")) {
        throw error;
      }
    }
  }

  if (subject === "swimming_pool") {
    const spaText = extractMeasurementSection(text, "spa");
    if (spaText) {
      try {
        const spaAnswer = extractAnswerFromText(questionType, spaText);
        return buildScopedMeasurementMissingAnswer(questionType, "Swimming pool", spaAnswer);
      } catch (error) {
        if (!String(error?.code || "").endsWith("_NOT_FOUND")) {
          throw error;
        }
      }
    }
  }

  return extractAnswerFromText(questionType, text);
}

async function collectCompanyCamProjectCandidates({
  companyCamRail,
  question,
  projectQuery,
  projectId,
}) {
  if (normalizeText(projectId)) {
    const selectedProject = await companyCamRail.getProject(normalizeText(projectId));
    return [
      {
        ...selectedProject,
        _score: scoreProjectAgainstQuestion(selectedProject, question) + 50,
        _matchedQueries: ["projectId"],
      },
    ];
  }

  const candidateMap = new Map();
  const queries = buildProjectSearchQueries(question, projectQuery);

  for (const query of queries) {
    const projects = await companyCamRail.searchProjects({
      perPage: 10,
      query: query || undefined,
    });

    for (const project of projects) {
      const existing = candidateMap.get(project.id);
      const nextScore = scoreProjectAgainstQuestion(project, question) + scoreTextAgainstQuestion(query, question);
      if (!existing) {
        candidateMap.set(project.id, {
          ...project,
          _score: nextScore,
          _matchedQueries: [query],
        });
        continue;
      }

      existing._score = Math.max(existing._score, nextScore);
      if (!existing._matchedQueries.includes(query)) {
        existing._matchedQueries.push(query);
      }
    }
  }

  return [...candidateMap.values()].sort((left, right) => {
    if (right._score !== left._score) {
      return right._score - left._score;
    }
    return Number(right?.updated_at || 0) - Number(left?.updated_at || 0);
  });
}

async function findCompanyCamAnswerCandidate({
  companyCamRail,
  question,
  questionType,
  projectQuery,
  projectId,
  extractPdfTextFromUrlImpl = extractPdfTextFromUrl,
}) {
  if (!companyCamRail) {
    return null;
  }

  const projectCandidates = await collectCompanyCamProjectCandidates({
    companyCamRail,
    question,
    projectQuery,
    projectId,
  });

  if (projectCandidates.length === 0) {
    return null;
  }

  const answerCandidates = [];

  for (const project of projectCandidates) {
    const documents = (await companyCamRail.listProjectDocuments(project.id)).filter(
      (document) => isPdfDocument(document) && normalizeText(document.url)
    );

    if (documents.length === 0) {
      continue;
    }

    const projectDocSignal = documents.reduce(
      (maxScore, document) => Math.max(maxScore, scoreDocumentAgainstQuestion(document, question)),
      0
    );

    const prioritizedDocuments = [...documents].sort((left, right) => {
      const leftScore = scoreDocumentAgainstQuestion(left, question);
      const rightScore = scoreDocumentAgainstQuestion(right, question);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return Number(right?.updated_at || right?.created_at || 0) - Number(left?.updated_at || left?.created_at || 0);
    });

    for (const document of prioritizedDocuments) {
      let pdfTextResult;
      try {
        pdfTextResult = await extractPdfTextFromUrlImpl(document.url);
      } catch (error) {
        continue;
      }

      let answer;
      try {
        answer = extractAnswerFromQuestionText(questionType, question, pdfTextResult.text);
      } catch (error) {
        if (
          [
            "COMPANYCAM_TOTAL_GALLONS_NOT_FOUND",
            "COMPANYCAM_SQUARE_FOOTAGE_NOT_FOUND",
            "COMPANYCAM_AVERAGE_DEPTH_NOT_FOUND",
            "COMPANYCAM_GALLONS_PER_INCH_NOT_FOUND",
            "COMPANYCAM_REPORT_FINDINGS_NOT_FOUND",
          ].includes(error?.code)
        ) {
          continue;
        }
        throw error;
      }

      answerCandidates.push({
        provider: "companycam",
        project,
        allProjects: projectCandidates,
        answer,
        sourceDocument: {
          id: document.id,
          name: document.name,
          contentType: document.content_type,
          byteSize: document.byte_size ?? null,
          updatedAt: document.updated_at || document.created_at || null,
          url: document.url,
        },
        source: {
          type: "companycam_exported_pdf",
          evidenceSnippet: answer.evidenceSnippet,
          pdfBytes: pdfTextResult.byteLength,
          matchedQueries: project._matchedQueries || [],
        },
        totalScore:
          (project._score || 0) +
          projectDocSignal +
          scoreDocumentAgainstQuestion(document, question) +
          (isChecklistLikeDocument(document) ? 20 : 0),
      });
    }
  }

  return answerCandidates.sort((left, right) => {
    if (right.totalScore !== left.totalScore) {
      return right.totalScore - left.totalScore;
    }
    return Number(right?.sourceDocument?.updatedAt || 0) - Number(left?.sourceDocument?.updatedAt || 0);
  })[0] || null;
}

function getDropboxCustomersRoot() {
  const normalizedBase = normalizeText(DEFAULT_AQUATRACE_DROPBOX_BASE);
  if (!normalizedBase) {
    return "";
  }

  return normalizedBase.toLowerCase().endsWith(`${sep}customers`.toLowerCase())
    ? normalizedBase
    : join(normalizedBase, "Customers");
}

function walkPdfFiles(rootPath) {
  if (!existsSync(rootPath)) {
    return [];
  }

  const queue = [rootPath];
  const pdfFiles = [];

  while (queue.length > 0) {
    const currentPath = queue.pop();
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        pdfFiles.push(fullPath);
      }
    }
  }

  return pdfFiles;
}

function scoreDropboxPathAgainstQuestion(filePath, question) {
  const lowerPath = normalizeText(filePath).toLowerCase();
  let score = scoreTextAgainstQuestion(lowerPath, question) * 2;

  if (lowerPath.includes("exportedcurrentaquatraceswimmingpoolleakdetectionchecklist")) {
    score += 20;
  }
  if (lowerPath.includes("checklist")) {
    score += 8;
  }
  if (lowerPath.includes("evaporation") || lowerPath.includes("moasure")) {
    score -= 8;
  }

  return score;
}

function inferDropboxProjectName(filePath, customersRoot) {
  const relativePath = relative(customersRoot, filePath);
  const parts = relativePath.split(sep).filter(Boolean);
  if (parts.length >= 4) {
    return `${parts[2]} / ${parts[3]}`;
  }
  if (parts.length >= 3) {
    return parts[2];
  }
  return basename(filePath, ".pdf");
}

async function findDropboxAnswerCandidate({
  question,
  questionType,
  extractPdfTextFromFileImpl = extractPdfTextFromFile,
}) {
  const customersRoot = getDropboxCustomersRoot();
  if (!customersRoot || !existsSync(customersRoot)) {
    return null;
  }

  const candidates = walkPdfFiles(customersRoot)
    .map((filePath) => ({
      filePath,
      score: scoreDropboxPathAgainstQuestion(filePath, question),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return statSync(right.filePath).mtimeMs - statSync(left.filePath).mtimeMs;
    })
    .slice(0, 40);

  for (const candidate of candidates) {
    let pdfTextResult;
    try {
      pdfTextResult = await extractPdfTextFromFileImpl(candidate.filePath);
    } catch {
      continue;
    }

    let answer;
    try {
        answer = extractAnswerFromQuestionText(questionType, question, pdfTextResult.text);
    } catch (error) {
      if (
        [
          "COMPANYCAM_TOTAL_GALLONS_NOT_FOUND",
          "COMPANYCAM_SQUARE_FOOTAGE_NOT_FOUND",
          "COMPANYCAM_AVERAGE_DEPTH_NOT_FOUND",
          "COMPANYCAM_GALLONS_PER_INCH_NOT_FOUND",
          "COMPANYCAM_REPORT_FINDINGS_NOT_FOUND",
        ].includes(error?.code)
      ) {
        continue;
      }
      throw error;
    }

    const fileStats = statSync(candidate.filePath);
    return {
      provider: "dropbox",
      project: {
        id: null,
        name: inferDropboxProjectName(candidate.filePath, customersRoot),
        address: null,
        projectUrl: "",
        publicUrl: "",
      },
      allProjects: [],
      answer,
      sourceDocument: {
        id: candidate.filePath,
        name: basename(candidate.filePath),
        contentType: "application/pdf",
        byteSize: fileStats.size,
        updatedAt: fileStats.mtime.toISOString(),
        filePath: candidate.filePath,
      },
      source: {
        type: "dropbox_customer_pdf",
        evidenceSnippet: answer.evidenceSnippet,
        pdfBytes: pdfTextResult.byteLength,
        filePath: candidate.filePath,
      },
      totalScore: candidate.score + 30,
    };
  }

  return null;
}

export function assertAquatraceCompanyCamTenantScope(tenantId) {
  const normalizedTenantId = normalizeCompanyCamTenantId(tenantId);
  if (!ALLOWED_COMPANYCAM_TENANT_IDS.has(normalizedTenantId)) {
    throw createCompanyCamQuestionError(
      `CompanyCam access is not approved for tenant "${normalizedTenantId}".`,
      {
        status: 403,
        code: "COMPANYCAM_TENANT_SCOPE_DENIED",
      }
    );
  }

  return normalizedTenantId;
}

export async function answerCompanyCamReportQuestion({
  companyCamRail,
  tenantId,
  question,
  projectQuery,
  projectId,
  extractPdfTextFromUrlImpl = extractPdfTextFromUrl,
  extractPdfTextFromFileImpl = extractPdfTextFromFile,
} = {}) {
  const scopedTenantId = assertAquatraceCompanyCamTenantScope(tenantId);
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion) {
    throw createCompanyCamQuestionError("A CompanyCam question is required.", {
      status: 400,
      code: "COMPANYCAM_QUESTION_REQUIRED",
    });
  }

  const questionType = detectCompanyCamQuestionType(normalizedQuestion);
  const attemptedProviders = [];

  const companyCamCandidate = await findCompanyCamAnswerCandidate({
    companyCamRail,
    question: normalizedQuestion,
    questionType,
    projectQuery,
    projectId,
    extractPdfTextFromUrlImpl,
  });
  attemptedProviders.push("companycam");

  const resolvedCandidate =
    companyCamCandidate ||
    (await findDropboxAnswerCandidate({
      question: normalizedQuestion,
      questionType,
      extractPdfTextFromFileImpl,
    }));

  if (!companyCamCandidate) {
    attemptedProviders.push("dropbox");
  }

  if (!resolvedCandidate) {
    throw createCompanyCamQuestionError(
      "No CompanyCam or Dropbox report source matched that question.",
      {
        status: 404,
        code: "COMPANYCAM_PROJECT_NOT_FOUND",
      }
    );
  }

  const alternativeProjects = (resolvedCandidate.allProjects || [])
    .filter((project) => project.id && project.id !== resolvedCandidate.project.id)
    .slice(0, 3)
    .map((project) => ({
      id: project.id,
      name: project.name,
      address: project.address || null,
      score: project._score ?? scoreProjectAgainstQuestion(project, normalizedQuestion),
    }));

  return {
    ok: true,
    tenantId: scopedTenantId,
    question: normalizedQuestion,
    questionType,
    answer: resolvedCandidate.answer,
    project: {
      id: resolvedCandidate.project.id,
      name: resolvedCandidate.project.name,
      address: resolvedCandidate.project.address || null,
      projectUrl: resolvedCandidate.project.projectUrl || "",
      publicUrl: resolvedCandidate.project.publicUrl || "",
    },
    alternativeProjects,
    sourceDocument: resolvedCandidate.sourceDocument,
    source: resolvedCandidate.source,
    resourcePath: {
      provider: resolvedCandidate.provider,
      attemptedProviders,
      companyCamPreferred: true,
      dropboxFallbackUsed: resolvedCandidate.provider === "dropbox",
      jobberReady: false,
    },
  };
}

export function formatCompanyCamReportAnswer(result = {}) {
  return [
    "COMPANYCAM JOB DATA",
    `- tenant: ${result.tenantId || DEFAULT_COMPANYCAM_TENANT_ID}`,
    `- project: ${result?.project?.name || "unknown"}`,
    `- address: ${[
      result?.project?.address?.street_address_1,
      result?.project?.address?.city,
      result?.project?.address?.state,
      result?.project?.address?.postal_code,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .join(", ")}`,
    `- answer: ${result?.answer?.fieldLabel || TOTAL_GALLONS_LABEL} = ${result?.answer?.displayValue || "unknown"}`,
    `- source document: ${result?.sourceDocument?.name || "unknown"}`,
    `- evidence: ${normalizeText(result?.source?.evidenceSnippet) || "not available"}`,
    `- source provider: ${normalizeText(result?.resourcePath?.provider) || "companycam"}`,
    `- alternate project matches: ${
      Array.isArray(result?.alternativeProjects) && result.alternativeProjects.length > 0
        ? result.alternativeProjects.map((project) => `${project.name} (${project.id})`).join(" ; ")
        : "none"
    }`,
    "- CompanyCam mode: read-only",
  ].join("\n");
}

export const companyCamQuestionServiceInternals = {
  ALLOWED_COMPANYCAM_TENANT_IDS,
  AVERAGE_DEPTH_LABEL,
  DEFAULT_AQUATRACE_DROPBOX_BASE,
  DEFAULT_COMPANYCAM_TENANT_ID,
  GENERIC_QUESTION_TOKENS,
  GALLONS_PER_INCH_LABEL,
  SQUARE_FOOTAGE_LABEL,
  TOTAL_GALLONS_LABEL,
  buildProjectMatchText,
  buildProjectSearchQueries,
  buildUsefulQuestionTokens,
  createCompanyCamQuestionError,
  detectCompanyCamQuestionType,
  extractAnswerFromText,
  extractAverageDepthFromText,
  extractAnswerFromQuestionText,
  extractGallonsPerInchFromText,
  extractMeasurementSummaryFromText,
  extractReportFindingsFromText,
  extractMeasurementSection,
  extractPdfTextFromBuffer,
  extractPdfTextFromFile,
  extractPdfTextFromUrl,
  extractSquareFootageFromText,
  findCompanyCamAnswerCandidate,
  collectCompanyCamProjectCandidates,
  findDropboxAnswerCandidate,
  getDropboxCustomersRoot,
  inferDropboxProjectName,
  detectMeasurementSubject,
  normalizeAnswerNumber,
  normalizeCompanyCamTenantId,
  scoreDocumentAgainstQuestion,
  scoreDropboxPathAgainstQuestion,
  scoreProjectAgainstQuestion,
  scoreTextAgainstQuestion,
  tokenizeQuestion,
  walkPdfFiles,
};
