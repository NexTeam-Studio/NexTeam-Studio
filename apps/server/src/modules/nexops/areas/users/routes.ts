import type { Request, Response } from "express";
import { z } from "zod";
import { RailError } from "@nexteam/core";
import { getAdminDb } from "../../../../firebase.js";
import { requireAccessContext } from "../../../../auth/accessContext.js";

const notificationPreferencesSchema = z.object({
  daily: z.boolean().default(true),
  activity: z.boolean().default(true),
  platform: z.boolean().default(true),
  marketing: z.boolean().default(false)
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional().default(""),
  lastName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(""),
  streetAddress: z.string().trim().max(180).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  stateProvince: z.string().trim().max(100).optional().default(""),
  zipCode: z.string().trim().max(24).optional().default(""),
  // This remains tenant-scoped until the media lane supplies a durable,
  // access-controlled image reference.
  avatarDataUrl: z.string().startsWith("data:image/").max(500_000).optional().default(""),
  notificationPreferences: notificationPreferencesSchema.optional().default({
    daily: true,
    activity: true,
    platform: true,
    marketing: false
  })
});

export type UserProfile = z.infer<typeof profileSchema>;

export function registerUsersRoutes(app: import("express").Express, env: NodeJS.ProcessEnv): void {
  app.get("/api/nexops/users/:id/profile", async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.query.tenantId ?? "").trim();
      const userId = req.params.id;
      if (!tenantId || !userId) throw new RailError("Tenant and user are required.", { provider: "native", op: "getUserProfile", status: 400 });
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "getUserProfile" });
      if (access.tenantUserId !== userId && !["OWNER", "OFFICE_ADMIN"].includes(access.role)) throw new RailError("You cannot view this profile.", { provider: "firebase", op: "getUserProfile", status: 403 });
      const db = getAdminDb(env);
      if (!db) throw new RailError("Profile storage is unavailable.", { provider: "firebase", op: "getUserProfile", status: 503 });
      const snapshot = await db.collection("tenantUserProfiles").doc(`${tenantId}_${userId}`).get();
      const data = snapshot.data();
      if (data && data.tenantId !== tenantId) throw new RailError("Profile belongs to another tenant.", { provider: "firebase", op: "getUserProfile", status: 409 });
      res.json({ ok: true, profile: data ? profileSchema.parse(data.profile) : null });
    } catch (error) { sendError(res, error); }
  });

  app.put("/api/nexops/users/:id/profile", async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.body?.tenantId ?? "").trim();
      const userId = req.params.id;
      if (!tenantId || !userId) throw new RailError("Tenant and user are required.", { provider: "native", op: "saveUserProfile", status: 400 });
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "saveUserProfile" });
      if (access.tenantUserId !== userId && !["OWNER", "OFFICE_ADMIN"].includes(access.role)) throw new RailError("Only an owner or office admin can edit another profile.", { provider: "firebase", op: "saveUserProfile", status: 403 });
      const profile = profileSchema.parse(req.body?.profile);
      const db = getAdminDb(env);
      if (!db) throw new RailError("Profile storage is unavailable.", { provider: "firebase", op: "saveUserProfile", status: 503 });
      const ref = db.collection("tenantUserProfiles").doc(`${tenantId}_${userId}`);
      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(ref);
        if (existing.exists && existing.data()?.tenantId !== tenantId) throw new RailError("Profile belongs to another tenant.", { provider: "firebase", op: "saveUserProfile", status: 409 });
        transaction.set(ref, { tenantId, userId, profile, updatedAt: new Date().toISOString(), updatedBy: access.tenantUserId }, { merge: true });
      });
      res.json({ ok: true, profile });
    } catch (error) { sendError(res, error); }
  });
}

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError && error.status ? error.status : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Unable to save profile." });
}
