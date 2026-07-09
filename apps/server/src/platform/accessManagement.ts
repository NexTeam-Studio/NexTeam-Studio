import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  jobAccessLinkSchema,
  tenantUserSchema,
  type JobAccessLink,
  type JobAccessScope,
  type TenantUser,
  type TenantUserRole
} from "@nexteam/core";
import { RailError } from "@nexteam/core";
import type { AccessContext } from "../auth/accessContext.js";
import type { PlatformRepository } from "./repository.js";

export const DEFAULT_JOB_LINK_SCOPES: JobAccessScope[] = ["job.read", "checklist.write", "media.upload", "notes.write"];

export interface TenantUserInput {
  tenantId: string;
  id?: string | undefined;
  authUid?: string | undefined;
  email?: string | undefined;
  displayName: string;
  role: TenantUserRole;
  active?: boolean | undefined;
  now?: string | undefined;
}

export interface JobAccessLinkInput {
  tenantId: string;
  jobId: string;
  propertyId?: string | undefined;
  externalName: string;
  externalEmail?: string | undefined;
  scopes?: JobAccessScope[] | undefined;
  expiresAt: string;
  createdBy: string;
  now?: string | undefined;
  token?: string | undefined;
}

export interface JobAccessLinkCreation {
  link: JobAccessLink;
  oneTimeToken: string;
  tokenFingerprint: string;
}

function nowIso(input?: string): string {
  return input ?? new Date().toISOString();
}

export function hashJobAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function fingerprint(token: string): string {
  return hashJobAccessToken(token).slice(0, 12);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function buildTenantUser(input: TenantUserInput): TenantUser {
  const timestamp = nowIso(input.now);
  return tenantUserSchema.parse({
    id: input.id ?? `tenant_user_${randomUUID()}`,
    tenantId: input.tenantId,
    authUid: input.authUid,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    active: input.active ?? true,
    createdAt: timestamp,
    updatedAt: timestamp
  }) as TenantUser;
}

export function customClaimsForTenantUser(user: TenantUser): Record<string, unknown> {
  return {
    tenantId: user.tenantId,
    tenantRole: user.role,
    tenantUserId: user.id,
    roles: [user.role.toLowerCase()]
  };
}

export async function upsertTenantUser(repository: PlatformRepository, input: TenantUserInput): Promise<TenantUser> {
  const existing = input.id ? await repository.getTenantUser(input.tenantId, input.id) : null;
  const timestamp = nowIso(input.now);
  const next = buildTenantUser({
    ...input,
    id: input.id ?? existing?.id,
    createdAt: existing?.createdAt,
    now: existing?.createdAt ?? timestamp
  } as TenantUserInput);
  return repository.upsertTenantUser({
    ...next,
    createdAt: existing?.createdAt ?? next.createdAt,
    updatedAt: timestamp
  });
}

export function createJobAccessLinkRecord(input: JobAccessLinkInput): JobAccessLinkCreation {
  const token = input.token ?? randomBytes(32).toString("base64url");
  const createdAt = nowIso(input.now);
  const link = jobAccessLinkSchema.parse({
    id: `job_link_${randomUUID()}`,
    tenantId: input.tenantId,
    jobId: input.jobId,
    propertyId: input.propertyId,
    externalName: input.externalName,
    externalEmail: input.externalEmail,
    tokenHash: hashJobAccessToken(token),
    scopes: input.scopes ?? DEFAULT_JOB_LINK_SCOPES,
    expiresAt: input.expiresAt,
    createdAt,
    createdBy: input.createdBy
  }) as JobAccessLink;
  return { link, oneTimeToken: token, tokenFingerprint: fingerprint(token) };
}

export async function createJobAccessLink(repository: PlatformRepository, input: JobAccessLinkInput): Promise<JobAccessLinkCreation> {
  const created = createJobAccessLinkRecord(input);
  await repository.saveJobAccessLink(created.link);
  return created;
}

export function accessContextForJobLink(link: JobAccessLink): AccessContext {
  return {
    tenantId: link.tenantId,
    tenantUserId: link.id,
    role: "TECHNICIAN",
    accessKind: "job_link",
    jobAccessLinkId: link.id,
    jobId: link.jobId,
    propertyId: link.propertyId,
    scopes: link.scopes
  };
}

export async function verifyJobAccessToken(
  repository: PlatformRepository,
  input: { tenantId: string; linkId: string; token: string; now?: string | undefined }
): Promise<AccessContext> {
  const links = await repository.listJobAccessLinks(input.tenantId);
  const link = links.find((candidate) => candidate.id === input.linkId);
  if (!link) {
    throw new RailError("That job link was not found.", { provider: "platform", op: "verifyJobAccessLink", status: 404 });
  }
  if (link.revokedAt) {
    throw new RailError("That job link has been revoked.", { provider: "platform", op: "verifyJobAccessLink", status: 403 });
  }
  if (link.expiresAt <= nowIso(input.now)) {
    throw new RailError("That job link has expired.", { provider: "platform", op: "verifyJobAccessLink", status: 403 });
  }
  if (!safeEqual(hashJobAccessToken(input.token), link.tokenHash)) {
    throw new RailError("That job link token is not valid.", { provider: "platform", op: "verifyJobAccessLink", status: 403 });
  }
  return accessContextForJobLink(link);
}
