import type { Request, Response } from "express";
import { RailError } from "@nexteam/core";
import { z } from "zod";
import { requireTenantRole } from "../../../../auth/accessContext.js";
import { configuredTenantId } from "../../../../core/tenantConfig.js";

export function defaultCrmTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "crmRoute");
}

export function publicRequestOrigin(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${req.get("host") ?? "localhost:3000"}`;
}

export function sendCrmRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof z.ZodError
    ? error.issues.map((issue) => issue.message).join(" ")
    : error instanceof Error ? error.message : "Unknown CRM route error";
  res.status(status).json({ ok: false, error: message });
}

export async function requireOfficeAccess(req: Request, env: NodeJS.ProcessEnv, tenantId: string, op: string) {
  return requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op });
}
