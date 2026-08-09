import type { Express, Request } from "express";
import { RailError, type CRMProvider, type NexiTool } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole, type AccessContext } from "../auth/accessContext.js";
import { createApprovalNexiTools } from "../approval/nexiTools.js";
import { createCampaignNexiTools } from "../campaigns/nexiTools.js";
import { createCommsNexiTools } from "../comms/nexiTools.js";
import { createContentNexiTools } from "../content/nexiTools.js";
import { createContextNexiTools } from "../context/nexiTools.js";
import { createCrmReadToolsWithOptions, createCrmToolsWithOptions } from "../modules/nexops/nexiTools.js";
import { createEvaporationNexiTools } from "../evaporation/nexiTools.js";
import { createFieldDocsTools } from "../fielddocs/nexiTools.js";
import { createIntakeNexiTools } from "../intake/nexiTools.js";
import { enforceToolEntitlements } from "../platform/entitlements.js";
import { loadTenantFromPlatform } from "../platform/routes.js";
import type { PlatformRepository } from "../platform/repository.js";
import { createReputationNexiTools } from "../reputation/nexiTools.js";
import { createSchedulingNexiTools } from "../scheduling/nexiTools.js";
import { createSeoNexiTools } from "../seo/nexiTools.js";
import { createSitesNexiTools } from "../sites/nexiTools.js";
import { createNexiRouter } from "./nexiRoutes.js";

type ApprovalInput = Parameters<typeof createApprovalNexiTools>[0];
type CampaignInput = Parameters<typeof createCampaignNexiTools>[0];
type ContentInput = Parameters<typeof createContentNexiTools>[0];
type FieldDocsInput = Extract<Parameters<typeof createFieldDocsTools>[0], { mediaRepository: unknown }>;
type IntakeInput = Parameters<typeof createIntakeNexiTools>[0];
type ReputationInput = Parameters<typeof createReputationNexiTools>[0];
type SeoInput = Parameters<typeof createSeoNexiTools>[0];
type SitesInput = Parameters<typeof createSitesNexiTools>[0];

export interface IntegratedNexiRouteDependencies {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  platformRepository: PlatformRepository;
  crm: {
    createProvider: (tenantId: string) => CRMProvider;
    approvalQueue: Parameters<typeof createCrmToolsWithOptions>[1];
    options: Parameters<typeof createCrmToolsWithOptions>[2];
  };
  comms: {
    rail: Parameters<typeof createCommsNexiTools>[0];
    approvalQueue: Parameters<typeof createCommsNexiTools>[1];
  };
  scheduling: Parameters<typeof createSchedulingNexiTools>[0];
  evaporation: Parameters<typeof createEvaporationNexiTools>[0];
  fieldDocs: Omit<FieldDocsInput, "viewerRole" | "viewerUserId">;
  campaign: Omit<CampaignInput, "actorId">;
  approval: Omit<ApprovalInput, "actorId" | "actorRole">;
  sites: Omit<SitesInput, "access">;
  reputation: Omit<ReputationInput, "actorId">;
  seo: Omit<SeoInput, "access">;
  intake: Omit<IntakeInput, "access">;
  content: Omit<ContentInput, "actorRole" | "actorId">;
}

/**
 * Build the tool set only after the request's tenant and operator role are known.
 *
 * Every CRM provider is bound to the tenant selected by requireTenantRole. Technicians
 * receive read-only real-record tools; only owners and office admins receive tool paths
 * that can enqueue or execute approval-gated work.
 */
export function createIntegratedNexiToolsForAccess(
  input: IntegratedNexiRouteDependencies,
  access: AccessContext
): NexiTool[] {
  const commonTools = createContextNexiTools({ env: input.env }).concat(createFieldDocsTools({
    ...input.fieldDocs,
    viewerRole: access.role,
    viewerUserId: access.tenantUserId
  }));
  const crmProvider = input.crm.createProvider(access.tenantId);
  if (access.role === "TECHNICIAN") {
    return commonTools.concat(createCrmReadToolsWithOptions(crmProvider, input.crm.options));
  }

  const actorId = actorIdForAccess(access);
  return commonTools
    .concat(createCrmToolsWithOptions(crmProvider, input.crm.approvalQueue, input.crm.options))
    .concat(createCommsNexiTools(input.comms.rail, input.comms.approvalQueue))
    .concat(createSchedulingNexiTools(input.scheduling))
    .concat(createEvaporationNexiTools(input.evaporation))
    .concat(createCampaignNexiTools({ ...input.campaign, actorId }))
    .concat(createApprovalNexiTools({ ...input.approval, actorId, actorRole: access.role }))
    .concat(createSitesNexiTools({ ...input.sites, access }))
    .concat(createReputationNexiTools({ ...input.reputation, actorId }))
    .concat(createSeoNexiTools({ ...input.seo, access }))
    .concat(createIntakeNexiTools({ ...input.intake, access }))
    .concat(createContentNexiTools({ ...input.content, actorRole: access.role, actorId }));
}

export function registerIntegratedNexiRoutes(app: Express, input: IntegratedNexiRouteDependencies): void {
  async function resolveOperatorAccess(req: Request, tenantId: string) {
    return await requireTenantRole(req, input.env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
      requestedTenantId: tenantId,
      op: "nexiOperatorContext"
    });
  }

  app.use("/api/nexi", createNexiRouter(input.env, {
    loadTenant: async (req) => {
      const body = req.body as { tenantId?: unknown };
      const tenantId = typeof body?.tenantId === "string" && body.tenantId.trim()
        ? body.tenantId.trim()
        : input.tenantId;
      return loadTenantFromPlatform(input.platformRepository, tenantId, input.env);
    },
    loadRequestorContext: async (req, tenant) => {
      try {
        const access = await resolveOperatorAccess(req, tenant.id);
        const tenantUsers = await input.platformRepository.listTenantUsers(tenant.id);
        const tenantUser = tenantUsers.find((entry) => entry.id === access.tenantUserId)
          ?? tenantUsers.find((entry) => entry.email?.toLowerCase() === access.email?.toLowerCase());
        return {
          tenantUserId: access.tenantUserId,
          displayName: tenantUser?.displayName ?? access.email ?? access.tenantUserId,
          email: tenantUser?.email ?? access.email,
          phones: tenantUser?.phones,
          address: tenantUser?.address
        };
      } catch (error) {
        if (error instanceof RailError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    filterTools: (tenant, tools) => enforceToolEntitlements(tenant, tools).tools,
    extraToolsForRequest: async (req, tenant) => {
      let access;
      try {
        access = await resolveOperatorAccess(req, tenant.id);
      } catch (error) {
        if (error instanceof RailError && (error.status === 401 || error.status === 403)) return [];
        throw error;
      }
      return createIntegratedNexiToolsForAccess(input, access);
    }
  }));
}
