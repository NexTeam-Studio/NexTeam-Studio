export const AQUATRACE_JOB_REPORT_SECTIONS = [
  "Summary",
  "Details/Results",
  "Additional Notes",
  "Conditions Upon Arrival",
  "Pool/Spa Overview",
  "Measurements",
  "Filtration Overview",
  "Testing Procedures",
  "Results"
] as const;

export type AquatraceDocumentType = "job_report" | "moasure_export" | "evap_calc" | "unknown";
export type AquatraceResultStatus = "pass" | "fail" | "pass_after_onsite_repair" | "not_applicable" | "unknown";

export interface AquatraceSourceDocument {
  id: string;
  label: string;
  text: string;
}

export interface ParsedLossValue {
  raw: string;
  inchesPerDay: number;
}

export interface AquatraceMeasurement {
  surfaceAreaSqFt?: number;
  averageDepthInches?: number;
  reportedGallonsPerInch?: number;
  gallonsPerInch?: number;
  totalGallons?: number;
  moasureUsed?: "yes" | "no" | "na" | "unknown";
}

export interface AquatraceSystemResult {
  status: AquatraceResultStatus;
  issueDescription?: string;
  hardWaterLossFound: boolean;
  defectWithoutLoss: boolean;
}

export interface AquatraceJobReportExtraction {
  documentType: "job_report";
  source: Omit<AquatraceSourceDocument, "text">;
  clientDisplayName?: string;
  cityState?: string;
  serviceDateRaw?: string;
  serviceDateKey?: string;
  completionTimeRaw?: string;
  technicians: string[];
  sectionsPresent: string[];
  findings?: string;
  additionalNotes?: string;
  checklistEvapIndex?: ParsedLossValue;
  reportedDailyLoss?: ParsedLossValue;
  measurement: AquatraceMeasurement;
  poolSpaCounts: Record<string, number | string>;
  legacyParsedCounts: Record<string, number>;
  testingProcedures: {
    used: string[];
    successful: string[];
  };
  results: Record<string, AquatraceSystemResult>;
  flags: string[];
}

export interface AquatraceMoasureExtraction {
  documentType: "moasure_export";
  source: Omit<AquatraceSourceDocument, "text">;
  titleClientHint?: string;
  createdDateRaw?: string;
  createdDateKey?: string;
  perimeterFt?: number;
  areaSqFt?: number;
  depthViewGallonsPerInch?: number;
  edges: Array<{
    index: number;
    fromElevationFt: number;
    lengthFt: number;
    toElevationFt: number;
  }>;
  flags: string[];
}

export interface AquatraceEvapExtraction {
  documentType: "evap_calc";
  source: Omit<AquatraceSourceDocument, "text">;
  generatedDateRaw?: string;
  generatedDateKey?: string;
  zipCode?: string;
  surfaceAreaSqFt?: number;
  waterTempF?: number;
  airTempF?: number;
  relativeHumidityPercent?: number;
  windMph?: number;
  observedDailyLoss?: ParsedLossValue;
  evapEstimate?: ParsedLossValue;
  evapGallonsPerDay?: number;
  leakLossAfterEvap?: ParsedLossValue;
  leakGallonsPerDay?: number;
  totalDailyLoss?: ParsedLossValue;
  totalGallonsPerDay?: number;
  forecastRowCount: number;
  flags: string[];
}

export interface UnknownAquatraceDocumentExtraction {
  documentType: "unknown";
  source: Omit<AquatraceSourceDocument, "text">;
  flags: string[];
}

export type AquatraceDocumentExtraction =
  | AquatraceJobReportExtraction
  | AquatraceMoasureExtraction
  | AquatraceEvapExtraction
  | UnknownAquatraceDocumentExtraction;

export interface JobberHierarchyCandidate {
  clientName: string;
  propertyName?: string;
  tierPath?: string[];
  jobberClientId?: string;
  jobberPropertyId?: string;
}

export interface AquatraceVisitExtraction {
  visitKey: string;
  clientDisplayName?: string;
  serviceDateKey?: string;
  sourceDocumentIds: string[];
  hierarchy?: JobberHierarchyCandidate;
  jobReport?: AquatraceJobReportExtraction;
  moasure?: AquatraceMoasureExtraction;
  evap?: AquatraceEvapExtraction;
  fields: Record<string, string | number>;
  flags: string[];
}

export interface AquatraceReportSetExtraction {
  parsedDocuments: AquatraceDocumentExtraction[];
  visits: AquatraceVisitExtraction[];
  unresolvedDocs: Array<{
    documentId: string;
    label: string;
    documentType: AquatraceDocumentType;
    reason: string;
  }>;
}

const FINDINGS_SECTION_LABEL = "Swimming Pool Leak Detection Details /Results";
const TECHNICIAN_ROSTER = ["Chris", "Logan", "Catherine"] as const;

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeReportText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceWithoutText(source: AquatraceSourceDocument): Omit<AquatraceSourceDocument, "text"> {
  return { id: source.id, label: source.label };
}

function firstCapture(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function assignNumber(target: Record<string, string | number>, key: string, value: number | null | undefined): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
  }
}

function assignString(target: Record<string, string | number>, key: string, value: string | null | undefined): void {
  if (value) {
    target[key] = value;
  }
}

function parseDateKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b,?/gi, "")
    .replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1")
    .replace(/\s*@.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLossNotation(rawValue: string | null | undefined): ParsedLossValue | null {
  if (!rawValue) return null;
  const raw = rawValue.replace(/inches?\s*\/\s*day/gi, "").replace(/per\s*day/gi, "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/"/g, "").replace(/\s+/g, " ").trim();

  const parts = cleaned.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    let total = 0;
    for (const part of parts) {
      const parsed = parseLossNotation(part);
      if (!parsed) return null;
      total += parsed.inchesPerDay;
    }
    return { raw: rawValue.trim(), inchesPerDay: round(total, 4) };
  }

  const mixed = cleaned.match(/^(-?\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (Number.isFinite(whole) && denominator > 0) {
      return { raw: rawValue.trim(), inchesPerDay: round(whole + numerator / denominator, 4) };
    }
  }

  const fraction = cleaned.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator > 0) {
      return { raw: rawValue.trim(), inchesPerDay: round(numerator / denominator, 4) };
    }
  }

  const leadingFraction = cleaned.match(/^(\d+)\s*\/\s*(\d+)/);
  if (leadingFraction) {
    const numerator = Number(leadingFraction[1]);
    const denominator = Number(leadingFraction[2]);
    if (denominator > 0) {
      return { raw: rawValue.trim(), inchesPerDay: round(numerator / denominator, 4) };
    }
  }

  const number = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (number?.[0]) {
    const parsed = Number(number[0]);
    if (Number.isFinite(parsed)) {
      return { raw: rawValue.trim(), inchesPerDay: round(parsed, 4) };
    }
  }
  return null;
}

export function classifyAquatraceDocument(textValue: string, labelValue = ""): AquatraceDocumentType {
  const text = normalizeReportText(textValue);
  const label = normalizeReportText(labelValue).toLowerCase();
  if (/pool evaporation report/i.test(text) || label.includes("evaporation calculator")) {
    return "evap_calc";
  }
  if (/\bPLAN VIEW\b/i.test(text) && /\bCreated on\b/i.test(text) && !/Checklist/i.test(text)) {
    return "moasure_export";
  }
  if (/Aquatrace Swimming Pool Leak Detection Checklist|Summary Summary|Swimming Pool Leak Detection Details\s*\/Results/i.test(text)) {
    return "job_report";
  }
  return "unknown";
}

function sectionPresent(text: string, section: string): boolean {
  const variants: Record<string, RegExp> = {
    "Summary": /Summary/i,
    "Details/Results": /Details\s*\/Results|Leak Detection Details/i,
    "Additional Notes": /Additional Notes/i,
    "Conditions Upon Arrival": /Conditions Upon Arrival/i,
    "Pool/Spa Overview": /Pool\/Spa Overview/i,
    "Measurements": /Measurements|Estimated Approximate Total Gallons|Square Footage/i,
    "Filtration Overview": /Filtration Overview/i,
    "Testing Procedures": /Testing Procedures/i,
    "Results": /\bResults\b/i
  };
  return variants[section]?.test(text) ?? false;
}

function extractFindings(text: string): string | null {
  const lower = text.toLowerCase();
  const startIndex = lower.indexOf(FINDINGS_SECTION_LABEL.toLowerCase());
  if (startIndex < 0) {
    return null;
  }
  const afterLabel = text
    .slice(startIndex + FINDINGS_SECTION_LABEL.length)
    .replace(/^--\s+\d+\s+of\s+\d+\s+--\s*/i, "")
    .trim();
  const nextPageMatch = afterLabel.match(/\s--\s+\d+\s+of\s+\d+\s+--/i);
  const findings = (nextPageMatch ? afterLabel.slice(0, nextPageMatch.index) : afterLabel).trim();
  if (!findings) {
    return null;
  }
  return findings.length > 1400 ? `${findings.slice(0, 1400).trim()}...` : findings;
}

function extractAdditionalNotes(text: string): string | null {
  const value = firstCapture(
    text,
    /Additional Notes\s+(.+?)\s+(?:Conditions Upon Arrival|Pool\/Spa Overview|Filtration Overview|Testing Procedures)/i
  );
  return value && value.length > 1200 ? `${value.slice(0, 1200).trim()}...` : value;
}

function extractTechnicians(rawTechs: string | null): string[] {
  if (!rawTechs) return [];
  const normalized = rawTechs.toLowerCase();
  const found = TECHNICIAN_ROSTER.filter((name) => normalized.includes(name.toLowerCase()));
  if (found.length > 0) {
    return [...found];
  }
  return rawTechs
    .split(/\band\b|,|\/|&/i)
    .map((part) => part.replace(/\bSears\b/gi, "").trim())
    .filter(Boolean);
}

function extractSummaryFields(text: string): {
  clientDisplayName: string | null;
  cityState: string | null;
  technicians: string[];
  serviceDateRaw: string | null;
  serviceDateKey: string | null;
  completionTimeRaw: string | null;
} {
  const summary = text.match(
    /Summary Summary\s+(.+?)\s+Client Name\s+(.+?)\s+City\s*\/\s*State\s+(.+?)\s+Aquatrace Technician Name\(s\)\s+(.+?)\s+Project Service Date\s+(.+?)\s+Project Service Completion Time/i
  );
  const clientDisplayName = summary?.[1]?.trim() ?? null;
  const cityState = summary?.[2]?.trim() ?? null;
  const technicianRaw = summary?.[3]?.trim() ?? null;
  const serviceDateRaw = summary?.[4]?.trim() ?? null;
  const completionTimeRaw = summary?.[5]?.trim() ?? null;
  return {
    clientDisplayName,
    cityState,
    technicians: extractTechnicians(technicianRaw),
    serviceDateRaw,
    serviceDateKey: parseDateKey(serviceDateRaw),
    completionTimeRaw
  };
}

function extractMeasurement(text: string, flags: string[]): AquatraceMeasurement {
  const measurement: AquatraceMeasurement = {};
  const surfaceArea = parseNumber(firstCapture(text, /Square Footage \(Surface Area\)\s*([\d,.]+)\s*ft/i));
  const averageDepth = parseNumber(firstCapture(text, /Estimated Average Depth \(Inches\)\s*([\d,.]+)\s*(?:in|")/i));
  const reportedGallonsPerInch = parseNumber(firstCapture(text, /Estimated Approximate Gallons\s*\/\s*Inch\s*(?:\.\.\.)?\s*([\d,.]+)\s*Gallons?\s*\/?\s*Inch/i));
  const totalGallons = parseNumber(firstCapture(text, /Estimated Approximate Total Gallons\s*([\d,.]+)\s*Gallon/i))
    ?? parseNumber(firstCapture(text, /Total Gallons\s*[:\-]?\s*([\d,.]+)/i))
    ?? parseNumber(firstCapture(text, /([\d,.]+)\s*(?:pool\s*)?gallons?/i));
  if (surfaceArea !== null) {
    measurement.surfaceAreaSqFt = surfaceArea;
    measurement.gallonsPerInch = round(surfaceArea * 0.625, 4);
  }
  if (averageDepth !== null) measurement.averageDepthInches = averageDepth;
  if (reportedGallonsPerInch !== null) measurement.reportedGallonsPerInch = reportedGallonsPerInch;
  if (totalGallons !== null) measurement.totalGallons = totalGallons;
  if (
    typeof measurement.gallonsPerInch === "number"
    && typeof measurement.reportedGallonsPerInch === "number"
    && Math.abs(measurement.gallonsPerInch - measurement.reportedGallonsPerInch) > 1
  ) {
    flags.push("gallons_per_inch_recomputed_from_surface_area");
  }
  if (/Moasure Used\s+Yes/i.test(text)) measurement.moasureUsed = "yes";
  else if (/Moasure Used\s+No/i.test(text)) measurement.moasureUsed = "no";
  else if (/Moasure Used\s+N\/A/i.test(text)) measurement.moasureUsed = "na";
  else measurement.moasureUsed = "unknown";
  return measurement;
}

function extractChecklistEvapIndex(text: string): ParsedLossValue | undefined {
  const raw = firstCapture(
    text,
    /Daily Evap(?:oration)? Index\s+(.+?)\s+(?:Reported Daily Loss|Pre-existing|Pool\/Spa Overview|Residential|Commercial|Skimmer|Filtration Overview)/i
  );
  const parsed = parseLossNotation(raw);
  return parsed ?? undefined;
}

function extractReportedDailyLoss(text: string): ParsedLossValue | undefined {
  const raw = firstCapture(
    text,
    /Reported Daily Loss\s+(.+?)\s+(?:Pre-existing|Pool\/Spa Overview|Residential|Commercial|Skimmer|Filtration Overview)/i
  );
  const parsed = parseLossNotation(raw);
  return parsed ?? undefined;
}

function extractPoolSpaCounts(text: string): {
  counts: Record<string, number | string>;
  legacyParsedCounts: Record<string, number>;
  flags: string[];
} {
  const counts: Record<string, number | string> = {};
  const legacyParsedCounts: Record<string, number> = {};
  const flags: string[] = [];
  const labels: Array<[string, RegExp]> = [
    ["skimmers", /How many skimmers[^\d]*(\d+)/i],
    ["wallReturns", /How many wall returns[^\d]*(\d+)/i],
    ["floorReturns", /How many floor returns[^\d]*(\d+)/i],
    ["mainDrains", /How many main drains[^\d]*(\d+)/i],
    ["lights", /How many lights[^\d]*(\d+)/i],
    ["cleanerPorts", /How many cleaner ports[^\d]*(\d+)/i]
  ];
  for (const [key, pattern] of labels) {
    const value = parseNumber(firstCapture(text, pattern));
    if (value !== null) {
      counts[key] = value;
    }
  }

  const legacyMatches = Array.from(text.matchAll(/(\d+)\s+(wall returns?|floor returns?|main drains?|cleaner ports?|skimmers?|lights?|equalizers?|fill ports?|skim-rail gutters?)/gi));
  for (const match of legacyMatches) {
    const value = parseNumber(match[1]);
    const rawLabel = match[2]?.toLowerCase().replace(/\s+/g, " ").trim();
    if (value === null || !rawLabel) continue;
    const key = rawLabel
      .replace(/s$/, "")
      .replace(/[-\s]+([a-z])/g, (_all, letter: string) => letter.toUpperCase());
    legacyParsedCounts[key] = value;
  }
  if (Object.keys(legacyParsedCounts).length > 0) {
    counts.legacyRaw = legacyMatches.map((match) => match[0]).join(" / ");
    flags.push("legacy_free_text_counts_best_effort_parsed");
  }

  const systemType = firstCapture(text, /Skimmer System Type\s+(.+?)\s+(?:How many|Pool|Spa|Catch Basin|Measurements|Filtration Overview)/i);
  if (systemType) {
    counts.skimmerSystemType = systemType;
  }
  return { counts, legacyParsedCounts, flags };
}

function extractTestingProcedures(text: string): { used: string[]; successful: string[] } {
  const usedRaw = firstCapture(text, /Testing Procedures\s+Used\s+(.+?)\s+Testing Procedures\s+Successful/i);
  const successfulRaw = firstCapture(text, /Testing Procedures\s+Successful\s+(.+?)\s+Results/i);
  const split = (value: string | null): string[] => (value ?? "")
    .split(/,|;|\s{2,}|\s+-\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2)
    .slice(0, 24);
  return { used: split(usedRaw), successful: split(successfulRaw) };
}

function classifySystemResult(system: string, findings: string | null, text: string): AquatraceSystemResult {
  const source = `${findings ?? ""} ${text}`;
  const systemPattern = new RegExp(`\\b${system.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const matches = Array.from(source.matchAll(new RegExp(systemPattern.source, "gi")));
  const context = matches
    .map((match) => {
      const index = match.index ?? 0;
      const previousStops = [source.lastIndexOf(".", index), source.lastIndexOf(";", index), source.lastIndexOf(" -- ", index)];
      const nextStops = [source.indexOf(".", index + 1), source.indexOf(";", index + 1), source.indexOf(" -- ", index + 1)]
        .filter((candidate) => candidate >= 0);
      const start = Math.max(0, Math.max(...previousStops) + 1);
      const end = nextStops.length > 0 ? Math.min(...nextStops) : Math.min(source.length, index + 240);
      return source.slice(start, end);
    })
    .join(" ");
  const aroundSystem = context.length > 0;
  const explicitNoLoss = /\b(?:no|without)\s+(?:hard\s+)?water loss|defect(?:s)? without loss|not losing water/i.test(context);
  const hardLoss = aroundSystem && !explicitNoLoss && /\b(leak|water loss|losing water|failed pressure|pressure loss)\b/i.test(context);
  const onsiteRepair = hardLoss && /pass(?:ed)? after onsite repair|repaired onsite|after onsite repair/i.test(context);
  const na = aroundSystem && /\bN\/A|not applicable\b/i.test(context);
  const defect = aroundSystem && /\b(defect|crack|broken|missing|worn|settlement|cosmetic)\b/i.test(context);
  let status: AquatraceResultStatus = "unknown";
  if (na) status = "not_applicable";
  else if (onsiteRepair) status = "pass_after_onsite_repair";
  else if (hardLoss) status = "fail";
  else if (defect || aroundSystem) status = "pass";
  return {
    status,
    hardWaterLossFound: hardLoss,
    defectWithoutLoss: defect && !hardLoss
  };
}

function extractResults(text: string, findings: string | null): Record<string, AquatraceSystemResult> {
  return {
    structure: classifySystemResult("structure", findings, text),
    lights: classifySystemResult("lights", findings, text),
    plumbing: classifySystemResult("plumbing", findings, text),
    roofSolar: classifySystemResult("roof solar", findings, text),
    filtration: classifySystemResult("filtration", findings, text)
  };
}

export function extractJobReport(source: AquatraceSourceDocument): AquatraceJobReportExtraction {
  const text = normalizeReportText(source.text);
  const flags: string[] = [];
  const summary = extractSummaryFields(text);
  if (/^Exported - Current/i.test(source.label) && !/Client Name/i.test(source.label)) {
    flags.push("companycam_generated_filename_without_client");
  }
  if (!summary.clientDisplayName) {
    flags.push("client_name_not_found_in_summary");
  }
  if (!summary.serviceDateKey) {
    flags.push("service_date_not_found");
  }
  const counts = extractPoolSpaCounts(text);
  flags.push(...counts.flags);
  const findings = extractFindings(text);
  const checklistEvapIndex = extractChecklistEvapIndex(text);
  const reportedDailyLoss = extractReportedDailyLoss(text);
  const report: AquatraceJobReportExtraction = {
    documentType: "job_report",
    source: sourceWithoutText(source),
    technicians: summary.technicians,
    sectionsPresent: AQUATRACE_JOB_REPORT_SECTIONS.filter((section) => sectionPresent(text, section)),
    measurement: extractMeasurement(text, flags),
    poolSpaCounts: counts.counts,
    legacyParsedCounts: counts.legacyParsedCounts,
    testingProcedures: extractTestingProcedures(text),
    results: extractResults(text, findings),
    flags
  };
  if (summary.clientDisplayName) report.clientDisplayName = summary.clientDisplayName;
  if (summary.cityState) report.cityState = summary.cityState;
  if (summary.serviceDateRaw) report.serviceDateRaw = summary.serviceDateRaw;
  if (summary.serviceDateKey) report.serviceDateKey = summary.serviceDateKey;
  if (summary.completionTimeRaw) report.completionTimeRaw = summary.completionTimeRaw;
  if (findings) report.findings = findings;
  const additionalNotes = extractAdditionalNotes(text);
  if (additionalNotes) report.additionalNotes = additionalNotes;
  if (checklistEvapIndex) report.checklistEvapIndex = checklistEvapIndex;
  if (reportedDailyLoss) report.reportedDailyLoss = reportedDailyLoss;
  return report;
}

export function extractMoasureExport(source: AquatraceSourceDocument): AquatraceMoasureExtraction {
  const text = normalizeReportText(source.text);
  const flags: string[] = [];
  const titleClientHint = firstCapture(text, /AQUATRACE\s*:\s*(.+?)\s*:\s*PLAN VIEW/i);
  const createdDateRaw = firstCapture(text, /Created on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const createdDateKey = parseDateKey(createdDateRaw);
  const planMatch = text.match(/PLAN VIEW\s+([\d,.]+)ft\s+\(([\d,.]+)ft²\)/i);
  const perimeterFt = parseNumber(planMatch?.[1]);
  const areaSqFt = parseNumber(planMatch?.[2]);
  const depthViewGallonsPerInch = parseNumber(firstCapture(text, /DEPTH VIEW\s+[\d,.]+ft²\s+\(([\d,.]+)gal\)/i));
  if (!titleClientHint) flags.push("moasure_filename_or_title_has_no_client_identity");
  if (!createdDateKey) flags.push("moasure_created_date_not_found");
  const edges = Array.from(text.matchAll(/\b(\d+)\s+\((-?\d+(?:\.\d+)?)ft\),\s*([\d.]+)ft,\s*\((-?\d+(?:\.\d+)?)ft\)/gi))
    .map((match) => ({
      index: Number(match[1]),
      fromElevationFt: Number(match[2]),
      lengthFt: Number(match[3]),
      toElevationFt: Number(match[4])
    }))
    .filter((edge) => Number.isFinite(edge.index) && Number.isFinite(edge.lengthFt));
  const extraction: AquatraceMoasureExtraction = {
    documentType: "moasure_export",
    source: sourceWithoutText(source),
    edges,
    flags
  };
  if (titleClientHint) extraction.titleClientHint = titleClientHint;
  if (createdDateRaw) extraction.createdDateRaw = createdDateRaw;
  if (createdDateKey) extraction.createdDateKey = createdDateKey;
  if (perimeterFt !== null) extraction.perimeterFt = perimeterFt;
  if (areaSqFt !== null) extraction.areaSqFt = areaSqFt;
  if (depthViewGallonsPerInch !== null) extraction.depthViewGallonsPerInch = depthViewGallonsPerInch;
  return extraction;
}

export function extractEvapCalc(source: AquatraceSourceDocument): AquatraceEvapExtraction {
  const text = normalizeReportText(source.text);
  const flags: string[] = [];
  const generatedDateRaw = firstCapture(text, /Generated:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const generatedDateKey = parseDateKey(generatedDateRaw);
  const evapRaw = firstCapture(text, /EVAPORATION ESTIMATE\s+(.+?)\s+inches\s*\/\s*day/i);
  const leakRaw = firstCapture(text, /POTENTIAL LEAK LOSS \(AFTER EVAPORATION\)\s+(.+?)\s+inches\s*\/\s*day/i);
  const totalRaw = firstCapture(text, /TOTAL DAILY WATER LOSS(?:\s+Approximate.*?No Repair.*?with Leak)?\s+(.+?)\s+inches\s*\/\s*day/i);
  const observedRaw = firstCapture(text, /Observed Daily Loss\s+(.+?)\s+(?:EVAPORATION ESTIMATE|POTENTIAL LEAK LOSS|TOTAL DAILY WATER LOSS)/i);
  if (!generatedDateKey) flags.push("evap_generated_date_not_found");
  const extraction: AquatraceEvapExtraction = {
    documentType: "evap_calc",
    source: sourceWithoutText(source),
    forecastRowCount: Array.from(text.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi)).length,
    flags
  };
  if (generatedDateRaw) extraction.generatedDateRaw = generatedDateRaw;
  if (generatedDateKey) extraction.generatedDateKey = generatedDateKey;
  const zipCode = firstCapture(text, /ZIP Code\s+(\d{5})/i);
  if (zipCode) extraction.zipCode = zipCode;
  const surfaceAreaSqFt = parseNumber(firstCapture(text, /Surface Area\s+([\d,.]+)\s*ft²/i));
  const waterTempF = parseNumber(firstCapture(text, /Water Temp\s+([\d.]+)°?\s*F/i));
  const airTempF = parseNumber(firstCapture(text, /Air Temp\s+([\d.]+)°?\s*F/i));
  const relativeHumidityPercent = parseNumber(firstCapture(text, /(?:RH|Relative Humidity)\s+([\d.]+)\s*%/i));
  const windMph = parseNumber(firstCapture(text, /Wind\s+([\d.]+)\s*mph/i));
  if (surfaceAreaSqFt !== null) extraction.surfaceAreaSqFt = surfaceAreaSqFt;
  if (waterTempF !== null) extraction.waterTempF = waterTempF;
  if (airTempF !== null) extraction.airTempF = airTempF;
  if (relativeHumidityPercent !== null) extraction.relativeHumidityPercent = relativeHumidityPercent;
  if (windMph !== null) extraction.windMph = windMph;
  const observedDailyLoss = parseLossNotation(observedRaw);
  const evapEstimate = parseLossNotation(evapRaw);
  const leakLossAfterEvap = parseLossNotation(leakRaw);
  const totalDailyLoss = parseLossNotation(totalRaw);
  if (observedDailyLoss) extraction.observedDailyLoss = observedDailyLoss;
  if (evapEstimate) extraction.evapEstimate = evapEstimate;
  if (leakLossAfterEvap) extraction.leakLossAfterEvap = leakLossAfterEvap;
  if (totalDailyLoss) extraction.totalDailyLoss = totalDailyLoss;
  const evapGallons = parseNumber(firstCapture(text, /EVAPORATION ESTIMATE\s+.+?\s+inches\s*\/\s*day\s+([\d,.]+)\s+gallons\s*\/\s*day/i));
  const leakGallons = parseNumber(firstCapture(text, /POTENTIAL LEAK LOSS \(AFTER EVAPORATION\)\s+.+?\s+inches\s*\/\s*day\s+([\d,.]+)\s+gallons\s*\/\s*day/i));
  const totalGallons = parseNumber(firstCapture(text, /TOTAL DAILY WATER LOSS(?:\s+Approximate.*?No Repair.*?with Leak)?\s+.+?\s+inches\s*\/\s*day\s+([\d,.]+)\s+gallons\s*\/\s*day/i));
  if (evapGallons !== null) extraction.evapGallonsPerDay = evapGallons;
  if (leakGallons !== null) extraction.leakGallonsPerDay = leakGallons;
  if (totalGallons !== null) extraction.totalGallonsPerDay = totalGallons;
  return extraction;
}

export function extractAquatraceDocument(source: AquatraceSourceDocument): AquatraceDocumentExtraction {
  const documentType = classifyAquatraceDocument(source.text, source.label);
  if (documentType === "job_report") return extractJobReport(source);
  if (documentType === "moasure_export") return extractMoasureExport(source);
  if (documentType === "evap_calc") return extractEvapCalc(source);
  return {
    documentType: "unknown",
    source: sourceWithoutText(source),
    flags: ["unknown_document_type"]
  };
}

function matchesHierarchy(clientDisplayName: string | undefined, candidate: JobberHierarchyCandidate): boolean {
  if (!clientDisplayName) return false;
  const haystack = [
    candidate.clientName,
    candidate.propertyName,
    ...(candidate.tierPath ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
  const tokens = clientDisplayName.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens.filter((token) => token.length > 2 && haystack.includes(token)).length >= Math.min(2, tokens.length);
}

function flattenVisitFields(input: {
  jobReport?: AquatraceJobReportExtraction;
  moasure?: AquatraceMoasureExtraction;
  evap?: AquatraceEvapExtraction;
  hierarchy?: JobberHierarchyCandidate;
  flags: string[];
}): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  const job = input.jobReport;
  if (job) {
    assignString(fields, "clientDisplayName", job.clientDisplayName);
    assignString(fields, "cityState", job.cityState);
    assignString(fields, "serviceDate", job.serviceDateKey);
    assignString(fields, "completionTime", job.completionTimeRaw);
    assignString(fields, "technicians", job.technicians.join(", "));
    assignString(fields, "reportFindings", job.findings);
    assignString(fields, "additionalNotes", job.additionalNotes);
    assignNumber(fields, "surfaceAreaSqFt", job.measurement.surfaceAreaSqFt);
    assignNumber(fields, "averageDepthInches", job.measurement.averageDepthInches);
    assignNumber(fields, "reportedGallonsPerInch", job.measurement.reportedGallonsPerInch);
    assignNumber(fields, "gallonsPerInch", job.measurement.gallonsPerInch);
    assignNumber(fields, "poolGallons", job.measurement.totalGallons);
    assignString(fields, "testingProceduresUsed", job.testingProcedures.used.join(", "));
    assignString(fields, "testingProceduresSuccessful", job.testingProcedures.successful.join(", "));
    if (job.checklistEvapIndex) {
      fields.checklistEvapIndexInchesPerDay = job.checklistEvapIndex.inchesPerDay;
      fields.checklistEvapIndexRaw = job.checklistEvapIndex.raw;
    }
    if (job.reportedDailyLoss) {
      fields.reportedDailyLossInchesPerDay = job.reportedDailyLoss.inchesPerDay;
      fields.reportedDailyLossRaw = job.reportedDailyLoss.raw;
    }
    for (const [key, result] of Object.entries(job.results)) {
      fields[`${key}ResultStatus`] = result.status;
      fields[`${key}HardWaterLossFound`] = result.hardWaterLossFound ? "true" : "false";
      fields[`${key}DefectWithoutLoss`] = result.defectWithoutLoss ? "true" : "false";
    }
    if (Object.keys(job.poolSpaCounts).length > 0) {
      fields.poolSpaCountsJson = JSON.stringify(job.poolSpaCounts);
    }
    if (Object.keys(job.legacyParsedCounts).length > 0) {
      fields.legacyParsedCountsJson = JSON.stringify(job.legacyParsedCounts);
    }
  }
  if (input.moasure) {
    assignString(fields, "moasureCreatedDate", input.moasure.createdDateKey);
    assignString(fields, "moasureTitleClientHint", input.moasure.titleClientHint);
    assignNumber(fields, "moasurePerimeterFt", input.moasure.perimeterFt);
    assignNumber(fields, "moasureAreaSqFt", input.moasure.areaSqFt);
    assignNumber(fields, "moasureDepthViewGallonsPerInch", input.moasure.depthViewGallonsPerInch);
    fields.moasureEdgeCount = input.moasure.edges.length;
    if (typeof input.moasure.areaSqFt === "number") {
      fields.gallonsPerInch = round(input.moasure.areaSqFt * 0.625, 4);
      fields.gallonsPerInchAuthority = "moasure_area";
    }
  }
  if (input.evap) {
    assignString(fields, "evapGeneratedDate", input.evap.generatedDateKey);
    assignString(fields, "evapZipCode", input.evap.zipCode);
    assignNumber(fields, "evapSurfaceAreaSqFt", input.evap.surfaceAreaSqFt);
    assignNumber(fields, "evapWaterTempF", input.evap.waterTempF);
    assignNumber(fields, "evapAirTempF", input.evap.airTempF);
    assignNumber(fields, "evapRelativeHumidityPercent", input.evap.relativeHumidityPercent);
    assignNumber(fields, "evapWindMph", input.evap.windMph);
    if (input.evap.observedDailyLoss) {
      fields.observedDailyLossInchesPerDay = input.evap.observedDailyLoss.inchesPerDay;
      fields.observedDailyLossRaw = input.evap.observedDailyLoss.raw;
    }
    if (input.evap.evapEstimate) {
      fields.evapEstimateInchesPerDay = input.evap.evapEstimate.inchesPerDay;
      fields.evapEstimateRaw = input.evap.evapEstimate.raw;
    }
    assignNumber(fields, "evapGallonsPerDay", input.evap.evapGallonsPerDay);
    if (input.evap.leakLossAfterEvap) {
      fields.leakLossAfterEvapInchesPerDay = input.evap.leakLossAfterEvap.inchesPerDay;
      fields.leakLossAfterEvapRaw = input.evap.leakLossAfterEvap.raw;
    }
    assignNumber(fields, "leakGallonsPerDay", input.evap.leakGallonsPerDay);
    if (input.evap.totalDailyLoss) {
      fields.totalDailyLossInchesPerDay = input.evap.totalDailyLoss.inchesPerDay;
      fields.totalDailyLossRaw = input.evap.totalDailyLoss.raw;
    }
    assignNumber(fields, "totalGallonsPerDay", input.evap.totalGallonsPerDay);
    fields.evapForecastRowCount = input.evap.forecastRowCount;
  }
  if (input.hierarchy) {
    fields.parentClientName = input.hierarchy.clientName;
    assignString(fields, "propertyName", input.hierarchy.propertyName);
    if (input.hierarchy.tierPath?.length) fields.propertyTierPath = input.hierarchy.tierPath.join(" > ");
    assignString(fields, "jobberClientId", input.hierarchy.jobberClientId);
    assignString(fields, "jobberPropertyId", input.hierarchy.jobberPropertyId);
  }
  fields.extractionFlags = input.flags.join(",");
  return fields;
}

export function extractAquatraceReportFields(text: string): Record<string, string | number> {
  const document = extractAquatraceDocument({
    id: "inline",
    label: "inline",
    text
  });
  if (document.documentType !== "job_report") {
    return {};
  }
  return flattenVisitFields({ jobReport: document, flags: document.flags });
}

export function ingestAquatraceReportSet(input: {
  documents: AquatraceSourceDocument[];
  jobberHierarchyCandidates?: JobberHierarchyCandidate[];
}): AquatraceReportSetExtraction {
  const parsedDocuments = input.documents.map((document) => extractAquatraceDocument(document));
  const jobReports = parsedDocuments.filter((document): document is AquatraceJobReportExtraction => document.documentType === "job_report");
  const moasures = parsedDocuments.filter((document): document is AquatraceMoasureExtraction => document.documentType === "moasure_export");
  const evaps = parsedDocuments.filter((document): document is AquatraceEvapExtraction => document.documentType === "evap_calc");
  const unresolvedDocs: AquatraceReportSetExtraction["unresolvedDocs"] = [];
  const usedMoasureIds = new Set<string>();
  const usedEvapIds = new Set<string>();

  const visits = jobReports.map((jobReport) => {
    const flags = [...jobReport.flags];
    const visitDateKey = jobReport.serviceDateKey;
    const moasure = moasures.find((candidate) => candidate.createdDateKey && candidate.createdDateKey === visitDateKey);
    const evap = evaps.find((candidate) => candidate.generatedDateKey && candidate.generatedDateKey === visitDateKey);
    if (moasure) usedMoasureIds.add(moasure.source.id);
    if (evap) usedEvapIds.add(evap.source.id);
    if (moasure) {
      flags.push("moasure_linked_by_date_match");
      if (typeof moasure.areaSqFt === "number" && typeof jobReport.measurement.surfaceAreaSqFt === "number") {
        const delta = Math.abs(moasure.areaSqFt - jobReport.measurement.surfaceAreaSqFt);
        if (delta > 1) {
          flags.push(`moasure_area_delta_sqft:${round(delta, 2)}`);
        }
      }
    }
    if (evap) {
      flags.push("evap_linked_by_date_match");
      if (jobReport.checklistEvapIndex && evap.evapEstimate) {
        const delta = round(evap.evapEstimate.inchesPerDay - jobReport.checklistEvapIndex.inchesPerDay, 4);
        if (Math.abs(delta) > 0.01) {
          flags.push(`evap_pdf_overrides_checklist_delta_inches:${delta}`);
        }
      }
    }
    const hierarchy = input.jobberHierarchyCandidates?.find((candidate) => matchesHierarchy(jobReport.clientDisplayName, candidate));
    if (hierarchy) flags.push("jobber_hierarchy_candidate_attached");
    const sourceDocumentIds = [jobReport.source.id];
    if (moasure) sourceDocumentIds.push(moasure.source.id);
    if (evap) sourceDocumentIds.push(evap.source.id);
    const visitKey = [
      jobReport.clientDisplayName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      visitDateKey
    ].filter(Boolean).join(":") || jobReport.source.id;
    const flattenInput: {
      jobReport?: AquatraceJobReportExtraction;
      moasure?: AquatraceMoasureExtraction;
      evap?: AquatraceEvapExtraction;
      hierarchy?: JobberHierarchyCandidate;
      flags: string[];
    } = { jobReport, flags };
    if (moasure) flattenInput.moasure = moasure;
    if (evap) flattenInput.evap = evap;
    if (hierarchy) flattenInput.hierarchy = hierarchy;
    const visit: AquatraceVisitExtraction = {
      visitKey,
      sourceDocumentIds,
      fields: flattenVisitFields(flattenInput),
      flags
    };
    if (jobReport.clientDisplayName) visit.clientDisplayName = jobReport.clientDisplayName;
    if (visitDateKey) visit.serviceDateKey = visitDateKey;
    if (hierarchy) visit.hierarchy = hierarchy;
    visit.jobReport = jobReport;
    if (moasure) visit.moasure = moasure;
    if (evap) visit.evap = evap;
    return visit;
  });

  for (const moasure of moasures) {
    if (!usedMoasureIds.has(moasure.source.id)) {
      unresolvedDocs.push({
        documentId: moasure.source.id,
        label: moasure.source.label,
        documentType: "moasure_export",
        reason: "No CompanyCam checklist visit matched this Moasure created date."
      });
    }
  }
  for (const evap of evaps) {
    if (!usedEvapIds.has(evap.source.id)) {
      unresolvedDocs.push({
        documentId: evap.source.id,
        label: evap.source.label,
        documentType: "evap_calc",
        reason: "No CompanyCam checklist visit matched this evaporation report generated date."
      });
    }
  }
  for (const unknown of parsedDocuments.filter((document): document is UnknownAquatraceDocumentExtraction => document.documentType === "unknown")) {
    unresolvedDocs.push({
      documentId: unknown.source.id,
      label: unknown.source.label,
      documentType: "unknown",
      reason: "Document type could not be classified."
    });
  }

  return { parsedDocuments, visits, unresolvedDocs };
}

export function aquatraceReportTextSnippet(textValue: string): string {
  const text = normalizeReportText(textValue);
  const anchors = [
    "Swimming Pool Leak Detection Details /Results",
    "Estimated Approximate Total Gallons",
    "Pool Evaporation Report",
    "PLAN VIEW"
  ];
  const anchor = anchors
    .map((label) => text.toLowerCase().indexOf(label.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  return text.slice(Math.max(0, anchor - 160), anchor + 640);
}
