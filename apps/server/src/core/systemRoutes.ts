import type { Express, Request, Response } from "express";
import { getBuildInfo } from "../buildInfo.js";
import { buildHealth } from "../health.js";
import { sendHttpError } from "./httpError.js";
import { inspectRuntimeIdentity } from "../app/runtimeIdentity.js";
import { isLocalDevAuthEnabled, requireAccessContext } from "../auth/accessContext.js";

export function registerSystemRoutes(
  app: Express,
  input: { env: NodeJS.ProcessEnv; tenantId: string; localProfiles: (tenantId: string) => unknown[] }
): void {
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({ ...getBuildInfo(input.env), ...inspectRuntimeIdentity(input.env) });
  });

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      const health = await buildHealth(input.env, inspectRuntimeIdentity(input.env));
      res.status(health.ok ? 200 : 503).json(health);
    } catch (error) {
      sendHttpError(res, error);
    }
  });

  app.get("/api/public/runtime-config", (_req: Request, res: Response) => {
    const firebase = {
      apiKey: input.env.VITE_FIREBASE_API_KEY || "",
      authDomain: input.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      projectId: input.env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: input.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: input.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: input.env.VITE_FIREBASE_APP_ID || ""
    };
    res.json({
      ok: true,
      firebase,
      firebaseConfigured: Object.values(firebase).every((value) => value.length > 0),
      authRequired: input.env.NEXI_FIREBASE_AUTH_REQUIRED !== "false",
      localAuthEnabled: isLocalDevAuthEnabled(input.env),
      localProfiles: isLocalDevAuthEnabled(input.env) ? input.localProfiles(input.tenantId) : []
    });
  });

  app.get("/api/auth/access-context", async (req: Request, res: Response) => {
    try {
      const access = await requireAccessContext(req, input.env, { op: "shellAccessContext" });
      res.json({
        ok: true,
        tenantId: access.tenantId,
        tenantUserId: access.tenantUserId,
        role: access.role
      });
    } catch (error) {
      sendHttpError(res, error);
    }
  });
}
