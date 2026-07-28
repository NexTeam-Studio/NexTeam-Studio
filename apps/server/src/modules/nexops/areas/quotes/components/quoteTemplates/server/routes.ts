import type { Request, Response } from "express";
import type { QuoteTemplate } from "@nexteam/core";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";

export function registerQuoteTemplateRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    app,
    defaultTenantId,
    ensureQuoteConfiguration,
    env,
    quoteTemplateInputSchema,
    randomUUID,
    repositoryForTenant,
    requireQuoteAccess,
    sendRouteError
  } = context;

  app.get("/api/crm/quote-templates", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "listQuoteTemplates");
      const repository = repositoryForTenant();
      const { settings, templates } = await ensureQuoteConfiguration(repository, tenantId);
      res.json({ ok: true, tenantId, actorRole: access.role, settings, templates });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quote-templates", async (req: Request, res: Response) => {
    try {
      const input = quoteTemplateInputSchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "createQuoteTemplate");
      const repository = repositoryForTenant();
      const timestamp = new Date().toISOString();
      const template: QuoteTemplate = {
        id: input.id?.trim() || `quote_template_${randomUUID()}`,
        tenantId: input.tenantId,
        name: input.name.trim(),
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.titlePrefix?.trim() ? { titlePrefix: input.titlePrefix.trim() } : {}),
        ...(input.defaultLineItems?.length ? { defaultLineItems: input.defaultLineItems } : {}),
        defaultApprovalRules: input.defaultApprovalRules,
        ...(input.expiryDays !== undefined ? { expiryDays: input.expiryDays } : {}),
        ...(input.terms?.trim() ? { terms: input.terms.trim() } : {}),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const saved = await repository.upsertQuoteTemplate(template);
      res.status(201).json({ ok: true, tenantId: input.tenantId, actorRole: access.role, template: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/quote-templates/:id", async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;
      if (!templateId) {
        throw new RailError("Quote template id is required.", { provider: "native", op: "updateQuoteTemplate", status: 400 });
      }
      const input = quoteTemplateInputSchema.partial().parse(req.body);
      const tenantId = input.tenantId ?? (typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env));
      const access = await requireQuoteAccess(req, tenantId, "updateQuoteTemplate");
      const repository = repositoryForTenant();
      const existing = await repository.getQuoteTemplate(tenantId, templateId);
      if (!existing) {
        throw new RailError(`Quote template ${templateId} was not found.`, { provider: "native", op: "updateQuoteTemplate", status: 404 });
      }
      const saved = await repository.upsertQuoteTemplate({
        ...existing,
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || undefined } : {}),
        ...(input.titlePrefix !== undefined ? { titlePrefix: input.titlePrefix?.trim() || undefined } : {}),
        ...(input.defaultLineItems !== undefined ? { defaultLineItems: input.defaultLineItems } : {}),
        ...(input.defaultApprovalRules ? { defaultApprovalRules: input.defaultApprovalRules } : {}),
        ...(input.expiryDays !== undefined ? { expiryDays: input.expiryDays } : {}),
        ...(input.terms !== undefined ? { terms: input.terms?.trim() || undefined } : {}),
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId, actorRole: access.role, template: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
