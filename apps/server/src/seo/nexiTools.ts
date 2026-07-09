import { z } from "zod";
import { type ApprovalQueueService, type NexiTool, type Source } from "@nexteam/core";
import type { AccessContext } from "../auth/accessContext.js";
import { actorIdForAccess } from "../auth/accessContext.js";
import type { SitesRepository } from "../sites/repository.js";
import { DataForSeoRankProvider } from "./dataForSeoProvider.js";
import type { SeoRepository } from "./repository.js";
import {
  auditSiteInputSchema,
  keywordGapBriefInputSchema,
  rankSnapshotInputSchema,
  seoReportInputSchema,
  seoQueueInputSchema
} from "./schemas.js";
import { SeoService } from "./service.js";

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

export function createSeoNexiTools(input: {
  repository: SeoRepository;
  sitesRepository: SitesRepository;
  approvalQueue: ApprovalQueueService;
  access: AccessContext;
  env?: NodeJS.ProcessEnv | undefined;
}): NexiTool[] {
  const env = input.env ?? process.env;
  const service = new SeoService({
    repository: input.repository,
    sitesRepository: input.sitesRepository,
    approvalQueue: input.approvalQueue,
    rankProvider: new DataForSeoRankProvider(env),
    env
  });

  return [
    {
      name: "rankSnapshot",
      description: "Check saved or live local SEO ranks for keyword and city pairs. If DataForSEO is not configured, return a clear blocker instead of guessing.",
      inputSchema: rankSnapshotInputSchema,
      handler: async (tenant, args) => {
        const parsed = rankSnapshotInputSchema.parse(args);
        const snapshots = await service.rankSnapshot({
          tenantId: tenant.id,
          targetDomain: parsed.targetDomain,
          keywords: parsed.keywords
        });
        return {
          result: {
            snapshots,
            configured: snapshots.every((snapshot) => snapshot.configured),
            blocker: snapshots.find((snapshot) => snapshot.blocker)?.blocker
          },
          sources: snapshots.map((snapshot) => source(snapshot.id, `${snapshot.keyword} in ${snapshot.geo}`))
        };
      }
    },
    {
      name: "auditSiteSeo",
      description: "Audit a tenant's generated website for SEO basics and optionally queue the first safe fix for approval.",
      inputSchema: auditSiteInputSchema.extend({ queueFix: z.boolean().default(false), issueCode: z.string().optional() }),
      handler: async (tenant, args) => {
        const parsed = auditSiteInputSchema.extend({ queueFix: z.boolean().default(false), issueCode: z.string().optional() }).parse(args);
        if (parsed.queueFix) {
          const result = await service.draftSiteFix({
            tenantId: tenant.id,
            slug: parsed.slug,
            issueCode: parsed.issueCode,
            actorId: actorIdForAccess(input.access)
          });
          return {
            result,
            sources: [source(result.audit.id, `SEO audit for ${result.site.title}`)]
          };
        }
        const result = await service.auditSite(tenant.id, parsed.slug);
        return {
          result,
          sources: [source(result.audit.id, `SEO audit for ${result.site.title}`)]
        };
      }
    },
    {
      name: "seoQueue",
      description: "Show pending SEO fixes, article briefs, saved audits, and reports for this tenant.",
      inputSchema: seoQueueInputSchema,
      handler: async (tenant, args) => {
        seoQueueInputSchema.parse(args);
        const queue = await service.queue(tenant.id);
        return {
          result: queue,
          sources: [
            ...queue.approvals.map((approval) => source(approval.id, approval.preview.title)),
            ...queue.audits.slice(0, 5).map((audit) => source(audit.id, `SEO audit for ${audit.slug}`))
          ]
        };
      }
    },
    {
      name: "draftSeoArticleBrief",
      description: "Draft an SEO article brief from a keyword gap and park it in ApprovalQueue. Does not publish.",
      inputSchema: keywordGapBriefInputSchema,
      handler: async (tenant, args) => {
        const parsed = keywordGapBriefInputSchema.parse(args);
        const result = await service.draftArticleBrief({
          tenantId: tenant.id,
          keyword: parsed.keyword,
          geo: parsed.geo,
          competitorUrl: parsed.competitorUrl
        });
        return {
          result: { ...result, publishingDeferred: true },
          sources: [source(result.brief.id, result.brief.title), source(result.approval.id, result.approval.preview.title)]
        };
      }
    },
    {
      name: "seoReport",
      description: "Create a monthly plain-English SEO report PDF summary for this tenant.",
      inputSchema: seoReportInputSchema,
      handler: async (tenant, args) => {
        const parsed = seoReportInputSchema.parse(args);
        const result = await service.monthlyReport({
          tenantId: tenant.id,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd
        });
        return {
          result: {
            report: result.report,
            pdfBytes: result.pdf.byteLength,
            pdfRef: result.report.pdfRef
          },
          sources: [source(result.report.id, "Monthly SEO report")]
        };
      }
    }
  ];
}
