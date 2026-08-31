import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { createJobBodySchema, customerDocumentPackageDeliverySchema, customerDocumentPackageSelectionSchema, jobActionSchema, updateJobBodySchema } from "./routeSchemas.js";
import { renderJobPdf } from "./jobDocument.js";

function packageArtifactKey(entry: { id: string; source: string }): string {
  return `${entry.source}:${entry.id}`;
}

function isFinancialArtifact(entry: { kind: string }): boolean {
  return entry.kind === "invoice" || entry.kind === "receipt";
}

type CloseoutArtifact = {
  id: string;
  source: string;
  kind: string;
  label?: string | undefined;
  fileName?: string | undefined;
  mimeType?: string | undefined;
  occurredAt?: string | undefined;
  jobId?: string | undefined;
  propertyId?: string | undefined;
  visitId?: string | undefined;
};

type CloseoutLibrary = {
  folders: Array<{ documents: CloseoutArtifact[] }>;
  unfiled: CloseoutArtifact[];
  officeRecords: CloseoutArtifact[];
  nexcam: {
    reports: CloseoutArtifact[];
    signedDocuments: CloseoutArtifact[];
    media: CloseoutArtifact[];
  };
};

async function resolveCloseoutArtifacts(input: {
  tenantId: string;
  job: { id: string; clientId: string; propertyId?: string | undefined };
  role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
  nexDocsService: () => { listClientLibrary(input: { tenantId: string; clientId: string; propertyId?: string; viewer: "staff"; includeClientStatement: false }): Promise<CloseoutLibrary> };
}) {
  const library = await input.nexDocsService().listClientLibrary({
    tenantId: input.tenantId,
    clientId: input.job.clientId,
    ...(input.job.propertyId ? { propertyId: input.job.propertyId } : {}),
    viewer: "staff",
    includeClientStatement: false
  });
  const entries = [
    ...library.folders.flatMap((folder) => folder.documents),
    ...library.unfiled,
    ...library.officeRecords,
    ...library.nexcam.reports,
    ...library.nexcam.signedDocuments,
    ...library.nexcam.media
  ].filter((entry) => entry.jobId === input.job.id)
    .filter((entry) => input.role !== "TECHNICIAN" || !isFinancialArtifact(entry));
  return [...new Map(entries.map((entry) => [packageArtifactKey(entry), entry])).values()].map((entry) => ({
    artifactId: entry.id,
    source: (entry.source === "nexcam" ? "nexcam" : entry.source === "generated" ? "generated" : "nexdocs") as "nexdocs" | "nexcam" | "generated",
    kind: entry.kind,
    label: entry.label ?? entry.fileName ?? "Untitled document",
    fileName: entry.fileName ?? entry.label ?? "document",
    mimeType: entry.mimeType,
    occurredAt: entry.occurredAt,
    ...(entry.propertyId ? { propertyId: entry.propertyId } : {}),
    ...(entry.visitId ? { visitId: entry.visitId } : {})
  }));
}
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
    nexDocsService,
    providerForTenant,
    publicOrigin,
    repositoryForTenant,
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

  app.get("/api/crm/jobs/:id/pdf", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim() ? req.query.tenantId : defaultTenantId(env);
      if (!jobId) throw new RailError("Job id is required.", { provider: "native", op: "renderJobPdf", status: 400 });
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "renderJobPdf" });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) throw new RailError("Job was not found.", { provider: "native", op: "renderJobPdf", status: 404 });
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderJobPdf(job, settings.documentDesign));
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/crm/jobs/:id/closeout-package", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) throw new RailError("Job id is required.", { provider: "native", op: "getCloseoutPackage", status: 400 });
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim() ? req.query.tenantId : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getCloseoutPackage");
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "getCloseoutPackage", status: 404 });
      const [pkg, artifacts] = await Promise.all([
        jobLifecycle().getCustomerDocumentPackage(tenantId, jobId),
        resolveCloseoutArtifacts({ tenantId, job, role: access.role, nexDocsService })
      ]);
      res.json({ ok: true, tenantId, actorRole: access.role, package: pkg, artifacts });
    } catch (error) { sendRouteError(res, error); }
  });

  app.put("/api/crm/jobs/:id/closeout-package", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) throw new RailError("Job id is required.", { provider: "native", op: "saveCloseoutPackage", status: 400 });
      const input = customerDocumentPackageSelectionSchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "saveCloseoutPackage");
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "saveCloseoutPackage", status: 404 });
      const artifacts = await resolveCloseoutArtifacts({ tenantId, job, role: access.role, nexDocsService });
      const eligible = new Map(artifacts.map((artifact) => [`${artifact.source}:${artifact.artifactId}`, artifact]));
      const selectedArtifactRefs = input.selectedArtifactRefs.map((reference) => {
        const artifact = eligible.get(`${reference.source}:${reference.artifactId}`);
        if (!artifact || artifact.kind !== reference.kind || artifact.visitId !== reference.visitId) {
          throw new RailError("A selected closeout artifact is no longer eligible for this Job.", { provider: "native", op: "saveCloseoutPackage", status: 400 });
        }
        return { artifactId: artifact.artifactId, source: artifact.source, kind: artifact.kind, ...(artifact.visitId ? { visitId: artifact.visitId } : {}) };
      });
      const pkg = await jobLifecycle().saveCustomerDocumentPackageSelection({ tenantId, jobId, actorId: access.tenantUserId, selectedArtifactRefs, ...(input.expectedPackageVersion ? { expectedPackageVersion: input.expectedPackageVersion } : {}) });
      res.json({ ok: true, tenantId, actorRole: access.role, package: pkg, artifacts });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/crm/jobs/:id/closeout-package/delivery-review", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) throw new RailError("Job id is required.", { provider: "native", op: "getCloseoutPackageDeliveryReview", status: 400 });
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim() ? req.query.tenantId : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getCloseoutPackageDeliveryReview");
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "getCloseoutPackageDeliveryReview", status: 404 });
      const artifacts = await resolveCloseoutArtifacts({ tenantId, job, role: access.role, nexDocsService });
      const preview = await jobLifecycle().prepareCustomerDocumentPackageDelivery({ tenantId, jobId, artifacts });
      res.json({ ok: true, tenantId, actorRole: access.role, preview });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/crm/jobs/:id/closeout-package/delivery", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) throw new RailError("Job id is required.", { provider: "native", op: "sendCloseoutPackageDelivery", status: 400 });
      const input = customerDocumentPackageDeliverySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendCloseoutPackageDelivery");
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "sendCloseoutPackageDelivery", status: 404 });
      const artifacts = await resolveCloseoutArtifacts({ tenantId, job, role: access.role, nexDocsService });
      const eligible = new Map(artifacts.map((artifact) => [`${artifact.source}:${artifact.artifactId}`, artifact]));
      const selectedArtifactRefs = input.selectedArtifactRefs.map((reference) => {
        const artifact = eligible.get(`${reference.source}:${reference.artifactId}`);
        if (!artifact || artifact.kind !== reference.kind || artifact.visitId !== reference.visitId) {
          throw new RailError("A selected closeout artifact is no longer eligible for this Job.", { provider: "native", op: "sendCloseoutPackageDelivery", status: 400 });
        }
        return { artifactId: artifact.artifactId, source: artifact.source, kind: artifact.kind, ...(artifact.visitId ? { visitId: artifact.visitId } : {}) };
      });
      const preview = await jobLifecycle().sendCustomerDocumentPackageDelivery({ tenantId, jobId, actorId: access.tenantUserId, recipient: input.recipient, subject: input.subject, bodyText: input.bodyText, ...(input.copyTarget ? { copyTarget: input.copyTarget } : {}), ...(input.sendCopy !== undefined ? { sendCopy: input.sendCopy } : {}), selectedArtifactRefs, artifacts });
      res.json({ ok: true, tenantId, actorRole: access.role, preview });
    } catch (error) { sendRouteError(res, error); }
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
        ...(input.customFields ? { customFields: input.customFields } : {}),
        ...(input.assignedOwnerId ? { assignedOwnerId: input.assignedOwnerId } : {}),
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
        ...(input.assignedOwnerId !== undefined ? { assignedOwnerId: input.assignedOwnerId ?? undefined } : {}),
        ...(input.customFields !== undefined ? { customFields: input.customFields } : {}),
        updatedAt: new Date().toISOString()
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.json({ ok: true, tenantId, actorRole: access.role, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/jobs/:id/completion-status", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "completionStatus", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "completionStatus");
      const completion = await jobLifecycle().completionStatus(tenantId, jobId);
      res.json({ ok: true, tenantId, actorRole: access.role, completion });
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
        actorId: access.tenantUserId,
        ...(input.completionOverrideReason ? { completionOverrideReason: input.completionOverrideReason } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
