import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../nexops/runtime/routeRuntime.js";
import type { NexDocsClientLibrary } from "../../../../../fielddocs/nexDocsService.js";
import type { PortalHubSnapshot } from "./portalHubService.js";
import { portalNexDocsUploadBodySchema, portalPhoneReverifyBodySchema } from "./routeSchemas.js";
import { reviewSequenceActionBodySchema, startReviewSequenceBodySchema } from "../../../../../reputation/reviewSequenceRouteSchemas.js";
import { applyPortalSecurityHeaders } from "./securityHeaders.js";

/**
 * NexDocs is also used by staff, so its library deliberately contains all
 * client-owned office records.  NexPortal must narrow that list back to the
 * delivered records admitted by its session snapshot before rendering or
 * searching it.  This keeps draft/internal quote and invoice PDFs from
 * leaking through the otherwise shared document-library surface.
 */
function deliveredPortalLibrary(snapshot: PortalHubSnapshot, library: NexDocsClientLibrary): NexDocsClientLibrary {
  const deliveredOfficeRecordIds = new Set(
    snapshot.documents
      .filter((document) => document.kind === "quote_pdf" || document.kind === "invoice_pdf" || document.kind === "receipt" || document.kind === "statement")
      .map((document) => document.id)
  );
  const officeRecords = library.officeRecords.filter((entry) => deliveredOfficeRecordIds.has(entry.id));
  const searchResults = library.searchResults.filter((hit) => (
    hit.entry.section !== "office_records" || deliveredOfficeRecordIds.has(hit.entry.id)
  ));
  return {
    ...library,
    officeRecords,
    searchResults,
    counts: {
      ...library.counts,
      officeRecords: officeRecords.length,
      total: library.counts.total - library.counts.officeRecords + officeRecords.length
    }
  };
}

export function registerPortalCoreRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    app,
    assignedTechniciansByVisitId,
    buildPortalSnapshotOrRedirect,
    defaultTenantId,
    env,
    nexDocsService,
    portalHub,
    portalPathWithTenant,
    portalSessionDestination,
    portalTenantId,
    providerForTenant,
    renderPortalHomeHtml,
    renderPortalOptOutHtml,
    renderPortalReverifyHtml,
    renderPortalReviewLandingHtml,
    renderUnifiedPortalDocumentsHtml,
    repositoryForTenant,
    requirePortalSession,
    requireQuoteAccess,
    reviewSequences,
    sendPortalNexDocsFile,
    sendRouteError,
    tenantBranding
  } = context;

  app.get("/api/crm/review-sequences", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "listReviewSequences");
      const status = await reviewSequences().listStatus(tenantId, {
        ...(typeof req.query.clientId === "string" && req.query.clientId.trim() ? { clientId: req.query.clientId } : {}),
        ...(typeof req.query.jobId === "string" && req.query.jobId.trim() ? { jobId: req.query.jobId } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...status });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/review-sequences/start", async (req: Request, res: Response) => {
    try {
      const input = startReviewSequenceBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "startReviewSequence");
      const sequence = await reviewSequences().maybeStartForJob({
        tenantId,
        jobId: input.jobId,
        ...(input.source ? { source: input.source } : {})
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, sequence });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/review-sequences/:id/stop", async (req: Request, res: Response) => {
    try {
      const reviewSequenceId = req.params.id;
      if (!reviewSequenceId) {
        throw new RailError("Review sequence id is required.", { provider: "native", op: "stopReviewSequence", status: 400 });
      }
      const input = reviewSequenceActionBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "stopReviewSequence");
      const sequence = await reviewSequences().stopSequence({
        tenantId,
        reviewSequenceId,
        reason: "manual"
      });
      res.json({ ok: true, tenantId, actorRole: access.role, sequence });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/review-sequences/:id/mark-reviewed", async (req: Request, res: Response) => {
    try {
      const reviewSequenceId = req.params.id;
      if (!reviewSequenceId) {
        throw new RailError("Review sequence id is required.", { provider: "native", op: "markReviewed", status: 400 });
      }
      const input = reviewSequenceActionBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "markReviewed");
      const sequence = await reviewSequences().markReviewed({
        tenantId,
        reviewSequenceId
      });
      res.json({ ok: true, tenantId, actorRole: access.role, sequence });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/session/:sessionId", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const sessionId = req.params.sessionId;
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const tenantId = portalTenantId(req);
      if (!sessionId || !token) {
        throw new RailError("Portal session id and token are required.", { provider: "native", op: "portalSessionStart", status: 400 });
      }
      const session = await portalHub().consumeMagicLink({ tenantId, sessionId, token });
      res.setHeader("set-cookie", portalHub().cookieHeader(session, token));
      res.redirect(303, portalPathWithTenant(tenantId, portalSessionDestination(session)));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const assignedTechnicians = await assignedTechniciansByVisitId(built.tenantId, built.snapshot.visits);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalHomeHtml(built.snapshot, {
        assignedTechniciansByVisitId: assignedTechnicians,
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/documents", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const library = await nexDocsService().listClientLibrary({
        tenantId: built.tenantId,
        clientId: built.snapshot.client.id,
        viewer: "portal",
        includeClientStatement: built.snapshot.session.scope !== "property",
        ...(built.snapshot.session.scope === "property" && built.snapshot.session.propertyId
          ? { propertyId: built.snapshot.session.propertyId }
          : {}),
        ...(typeof req.query.q === "string" && req.query.q.trim() ? { q: req.query.q.trim() } : {})
      });
      const portalLibrary = deliveredPortalLibrary(built.snapshot, library);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderUnifiedPortalDocumentsHtml({
        snapshot: built.snapshot,
        tenantId: built.tenantId,
        library: portalLibrary,
        ...(typeof req.query.q === "string" && req.query.q.trim() ? { searchQuery: req.query.q.trim() } : {}),
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { uploadStatus: req.query.status.trim() } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/documents/upload", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const portalAccess = await requirePortalSession(req);
      const input = portalNexDocsUploadBodySchema.parse(req.body ?? {});
      if (input.tenantId !== portalAccess.tenantId) {
        throw new RailError("Portal upload tenant mismatch.", { provider: "native", op: "portalUploadNexDocsDocument", status: 403 });
      }
      const document = await nexDocsService().uploadDocument({
        tenantId: portalAccess.tenantId,
        clientId: portalAccess.session.clientId,
        folderId: input.folderId,
        label: input.label,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileBase64: input.fileBase64,
        source: "client_upload"
      }, env);
      res.status(201).json({ ok: true, document });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/documents/:id/file", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const documentId = req.params.id;
      if (!documentId) {
        throw new RailError("Document id is required.", { provider: "native", op: "portalFetchNexDocsFile", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      const document = await nexDocsService().getUploadedDocument(portalAccess.tenantId, documentId);
      const repository = repositoryForTenant();
      const [properties, jobs] = await Promise.all([
        repository.listProperties(portalAccess.tenantId),
        repository.listJobs(portalAccess.tenantId)
      ]);
      const propertyId = document.propertyId ?? (document.jobId ? jobs.find((job) => job.id === document.jobId)?.propertyId : undefined);
      const property = propertyId ? properties.find((record) => record.id === propertyId) : undefined;
      const propertyAllowed = portalAccess.session.scope !== "property" || property?.id === portalAccess.session.propertyId;
      if (document.clientId !== portalAccess.session.clientId || document.hiddenFromClient === true || !propertyAllowed) {
        throw new RailError("That NexDocs file is not available in this portal session.", { provider: "native", op: "portalFetchNexDocsFile", status: 403 });
      }
      await sendPortalNexDocsFile(res, {
        storageRef: document.storageRef,
        fallbackFileName: document.fileName,
        fallbackMimeType: document.mimeType
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/reverify", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const portalAccess = await requirePortalSession(req);
      const clients = await providerForTenant(portalAccess.tenantId).getClients("");
      const clientName = clients.find((record) => record.id === portalAccess.session.clientId)?.name ?? "Client";
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalReverifyHtml({
        branding: await tenantBranding(portalAccess.tenantId),
        clientName,
        tenantId: portalAccess.tenantId,
        sessionId: portalAccess.session.id,
        ...(typeof req.query.returnPath === "string" && req.query.returnPath.trim() ? { returnPath: req.query.returnPath } : {}),
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/reverify/phone", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const input = portalPhoneReverifyBodySchema.parse(req.body);
      await portalHub().reverifyByPhoneLast4({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        last4: input.last4
      });
      const returnPath = input.returnPath?.startsWith("/nexportal") ? input.returnPath : "/nexportal";
      const [pathOnly, queryString] = returnPath.split("?", 2);
      const query = new URLSearchParams(queryString ?? "");
      if (!query.get("tenantId")) {
        query.set("tenantId", input.tenantId);
      }
      res.redirect(303, `${pathOnly}?${query.toString()}`);
    } catch (error) {
      if (error instanceof RailError) {
        const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
        const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId : defaultTenantId(env);
        const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/nexportal") ? body.returnPath : "/nexportal";
        const query = new URLSearchParams({
          tenantId,
          returnPath,
          status: error.message
        });
        res.redirect(303, `/nexportal/reverify?${query.toString()}`);
        return;
      }
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/review", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const tenantId = portalTenantId(req);
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : "";
      if (!clientId || !jobId) {
        throw new RailError("Client and job ids are required for the review request link.", { provider: "native", op: "portalReviewLanding", status: 400 });
      }
      const [clients, jobs] = await Promise.all([
        providerForTenant(tenantId).getClients(""),
        repositoryForTenant().listJobs(tenantId)
      ]);
      const client = clients.find((record) => record.id === clientId);
      const job = jobs.find((record) => record.id === jobId);
      if (!client || !job) {
        throw new RailError("The linked review request could not be resolved.", { provider: "native", op: "portalReviewLanding", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalReviewLandingHtml({
        branding: await tenantBranding(tenantId),
        clientName: client.name,
        jobTitle: job.title,
        ...(typeof req.query.message === "string" && req.query.message.trim() ? { message: req.query.message } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/reviews/opt-out", async (req: Request, res: Response) => {
    try {
      applyPortalSecurityHeaders(res);
      const tenantId = portalTenantId(req);
      const reviewSequenceId = typeof req.query.sequenceId === "string" ? req.query.sequenceId : "";
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!reviewSequenceId || !token) {
        throw new RailError("Review sequence and token are required.", { provider: "native", op: "reviewOptOut", status: 400 });
      }
      const stopped = await reviewSequences().optOut({
        tenantId,
        reviewSequenceId,
        token
      });
      const client = (await providerForTenant(tenantId).getClients("")).find((record) => record.id === stopped.clientId);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalOptOutHtml({
        branding: await tenantBranding(tenantId),
        clientName: client?.name ?? "Client",
        stopped: true
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
