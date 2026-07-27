import type { signedDocumentRecordSchema } from "@nexteam/core";
import { z } from "zod";

export const fieldDocsTextSnippetSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  label: z.string().min(1),
  bodyText: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const fieldReportTemplateSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  defaultText: z.string().optional(),
  snippetIds: z.array(z.string().min(1)).default([])
});

export const fieldReportTemplateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  defaultReportTitle: z.string().min(1),
  sections: z.array(fieldReportTemplateSectionSchema).min(1),
  watermarkByDefault: z.boolean().default(false),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const fieldDocsBundleSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  label: z.string().min(1),
  jobTypeKey: z.string().min(1),
  checklistTemplateId: z.string().min(1),
  reportTemplateId: z.string().min(1),
  active: z.boolean().default(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export type FieldDocsTextSnippet = z.infer<typeof fieldDocsTextSnippetSchema>;
export type FieldReportTemplateSection = z.infer<typeof fieldReportTemplateSectionSchema>;
export type FieldReportTemplate = z.infer<typeof fieldReportTemplateSchema>;
export type FieldDocsBundle = z.infer<typeof fieldDocsBundleSchema>;
export type SignedDocumentRecord = z.infer<typeof signedDocumentRecordSchema>;

function seededTimestamp(): string {
  return "2026-07-18T00:00:00.000Z";
}

export const DEFAULT_FIELD_REPORT_TEMPLATE_ID = "field_report_template_leak_detection_v1";
export const DEFAULT_FIELDDOCS_BUNDLE_ID = "fielddocs_bundle_leak_detection_v1";

export function defaultFieldReportTemplates(tenantId: string): FieldReportTemplate[] {
  return [
    fieldReportTemplateSchema.parse({
      id: DEFAULT_FIELD_REPORT_TEMPLATE_ID,
      tenantId,
      title: "Leak detection report",
      defaultReportTitle: "Leak Detection Report",
      sections: [
        { id: "summary", label: "Summary", defaultText: "Scope, findings, and closeout timing." },
        { id: "findings", label: "Findings", defaultText: "Document where loss was confirmed or ruled out." },
        { id: "next_steps", label: "Next steps", defaultText: "Recommended repair, monitoring, or follow-up." }
      ],
      watermarkByDefault: false,
      createdAt: seededTimestamp(),
      updatedAt: seededTimestamp()
    })
  ];
}

export function defaultFieldDocsBundles(tenantId: string): FieldDocsBundle[] {
  return [
    fieldDocsBundleSchema.parse({
      id: DEFAULT_FIELDDOCS_BUNDLE_ID,
      tenantId,
      label: "Leak detection job bundle",
      jobTypeKey: "AQ-LEAK-DETECT",
      checklistTemplateId: "leak_detection_checklist_v1",
      reportTemplateId: DEFAULT_FIELD_REPORT_TEMPLATE_ID,
      active: true,
      createdAt: seededTimestamp(),
      updatedAt: seededTimestamp()
    })
  ];
}
