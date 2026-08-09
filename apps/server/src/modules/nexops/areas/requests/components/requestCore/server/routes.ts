import type { Request, Response } from "express";
import type { RequestForm } from "@nexteam/core";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { createRequestBodySchema, requestFormBodySchema, updateRequestBodySchema } from "./routeSchemas.js";

export function registerRequestCoreRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    app,
    availableRequestFields,
    backfillLegacyLeads,
    convertRequestToJob,
    convertRequestToQuote,
    createAndNotifyRequest,
    defaultTenantId,
    deps,
    ensureRequestForms,
    env,
    eventBus,
    formPresentation,
    getRequestOrThrow,
    publicFormSubmissionValues,
    randomUUID,
    requireTenantRole,
    renderPublicRequestForm,
    repositoryForTenant,
    sanitizeFieldVisibility,
    selectRequestFields,
    sendRouteError,
    updateServiceRequestShape
  } = context;

  app.get("/api/crm/request-forms", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "listRequests" });
      const forms = await ensureRequestForms(repositoryForTenant(), tenantId);
      res.json({
        ok: true,
        forms: forms.map((form) => ({ ...form, ...formPresentation(form) })),
        availableFields: availableRequestFields()
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/request-forms", async (req: Request, res: Response) => {
    try {
      const input = requestFormBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "saveRequestForm" });
      const timestamp = new Date().toISOString();
      const form: RequestForm = {
        id: `request_form_${randomUUID()}`,
        tenantId,
        slug: input.slug ? input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        title: input.title.trim(),
        ...(input.intro?.trim() ? { intro: input.intro.trim() } : {}),
        active: input.active,
        fieldDefinitions: selectRequestFields(input.fieldKeys),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      if (!form.fieldDefinitions.length) {
        throw new RailError("Select at least one valid request field before saving the form.", { provider: "native", op: "saveRequestForm", status: 400 });
      }
      const saved = await repositoryForTenant().upsertRequestForm(form);
      res.status(201).json({ ok: true, form: { ...saved, ...formPresentation(saved) } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/request-forms/:id", async (req: Request, res: Response) => {
    try {
      const formId = req.params.id;
      if (!formId) {
        throw new RailError("Request form id is required.", { provider: "native", op: "updateRequestForm", status: 400 });
      }
      const input = requestFormBodySchema.partial().parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "updateRequestForm" });
      const existing = await repositoryForTenant().getRequestForm(tenantId, formId);
      if (!existing) {
        throw new RailError(`Request form ${formId} was not found.`, { provider: "native", op: "updateRequestForm", status: 404 });
      }
      const nextFieldDefinitions = input.fieldKeys ? selectRequestFields(input.fieldKeys) : existing.fieldDefinitions;
      const saved = await repositoryForTenant().upsertRequestForm({
        ...existing,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.slug?.trim() ? { slug: input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") } : {}),
        ...(input.intro !== undefined ? { intro: input.intro?.trim() || undefined } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        fieldDefinitions: nextFieldDefinitions,
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, form: { ...saved, ...formPresentation(saved) } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/request-forms/:tenantId/:slug", async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId ?? "");
      const slug = String(req.params.slug ?? "");
      const repository = repositoryForTenant();
      await ensureRequestForms(repository, tenantId);
      const form = await repository.getRequestFormBySlug(tenantId, slug);
      if (!form || !form.active) {
        throw new RailError("Request form was not found.", { provider: "native", op: "renderRequestForm", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPublicRequestForm(form));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/request-forms/:tenantId/:slug/submit", async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId ?? "");
      const slug = String(req.params.slug ?? "");
      const repository = repositoryForTenant();
      await ensureRequestForms(repository, tenantId);
      const form = await repository.getRequestFormBySlug(tenantId, slug);
      if (!form || !form.active) {
        throw new RailError("Request form was not found.", { provider: "native", op: "submitRequestForm", status: 404 });
      }
      const record = req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};
      const request = await createAndNotifyRequest({
        tenantId,
        source: "website_form",
        formId: form.id,
        formSlug: form.slug,
        allowIncomplete: false,
        fieldValues: publicFormSubmissionValues(form, record)
      });
      if ((req.headers["content-type"] ?? "").toString().includes("application/json")) {
        res.status(201).json({ ok: true, request });
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Request received</title><style>body{font-family:Montserrat,Arial,sans-serif;background:#f5f7f1;color:#0c1118;margin:0}main{max-width:720px;margin:0 auto;padding:40px 16px}section{border:1px solid rgba(12,17,24,.12);border-radius:28px;background:#fff;padding:24px;box-shadow:0 24px 70px rgba(12,17,24,.08)}h1{margin:0 0 12px}p{line-height:1.5}</style></head><body><main><section><h1>Request received</h1><p>The office has your request and will review it shortly.</p><p><strong>${request.clientName}</strong><br/>${request.subject}</p></section></main></body></html>`);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/requests", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "getRequest" });
      await ensureRequestForms(repositoryForTenant(), tenantId);
      const requests = await repositoryForTenant().listRequests(tenantId);
      res.json({ ok: true, requests });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/requests/:id", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "getRequest", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "getRequest" });
      const request = await getRequestOrThrow(tenantId, requestId);
      res.json({ ok: true, request });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests", async (req: Request, res: Response) => {
    try {
      const input = createRequestBodySchema.parse(req.body);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "createRequest" });
      const request = await createAndNotifyRequest(input);
      res.status(201).json({ ok: true, request });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/requests/:id", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "updateRequest", status: 400 });
      }
      const input = updateRequestBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "updateRequest" });
      const existing = await getRequestOrThrow(tenantId, requestId);
      if (existing.status === "converted_to_quote" || existing.status === "converted_to_job") {
        throw new RailError("Converted requests are read-only. Continue the work from the linked quote or job.", {
          provider: "native",
          op: "updateRequest",
          status: 409
        });
      }
      const next = updateServiceRequestShape(existing, {
        subject: input.subject,
        narrative: input.narrative,
        selectedClientId: input.selectedClientId,
        selectedPropertyId: input.selectedPropertyId,
        reviewedAt: input.reviewedAt,
        fieldPatches: input.fieldPatches?.map((field) => ({
          key: field.key,
          ...(field.value !== undefined ? { value: field.value } : {}),
          ...(sanitizeFieldVisibility(field.visibility) ? { visibility: sanitizeFieldVisibility(field.visibility) } : {})
        }))
      });
      const saved = await repositoryForTenant().updateRequest(requestId, next);
      res.json({ ok: true, request: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/archive", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "archiveRequest", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "archiveRequest" });
      const request = await getRequestOrThrow(tenantId, requestId);
      if (request.status === "converted_to_quote" || request.status === "converted_to_job") {
        throw new RailError("Converted requests remain as a read-only intake record and cannot be archived.", {
          provider: "native",
          op: "archiveRequest",
          status: 409
        });
      }
      if (request.status === "archived") {
        res.json({ ok: true, request });
        return;
      }
      const saved = await repositoryForTenant().updateRequest(requestId, {
        tenantId,
        status: "archived",
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reopenedAt: undefined
      });
      res.json({ ok: true, request: { ...request, ...saved } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/reopen", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "reopenRequest", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "reopenRequest" });
      const request = await getRequestOrThrow(tenantId, requestId);
      if (request.status !== "archived") {
        res.json({ ok: true, request });
        return;
      }
      const saved = await repositoryForTenant().updateRequest(requestId, {
        tenantId,
        status: "new",
        reopenedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: undefined
      });
      res.json({ ok: true, request: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/convert-to-quote", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "convertRequestToQuote", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "convertRequestToQuote" });
      const request = await getRequestOrThrow(tenantId, requestId);
      if (request.convertedQuoteId) {
        const quote = await repositoryForTenant().getQuote(tenantId, request.convertedQuoteId);
        if (quote) {
          res.json({ ok: true, alreadyConverted: true, request, quote });
          return;
        }
      }
      if (request.status === "converted_to_job" || request.convertedJobId) {
        throw new RailError("This request already created a job and cannot also create a quote.", {
          provider: "native",
          op: "convertRequestToQuote",
          status: 409
        });
      }
      if (request.status === "archived") {
        throw new RailError("Reopen the request before converting it.", {
          provider: "native",
          op: "convertRequestToQuote",
          status: 409
        });
      }
      if (!request.reviewedAt) {
        throw new RailError("Mark the request reviewed before creating a quote.", {
          provider: "native",
          op: "convertRequestToQuote",
          status: 409
        });
      }
      const converted = await convertRequestToQuote(repositoryForTenant(), request);
      await eventBus.emit({
        tenantId,
        type: "quote.created",
        payload: {
          quoteId: converted.quote.id,
          clientId: converted.quote.clientId,
          ...(converted.quote.requestId ? { requestId: converted.quote.requestId } : {})
        }
      });
      await eventBus.emit({
        tenantId,
        type: "request.converted_to_quote",
        payload: {
          requestId: converted.request.id,
          quoteId: converted.quote.id,
          clientId: converted.quote.clientId
        }
      });
      res.status(201).json({ ok: true, request: converted.request, quote: converted.quote, property: converted.property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/convert-to-job", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "convertRequestToJob", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "convertRequestToJob" });
      const request = await getRequestOrThrow(tenantId, requestId);
      if (request.convertedJobId) {
        const job = (await repositoryForTenant().listJobs(tenantId)).find((candidate) => candidate.id === request.convertedJobId);
        if (job) {
          res.json({ ok: true, alreadyConverted: true, request, job });
          return;
        }
      }
      if (request.status === "converted_to_quote" || request.convertedQuoteId) {
        throw new RailError("This request already created a quote and cannot also create a job.", {
          provider: "native",
          op: "convertRequestToJob",
          status: 409
        });
      }
      if (request.status === "archived") {
        throw new RailError("Reopen the request before converting it.", {
          provider: "native",
          op: "convertRequestToJob",
          status: 409
        });
      }
      if (!request.reviewedAt) {
        throw new RailError("Mark the request reviewed before creating a job.", {
          provider: "native",
          op: "convertRequestToJob",
          status: 409
        });
      }
      const converted = await convertRequestToJob(repositoryForTenant(), request);
      await eventBus.emit({
        tenantId,
        type: "job.created",
        payload: {
          jobId: converted.job.id,
          title: converted.job.title,
          createdBy: "request_conversion"
        }
      });
      await eventBus.emit({
        tenantId,
        type: "request.converted_to_job",
        payload: {
          requestId: converted.request.id,
          jobId: converted.job.id,
          clientId: converted.job.clientId
        }
      });
      res.status(201).json({ ok: true, request: converted.request, job: converted.job, property: converted.property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/backfill-leads", async (req: Request, res: Response) => {
    try {
      if (!deps.sitesRepository) {
        throw new RailError("Lead backfill is unavailable because the sites repository is not connected.", { provider: "native", op: "backfillLeads", status: 501 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "backfillLeads" });
      const leads = await deps.sitesRepository.listLeads(tenantId);
      const result = await backfillLegacyLeads({
        repository: repositoryForTenant(),
        leads,
        automation: {
          approvalQueue: deps.approvalQueue,
          commsRail: deps.commsRail,
          platformRepository: deps.platformRepository
        }
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
