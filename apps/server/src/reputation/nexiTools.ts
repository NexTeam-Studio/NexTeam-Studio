import { z } from "zod";
import { RailError, type ApprovalQueueService, type EventBus, type NexiTool, type Source } from "@nexteam/core";
import type { GbpReviewProvider } from "./gbpProvider.js";
import type { ReputationRepository } from "./repository.js";
import { ReputationService } from "./service.js";
import { profileSyncInputSchema, reviewRequestInputSchema } from "./schemas.js";

const pollReviewsInputSchema = z.object({});
const queueInputSchema = z.object({});
const draftReviewReplyInputSchema = z.object({
  reviewId: z.string().min(1).optional(),
  replyGuidance: z.string().optional()
});

function source(ref: string, label: string, rail: Source["rail"] = "native"): Source {
  return { rail, ref, label };
}

export function createReputationNexiTools(input: {
  repository: ReputationRepository;
  approvalQueue: ApprovalQueueService;
  gbpProvider: GbpReviewProvider;
  eventBus?: EventBus | undefined;
  actorId?: string | undefined;
}): NexiTool[] {
  const service = new ReputationService(input);
  const actorId = input.actorId ?? "unknown-actor";
  return [
    {
      name: "pollGbpReviews",
      description: "Check Google Business Profile reviews for the tenant. If GBP OAuth is not connected, return the exact blocker instead of pretending no reviews exist.",
      inputSchema: pollReviewsInputSchema,
      handler: async (tenant, args) => {
        pollReviewsInputSchema.parse(args);
        const result = await service.pollGbpReviews(tenant);
        return {
          result,
          sources: result.imported.length
            ? result.imported.map((review) => source(review.id, `GBP review from ${review.authorName}`, "gbp"))
            : [source("gbp-review-connection", result.blocker ?? "GBP review connection status")]
        };
      }
    },
    {
      name: "reputationQueue",
      description: "List tenant reviews, drafted review replies, and GBP profile-sync drafts waiting for owner review.",
      inputSchema: queueInputSchema,
      handler: async (tenant, args) => {
        queueInputSchema.parse(args);
        const [reviews, profiles] = await Promise.all([
          input.repository.listReviews(tenant.id),
          input.repository.listProfiles(tenant.id)
        ]);
        return {
          result: {
            reviews,
            profiles,
            pendingReplies: reviews.filter((review) => review.replyStatus === "drafted"),
            publishingDeferredUntilGbpCredentials: true
          },
          sources: [source("reputation_queue", `Reputation queue for ${tenant.name}`)]
        };
      }
    },
    {
      name: "draftReviewReply",
      description: "Draft a professional GBP review reply and park it in ApprovalQueue. Does not publish.",
      inputSchema: draftReviewReplyInputSchema,
      handler: async (tenant, args) => {
        const parsed = draftReviewReplyInputSchema.parse(args);
        const reviewId = parsed.reviewId ?? (await input.repository.listReviews(tenant.id))[0]?.id;
        if (!reviewId) {
          throw new RailError("No review is available to reply to yet.", { provider: "native", op: "draftReviewReply", status: 404 });
        }
        const result = await service.draftReviewReply(tenant, reviewId, actorId);
        return {
          result,
          sources: [
            source(result.review.id, `GBP review from ${result.review.authorName}`, "gbp"),
            source(result.approval.id, `ApprovalQueue review reply ${result.approval.id}`)
          ]
        };
      }
    },
    {
      name: "draftReviewRequest",
      description: "Queue a review request through the M6 campaign rail after invoice payment. This never sends directly.",
      inputSchema: reviewRequestInputSchema,
      handler: async (tenant, args) => {
        const approval = await service.queueReviewRequest(tenant, args, actorId);
        return {
          result: { approval, sendsAreApprovalQueuedOnly: true, usesCampaignRail: true },
          sources: [source(approval.id, `ApprovalQueue review request ${approval.id}`)]
        };
      }
    },
    {
      name: "draftGbpProfileSync",
      description: "Draft a GBP hours/services/Q&A profile update for approval. Does not publish.",
      inputSchema: profileSyncInputSchema,
      handler: async (tenant, args) => {
        const result = await service.draftProfileSync(tenant, args, actorId);
        return {
          result,
          sources: [source(result.profile.id, `GBP profile sync draft for ${tenant.name}`)]
        };
      }
    }
  ];
}
