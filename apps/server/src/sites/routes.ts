import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  InMemoryEventBus,
  RailError,
  type ApprovalQueueService,
  type EventBus
} from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import type { CommsRail } from "../comms/gmailRegistry.js";
import type { PlatformRepository } from "../platform/repository.js";
import { buildServiceRequest, createRequestWithClientMaterialization, notifyRequestCreated } from "../crm/requestFoundation.js";
import { buildOperatorUiTheme, defaultOperatorUiTheme } from "./appearance.js";
import { generatePoolLeakSite } from "./generator.js";
import { leadSubmissionSchema, operatorUiThemeInputSchema } from "./schemas.js";
import type { SitesRepository } from "./repository.js";
import { buildStaticSitePublishBundle, ExplicitFtpsSitePublisher, ftpsTargetForTenant, type SitePublisher } from "./publisher.js";

export interface SitesRouteDeps {
  repository: SitesRepository;
  approvalQueue: ApprovalQueueService;
  crmRepository?: NativeCrmRepository | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
  commsRail?: CommsRail | undefined;
  eventBus?: EventBus | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  sitePublisher?: SitePublisher | undefined;
  siteAssetRoot?: string | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv) {
  return configuredTenantId(env, "sitesRoute");
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown Sites route error";
  res.status(status).json({ ok: false, error: message });
}

function normalizeLeadBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const record = body as Record<string, unknown>;
  const consentEmail = record["consent.email"];
  const consentSms = record["consent.sms"];
  const consentMarketing = record["consent.marketing"];
  return {
    ...record,
    consent: {
      email: consentEmail === undefined ? true : String(consentEmail) === "true",
      sms: consentSms === undefined ? false : String(consentSms) === "true",
      marketing: consentMarketing === undefined ? false : String(consentMarketing) === "true"
    }
  };
}

export function registerSitesRoutes(app: Express, deps: SitesRouteDeps): void {
  const env = deps.env ?? process.env;
  const eventBus = deps.eventBus ?? new InMemoryEventBus();
  const sitePublisher = deps.sitePublisher ?? new ExplicitFtpsSitePublisher();
  const siteAssetRoot = deps.siteAssetRoot ?? "apps/web/public";

  async function loadPublishBundle(tenantId: string, slug: string) {
    const site = await deps.repository.getSiteBySlug(tenantId, slug);
    if (!site) throw new RailError("Site was not found.", { provider: "native", op: "prepareSitePublish", status: 404 });
    return {
      site,
      bundle: await buildStaticSitePublishBundle({ tenantId, html: site.html, assetRoot: siteAssetRoot })
    };
  }

  app.post("/api/sites/:slug/publish/prepare", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER"], { requestedTenantId, op: "sitePublishPrepare" });
      const { site, bundle } = await loadPublishBundle(access.tenantId, String(req.params.slug ?? ""));
      // Validate the target now, but never include credentials in an approval record or response.
      ftpsTargetForTenant(env, access.tenantId);
      const approval = await deps.approvalQueue.create({
        tenantId: access.tenantId,
        kind: "site_publish",
        preview: {
          title: `Publish ${site.title}`,
          body: `Publish ${bundle.files.length} reviewed static website file(s) to this tenant's configured hosting folder. This updates files only; it never deletes remote files.`
        },
        execute: {
          service: "sites",
          op: "publishStaticSiteFtps",
          args: { siteId: site.id, slug: site.slug, fileCount: bundle.files.length, contentHash: bundle.contentHash, transport: "explicit_ftps", noDelete: true, actorId: actorIdForAccess(access) }
        },
        createdBy: "user"
      });
      res.status(201).json({ ok: true, approval, publish: { fileCount: bundle.files.length, contentHash: bundle.contentHash, transport: "explicit_ftps" } });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/sites/:slug/publish/execute", async (req: Request, res: Response) => {
    try {
      const approvalId = typeof req.body?.approvalId === "string" ? req.body.approvalId : "";
      if (!approvalId) throw new RailError("An approved publish item is required.", { provider: "native", op: "sitePublishExecute", status: 400 });
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER"], { requestedTenantId, op: "sitePublishExecute" });
      const approval = await deps.approvalQueue.get(access.tenantId, approvalId);
      if (!approval || approval.status !== "approved" || approval.execute.service !== "sites" || approval.execute.op !== "publishStaticSiteFtps") {
        throw new RailError("That website publish item is not approved.", { provider: "native", op: "sitePublishExecute", status: 409 });
      }
      const { site, bundle } = await loadPublishBundle(access.tenantId, String(req.params.slug ?? ""));
      const args = approval.execute.args && typeof approval.execute.args === "object"
        ? approval.execute.args as Record<string, unknown>
        : {};
      if (args.siteId !== site.id || args.slug !== site.slug || args.contentHash !== bundle.contentHash) {
        throw new RailError("The reviewed website changed. Prepare and approve it again before publishing.", { provider: "native", op: "sitePublishExecute", status: 409 });
      }
      const result = await sitePublisher.publish(ftpsTargetForTenant(env, access.tenantId), bundle);
      const completed = await deps.approvalQueue.executeApproved(access.tenantId, approval.id, actorIdForAccess(access));
      res.json({ ok: true, result, approval: completed.item });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/sites/:slug/generate", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "siteGenerate"
      });
      const site = generatePoolLeakSite({
        ...(req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {}),
        tenantId: access.tenantId,
        slug: req.params.slug
      });
      const approval = await deps.approvalQueue.create({
        tenantId: access.tenantId,
        kind: "site_publish",
        preview: {
          title: `Prepare ${site.title} website for custom domain`,
          body: `Internal site is staged at ${site.internalUrl}. Custom domain and SSL stay parked until Cloudflare setup is approved.`
        },
        execute: {
          service: "sites",
          op: "publishCustomDomain",
          args: {
            siteId: site.id,
            slug: site.slug,
            internalUrl: site.internalUrl,
            customDomainRequiresCloudflare: true,
            noExternalPublish: true,
            actorId: actorIdForAccess(access)
          }
        },
        createdBy: "user"
      });
      const saved = await deps.repository.saveSite({ ...site, approvalId: approval.id });
      res.status(201).json({ ok: true, site: saved, approval, customDomainDeferred: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/sites/:slug/model", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "siteModel"
      });
      const site = await deps.repository.getSiteBySlug(access.tenantId, String(req.params.slug ?? ""));
      if (!site) {
        throw new RailError("Site was not found.", { provider: "native", op: "getSite", status: 404 });
      }
      res.json({ ok: true, site });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/sites/operator-ui", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId,
        op: "operatorUiRead"
      });
      const theme = await deps.repository.getOperatorUiTheme(access.tenantId)
        ?? defaultOperatorUiTheme(access.tenantId);
      res.json({ ok: true, theme });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/sites/operator-ui", async (req: Request, res: Response) => {
    try {
      const input = operatorUiThemeInputSchema.parse(req.body);
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "operatorUiUpdate"
      });
      const existing = await deps.repository.getOperatorUiTheme(access.tenantId);
      const theme = buildOperatorUiTheme({
        tenantId: access.tenantId,
        patch: input,
        existing,
        actorId: actorIdForAccess(access)
      });
      const saved = await deps.repository.saveOperatorUiTheme(theme);
      res.json({ ok: true, theme: saved, actorId: actorIdForAccess(access) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/sites/:slug", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const site = await deps.repository.getSiteBySlug(tenantId, String(req.params.slug ?? ""));
      if (!site) {
        throw new RailError("Site was not found.", { provider: "native", op: "renderSite", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(site.html);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/sites/:slug/leads", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug ?? "");
      const parsed = leadSubmissionSchema.parse(normalizeLeadBody(req.body));
      const tenantId = parsed.tenantId ?? defaultTenantId(env);
      const site = await deps.repository.getSiteBySlug(tenantId, slug);
      if (!site) {
        throw new RailError("Site was not found.", { provider: "native", op: "submitLead", status: 404 });
      }
      const createdAt = new Date().toISOString();
      const lead = await deps.repository.saveLead({
        id: `lead_${randomUUID()}`,
        tenantId,
        siteId: site.id,
        slug,
        name: parsed.name,
        ...(parsed.email ? { email: parsed.email } : {}),
        ...(parsed.phone ? { phone: parsed.phone } : {}),
        ...(parsed.city ? { city: parsed.city } : {}),
        message: parsed.message,
        consent: parsed.consent,
        source: "m8_site_form",
        status: "new",
        createdAt
      });

      await eventBus.emit({
        tenantId,
        type: "lead.received",
        payload: {
          leadId: lead.id,
          slug,
          source: "m8_site_form",
          city: lead.city ?? "",
          hasEmail: !!lead.email,
          hasPhone: !!lead.phone
        }
      });

      const approval = await deps.approvalQueue.create({
        tenantId,
        kind: "email",
        preview: {
          title: `New website lead: ${lead.name}`,
          body: `${lead.name} asked for leak help from ${lead.city || "unknown city"}. Review the lead before any reply is sent.`
        },
        execute: {
          service: "sites",
          op: "notifyOwnerOfLead",
          args: {
            leadId: lead.id,
            slug,
            noOutboundSend: true
          }
        },
        createdBy: "system"
      });

      let request = null;
      if (deps.crmRepository) {
        const built = await buildServiceRequest(deps.crmRepository, {
          tenantId,
          source: "website_form",
          formSlug: slug,
          narrative: parsed.message,
          consent: parsed.consent,
          allowIncomplete: true,
          sourceLeadId: lead.id,
          fieldValues: [
            { key: "client_name", value: parsed.name },
            ...(parsed.email ? [{ key: "email", value: parsed.email }] : []),
            ...(parsed.phone ? [{ key: "phone", value: parsed.phone }] : []),
            ...(parsed.city ? [{ key: "property_city", value: parsed.city }] : []),
            { key: "issue_summary", value: parsed.message }
          ]
        });
        const linkedRequest = await createRequestWithClientMaterialization(deps.crmRepository, built);
        const notified = await notifyRequestCreated(linkedRequest, {
          approvalQueue: deps.approvalQueue,
          commsRail: deps.commsRail,
          platformRepository: deps.platformRepository
        });
        request = notified.notifications
          ? await deps.crmRepository.updateRequest(linkedRequest.id, {
            tenantId: linkedRequest.tenantId,
            notifications: notified.notifications,
            updatedAt: notified.updatedAt
          })
          : linkedRequest;
      }

      res.status(201).json({ ok: true, lead, request, event: "lead.received", approval, outboundQueuedOnly: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/sites/:slug/leads", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "siteLeads"
      });
      const leads = await deps.repository.listLeads(access.tenantId, String(req.params.slug ?? ""));
      res.json({ ok: true, leads });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
