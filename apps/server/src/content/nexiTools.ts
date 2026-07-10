import { z } from "zod";
import { type ApprovalQueueService, type NexiTool, type Source } from "@nexteam/core";
import { summarizeContentStats, type ContentDraft, type ContentDraftKind } from "./contentEngine.js";
import type { ContentRepository } from "./repository.js";
import { draftContentForJob, queueContentDraftForApproval } from "./workflow.js";

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

const queueFreeformContentSchema = z.object({
  kind: contentKindSchema.default("article"),
  title: z.string().min(1),
  body: z.string().min(1),
  jobId: z.string().optional(),
  clientName: z.string().optional(),
  sourcePrompt: z.string().optional()
});

const approveSchema = z.object({
  tenantId: z.string().optional(),
  draftId: z.string().min(1)
});

const rejectSchema = z.object({
  tenantId: z.string().optional(),
  draftId: z.string().min(1)
});

const contentStatsSchema = z.object({
  tenantId: z.string().optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function freeformDraft(input: {
  tenantId: string;
  kind: ContentDraftKind;
  title: string;
  body: string;
  jobId?: string | undefined;
  clientName?: string | undefined;
  sourcePrompt?: string | undefined;
}): ContentDraft {
  const draftId = `content_${input.kind}_${crypto.randomUUID()}`;
  const sources = [
    source(draftId, `Nexi freeform ${input.kind.replace("_", " ")} draft`)
  ];
  if (input.jobId) {
    sources.push(source(input.jobId, `Native job reference ${input.jobId}`));
  }
  return {
    id: draftId,
    tenantId: input.tenantId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    mediaRefs: [],
    jobId: input.jobId,
    status: "draft",
    sources,
    createdAt: new Date().toISOString()
  };
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
      name: "queueFreeformContent",
      description: "Save owner-requested content written in chat as a real content draft queued for approval. Does not publish.",
      inputSchema: queueFreeformContentSchema,
      handler: async (tenant, args) => {
        const parsed = queueFreeformContentSchema.parse(args);
        const draft = await queueContentDraftForApproval({
          draft: freeformDraft({
            tenantId: tenant.id,
            kind: parsed.kind as ContentDraftKind,
            title: parsed.title,
            body: parsed.body,
            jobId: parsed.jobId,
            clientName: parsed.clientName,
            sourcePrompt: parsed.sourcePrompt
          }),
          repository: input.repository,
          approvalQueue: input.approvalQueue
        });
        await input.repository.saveCalendarItems([{
          id: `cal_${draft.kind}_${draft.id}`,
          tenantId: draft.tenantId,
          kind: draft.kind,
          title: draft.title,
          scheduledFor: draft.createdAt,
          cadenceReason: "Owner asked Nexi to save this freeform content draft.",
          draftId: draft.id
        }]);
        return {
          result: { draft, publishingDeferred: true, savedToContentQueue: true },
          sources: [source(draft.id, `Native content draft ${draft.title}`), ...draft.sources]
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
      name: "rejectContentDraft",
      description: "Reject a queued content draft without publishing it.",
      inputSchema: rejectSchema,
      handler: async (tenant, args) => {
        const parsed = rejectSchema.parse(args);
        const tenantId = parsed.tenantId ?? tenant.id;
        const draft = await input.repository.getDraft(tenantId, parsed.draftId);
        if (!draft) {
          return { result: { draft: null, publishingDeferred: true }, sources: [] };
        }
        const approval = draft.approvalId ? await input.approvalQueue.reject(draft.approvalId) : null;
        const updated = await input.repository.updateDraft(tenantId, draft.id, { status: "rejected" });
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
