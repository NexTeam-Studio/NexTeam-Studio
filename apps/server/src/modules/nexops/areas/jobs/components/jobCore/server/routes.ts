import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { createJobBodySchema, jobActionSchema, updateJobBodySchema } from "./routeSchemas.js";
import { quickPaymentRequestBodySchema } from "../../../../invoices/components/paymentRails/server/routeSchemas.js";

export function registerJobCoreRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    actorIdForAccess,
    app,
    createQuickPaymentRequestRecord,
    defaultTenantId,
    env,
    fieldDocsService,
    jobLifecycle,
    providerForTenant,
    publicOrigin,
    requireTenantRole,
    requireBillingAccess,
    requireQuoteAccess,
    sendRouteError,
  } = context;

  app.get("/api/crm/jobs", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "listJobs" });
      const jobs = await jobLifecycle().listJobs(tenantId);
      res.json({ ok: true, jobs });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/jobs/:id", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "getJobDetail", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "getJobDetail" });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "getJobDetail", status: 404 });
      }
      res.json({ ok: true, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs", async (req: Request, res: Response) => {
    try {
      const input = createJobBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "createJob");
      const created = await jobLifecycle().createJob({
        tenantId,
        clientId: input.clientId,
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.quoteId ? { quoteId: input.quoteId } : {}),
        title: input.title,
        ...(input.lineItems ? { lineItems: input.lineItems } : {}),
        ...(input.paymentSchedule ? { paymentSchedule: input.paymentSchedule } : {}),
        ...(input.intake ? { intake: input.intake } : {}),
        createdBy: access.tenantUserId
      });
      const bundleAttachment = await fieldDocsService().maybeAttachBundleForJob({
        tenantId,
        job: created
      });
      const job = await jobLifecycle().getJobDetail(tenantId, created.id);
      res.status(201).json({
        ok: true,
        tenantId,
        actorRole: access.role,
        job: job ?? created,
        ...(bundleAttachment ? {
          fieldDocsBundle: {
            bundleId: bundleAttachment.bundle.id,
            checklistId: bundleAttachment.checklist.id,
            reportId: bundleAttachment.report.id,
            reportTemplateId: bundleAttachment.reportTemplate.id
          }
        } : {})
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/quick-payment-request", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "createQuickPaymentRequest", status: 400 });
      }
      const input = quickPaymentRequestBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createQuickPaymentRequest");
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "createQuickPaymentRequest", status: 404 });
      }
      const result = await createQuickPaymentRequestRecord({
        tenantId,
        clientId: job.clientId,
        title: input.title.trim(),
        amount: input.amount,
        ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
        jobId: job.id,
        ...(job.requestId ? { requestId: job.requestId } : {}),
        actorId: actorIdForAccess(access),
        delivery: input.delivery,
        publicBaseUrl: publicOrigin(req)
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/jobs/:id", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "updateJob", status: 400 });
      }
      const input = updateJobBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "updateJob");
      const detail = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!detail) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "updateJob", status: 404 });
      }
      const provider = providerForTenant(tenantId);
      await provider.updateJob(jobId, {
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.paymentSchedule !== undefined ? { paymentSchedule: input.paymentSchedule } : {}),
        ...(input.clientVisibility !== undefined ? { clientVisibility: input.clientVisibility } : {}),
        updatedAt: new Date().toISOString()
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.json({ ok: true, tenantId, actorRole: access.role, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/action-preview", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "prepareJobActionPreview", status: 400 });
      }
      const input = jobActionSchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "prepareJobActionPreview");
      const preview = await jobLifecycle().prepareJobActionPreview(tenantId, jobId, input.action);
      res.json({ ok: true, tenantId, actorRole: access.role, preview });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/actions", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "performJobAction", status: 400 });
      }
      const input = jobActionSchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "performJobAction");
      const result = await jobLifecycle().performJobAction({
        tenantId,
        jobId,
        action: input.action,
        actorId: access.tenantUserId
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
