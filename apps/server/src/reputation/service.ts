import { RailError, type ApprovalItem, type ApprovalQueueService, type EventBus, type Tenant } from "@nexteam/core";
import type { GbpReviewProvider } from "./gbpProvider.js";
import type { ReputationRepository } from "./repository.js";
import {
  profileSyncInputSchema,
  reviewRequestInputSchema,
  reputationProfileSchema,
  reputationReviewSchema,
  type ProfileSyncInput,
  type ReputationProfile,
  type ReputationReview,
  type ReviewRequestInput
} from "./schemas.js";

export interface ReputationServiceDeps {
  repository: ReputationRepository;
  approvalQueue: ApprovalQueueService;
  gbpProvider: GbpReviewProvider;
  eventBus?: EventBus | undefined;
}

function now(): string {
  return new Date().toISOString();
}

function reviewDocId(tenantId: string, gbpReviewId: string): string {
  return `gbp_review_${tenantId}_${gbpReviewId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function reviewReplyText(tenant: Tenant, review: ReputationReview): string {
  const business = tenant.name === "Aquatrace" ? "Aquatrace Swimming Pool Leak Detection" : tenant.name;
  if (review.rating >= 4) {
    return [
      `${review.authorName}, thank you for trusting ${business}.`,
      "We appreciate you taking the time to share your experience, and we are glad the leak detection visit gave you a clear next step."
    ].join(" ");
  }
  return [
    `${review.authorName}, thank you for letting us know.`,
    "We take this seriously and would like to review the job details so we can understand what happened and make it right where we can."
  ].join(" ");
}

function reviewReplyPreview(review: ReputationReview, replyText: string): string {
  const comment = review.comment ? `Review: ${review.comment}` : "Review has no public text.";
  return [
    `Rating: ${review.rating}/5 from ${review.authorName}`,
    comment,
    "",
    `Draft reply: ${replyText}`,
    "",
    "Posting to GBP stays parked until the owner approves and GBP credentials are confirmed."
  ].join("\n");
}

function profilePreview(profile: ReputationProfile): string {
  const hours = Object.entries(profile.hours).map(([day, window]) => `${day}: ${window}`).join("\n");
  const services = profile.services.map((service) => `- ${service}`).join("\n");
  const qas = profile.qas.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n\n");
  return [
    `Location: ${profile.locationId}`,
    "Hours:",
    hours || "No hours supplied.",
    "",
    "Services:",
    services || "No services supplied.",
    "",
    "Q&A:",
    qas || "No Q&A supplied.",
    "",
    "GBP profile updates are approval-gated and do not publish directly."
  ].join("\n");
}

export class ReputationService {
  constructor(private readonly deps: ReputationServiceDeps) {}

  async pollGbpReviews(tenant: Tenant): Promise<{
    configured: boolean;
    provider: string;
    blocker?: string | undefined;
    imported: ReputationReview[];
  }> {
    const polled = await this.deps.gbpProvider.pollReviews(tenant.id);
    const imported: ReputationReview[] = [];
    for (const review of polled.reviews) {
      const ts = now();
      const parsed = reputationReviewSchema.parse({
        id: reviewDocId(tenant.id, review.id),
        tenantId: tenant.id,
        provider: "gbp",
        locationId: review.locationId,
        authorName: review.authorName,
        rating: review.rating,
        comment: review.comment,
        reviewedAt: review.reviewedAt,
        replyStatus: "none",
        externalIds: { gbp: review.externalIds?.gbp ?? review.id },
        createdAt: ts,
        updatedAt: ts
      }) as ReputationReview;
      imported.push(await this.deps.repository.upsertReview(parsed));
      await this.deps.eventBus?.emit({
        tenantId: tenant.id,
        type: "review.received",
        payload: {
          reviewId: parsed.id,
          provider: "gbp",
          locationId: parsed.locationId,
          rating: parsed.rating,
          hasComment: Boolean(parsed.comment)
        }
      });
    }
    return { configured: polled.configured, provider: polled.provider, blocker: polled.blocker, imported };
  }

  async draftReviewReply(tenant: Tenant, reviewId: string, actorId = "unknown-actor"): Promise<{
    review: ReputationReview;
    approval: ApprovalItem;
    publishingDeferred: boolean;
  }> {
    const review = await this.deps.repository.getReview(tenant.id, reviewId);
    if (!review) {
      throw new RailError(`Review ${reviewId} was not found.`, { provider: "native", op: "draftReviewReply", status: 404 });
    }
    const replyText = reviewReplyText(tenant, review);
    const executeArgs: Record<string, unknown> = {
      actorId,
      tenantId: tenant.id,
      reviewId: review.id,
      locationId: review.locationId,
      replyText,
      publishingDeferredUntilGbpCredentials: true
    };
    if (review.externalIds?.gbp) {
      executeArgs.externalReviewId = review.externalIds.gbp;
    }
    const approval = await this.deps.approvalQueue.create({
      tenantId: tenant.id,
      kind: "review_reply",
      preview: {
        title: `GBP review reply for ${review.authorName}`,
        body: reviewReplyPreview(review, replyText)
      },
      execute: {
        service: "reputation",
        op: "publishGbpReviewReply",
        args: executeArgs
      },
      createdBy: "user"
    });
    const updated = await this.deps.repository.upsertReview({
      ...review,
      replyText,
      replyApprovalId: approval.id,
      replyStatus: "drafted",
      updatedAt: now()
    });
    return { review: updated, approval, publishingDeferred: true };
  }

  async queueReviewRequest(tenant: Tenant, raw: unknown, actorId = "unknown-actor"): Promise<ApprovalItem> {
    const input = reviewRequestInputSchema.parse(raw) as ReviewRequestInput;
    return this.deps.approvalQueue.create({
      tenantId: tenant.id,
      kind: "email",
      preview: {
        title: `Review request queued for ${input.clientName}`,
        body: `Subject: Thank you from ${tenant.name}\n\nThanks again for trusting ${tenant.name}. If the service helped, a short review would mean a lot. This is queued with a 2-day delay after invoice ${input.invoiceId}.`
      },
      execute: {
        service: "campaigns",
        op: "transactionalApprovalRequiredAfterDelay",
        args: {
          actorId,
          delayHours: 48,
          invoiceId: input.invoiceId,
          outbound: {
            tenantId: tenant.id,
            to: [input.to],
            subject: `Thank you from ${tenant.name}`,
            bodyText: `Thanks again for trusting ${tenant.name}. If the service helped, a short review would mean a lot.`
          }
        }
      },
      createdBy: "user"
    });
  }

  async draftProfileSync(tenant: Tenant, raw: unknown, actorId = "unknown-actor"): Promise<{
    profile: ReputationProfile;
    approval: ApprovalItem;
    publishingDeferred: boolean;
  }> {
    const input = profileSyncInputSchema.parse(raw) as ProfileSyncInput;
    const ts = now();
    const profile = reputationProfileSchema.parse({
      id: `gbp_profile_${tenant.id}_${input.locationId}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
      tenantId: tenant.id,
      locationId: input.locationId,
      hours: input.hours,
      services: input.services,
      qas: input.qas,
      status: "draft",
      createdAt: ts,
      updatedAt: ts
    }) as ReputationProfile;
    const approval = await this.deps.approvalQueue.create({
      tenantId: tenant.id,
      kind: "gbp_profile_update",
      preview: {
        title: `GBP profile sync draft for ${tenant.name}`,
        body: profilePreview(profile)
      },
      execute: {
        service: "reputation",
        op: "applyGbpProfileUpdate",
        args: {
          actorId,
          tenantId: tenant.id,
          profileId: profile.id,
          locationId: profile.locationId,
          publishingDeferredUntilGbpCredentials: true
        }
      },
      createdBy: "user"
    });
    const saved = await this.deps.repository.saveProfile({
      ...profile,
      status: "approval_pending",
      approvalId: approval.id,
      updatedAt: now()
    });
    return { profile: saved, approval, publishingDeferred: true };
  }
}
