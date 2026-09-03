import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { completeJobVisitBodySchema, moveJobVisitBodySchema, scheduleJobVisitBodySchema, scheduleJobVisitSeriesBodySchema, sendBookingConfirmationBodySchema } from "./routeSchemas.js";

export function registerVisitCoreRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    actorIdForAccess,
    app,
    assignedTechniciansByVisitId,
    buildPortalSnapshotOrRedirect,
    defaultTenantId,
    env,
    jobLifecycle,
    portalHub,
    portalPathWithTenant,
    publicOrigin,
    renderPortalAppointmentsHtml,
    requirePortalSession,
    requireQuoteAccess,
    requireTenantRole,
    sendRouteError
  } = context;

  app.post("/api/crm/jobs/:id/visits", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "scheduleJobVisit", status: 400 });
      }
      const input = scheduleJobVisitBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "scheduleJobVisit");
      const visit = await jobLifecycle().scheduleVisit({
        tenantId,
        jobId,
        ...(input.title ? { title: input.title } : {}),
        start: input.start,
        end: input.end,
        ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}),
        ...(input.details ? { details: input.details } : {})
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, visit, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/visits/batch", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "scheduleJobVisitSeries", status: 400 });
      }
      const input = scheduleJobVisitSeriesBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "scheduleJobVisitSeries");
      const visits = await jobLifecycle().scheduleVisitSeries({
        tenantId,
        jobId,
        visits: input.visits.map((visit) => ({
          ...(visit.title ? { title: visit.title } : {}),
          start: visit.start,
          end: visit.end,
          ...(visit.assignedTo ? { assignedTo: visit.assignedTo } : {}),
          ...(visit.details ? { details: visit.details } : {})
        }))
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, visits, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/jobs/:id/booking-confirmation-preview", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "prepareBookingConfirmation", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const visitId = typeof req.query.visitId === "string" && req.query.visitId.trim() ? req.query.visitId : undefined;
      const access = await requireQuoteAccess(req, tenantId, "prepareBookingConfirmation");
      const preview = await jobLifecycle().prepareBookingConfirmation(tenantId, jobId, visitId, publicOrigin(req));
      res.json({ ok: true, tenantId, actorRole: access.role, preview });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/booking-confirmation", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "sendBookingConfirmation", status: 400 });
      }
      const input = sendBookingConfirmationBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendBookingConfirmation");
      const sent = await jobLifecycle().sendBookingConfirmation({
        tenantId,
        jobId,
        actorId: actorIdForAccess(access),
        ...(input.visitId ? { visitId: input.visitId } : {}),
        mode: input.mode,
        ...(input.target !== undefined ? { target: input.target } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
        ...(input.sendCopy !== undefined ? { sendCopy: input.sendCopy } : {}),
        ...(input.copyTarget !== undefined ? { copyTarget: input.copyTarget } : {})
        ,publicBaseUrl: publicOrigin(req)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...sent });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/visits/:id/move", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "moveJobVisit", status: 400 });
      }
      const input = moveJobVisitBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "moveJobVisit");
      const moved = await jobLifecycle().moveVisitSeries({
        tenantId,
        visitId,
        start: input.start,
        end: input.end,
        ...(input.shiftRemaining !== undefined ? { shiftRemaining: input.shiftRemaining } : {})
      });
      const job = await jobLifecycle().getJobDetail(tenantId, moved.visit.jobId);
      res.json({ ok: true, tenantId, actorRole: access.role, visit: moved.visit, shiftedVisits: moved.shiftedVisits, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/visits/:id/complete", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "completeJobVisit", status: 400 });
      }
      const input = completeJobVisitBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: tenantId,
        op: "completeJobVisit"
      });
      const result = await jobLifecycle().completeVisit({
        tenantId,
        visitId,
        actorId: access.tenantUserId
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/appointments", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const assignedTechnicians = await assignedTechniciansByVisitId(built.tenantId, built.snapshot.visits);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalAppointmentsHtml(built.snapshot, {
        assignedTechniciansByVisitId: assignedTechnicians,
        ...(typeof req.query.confirmedVisitId === "string" && req.query.confirmedVisitId.trim() ? { confirmedVisitId: req.query.confirmedVisitId } : {}),
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/visits/:id/confirm", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "portalConfirmVisit", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        const query = new URLSearchParams({
          tenantId: portalAccess.tenantId,
          returnPath: `/nexportal/appointments?tenantId=${encodeURIComponent(portalAccess.tenantId)}`
        });
        res.redirect(303, `/nexportal/reverify?${query.toString()}`);
        return;
      }
      const visit = await portalHub().confirmVisit({
        tenantId: portalAccess.tenantId,
        session: portalAccess.session,
        visitId
      });
      const destination = portalPathWithTenant(portalAccess.tenantId, "/nexportal/appointments", new URLSearchParams({
        confirmedVisitId: visit.id
      }));
      res.redirect(303, destination);
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
