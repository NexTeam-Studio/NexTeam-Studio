import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { activityFeedQuerySchema, documentationActivityQuerySchema, notificationActionBodySchema, scheduleWorkspaceQuerySchema } from "./routeSchemas.js";

export function registerOperationsHubRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    app,
    defaultTenantId,
    env,
    operationsHub,
    requireAccessContext,
    sendRouteError
  } = context;

  app.get("/api/crm/schedule/workspace", async (req: Request, res: Response) => {
    try {
      const query = scheduleWorkspaceQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "scheduleWorkspace" });
      const teamMemberIds = query.team
        ? query.team.split(",").map((value) => value.trim()).filter(Boolean)
        : [];
      const workspace = await operationsHub().getScheduleWorkspace({
        access,
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(teamMemberIds.length ? { teamMemberIds } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, workspace });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/home", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "homeSnapshot" });
      const home = await operationsHub().getHomeSnapshot({ access });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, home });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/dashboard", async (req: Request, res: Response) => {
    try {
      const query = activityFeedQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "dashboardSnapshot" });
      const [home, entries, documentation] = await Promise.all([
        operationsHub().getHomeSnapshot({ access }),
        operationsHub().getActivityFeed({
          access,
          ...(query.objectType ? { objectType: query.objectType } : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {})
        }),
        operationsHub().getDocumentationActivity({ access })
      ]);
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, home, entries, documentation });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/activity", async (req: Request, res: Response) => {
    try {
      const query = activityFeedQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "activityFeed" });
      const entries = await operationsHub().getActivityFeed({
        access,
        ...(query.objectType ? { objectType: query.objectType } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, entries });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/documentation-activity", async (req: Request, res: Response) => {
    try {
      const query = documentationActivityQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "documentationActivity" });
      const documentation = await operationsHub().getDocumentationActivity({
        access,
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, documentation });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/notifications", async (req: Request, res: Response) => {
    try {
      const query = activityFeedQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "listNotifications" });
      const notifications = await operationsHub().getNotifications({
        access,
        ...(query.limit !== undefined ? { limit: query.limit } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, ...notifications });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/notifications/read", async (req: Request, res: Response) => {
    try {
      const input = notificationActionBodySchema.parse(req.body);
      const tenantId = input.tenantId?.trim() || defaultTenantId(env);
      if (!input.notificationId) {
        throw new RailError("Notification id is required.", { provider: "native", op: "markNotificationRead", status: 400 });
      }
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "markNotificationRead" });
      await operationsHub().markNotificationRead({
        access,
        notificationId: input.notificationId
      });
      res.json({ ok: true, tenantId: access.tenantId, notificationId: input.notificationId });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/notifications/read-all", async (req: Request, res: Response) => {
    try {
      const input = notificationActionBodySchema.parse(req.body);
      const tenantId = input.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "markAllNotificationsRead" });
      const markedCount = await operationsHub().markAllNotificationsRead({ access });
      res.json({ ok: true, tenantId: access.tenantId, markedCount });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
