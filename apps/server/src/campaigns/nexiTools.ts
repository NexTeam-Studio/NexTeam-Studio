import { z } from "zod";
import { type ApprovalQueueService, type NexiTool, type Source } from "@nexteam/core";
import type { CampaignRepository } from "./repository.js";
import { CampaignService } from "./service.js";

const audiencePreviewInputSchema = z.object({
  channel: z.enum(["email", "sms"]).default("email"),
  clientIds: z.array(z.string().min(1)).optional(),
  tagsAny: z.array(z.string().min(1)).optional(),
  tagsAll: z.array(z.string().min(1)).optional(),
  consentRequired: z.boolean().default(true),
  excludeSuppressed: z.boolean().default(true),
  maxResults: z.number().int().min(1).max(500).default(100)
});

const draftCampaignInputSchema = z.object({
  templateId: z.string().min(1).default("vgb-hotel-gm-outreach"),
  name: z.string().min(1).optional(),
  audience: audiencePreviewInputSchema.optional()
});

const campaignQueueInputSchema = z.object({
  campaignId: z.string().min(1).optional()
});

const suppressCampaignContactInputSchema = z.object({
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  channel: z.enum(["email", "sms"]).default("email"),
  reason: z.enum(["unsubscribed", "manual", "bounce", "spam_complaint"]).default("manual")
});

const queueReportDeliveryInputSchema = z.object({
  to: z.string().email(),
  reportTitle: z.string().min(1),
  reportRef: z.string().min(1)
});

const queueReviewRequestInputSchema = z.object({
  to: z.string().email(),
  invoiceId: z.string().min(1),
  clientName: z.string().min(1)
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

export function createCampaignNexiTools(input: {
  repository: CampaignRepository;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}): NexiTool[] {
  const service = new CampaignService(input);
  return [
    {
      name: "audiencePreview",
      description: "Preview a tenant-scoped campaign audience with consent and suppression checks before anything is queued.",
      inputSchema: audiencePreviewInputSchema,
      handler: async (tenant, args) => {
        const parsed = audiencePreviewInputSchema.parse(args);
        const preview = await service.previewAudience(tenant, parsed);
        return {
          result: {
            ...preview,
            approvalRequired: true,
            sendsBlockedUntilDnsConfirmed: true
          },
          sources: [source("campaign_audience_preview", `Campaign audience preview for ${tenant.id}`)]
        };
      }
    },
    {
      name: "draftCampaign",
      description: "Queue an approval-gated campaign sequence from a template. This never sends directly.",
      inputSchema: draftCampaignInputSchema,
      handler: async (tenant, args) => {
        const parsed = draftCampaignInputSchema.parse(args);
        const result = await service.queueTemplateCampaign(tenant, parsed);
        return {
          result: {
            campaign: result.campaign,
            template: result.template,
            selectedCount: result.audience.selected.length,
            excluded: result.audience.excluded,
            queuedApprovals: result.queuedApprovals,
            suppressed: result.suppressed,
            boundary: result.boundary,
            machineState: result.machineState,
            sendsAreApprovalQueuedOnly: true
          },
          sources: [
            source(result.campaign.id, `Campaign ${result.campaign.name}`),
            ...result.queuedApprovals.map((approval) => source(approval.id, `ApprovalQueue campaign item ${approval.id}`))
          ]
        };
      }
    },
    {
      name: "campaignQueue",
      description: "Read campaign queue, tracking, and suppression status for the tenant.",
      inputSchema: campaignQueueInputSchema,
      handler: async (tenant, args) => {
        const parsed = campaignQueueInputSchema.parse(args);
        const stats = await service.stats(tenant);
        const campaigns = parsed.campaignId
          ? stats.campaigns.filter((campaign) => campaign.id === parsed.campaignId)
          : stats.campaigns;
        return {
          result: { ...stats, campaigns, sendsAreApprovalQueuedOnly: true },
          sources: [source("campaign_queue", `Campaign queue for ${tenant.id}`)]
        };
      }
    },
    {
      name: "suppressCampaignContact",
      description: "Add a campaign suppression entry so later sequence steps cannot be queued for that contact/channel.",
      inputSchema: suppressCampaignContactInputSchema,
      handler: async (tenant, args) => {
        const parsed = suppressCampaignContactInputSchema.parse(args);
        const result = await service.unsubscribe(tenant, parsed);
        return {
          result,
          sources: [source(result.tracking.id, `Campaign suppression ${result.tracking.contactId}`)]
        };
      }
    },
    {
      name: "queueReportDelivery",
      description: "Queue a transactional report-delivery email for approval. This never sends directly.",
      inputSchema: queueReportDeliveryInputSchema,
      handler: async (tenant, args) => {
        const parsed = queueReportDeliveryInputSchema.parse(args);
        const approval = await service.queueTransactionalReportDelivery(tenant, parsed);
        return {
          result: { approval, sendsAreApprovalQueuedOnly: true },
          sources: [source(approval.id, `ApprovalQueue report delivery ${approval.id}`)]
        };
      }
    },
    {
      name: "queueReviewRequest",
      description: "Queue a two-day delayed review request after invoice payment. This never sends directly.",
      inputSchema: queueReviewRequestInputSchema,
      handler: async (tenant, args) => {
        const parsed = queueReviewRequestInputSchema.parse(args);
        const approval = await service.queueInvoicePaidReviewRequest(tenant, parsed);
        return {
          result: { approval, delayHours: 48, sendsAreApprovalQueuedOnly: true },
          sources: [source(approval.id, `ApprovalQueue review request ${approval.id}`)]
        };
      }
    }
  ];
}
