import { z } from "zod";
import { RailError, type NexiTool, type Source, type TenantUserRole } from "@nexteam/core";
import type { NexReachService } from "./nexreachService.js";

const generateJobContentSchema = z.object({
  jobId: z.string().min(1),
  cadence: z.enum(["owner_on_demand", "manual_batch"]).default("owner_on_demand"),
  requestedKinds: z.array(z.enum(["article", "social_post", "gbp_post"])).default(["article", "social_post"])
});

const draftIdSchema = z.object({
  draftId: z.string().min(1)
});

const pendingDraftListSchema = z.object({});

const listConsentedClientsSchema = z.object({
  serviceType: z.string().optional(),
  locality: z.string().optional(),
  closedSince: z.string().optional()
});

const revisePendingDraftApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function ensureMarketingRole(actorRole: TenantUserRole | undefined): void {
  if (!actorRole || actorRole === "OWNER" || actorRole === "OFFICE_ADMIN") {
    return;
  }
  throw new RailError("Only OWNER and OFFICE_ADMIN can use NexReach marketing tools.", {
    provider: "native",
    op: "nexreachRoleFence",
    status: 403
  });
}

function draftPatchFromChangeRequest(text: string): {
  title?: string;
  body?: string;
  shortCaption?: string;
  longCaption?: string;
} {
  const patch: {
    title?: string;
    body?: string;
    shortCaption?: string;
    longCaption?: string;
  } = {};
  const title = text.match(/\btitle\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
  const shortCaption = text.match(/\bshort\s+caption\s*(?:is|to|=|:)\s*([\s\S]+?)(?=\n(?:long\s+caption|body)\b|$)/i)?.[1]?.trim();
  const longCaption = text.match(/\blong\s+caption\s*(?:is|to|=|:)\s*([\s\S]+?)(?=\n(?:short\s+caption|body)\b|$)/i)?.[1]?.trim();
  const body = text.match(/\bbody\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
  if (title) {
    patch.title = title;
  }
  if (shortCaption) {
    patch.shortCaption = shortCaption;
  }
  if (longCaption) {
    patch.longCaption = longCaption;
  }
  if (body) {
    patch.body = body;
  }
  return patch;
}

export function createContentNexiTools(input: {
  service: NexReachService;
  actorRole?: TenantUserRole | undefined;
  actorId?: string | undefined;
}): NexiTool[] {
  return [
    {
      name: "generateJobContent",
      description: "Generate NexReach article and social drafts for a consent-eligible closed job. Drafts park for owner approval and do not publish anywhere.",
      inputSchema: generateJobContentSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = generateJobContentSchema.parse(args);
        const result = await input.service.generateJobContent({
          tenantId: tenant.id,
          jobId: parsed.jobId,
          actorId: input.actorId,
          cadence: parsed.cadence,
          requestedKinds: parsed.requestedKinds
        });
        return {
          result: {
            ...result,
            publishingDeferred: true,
            draftCount: result.drafts.length
          },
          sources: [
            source(result.eligibility.jobId, `Closed job ${result.eligibility.jobId}`),
            ...result.drafts.map((draft) => source(draft.id, `NexReach draft ${draft.title}`))
          ]
        };
      }
    },
    {
      name: "listPendingDrafts",
      description: "List NexReach drafts that are still waiting for owner approval.",
      inputSchema: pendingDraftListSchema,
      handler: async (tenant) => {
        ensureMarketingRole(input.actorRole);
        const drafts = await input.service.listPendingDrafts(tenant.id);
        return {
          result: {
            drafts,
            publishingDeferred: true
          },
          sources: drafts.map((draft) => source(draft.id, `NexReach pending draft ${draft.title}`))
        };
      }
    },
    {
      name: "approveDraft",
      description: "Restate a NexReach draft for explicit yes/no approval in chat. The next yes executes the approval and marks the draft ready for use.",
      inputSchema: draftIdSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = draftIdSchema.parse(args);
        const result = await input.service.restateDraftForApproval(tenant.id, parsed.draftId);
        return {
          result,
          sources: [source(result.approval.id, `ApprovalQueue marketing draft ${result.approval.id}`)]
        };
      }
    },
    {
      name: "discardDraft",
      description: "Discard a pending NexReach draft and reject its approval item.",
      inputSchema: draftIdSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = draftIdSchema.parse(args);
        const result = await input.service.discardDraft({
          tenantId: tenant.id,
          draftId: parsed.draftId,
          actorId: input.actorId
        });
        return {
          result,
          sources: [source(result.draft.id, `NexReach rejected draft ${result.draft.title}`)]
        };
      }
    },
    {
      name: "listConsentedClients",
      description: "List the NexReach audience pool of consented clients, with optional service, locality, and recency filters.",
      inputSchema: listConsentedClientsSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = listConsentedClientsSchema.parse(args);
        const audience = await input.service.listAudience(tenant.id, {
          ...(parsed.serviceType ? { serviceType: parsed.serviceType } : {}),
          ...(parsed.locality ? { locality: parsed.locality } : {}),
          ...(parsed.closedSince ? { closedSince: parsed.closedSince } : {})
        });
        return {
          result: { audience },
          sources: audience.map((member) => source(member.clientId, `Consented client ${member.clientName}`))
        };
      }
    },
    {
      name: "revisePendingDraftApproval",
      description: "Apply requested title or copy changes to a pending NexReach draft, then restate the revised draft for approval.",
      inputSchema: revisePendingDraftApprovalSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = revisePendingDraftApprovalSchema.parse(args);
        const drafts = await input.service.listPendingDrafts(tenant.id);
        const draft = drafts.find((entry) => entry.approval?.id === parsed.approvalId);
        if (!draft) {
          throw new RailError("That pending approval is not a NexReach draft I can revise right now.", {
            provider: "native",
            op: "revisePendingDraftApproval",
            status: 404
          });
        }
        const patch = draftPatchFromChangeRequest(parsed.changeRequest);
        if (!Object.keys(patch).length) {
          return {
            result: {
              needsClarification: "Tell me the changed title, body, short caption, or long caption and I'll restate the draft before anything is approved.",
              approval: draft.approval
            },
            sources: [source(parsed.approvalId, `ApprovalQueue marketing draft ${parsed.approvalId}`)]
          };
        }
        const revised = await input.service.reviseDraft({
          tenantId: tenant.id,
          draftId: draft.id,
          actorId: input.actorId,
          ...patch
        });
        return {
          result: revised,
          sources: [source(revised.approval.id, `ApprovalQueue marketing draft ${revised.approval.id}`)]
        };
      }
    },
    {
      name: "contentQueue",
      description: "Legacy alias for listPendingDrafts.",
      inputSchema: pendingDraftListSchema,
      handler: async (tenant) => {
        ensureMarketingRole(input.actorRole);
        const drafts = await input.service.listPendingDrafts(tenant.id);
        return {
          result: { drafts, publishingDeferred: true },
          sources: drafts.map((draft) => source(draft.id, `NexReach pending draft ${draft.title}`))
        };
      }
    },
    {
      name: "approve",
      description: "Legacy alias that directly approves and executes a NexReach draft.",
      inputSchema: draftIdSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = draftIdSchema.parse(args);
        const result = await input.service.approveDraft({
          tenantId: tenant.id,
          draftId: parsed.draftId,
          actorId: input.actorId
        });
        return {
          result: {
            draft: result.draft,
            approval: result.approval,
            publishingDeferred: true
          },
          sources: [source(result.draft.id, `NexReach ready draft ${result.draft.title}`)]
        };
      }
    },
    {
      name: "rejectContentDraft",
      description: "Legacy alias for discardDraft.",
      inputSchema: draftIdSchema,
      handler: async (tenant, args) => {
        ensureMarketingRole(input.actorRole);
        const parsed = draftIdSchema.parse(args);
        const result = await input.service.discardDraft({
          tenantId: tenant.id,
          draftId: parsed.draftId,
          actorId: input.actorId
        });
        return {
          result,
          sources: [source(result.draft.id, `NexReach rejected draft ${result.draft.title}`)]
        };
      }
    }
  ];
}
