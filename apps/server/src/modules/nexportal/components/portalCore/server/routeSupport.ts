import type { Request, Response } from "express";
import { RailError } from "@nexteam/core";
import { getAdminStorageBucket } from "../../../../../firebase.js";
import { defaultTenantBranding, type PlatformRepository } from "../../../../../platform/repository.js";
import { configuredTenantId } from "../../../../../core/tenantConfig.js";
import type { PortalSessionRecord } from "./portalHubRepository.js";
import type { PortalHubService } from "./portalHubService.js";

export function createPortalRouteSupport(input: {
  env: NodeJS.ProcessEnv;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers" | "getTenantBranding"> | undefined;
  portalHub: () => PortalHubService;
}) {
  function parseStorageRef(storageRef: string): { bucketName: string; objectPath: string } | null {
    const match = storageRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
    return match ? { bucketName: match[1]!, objectPath: match[2]! } : null;
  }

  async function sendPortalNexDocsFile(res: Response, fileInput: {
    storageRef: string;
    fallbackFileName: string;
    fallbackMimeType: string;
  }): Promise<void> {
    const storageRef = parseStorageRef(fileInput.storageRef);
    if (!storageRef) throw new RailError("NexDocs file is missing a valid storage reference.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 409 });
    const bucket = getAdminStorageBucket(input.env);
    if (!bucket) throw new RailError("Firebase Storage is not configured for NexDocs file reads.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 503 });
    if (bucket.name !== storageRef.bucketName) throw new RailError("NexDocs file is stored in a different Firebase bucket.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 409 });
    const file = bucket.file(storageRef.objectPath);
    const [exists] = await file.exists();
    if (!exists) throw new RailError("NexDocs file was not found in Storage.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 404 });
    const [metadata] = await file.getMetadata();
    res.setHeader("content-type", String(metadata.contentType ?? fileInput.fallbackMimeType));
    res.setHeader("content-disposition", `inline; filename="${fileInput.fallbackFileName.replace(/"/g, "")}"`);
    file.createReadStream().pipe(res);
  }

  async function tenantBranding(tenantId: string) {
    return await input.platformRepository?.getTenantBranding(tenantId) ?? defaultTenantBranding(tenantId);
  }

  function portalTenantId(req: Request): string {
    return typeof req.query.tenantId === "string" && req.query.tenantId.trim()
      ? req.query.tenantId
      : configuredTenantId(input.env, "crmRoute");
  }

  function portalSessionDestination(session: PortalSessionRecord): string {
    if (session.sourceObjectType === "quote" && session.sourceObjectId) return `/nexportal/quotes/${encodeURIComponent(session.sourceObjectId)}`;
    if (session.sourceObjectType === "invoice" && session.sourceObjectId) return `/nexportal/invoices/${encodeURIComponent(session.sourceObjectId)}`;
    return "/nexportal";
  }

  function portalPathWithTenant(tenantId: string, path: string, search?: URLSearchParams): string {
    const query = search ?? new URLSearchParams();
    if (!query.get("tenantId")) query.set("tenantId", tenantId);
    return `${path}?${query.toString()}`;
  }

  async function assignedTechniciansByVisitId(tenantId: string, visits: Array<{ id: string; assignedTo: string[] }>): Promise<Record<string, string[]>> {
    const users = input.platformRepository ? await input.platformRepository.listTenantUsers(tenantId) : [];
    const byId = new Map(users.map((user) => [user.id, user.displayName]));
    return Object.fromEntries(visits.map((visit) => [visit.id, visit.assignedTo.map((id) => {
      const displayName = byId.get(id) ?? id;
      return displayName.split(/\s+/)[0] ?? displayName;
    })]));
  }

  async function requirePortalSession(req: Request): Promise<{ tenantId: string; session: PortalSessionRecord; needsReverify: boolean }> {
    const tenantId = portalTenantId(req);
    const authenticated = await input.portalHub().authenticateCookie({ tenantId, cookieHeader: req.header("cookie") });
    if (!authenticated) throw new RailError("Portal access is not active on this device. Open the latest magic link to continue.", { provider: "native", op: "portalSession", status: 401 });
    return { tenantId, session: authenticated.session, needsReverify: authenticated.needsReverify };
  }

  async function buildPortalSnapshotOrRedirect(req: Request, res: Response): Promise<{
    tenantId: string;
    session: PortalSessionRecord;
    snapshot: Awaited<ReturnType<PortalHubService["buildSnapshot"]>>;
  } | null> {
    const portalAccess = await requirePortalSession(req);
    if (portalAccess.needsReverify) {
      const query = new URLSearchParams({ tenantId: portalAccess.tenantId, returnPath: req.originalUrl });
      res.redirect(303, `/nexportal/reverify?${query.toString()}`);
      return null;
    }
    const snapshot = await input.portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session });
    return { tenantId: portalAccess.tenantId, session: portalAccess.session, snapshot };
  }

  return {
    assignedTechniciansByVisitId,
    buildPortalSnapshotOrRedirect,
    parseStorageRef,
    portalPathWithTenant,
    portalSessionDestination,
    portalTenantId,
    requirePortalSession,
    sendPortalNexDocsFile,
    tenantBranding
  };
}
