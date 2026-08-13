import type { Express, Request, Response } from "express";
import { RailError } from "@nexteam/core";
import { getAdminAuth } from "../firebase.js";
import { customClaimsForTenantUser } from "../platform/accessManagement.js";
import type { PlatformRepository } from "../platform/repository.js";
import { linkExistingWorkspaceMembership } from "./workspaceLink.js";

type WorkspaceLinkRuntime = {
  env: NodeJS.ProcessEnv;
  platformRepository: PlatformRepository;
};

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Workspace link failed." });
}

export function registerWorkspaceLinkRoutes(app: Express, runtime: WorkspaceLinkRuntime): void {
  app.post("/api/auth/workspace-link", async (req: Request, res: Response) => {
    try {
      const token = (req.header("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
      const auth = getAdminAuth(runtime.env);
      if (!token || !auth) throw new RailError("Firebase sign-in is required.", { provider: "firebase", op: "workspaceLink", status: 401 });
      const decoded = await auth.verifyIdToken(token);
      // Platform identities remain outside tenant membership linking.
      if (decoded.platform_operator === true || (Array.isArray(decoded.roles) && decoded.roles.map(String).includes("platform_operator"))) {
        throw new RailError("Platform identities do not use tenant workspace linking.", { provider: "firebase", op: "workspaceLink", status: 403 });
      }
      const result = await linkExistingWorkspaceMembership(runtime.platformRepository, decoded);
      const claims = customClaimsForTenantUser(result.user);
      await auth.setCustomUserClaims(decoded.uid, claims);
      res.json({ ok: true, linked: result.linked, tenantId: result.user.tenantId, tenantUserId: result.user.id, role: result.user.role });
    } catch (error) { sendError(res, error); }
  });
}
