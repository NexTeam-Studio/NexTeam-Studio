import { randomUUID } from "node:crypto";
import { type ApprovalItem, type ApprovalQueueService, RailError } from "@nexteam/core";
import type { SitesRepository } from "../sites/repository.js";
import type { GeneratedSite } from "../sites/schemas.js";
import { applySeoFixToSite, auditSiteSeo } from "./auditEngine.js";
import { DataForSeoRankProvider, type RankProvider } from "./dataForSeoProvider.js";
import { buildSeoReportPdf } from "./reportPdf.js";
import {
  type SeoArticleBrief,
  type SeoAudit,
  type SeoKeyword,
  type SeoRankSnapshot,
  type SeoReport
} from "./schemas.js";
import type { SeoRepository } from "./repository.js";

export interface SeoServiceInput {
  repository: SeoRepository;
  sitesRepository: SitesRepository;
  approvalQueue: ApprovalQueueService;
  rankProvider?: RankProvider | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface SeoQueue {
  approvals: ApprovalItem[];
  audits: SeoAudit[];
  articleBriefs: SeoArticleBrief[];
  reports: SeoReport[];
}

function now(): string {
  return new Date().toISOString();
}

function defaultTargetDomain(env: NodeJS.ProcessEnv): string {
  return env.M9_TARGET_DOMAIN || "aquatraceleak.com";
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return { start: start.toISOString(), end: end.toISOString() };
}

function briefTitle(keyword: string, geo: string): string {
  return `${keyword} in ${geo}: what pool owners should know`;
}

export class SeoService {
  private readonly rankProvider: RankProvider;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly input: SeoServiceInput) {
    this.env = input.env ?? process.env;
    this.rankProvider = input.rankProvider ?? new DataForSeoRankProvider(this.env);
  }

  async rankSnapshot(input: {
    tenantId: string;
    keywords: SeoKeyword[];
    targetDomain?: string | undefined;
    now?: string | undefined;
  }): Promise<SeoRankSnapshot[]> {
    const snapshots = await this.rankProvider.fetchSnapshots({
      tenantId: input.tenantId,
      keywords: input.keywords,
      targetDomain: input.targetDomain ?? defaultTargetDomain(this.env),
      now: input.now
    });
    return this.input.repository.saveRankSnapshots(snapshots);
  }

  async auditSite(tenantId: string, slug: string, createdAt = now()): Promise<{ site: GeneratedSite; audit: SeoAudit }> {
    const site = await this.input.sitesRepository.getSiteBySlug(tenantId, slug);
    if (!site) {
      throw new RailError(`Site ${slug} was not found.`, { provider: "native", op: "seoAudit", status: 404 });
    }
    const issues = auditSiteSeo(site);
    const audit = await this.input.repository.saveAudit({
      id: `seo_audit_${randomUUID()}`,
      tenantId,
      siteId: site.id,
      slug: site.slug,
      issues,
      passed: issues.filter((issue) => issue.severity === "error").length === 0,
      createdAt
    });
    return { site, audit };
  }

  async draftSiteFix(input: {
    tenantId: string;
    slug: string;
    issueCode?: string | undefined;
    actorId?: string | undefined;
  }): Promise<{ site: GeneratedSite; audit: SeoAudit; approval: ApprovalItem | null }> {
    const { site, audit } = await this.auditSite(input.tenantId, input.slug);
    const issue = audit.issues.find((candidate) => candidate.fixAvailable && (!input.issueCode || candidate.code === input.issueCode));
    if (!issue) {
      return { site, audit, approval: null };
    }
    const approval = await this.input.approvalQueue.create({
      tenantId: input.tenantId,
      kind: "seo_fix",
      preview: {
        title: `SEO fix for ${site.title}`,
        body: `${issue.message} Proposed fix: ${issue.fixSummary ?? "Re-render the site SEO fields from the tenant site model."}`
      },
      execute: {
        service: "seo",
        op: "applySiteSeoFix",
        args: {
          tenantId: input.tenantId,
          siteId: site.id,
          slug: site.slug,
          issueCode: issue.code,
          actorId: input.actorId ?? "nexi",
          noExternalPublish: true
        }
      },
      createdBy: "nexi"
    });
    const savedAudit = await this.input.repository.saveAudit({ ...audit, approvalId: approval.id });
    return { site, audit: savedAudit, approval };
  }

  async approveAndApplySiteFix(input: {
    tenantId: string;
    slug: string;
    approvalId: string;
  }): Promise<{ approval: ApprovalItem; site: GeneratedSite; remainingAudit: SeoAudit }> {
    const approval = await this.input.approvalQueue.approve(input.approvalId);
    const site = await this.input.sitesRepository.getSiteBySlug(input.tenantId, input.slug);
    if (!site) {
      throw new RailError(`Site ${input.slug} was not found.`, { provider: "native", op: "seoApplyFix", status: 404 });
    }
    const fixed = await this.input.sitesRepository.saveSite(applySeoFixToSite(site));
    const remaining = await this.input.repository.saveAudit({
      id: `seo_audit_${randomUUID()}`,
      tenantId: input.tenantId,
      siteId: fixed.id,
      slug: fixed.slug,
      issues: auditSiteSeo(fixed),
      passed: auditSiteSeo(fixed).filter((issue) => issue.severity === "error").length === 0,
      createdAt: now(),
      approvalId: approval.id
    });
    return { approval, site: fixed, remainingAudit: remaining };
  }

  async draftArticleBrief(input: {
    tenantId: string;
    keyword: string;
    geo: string;
    competitorUrl?: string | undefined;
  }): Promise<{ brief: SeoArticleBrief; approval: ApprovalItem }> {
    const title = briefTitle(input.keyword, input.geo);
    const outline = [
      `What ${input.keyword} means for pool owners in ${input.geo}`,
      "Signs that point to a real leak instead of normal evaporation",
      "What Aquatrace checks during a visit",
      "When to schedule a professional leak detection"
    ];
    const createdAt = now();
    const approval = await this.input.approvalQueue.create({
      tenantId: input.tenantId,
      kind: "article",
      preview: {
        title,
        body: `${title}\n\nAngle: Local, plain-English article brief from the SEO keyword gap. Publishing stays approval-gated.`
      },
      execute: {
        service: "content",
        op: "draftSeoArticle",
        args: {
          tenantId: input.tenantId,
          keyword: input.keyword,
          geo: input.geo,
          competitorUrl: input.competitorUrl ?? "",
          publishingDeferredUntilCredentials: true
        }
      },
      createdBy: "nexi"
    });
    const brief = await this.input.repository.saveArticleBrief({
      id: `seo_brief_${randomUUID()}`,
      tenantId: input.tenantId,
      keyword: input.keyword,
      geo: input.geo,
      title,
      angle: input.competitorUrl
        ? `Close the local gap against ${input.competitorUrl} without copying their content.`
        : "Answer the question a local pool owner would ask before booking.",
      outline,
      approvalId: approval.id,
      createdAt
    });
    return { brief, approval };
  }

  async queue(tenantId: string): Promise<SeoQueue> {
    const pending = await this.input.approvalQueue.listPending(tenantId);
    return {
      approvals: pending.filter((item) => item.kind === "seo_fix" || (item.kind === "article" && item.execute.op === "draftSeoArticle")),
      audits: await this.input.repository.listAudits(tenantId),
      articleBriefs: await this.input.repository.listArticleBriefs(tenantId),
      reports: await this.input.repository.listReports(tenantId)
    };
  }

  async monthlyReport(input: {
    tenantId: string;
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
  }): Promise<{ report: SeoReport; pdf: Buffer }> {
    const period = input.periodStart && input.periodEnd
      ? { start: input.periodStart, end: input.periodEnd }
      : defaultPeriod();
    const snapshots = await this.input.repository.listRankSnapshots(input.tenantId);
    const audits = await this.input.repository.listAudits(input.tenantId);
    const latestAudit = audits[0];
    const ranked = snapshots.filter((snapshot) => snapshot.rank !== null).length;
    const unconfigured = snapshots.filter((snapshot) => !snapshot.configured).length;
    const summary = [
      `${ranked} tracked keywords have a visible rank in the saved snapshots.`,
      `${unconfigured} keyword checks are blocked by missing DataForSEO configuration.`,
      latestAudit ? `Latest site audit: ${latestAudit.passed ? "passed" : `${latestAudit.issues.length} issue(s) open`}.` : "No site audit has been saved yet."
    ].join(" ");
    const report: SeoReport = {
      id: `seo_report_${randomUUID()}`,
      tenantId: input.tenantId,
      periodStart: period.start,
      periodEnd: period.end,
      summary,
      pdfRef: `memory://seo-reports/${input.tenantId}/${Date.now()}.pdf`,
      createdAt: now()
    };
    const saved = await this.input.repository.saveReport(report);
    const pdf = buildSeoReportPdf({
      title: "NexTeam SEO Report",
      lines: [
        `Tenant: ${input.tenantId}`,
        `Period: ${period.start} to ${period.end}`,
        summary,
        "Plain-English report only. Publishing and site changes remain approval-gated."
      ]
    });
    return { report: saved, pdf };
  }
}
