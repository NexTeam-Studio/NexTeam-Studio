import { randomUUID } from "node:crypto";
import { renderStaticSite } from "../sites/renderer.js";
import type { GeneratedSite } from "../sites/schemas.js";
import type { SeoAuditIssue } from "./schemas.js";

function issue(input: Omit<SeoAuditIssue, "id">): SeoAuditIssue {
  return { id: `seo_issue_${randomUUID()}`, ...input };
}

function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

function hasJsonLdType(html: string, type: string): boolean {
  return jsonLdBlocks(html).some((block) => block.includes(`"@type":"${type}"`) || block.includes(`"@type": "${type}"`));
}

export function auditSiteSeo(site: GeneratedSite): SeoAuditIssue[] {
  const issues: SeoAuditIssue[] = [];
  if (!/<title>[^<]{10,70}<\/title>/i.test(site.html)) {
    issues.push(issue({
      severity: "warning",
      code: "title_length",
      message: "The page title should be clear and roughly 10-70 characters.",
      fixAvailable: true,
      fixSummary: "Re-render the page title from the tenant business name."
    }));
  }
  if (!/<meta\s+name=["']description["']\s+content=["'][^"']{50,180}["']\s*\/?>/i.test(site.html)) {
    issues.push(issue({
      severity: "warning",
      code: "missing_or_weak_meta_description",
      message: "The page needs a useful meta description for search previews.",
      fixAvailable: true,
      fixSummary: "Add the default leak-detection meta description."
    }));
  }
  if (!hasJsonLdType(site.html, "LocalBusiness")) {
    issues.push(issue({
      severity: "error",
      code: "missing_localbusiness_json_ld",
      message: "The site is missing LocalBusiness structured data.",
      fixAvailable: true,
      fixSummary: "Re-render the site with NexTeam's default LocalBusiness JSON-LD."
    }));
  }
  if (!hasJsonLdType(site.html, "Service")) {
    issues.push(issue({
      severity: "error",
      code: "missing_service_json_ld",
      message: "The site is missing Service structured data for its services.",
      fixAvailable: true,
      fixSummary: "Re-render the site with Service JSON-LD for the service cards."
    }));
  }
  if (!/action="\/api\/sites\/[^"]+\/leads"/i.test(site.html)) {
    issues.push(issue({
      severity: "error",
      code: "missing_lead_form_action",
      message: "The lead form is not wired to NexTeam's lead intake route.",
      fixAvailable: true,
      fixSummary: "Re-render the lead form action from the site slug."
    }));
  }
  return issues;
}

export function applySeoFixToSite(site: GeneratedSite, now = new Date().toISOString()): GeneratedSite {
  const next = {
    ...site,
    updatedAt: now
  };
  return {
    ...next,
    html: renderStaticSite(next)
  };
}
