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

function approvalOp(kind: ContentDraftKind): string {
  if (kind === "gbp_post") {
    return "publishGbpPost";
  }
  if (kind === "social_post") {
    return "publishSocialPost";
  }
  return "publishSeoArticle";
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
    const approval = await input.approvalQueue.create({
      tenantId: draft.tenantId,
      kind: draft.kind,
      preview: {
        title: draft.title,
        body: draft.body,
        mediaRefs: draft.mediaRefs
      },
      execute: {
        service: "content",
        op: approvalOp(draft.kind),
        args: {
          draftId: draft.id,
          tenantId: draft.tenantId,
          publishingDeferredUntilCredentials: true
        }
      },
      createdBy: "nexi"
    });
    savedDrafts.push(await input.repository.saveDraft({
      ...draft,
      status: "approval_pending",
      approvalId: approval.id
    }));
  }
  await input.repository.saveCalendarItems(planContentCalendar({
    tenantId: input.tenantId,
    startDate: input.now ?? new Date().toISOString(),
    drafts: savedDrafts
  }));
  return savedDrafts;
}
