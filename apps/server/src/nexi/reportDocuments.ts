import { PDFParse } from "pdf-parse";
import { siteJobBlueprintSchema, type DocRef, type ProjectRef, type SiteJobBlueprint, type Tenant } from "@nexteam/core";
import { CompanyCamAdapter } from "@nexteam/providers";

const TOTAL_GALLONS_LABEL = "Estimated Approximate Total Gallons";
const FINDINGS_SECTION_LABEL = "Swimming Pool Leak Detection Details /Results";

export interface CompanyCamReportExtraction {
  document: DocRef;
  fields: Record<string, string | number>;
  textSnippet: string;
  byteLength: number;
  parsed: boolean;
  error?: string | undefined;
}

export interface CompanyCamReportReadResult {
  project: ProjectRef | null;
  projects: ProjectRef[];
  documents: DocRef[];
  reports: CompanyCamReportExtraction[];
}

export interface CompanyCamReportReadInput {
  tenant: Tenant;
  projectQuery: string;
  question?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  provider?: CompanyCamAdapter | undefined;
  maxDocuments?: number | undefined;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSearch(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function usefulTokens(value: string): string[] {
  const generic = new Set(["the", "and", "for", "from", "what", "were", "was", "are", "report", "results", "findings", "issue", "pool"]);
  return Array.from(new Set(normalizeSearch(value).match(/[a-z0-9]+/g) ?? []))
    .filter((token) => token.length > 1 && !generic.has(token));
}

function isPdfDocument(document: DocRef): boolean {
  const mime = normalizeSearch(document.mime);
  const label = normalizeSearch(document.label);
  return mime.includes("pdf") || label.endsWith(".pdf") || label.includes("checklist");
}

function documentScore(document: DocRef, question: string): number {
  const label = normalizeSearch(document.label);
  let score = 0;
  if (label.includes("exported") || label.includes("checklist")) score += 20;
  if (label.includes("leak detection")) score += 8;
  if (label.includes("evaporation") || label.includes("moasure")) score -= 10;
  for (const token of usefulTokens(question)) {
    if (label.includes(token)) score += 2;
  }
  return score;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return normalizeText(result?.text);
  } finally {
    await parser.destroy();
  }
}

function numberFromMatch(match: RegExpMatchArray | null): number | null {
  const value = match?.[1];
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPoolGallons(text: string): number | null {
  return numberFromMatch(text.match(/Estimated Approximate Total Gallons\s*([\d,.]+)\s*Gallon[s]?/i))
    ?? numberFromMatch(text.match(/Total Gallons\s*[:\-]?\s*([\d,.]+)/i))
    ?? numberFromMatch(text.match(/([\d,.]+)\s*(?:pool\s*)?gallons?/i));
}

function extractFindings(text: string): string | null {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  const startIndex = lower.indexOf(FINDINGS_SECTION_LABEL.toLowerCase());
  if (startIndex < 0) {
    return null;
  }
  const afterLabel = normalized
    .slice(startIndex + FINDINGS_SECTION_LABEL.length)
    .replace(/^--\s+\d+\s+of\s+\d+\s+--\s*/i, "")
    .trim();
  const nextPageMatch = afterLabel.match(/\s--\s+\d+\s+of\s+\d+\s+--/i);
  const findings = (nextPageMatch ? afterLabel.slice(0, nextPageMatch.index) : afterLabel).trim();
  if (!findings) {
    return null;
  }
  return findings.length > 1200 ? `${findings.slice(0, 1200).trim()}...` : findings;
}

export function extractCompanyCamReportFields(text: string): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  const poolGallons = extractPoolGallons(text);
  if (poolGallons !== null) {
    fields.poolGallons = poolGallons;
  }
  const findings = extractFindings(text);
  if (findings) {
    fields.reportFindings = findings;
  }
  return fields;
}

function textSnippet(text: string): string {
  const normalized = normalizeText(text);
  const gallonsIndex = normalized.toLowerCase().indexOf(TOTAL_GALLONS_LABEL.toLowerCase());
  const findingsIndex = normalized.toLowerCase().indexOf(FINDINGS_SECTION_LABEL.toLowerCase());
  const anchor = [gallonsIndex, findingsIndex].filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? 0;
  return normalized.slice(Math.max(0, anchor - 160), anchor + 520);
}

export function siteJobBlueprintFromCompanyCamReport(input: {
  tenantId: string;
  project: ProjectRef;
  report: CompanyCamReportExtraction;
}): SiteJobBlueprint {
  const fields: Record<string, string | number> = {
    ...input.report.fields,
    projectName: input.project.name,
    documentLabel: input.report.document.label,
    companyCamProjectId: input.project.externalIds?.companycam ?? input.project.id,
    companyCamDocumentId: input.report.document.externalIds?.companycam ?? input.report.document.id
  };
  const street1 = input.project.address?.street1;
  if (street1) {
    fields.projectAddress = [
      street1,
      input.project.address?.city,
      input.project.address?.province,
      input.project.address?.postalCode
    ].filter(Boolean).join(", ");
  }
  return siteJobBlueprintSchema.parse({
    id: `site_job_companycam_${input.report.document.id}`,
    tenantId: input.tenantId,
    jobId: `companycam-project:${input.project.id}`,
    kind: "site_blueprint",
    fields,
    extractedFrom: `companycam-doc:${input.report.document.id}`,
    extractedAt: new Date().toISOString()
  }) as SiteJobBlueprint;
}

export async function readCompanyCamReports(input: CompanyCamReportReadInput): Promise<CompanyCamReportReadResult> {
  const provider = input.provider ?? CompanyCamAdapter.fromEnv(input.env ?? process.env, input.tenant.id);
  const projects = await provider.findProjects(input.projectQuery);
  const project = projects[0] ?? null;
  if (!project) {
    return { project: null, projects, documents: [], reports: [] };
  }
  const documents = await provider.getDocuments(project);
  const rankedDocuments = [...documents]
    .filter(isPdfDocument)
    .sort((left, right) => documentScore(right, input.question ?? input.projectQuery) - documentScore(left, input.question ?? input.projectQuery))
    .slice(0, input.maxDocuments ?? 4);
  const reports: CompanyCamReportExtraction[] = [];
  for (const document of rankedDocuments) {
    try {
      const binary = await provider.fetchProjectDocumentBinary(project, document);
      const text = await extractPdfText(binary.buffer);
      reports.push({
        document,
        fields: extractCompanyCamReportFields(text),
        textSnippet: textSnippet(text),
        byteLength: binary.buffer.byteLength,
        parsed: true
      });
    } catch (error) {
      reports.push({
        document,
        fields: {},
        textSnippet: "",
        byteLength: 0,
        parsed: false,
        error: error instanceof Error ? error.message : "CompanyCam report parse failed."
      });
    }
  }
  return { project, projects, documents, reports };
}
