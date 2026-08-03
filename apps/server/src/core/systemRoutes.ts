import type { Express, Request, Response } from "express";
import { getBuildInfo } from "../buildInfo.js";
import { buildHealth } from "../health.js";
import { sendHttpError } from "./httpError.js";

export function registerSystemRoutes(
  app: Express,
  input: { env: NodeJS.ProcessEnv; tenantId: string; localProfiles: (tenantId: string) => unknown[] }
): void {
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json(getBuildInfo());
  });

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      res.json(await buildHealth(input.env));
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
      localAuthEnabled: input.env.NEXI_FIREBASE_AUTH_REQUIRED === "false",
      localProfiles: input.localProfiles(input.tenantId)
    });
  });
}
