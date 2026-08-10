import type { Express, Request, Response } from "express";
import { RailError } from "@nexteam/core";
import { createLocalDevSession, isLocalDevAuthEnabled, readLocalDevSession } from "./accessContext.js";
import { sendHttpError } from "../core/httpError.js";

export function registerLocalDevAuthRoutes(
  app: Express,
  input: { env: NodeJS.ProcessEnv; tenantId: string }
): void {
  if (!isLocalDevAuthEnabled(input.env)) {
    return;
  }
  app.post("/api/public/local-auth/sign-in", (req: Request, res: Response) => {
    try {
      const body = req.body as { email?: unknown; password?: unknown; tenantId?: unknown };
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const tenantId = typeof body.tenantId === "string" && body.tenantId.trim()
        ? body.tenantId.trim()
        : input.tenantId;
      if (!email) {
        throw new RailError("Email is required.", { provider: "native", op: "localAuthSignIn", status: 400 });
      }
      const session = createLocalDevSession(email, password, tenantId, input.env);
      res.json({ ok: true, token: session.token, profile: session.profile });
    } catch (error) {
      sendHttpError(res, error);
    }
  });

  app.get("/api/public/local-auth/session", (req: Request, res: Response) => {
    try {
      const header = req.header("authorization") ?? "";
      const token = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
      if (!token) {
        throw new RailError("Sign in is required.", { provider: "native", op: "localAuthSession", status: 401 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId.trim()
        : input.tenantId;
      const session = readLocalDevSession(token, tenantId, input.env, "localAuthSession");
      if (!session) {
        throw new RailError("That session is not a local sign-in.", {
          provider: "native",
          op: "localAuthSession",
          status: 401
        });
      }
      res.json({ ok: true, token, profile: session.profile });
    } catch (error) {
      sendHttpError(res, error);
    }
  });
}
