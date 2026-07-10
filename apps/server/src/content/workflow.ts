import type { ApprovalQueueService } from "@nexteam/core";
import {
  generateDraftsForJob,
  planContentCalendar,
  type ContentDraft,
  type ContentDraftKind,
  type ContentJobFact,
  type ContentMediaFact,
  type TenantBrandVoice
} from "./contentEngine.js";
import type { ContentRepository } from "./repository.js";

export interface DraftContentForJobInput {
  tenantId: string;
  job: ContentJobFact;
  media?: ContentMediaFact[] | undefined;
  requestedKinds?: ContentDraftKind[] | undefined;
  brandVoice?: Partial<TenantBrandVoice> | undefined;
  repository: ContentRepository;
  approvalQueue: ApprovalQueueService;
  now?: string | undefined;
}

export interface QueueContentDraftForApprovalInput {
  draft: ContentDraft;
  repository: ContentRepository;
  approvalQueue: ApprovalQueueService;
}

function approvalOp(kind: ContentDraftKind): string {
  if (kind === "gbp_post") {
    return "publishGbpPost";
  }
  if (kind === "social_post") {
    return "publishSocialPost";
  }
  return "publishSeoArticle";
}

export async function queueContentDraftForApproval(input: QueueContentDraftForApprovalInput): Promise<ContentDraft> {
  const approval = await input.approvalQueue.create({
    tenantId: input.draft.tenantId,
    kind: input.draft.kind,
    preview: {
      title: input.draft.title,
      body: input.draft.body,
      mediaRefs: input.draft.mediaRefs
    },
    execute: {
      service: "content",
      op: approvalOp(input.draft.kind),
      args: {
        draftId: input.draft.id,
        tenantId: input.draft.tenantId,
        publishingDeferredUntilCredentials: true
      }
    },
    createdBy: "nexi"
  });
  return input.repository.saveDraft({
    ...input.draft,
    status: "approval_pending",
    approvalId: approval.id
  });
}

export async function draftContentForJob(input: DraftContentForJobInput): Promise<ContentDraft[]> {
  const drafts = generateDraftsForJob({
    tenantId: input.tenantId,
    job: input.job,
    media: input.media ?? [],
    requestedKinds: input.requestedKinds,
    brandVoice: input.brandVoice,
    now: input.now
  });
  const savedDrafts: ContentDraft[] = [];
  for (const draft of drafts) {
    savedDrafts.push(await queueContentDraftForApproval({
      draft,
      repository: input.repository,
      approvalQueue: input.approvalQueue
    }));
  }
  await input.repository.saveCalendarItems(planContentCalendar({
    tenantId: input.tenantId,
    startDate: input.now ?? new Date().toISOString(),
    drafts: savedDrafts
  }));
  return savedDrafts;
}
