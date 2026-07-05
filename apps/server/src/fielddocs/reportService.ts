import type { Media } from "@nexteam/core";
import type { ChecklistInstance } from "./checklists.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export interface FieldReportInput {
  tenantId: string;
  jobId: string;
  title: string;
  findings: string[];
  media: Media[];
  checklist?: ChecklistInstance | undefined;
}

export const fieldReportRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  title: z.string().min(1),
  findings: z.array(z.string()),
  mediaIds: z.array(z.string()),
  checklistId: z.string().optional(),
  pdfRef: z.string().min(1),
  status: z.enum(["draft", "posted"]),
  createdAt: z.string(),
  postedAt: z.string().optional()
});

export type FieldReportRecord = z.infer<typeof fieldReportRecordSchema>;

export function createFieldReportRecord(input: {
  tenantId: string;
  jobId: string;
  title: string;
  findings: string[];
  mediaIds: string[];
  checklistId?: string | undefined;
  status?: "draft" | "posted" | undefined;
}): FieldReportRecord {
  const id = `report_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const status = input.status ?? "posted";
  const base = {
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    title: input.title,
    findings: input.findings,
    mediaIds: input.mediaIds,
    pdfRef: `native://tenants/${input.tenantId}/fieldReports/${id}.pdf`,
    status,
    createdAt
  };
  return fieldReportRecordSchema.parse({
    ...base,
    ...(input.checklistId ? { checklistId: input.checklistId } : {}),
    ...(status === "posted" ? { postedAt: createdAt } : {})
  }) as FieldReportRecord;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function reportLines(input: FieldReportInput): string[] {
  return [
    "Aquatrace Field Documentation Report",
    `Title: ${input.title}`,
    `Tenant: ${input.tenantId}`,
    `Job: ${input.jobId}`,
    "",
    "Findings:",
    ...input.findings.map((finding) => `- ${finding}`),
    "",
    "Checklist:",
    ...(input.checklist?.items.map((item) => `- ${item.label}: ${item.status}`) ?? ["- No checklist attached"]),
    "",
    "Media:",
    ...input.media.map((item) => `- ${item.id}: ${item.aiCaption ?? item.storageRef}`),
    "",
    "Compliance Blocks:",
    "- Field documentation only; no engineering, legal, or regulatory determination.",
    "- Photos, checklist notes, and findings remain subject to operator review.",
    "- VGB documentation template language is informational and approval-gated before delivery."
  ];
}

export function renderFieldReportPdf(input: FieldReportInput): Buffer {
  const content = reportLines(input)
    .slice(0, 38)
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
