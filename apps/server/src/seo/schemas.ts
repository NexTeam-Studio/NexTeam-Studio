import { z } from "zod";

export const seoKeywordSchema = z.object({
  keyword: z.string().min(1),
  geo: z.string().min(1),
  device: z.enum(["desktop", "mobile"]).default("desktop")
});

export const seoRankSnapshotSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  keyword: z.string().min(1),
  geo: z.string().min(1),
  device: z.enum(["desktop", "mobile"]),
  provider: z.enum(["dataforseo", "fixture", "unconfigured"]),
  rank: z.number().int().positive().nullable(),
  url: z.string().optional(),
  targetDomain: z.string().optional(),
  configured: z.boolean(),
  blocker: z.string().optional(),
  checkedAt: z.string().min(1)
});

export const seoAuditIssueSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["error", "warning", "info"]),
  code: z.string().min(1),
  message: z.string().min(1),
  fixAvailable: z.boolean(),
  fixSummary: z.string().optional()
});

export const seoAuditSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  siteId: z.string().min(1),
  slug: z.string().min(1),
  issues: z.array(seoAuditIssueSchema),
  passed: z.boolean(),
  approvalId: z.string().optional(),
  createdAt: z.string().min(1)
});

export const seoArticleBriefSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  keyword: z.string().min(1),
  geo: z.string().min(1),
  title: z.string().min(1),
  angle: z.string().min(1),
  outline: z.array(z.string().min(1)).min(1),
  approvalId: z.string().optional(),
  createdAt: z.string().min(1)
});

export const seoReportSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  summary: z.string().min(1),
  pdfRef: z.string().min(1),
  createdAt: z.string().min(1)
});

export const rankSnapshotInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  targetDomain: z.string().min(1).optional(),
  keywords: z.array(seoKeywordSchema).min(1)
});

export const auditSiteInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  slug: z.string().min(1).default("aquatrace")
});

export const seoFixInputSchema = auditSiteInputSchema.extend({
  issueCode: z.string().min(1).optional()
});

export const seoQueueInputSchema = z.object({
  tenantId: z.string().min(1).optional()
});

export const keywordGapBriefInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  keyword: z.string().min(1),
  geo: z.string().min(1),
  competitorUrl: z.string().optional()
});

export const seoReportInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  periodStart: z.string().min(1).optional(),
  periodEnd: z.string().min(1).optional()
});

export type SeoKeyword = z.infer<typeof seoKeywordSchema>;
export type SeoRankSnapshot = z.infer<typeof seoRankSnapshotSchema>;
export type SeoAuditIssue = z.infer<typeof seoAuditIssueSchema>;
export type SeoAudit = z.infer<typeof seoAuditSchema>;
export type SeoArticleBrief = z.infer<typeof seoArticleBriefSchema>;
export type SeoReport = z.infer<typeof seoReportSchema>;
