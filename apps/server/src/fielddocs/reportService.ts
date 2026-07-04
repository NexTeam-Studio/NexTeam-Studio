import type { Media } from "@nexteam/core";
import type { ChecklistInstance } from "./checklists.js";

export interface FieldReportInput {
  tenantId: string;
  jobId: string;
  title: string;
  findings: string[];
  media: Media[];
  checklist?: ChecklistInstance | undefined;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function reportLines(input: FieldReportInput): string[] {
  return [
    "NexTeam Field Report",
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
    ...input.media.map((item) => `- ${item.id}: ${item.aiCaption ?? item.storageRef}`)
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
