import { z } from "zod";
import { type ApprovalQueueService, type NexiTool, type Source } from "@nexteam/core";
import { summarizeContentStats, type ContentDraftKind } from "./contentEngine.js";
import type { ContentRepository } from "./repository.js";
import { draftContentForJob } from "./workflow.js";

const contentKindSchema = z.enum(["gbp_post", "social_post", "article"]);

const jobFactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  clientName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  outcome: z.string().optional(),
  completedAt: z.string().optional(),
  lineItems: z.array(z.object({
    name: z.string().min(1),
    total: z.number().optional()
  })).optional()
});

const mediaFactSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["photo", "video", "pdf"]),
  thumbRef: z.string().optional(),
  storageRef: z.string().optional(),
  caption: z.string().optional()
});

const draftPostFromJobSchema = z.object({
  job: jobFactSchema,
  media: z.array(mediaFactSchema).default([]),
  requestedKinds: z.array(contentKindSchema).default(["gbp_post"])
});

const contentQueueSchema = z.object({
  tenantId: z.string().optional()
});

const approveSchema = z.object({
  tenantId: z.string().optional(),
  draftId: z.string().min(1)
});

const contentStatsSchema = z.object({
  tenantId: z.string().optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

export function createContentNexiTools(input: {
  repository: ContentRepository;
  approvalQueue: ApprovalQueueService;
}): NexiTool[] {
  return [
    {
      name: "draftPostFromJob",
      description: "Draft GBP, social, or article content from a completed native job and queue it for approval. Does not publish.",
      inputSchema: draftPostFromJobSchema,
      handler: async (tenant, args) => {
        const parsed = draftPostFromJobSchema.parse(args);
        const drafts = await draftContentForJob({
          tenantId: tenant.id,
          job: { ...parsed.job, tenantId: tenant.id },
          media: parsed.media,
          requestedKinds: parsed.requestedKinds as ContentDraftKind[],
          repository: input.repository,
          approvalQueue: input.approvalQueue
        });
        return {
          result: { drafts, publishingDeferred: true },
          sources: drafts.flatMap((draft) => [source(draft.id, `Native content draft ${draft.title}`), ...draft.sources])
        };
      }
    },
    {
      name: "contentQueue",
      description: "List draft content queued for a tenant.",
      inputSchema: contentQueueSchema,
      handler: async (tenant, args) => {
        const parsed = contentQueueSchema.parse(args);
        const tenantId = parsed.tenantId ?? tenant.id;
        const drafts = await input.repository.listDrafts(tenantId);
        return {
          result: { drafts, publishingDeferred: true },
          sources: drafts.map((draft) => source(draft.id, `Native content draft ${draft.title}`))
        };
      }
    },
    {
      name: "approve",
      description: "Approve a queued content draft into publish-ready state without publishing it.",
      inputSchema: approveSchema,
      handler: async (tenant, args) => {
        const parsed = approveSchema.parse(args);
        const tenantId = parsed.tenantId ?? tenant.id;
        const draft = await input.repository.getDraft(tenantId, parsed.draftId);
        if (!draft) {
          return { result: { draft: null, publishingDeferred: true }, sources: [] };
        }
        const approval = draft.approvalId ? await input.approvalQueue.approve(draft.approvalId) : null;
        const updated = await input.repository.updateDraft(tenantId, draft.id, { status: "publish_ready" });
        return {
          result: { draft: updated, approval, publishingDeferred: true },
          sources: [source(draft.id, `Native content draft ${draft.title}`)]
        };
      }
    },
    {
      name: "contentStats",
      description: "Summarize content draft and performance metrics for a tenant.",
      inputSchema: contentStatsSchema,
      handler: async (tenant, args) => {
        const parsed = contentStatsSchema.parse(args);
        const tenantId = parsed.tenantId ?? tenant.id;
        const drafts = await input.repository.listDrafts(tenantId);
        const performance = await input.repository.listPerformance(tenantId);
        return {
          result: { stats: summarizeContentStats(drafts, performance), publishingDeferred: true },
          sources: [source("content_stats", `Native content stats for ${tenantId}`)]
        };
      }
    }
  ];
}
