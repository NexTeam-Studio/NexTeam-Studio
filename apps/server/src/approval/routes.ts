import type { Express, Request, Response } from "express";
import type { ApprovalQueueService} from "@nexteam/core";
import { RailError, approvalItemSchema } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import { sendHttpError } from "../core/httpError.js";

export function registerApprovalQueueRoutes(
  app: Express,
  input: { env: NodeJS.ProcessEnv; tenantId: string; approvalQueue: ApprovalQueueService }
): void {
  const { approvalQueue } = input;
  app.post("/api/approval-queue", async (req: Request, res: Response) => {
    try {
      const item = await approvalQueue.create(req.body as Parameters<typeof approvalQueue.create>[0]);
      res.status(201).json(approvalItemSchema.parse(item));
    } catch (error) {
      sendHttpError(res, error);
    }
  });

  app.get("/api/approval-queue", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : input.tenantId;
      const includeHistory = String(req.query.includeHistory ?? "").toLowerCase() === "true";
      const items = includeHistory ? await approvalQueue.listByTenant(tenantId) : await approvalQueue.listPending(tenantId);
      res.json({ ok: true, items });
    } catch (error) {
      sendHttpError(res, error);
    }
  });

  for (const operation of ["approve", "reject", "execute"] as const) {
    app.post(`/api/approval-queue/:id/${operation}`, async (req: Request, res: Response) => {
      try {
        const approvalId = req.params.id;
        if (!approvalId) {
          throw new RailError("Approval id is required.", { provider: "approval", op: operation, status: 400 });
        }
        const pending = await approvalQueue.get(approvalId);
        if (!pending) {
          throw new RailError(`Approval item ${approvalId} was not found.`, {
            provider: "approval",
            op: operation,
            status: 404
          });
        }
        const access = await requireTenantRole(req, input.env, ["OWNER", "OFFICE_ADMIN"], {
          requestedTenantId: pending.tenantId,
          op: `approvalQueue${operation.charAt(0).toUpperCase()}${operation.slice(1)}`
        });
        const actorId = actorIdForAccess(access);
        if (operation === "execute") {
          const result = await approvalQueue.executeApproved(approvalId, actorId);
          res.json({ ok: true, ...result });
          return;
        }
        const item = operation === "approve"
          ? await approvalQueue.approve(approvalId, actorId)
          : await approvalQueue.reject(approvalId, actorId);
        res.json({ ok: true, item });
      } catch (error) {
        sendHttpError(res, error);
      }
    });
  }
}
