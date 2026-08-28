import type { Media, SignedDocumentRecord } from "@nexteam/core";
import { formatChecklistFieldValue, type ChecklistInstance } from "./checklists.js";
import { escapePdfText, renderTextPdf } from "../shared/documentRendering/pdfEngine.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export interface FieldReportInput {
  tenantId: string;
  jobId: string;
  propertyId?: string | undefined;
  visitId?: string | undefined;
  kind?: "field_report" | "ai_recap" | "evaporation" | undefined;
  title: string;
  findings: string[];
  media: Media[];
  checklist?: ChecklistInstance | undefined;
  visitNotes?: string[] | undefined;
  watermarkLabel?: string | undefined;
  watermarkAssetUrl?: string | undefined;
}

export const fieldReportRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  propertyId: z.string().optional(),
  visitId: z.string().optional(),
  kind: z.enum(["field_report", "ai_recap", "evaporation"]).default("field_report"),
  title: z.string().min(1),
  findings: z.array(z.string()),
  mediaIds: z.array(z.string()),
  checklistId: z.string().optional(),
  templateId: z.string().optional(),
  snippetIds: z.array(z.string()).optional(),
  watermarkEnabled: z.boolean().optional(),
  evaporationReportId: z.string().min(1).optional(),
  pdfRef: z.string().min(1),
  status: z.enum(["draft", "posted"]),
  createdAt: z.string(),
  postedAt: z.string().optional()
});

export type FieldReportRecord = z.infer<typeof fieldReportRecordSchema>;

export function createFieldReportRecord(input: {
  tenantId: string;
  jobId: string;
  propertyId?: string | undefined;
  visitId?: string | undefined;
  kind?: "field_report" | "ai_recap" | "evaporation" | undefined;
  title: string;
  findings: string[];
  mediaIds: string[];
  checklistId?: string | undefined;
  templateId?: string | undefined;
  snippetIds?: string[] | undefined;
  watermarkEnabled?: boolean | undefined;
  id?: string | undefined;
  pdfRef?: string | undefined;
  createdAt?: string | undefined;
  postedAt?: string | undefined;
  evaporationReportId?: string | undefined;
  status?: "draft" | "posted" | undefined;
}): FieldReportRecord {
  const id = input.id ?? `report_${randomUUID()}`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const status = input.status ?? "posted";
  const base = {
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    ...(input.visitId ? { visitId: input.visitId } : {}),
    kind: input.kind ?? "field_report",
    title: input.title,
    findings: input.findings,
    mediaIds: input.mediaIds,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.snippetIds?.length ? { snippetIds: input.snippetIds } : {}),
    ...(input.watermarkEnabled !== undefined ? { watermarkEnabled: input.watermarkEnabled } : {}),
    pdfRef: input.pdfRef ?? `native://tenants/${input.tenantId}/fieldReports/${id}.pdf`,
    status,
    createdAt
  };
  return fieldReportRecordSchema.parse({
    ...base,
    ...(input.checklistId ? { checklistId: input.checklistId } : {}),
    ...(input.evaporationReportId ? { evaporationReportId: input.evaporationReportId } : {}),
    ...(status === "posted" ? { postedAt: input.postedAt ?? createdAt } : {})
  }) as FieldReportRecord;
}

function reportLines(input: FieldReportInput): string[] {
  const blockedSections = new Set(
    (input.checklist?.sectionStates ?? [])
      .filter((section) => section.status === "not_applicable")
      .map((section) => section.section)
  );
  const visibleFields = (input.checklist?.fields ?? []).filter((field) => !blockedSections.has(field.section));
  const narrationLines = input.media.flatMap((item) => (item.comments ?? []).map((comment) => `${item.id}: ${comment.text}`));
  return [
    input.kind === "ai_recap" ? "NexCam AI Recap" : input.kind === "evaporation" ? "NexCam Evaporation Report" : "NexCam Field Report",
    ...(input.watermarkLabel ? [`Watermark: ${input.watermarkLabel}`] : []),
    ...(input.watermarkAssetUrl ? [`Watermark asset: ${input.watermarkAssetUrl}`] : []),
    `Title: ${input.title}`,
    `Tenant: ${input.tenantId}`,
    `Job: ${input.jobId}`,
    ...(input.propertyId ? [`Property: ${input.propertyId}`] : []),
    ...(input.visitId ? [`Visit: ${input.visitId}`] : []),
    "",
    input.kind === "ai_recap" ? "Recap:" : "Findings:",
    ...input.findings.map((finding) => `- ${finding}`),
    ...((input.visitNotes ?? []).length ? ["", "Visit notes:", ...(input.visitNotes ?? []).map((note) => `- ${note}`)] : []),
    "",
    "Checklist:",
    ...visibleFields.map((field) => `- ${field.label}: ${formatChecklistFieldValue(field)}`),
    ...(!visibleFields.length ? ["- No checklist attached"] : []),
    "",
    "Media:",
    ...input.media.map((item) => `- ${item.id}: ${item.aiCaption ?? item.storageRef}`),
    ...(narrationLines.length ? ["", "Narration:", ...narrationLines.map((line) => `- ${line}`)] : []),
    "",
    "Compliance Blocks:",
    "- Field documentation only; no engineering, legal, or regulatory determination.",
    "- Photos, checklist notes, and findings remain subject to operator review.",
    "- VGB documentation template language is informational and approval-gated before delivery."
  ];
}

export function renderFieldReportPdf(input: FieldReportInput): Buffer {
  return renderTextPdf(reportLines(input).slice(0, 38), { fontSize: 10, lineHeight: 17 });
}

export function renderSignedDocumentPdf(record: SignedDocumentRecord): Buffer {
  const lines = [
    "NexOps Signed Document",
    `Title: ${record.title}`,
    `Kind: ${record.kind}`,
    `Client: ${record.clientId}`,
    ...(record.jobId ? [`Job: ${record.jobId}`] : []),
    ...(record.propertyId ? [`Property: ${record.propertyId}`] : []),
    ...(record.visitId ? [`Visit: ${record.visitId}`] : []),
    `Status: ${record.status}`,
    "",
    "Body:",
    ...record.bodyText.split(/\r?\n/),
    "",
    "Signature:",
    ...(record.signature
      ? [
          `Mode: ${record.signature.mode}`,
          ...(record.signature.typedName ? [`Typed name: ${record.signature.typedName}`] : []),
          `Signed at: ${record.signature.signedAt}`,
          `IP: ${record.signature.ipAddress}`
        ]
      : ["Pending signature"])
  ];
  const content = lines
    .slice(0, 42)
    .map((line, index) => `BT /F1 10 Tf 50 ${750 - index * 17} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}
