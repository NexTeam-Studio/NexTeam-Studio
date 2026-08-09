import { randomUUID, createHash } from "node:crypto";
import { RailError, type ApprovalItem } from "@nexteam/core";
import type { Client, Job, Media, Property } from "@nexteam/core";
import type { TenantBranding } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import { pairBeforeAfter } from "../fielddocs/photoSearch.js";
import type { MediaRepository } from "../fielddocs/mediaRepository.js";
import type { PlatformRepository } from "../platform/repository.js";
import type { ReputationRepository } from "../reputation/repository.js";
import type { ApprovalQueueService } from "@nexteam/core";
import {
  draftContentForJob,
  queueContentDraftForApproval
} from "./workflow.js";
import type { ContentRepository } from "./repository.js";
import type {
  ContentAudienceMember,
  ContentDraft,
  ContentDraftKind,
  ContentJobFact,
  ContentEligibilityRecord,
  ContentSettings,
  ContentShowcase
} from "./contentEngine.js";
import {
  contentJobFactFromJob,
  contentMediaFactFromMedia,
  serviceTypeFromJob
} from "./contentEngine.js";

function now(): string {
  return new Date().toISOString();
}

function localityLabel(property?: Property | undefined, client?: Client | undefined): string {
  const address = property?.address ?? client?.billingAddress;
  const city = address?.city?.trim();
  const province = address?.province?.trim();
  return [city, province].filter(Boolean).join(", ") || "Local service area";
}

function marketingConsentEnabled(client: Client | undefined): boolean {
  return client?.consent.marketing === true;
}

function isClosedJob(job: Job): boolean {
  return Boolean(job.closedAt || job.archivedAt);
}

function safeClosedAt(job: Job): string | undefined {
  return job.closedAt ?? job.archivedAt ?? job.updatedAt ?? job.createdAt;
}

function cleanDraftBody(body: string, locality: string): string {
  return body
    .replace(/\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:road|rd|street|st|drive|dr|lane|ln|avenue|ave|court|ct|circle|cir|boulevard|blvd|way)\b/gi, locality)
    .replace(/\b(?:lat|latitude|lng|long|longitude)\s*[:=]?\s*-?\d+(?:\.\d+)?(?:,\s*-?\d+(?:\.\d+)?)?/gi, "");
}

function cleanDraftTitle(title: string, locality: string): string {
  return title.replace(/\b\d{1,6}\s+[A-Za-z0-9.' -]+/g, locality);
}

function cleanPublicText(value: string, locality: string): string {
  return cleanDraftBody(value, locality)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function serviceTypeLabel(job: ContentJobFact, locality: string): string {
  return cleanPublicText(serviceTypeFromJob(job), locality);
}

function watermarkLabel(tenantName: string): string {
  return `${tenantName} | NexCam`;
}

function portfolioTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function ratingSort(left: { rating: number; reviewedAt: string }, right: { rating: number; reviewedAt: string }): number {
  if (right.rating !== left.rating) {
    return right.rating - left.rating;
  }
  return right.reviewedAt.localeCompare(left.reviewedAt);
}

function beforeAfterFirst(media: Media[]): Media[] {
  const pairs = pairBeforeAfter(media);
  const prioritizedIds = new Set<string>();
  const prioritized: Media[] = [];
  for (const pair of pairs) {
    prioritized.push(pair.before, pair.after);
    prioritizedIds.add(pair.before.id);
    prioritizedIds.add(pair.after.id);
  }
  return [
    ...prioritized,
    ...media.filter((item) => !prioritizedIds.has(item.id))
  ];
}

function bundleManifestName(draft: ContentDraft): string {
  const stem = `${draft.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || draft.id}-bundle.txt`;
}

function audienceMemberFromJob(input: { job: Job; client: Client; property?: Property | undefined }): ContentAudienceMember {
  const locality = localityLabel(input.property, input.client);
  const jobFact = contentJobFactFromJob(input.job);
  return {
    clientId: input.client.id,
    clientName: input.client.name,
    locality,
    serviceType: serviceTypeLabel(jobFact, locality),
    lastClosedJobAt: safeClosedAt(input.job),
    email: input.client.emails[0],
    phone: input.client.phones[0],
    marketingConsent: marketingConsentEnabled(input.client)
  };
}

export interface NexReachAudienceFilter {
  serviceType?: string | undefined;
  locality?: string | undefined;
  closedSince?: string | undefined;
}

export interface NexReachPortfolioSnapshot {
  tenantId: string;
  tenantName: string;
  branding: TenantBranding | null;
  showcases: ContentShowcase[];
  reviews: Array<{
    id: string;
    authorName: string;
    rating: number;
    comment: string;
    reviewedAt: string;
  }>;
  settings: ContentSettings;
}

export interface NexReachPortfolioShell {
  tenantId: string;
  tenantName: string;
  branding: TenantBranding | null;
}

export interface NexReachServiceDeps {
  repository: ContentRepository;
  crmRepository: NativeCrmRepository;
  mediaRepository: MediaRepository;
  platformRepository: PlatformRepository;
  reputationRepository: ReputationRepository;
  approvalQueue: ApprovalQueueService;
}

export class NexReachService {
  constructor(private readonly deps: NexReachServiceDeps) {}

  async getSettings(tenantId: string): Promise<ContentSettings> {
    const existing = await this.deps.repository.getSettings(tenantId);
    if (existing) {
      return existing;
    }
    const tenant = await this.deps.platformRepository.getTenant(tenantId);
    const timestamp = now();
    const seeded: ContentSettings = {
      id: `nexreach_settings_${tenantId}`,
      tenantId,
      toneNotes: "Keep it plain, local, proof-first, and useful to a homeowner who wants a clear next step.",
      serviceAreaLine: "Serving Western North Carolina and Upstate South Carolina.",
      licenseLine: "Leak detection findings stay evidence-first and field-verified before anything is shared publicly.",
      ctaLine: "If your pool is losing more water than normal evaporation explains, schedule a leak detection visit.",
      approvalAuthority: "owner_only",
      seededDefaults: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.deps.repository.saveSettings({
      ...seeded,
      toneNotes: tenant?.name
        ? `${tenant.name}: plainspoken, local, evidence-first, never hype.`
        : seeded.toneNotes
    });
  }

  async saveSettings(input: {
    tenantId: string;
    toneNotes?: string | undefined;
    serviceAreaLine?: string | undefined;
    licenseLine?: string | undefined;
    ctaLine?: string | undefined;
  }): Promise<ContentSettings> {
    const existing = await this.getSettings(input.tenantId);
    const updated: ContentSettings = {
      ...existing,
      ...(input.toneNotes !== undefined ? { toneNotes: input.toneNotes.trim() } : {}),
      ...(input.serviceAreaLine !== undefined ? { serviceAreaLine: input.serviceAreaLine.trim() } : {}),
      ...(input.licenseLine !== undefined ? { licenseLine: input.licenseLine.trim() } : {}),
      ...(input.ctaLine !== undefined ? { ctaLine: input.ctaLine.trim() } : {}),
      updatedAt: now()
    };
    return this.deps.repository.saveSettings(updated);
  }

  async syncEligibility(tenantId: string): Promise<ContentEligibilityRecord[]> {
    const [jobs, clients, properties, existing] = await Promise.all([
      this.deps.crmRepository.listJobs(tenantId),
      this.deps.crmRepository.listClients(tenantId),
      this.deps.crmRepository.listProperties(tenantId),
      this.deps.repository.listEligibility(tenantId)
    ]);
    const byJobId = new Map(existing.map((record) => [record.jobId, record]));
    const next: ContentEligibilityRecord[] = [];
    for (const job of jobs.filter(isClosedJob)) {
      const client = clients.find((record) => record.id === job.clientId);
      if (!client) {
        continue;
      }
      const property = job.propertyId ? properties.find((record) => record.id === job.propertyId) : undefined;
      const current = byJobId.get(job.id);
      const consentEnabled = marketingConsentEnabled(client);
      const status = consentEnabled
        ? (current?.draftIds?.length ? "drafted" : "eligible")
        : "blocked_consent";
      const record: ContentEligibilityRecord = {
        id: current?.id ?? `content_eligibility_${job.id}`,
        tenantId,
        jobId: job.id,
        clientId: client.id,
        status,
        locality: localityLabel(property, client),
        serviceType: serviceTypeLabel(contentJobFactFromJob(job), localityLabel(property, client)),
        ...(safeClosedAt(job) ? { closedAt: safeClosedAt(job) } : {}),
        ...(current?.draftIds?.length ? { draftIds: current.draftIds } : {}),
        ...(consentEnabled ? {} : { blockedReason: "marketing_consent_off" }),
        createdAt: current?.createdAt ?? now(),
        updatedAt: now()
      };
      next.push(await this.deps.repository.saveEligibility(record));
    }
    return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async handleConsentChange(input: { tenantId: string; clientId: string; marketingConsent: boolean }): Promise<{
    flaggedShowcases: ContentShowcase[];
  }> {
    const [eligibility, showcases] = await Promise.all([
      this.deps.repository.listEligibility(input.tenantId),
      this.deps.repository.listShowcases(input.tenantId)
    ]);
    const clientRecords = eligibility.filter((record) => record.clientId === input.clientId);
    for (const record of clientRecords) {
      await this.deps.repository.saveEligibility({
        ...record,
        status: input.marketingConsent ? (record.draftIds?.length ? "drafted" : "eligible") : "blocked_consent",
        ...(input.marketingConsent ? { blockedReason: undefined } : { blockedReason: "marketing_consent_revoked" }),
        updatedAt: now()
      });
    }
    if (input.marketingConsent) {
      return { flaggedShowcases: [] };
    }
    const flagged: ContentShowcase[] = [];
    for (const showcase of showcases.filter((record) => record.clientId === input.clientId && record.status === "preview_ready")) {
      const updated = await this.deps.repository.saveShowcase({
        ...showcase,
        status: "review_required",
        updatedAt: now()
      });
      flagged.push(updated);
    }
    return { flaggedShowcases: flagged };
  }

  async listAudience(tenantId: string, filter: NexReachAudienceFilter = {}): Promise<ContentAudienceMember[]> {
    const [jobs, clients, properties] = await Promise.all([
      this.deps.crmRepository.listJobs(tenantId),
      this.deps.crmRepository.listClients(tenantId),
      this.deps.crmRepository.listProperties(tenantId)
    ]);
    const members = new Map<string, ContentAudienceMember>();
    for (const job of jobs.filter(isClosedJob)) {
      const client = clients.find((record) => record.id === job.clientId);
      if (!client || !marketingConsentEnabled(client)) {
        continue;
      }
      const property = job.propertyId ? properties.find((record) => record.id === job.propertyId) : undefined;
      const member = audienceMemberFromJob({ job, client, property });
      const current = members.get(client.id);
      if (!current || (member.lastClosedJobAt ?? "") > (current.lastClosedJobAt ?? "")) {
        members.set(client.id, member);
      }
    }
    return [...members.values()].filter((member) => {
      if (filter.serviceType && member.serviceType !== filter.serviceType) {
        return false;
      }
      if (filter.locality && member.locality !== filter.locality) {
        return false;
      }
      if (filter.closedSince && (member.lastClosedJobAt ?? "") < filter.closedSince) {
        return false;
      }
      return true;
    }).sort((left, right) => (right.lastClosedJobAt ?? "").localeCompare(left.lastClosedJobAt ?? ""));
  }

  private async loadDraftApproval(tenantId: string, draft: ContentDraft): Promise<ApprovalItem> {
    if (!draft.approvalId) {
      throw new RailError(`Draft ${draft.id} does not have a pending approval to act on.`, { provider: "native", op: "loadDraftApproval", status: 409 });
    }
    const approval = await this.deps.approvalQueue.get(tenantId, draft.approvalId);
    if (!approval) {
      throw new RailError(`Approval ${draft.approvalId} was not found for draft ${draft.id}.`, { provider: "native", op: "loadDraftApproval", status: 404 });
    }
    return approval;
  }

  async listPendingDrafts(tenantId: string): Promise<Array<ContentDraft & { approval: ApprovalItem | null }>> {
    const drafts = (await this.deps.repository.listDrafts(tenantId)).filter((draft) => draft.status === "approval_pending");
    return Promise.all(drafts.map(async (draft) => ({
      ...draft,
      approval: draft.approvalId ? await this.deps.approvalQueue.get(tenantId, draft.approvalId) : null
    })));
  }

  async getDraft(tenantId: string, draftId: string): Promise<ContentDraft | null> {
    return this.deps.repository.getDraft(tenantId, draftId);
  }

  async getRepositoryDraftsForUi(tenantId: string): Promise<ContentDraft[]> {
    return (await this.deps.repository.listDrafts(tenantId))
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  }

  async restateDraftForApproval(tenantId: string, draftId: string): Promise<{ draft: ContentDraft; approval: ApprovalItem }> {
    const draft = await this.requireDraft(tenantId, draftId);
    const approval = await this.loadDraftApproval(tenantId, draft);
    return { draft, approval };
  }

  async approveDraft(input: { tenantId: string; draftId: string; actorId?: string | undefined }): Promise<{
    approval: ApprovalItem;
    draft: ContentDraft;
  }> {
    const draft = await this.requireDraft(input.tenantId, input.draftId);
    const approval = await this.loadDraftApproval(input.tenantId, draft);
    if (approval.status === "pending") {
      await this.deps.approvalQueue.approve(input.tenantId, approval.id, input.actorId);
    }
    await this.deps.approvalQueue.executeApproved(input.tenantId, approval.id, input.actorId);
    const updated = await this.requireDraft(input.tenantId, input.draftId);
    return { approval: { ...approval, status: "approved" }, draft: updated };
  }

  async reviseDraft(input: {
    tenantId: string;
    draftId: string;
    actorId?: string | undefined;
    title?: string | undefined;
    body?: string | undefined;
    shortCaption?: string | undefined;
    longCaption?: string | undefined;
  }): Promise<{ draft: ContentDraft; approval: ApprovalItem }> {
    const draft = await this.requireDraft(input.tenantId, input.draftId);
    if (draft.status !== "approval_pending") {
      throw new RailError("Only approval-pending drafts can be revised before use.", { provider: "native", op: "reviseDraft", status: 409 });
    }
    const priorApproval = await this.loadDraftApproval(input.tenantId, draft);
    if (priorApproval.status === "pending") {
      await this.deps.approvalQueue.reject(input.tenantId, priorApproval.id, input.actorId ?? "system:nexreach-revise");
    }
    const locality = draft.locality ?? "Local service area";
    const updatedDraft: ContentDraft = {
      ...draft,
      ...(input.title !== undefined ? { title: cleanDraftTitle(input.title.trim(), locality) } : {}),
      ...(input.body !== undefined ? { body: cleanDraftBody(input.body.trim(), locality) } : {}),
      ...(input.shortCaption !== undefined ? { shortCaption: cleanDraftBody(input.shortCaption.trim(), locality) } : {}),
      ...(input.longCaption !== undefined ? { longCaption: cleanDraftBody(input.longCaption.trim(), locality) } : {}),
      updatedAt: now()
    };
    const requed = await queueContentDraftForApproval({
      draft: {
        ...updatedDraft,
        approvalId: undefined
      },
      repository: this.deps.repository,
      approvalQueue: this.deps.approvalQueue
    });
    return {
      draft: requed,
      approval: await this.loadDraftApproval(input.tenantId, requed)
    };
  }

  async discardDraft(input: { tenantId: string; draftId: string; actorId?: string | undefined }): Promise<{ draft: ContentDraft; approval?: ApprovalItem | undefined }> {
    const draft = await this.requireDraft(input.tenantId, input.draftId);
    let approval: ApprovalItem | undefined;
    if (draft.approvalId) {
      const existing = await this.deps.approvalQueue.get(input.tenantId, draft.approvalId);
      if (existing?.status === "pending") {
        approval = await this.deps.approvalQueue.reject(input.tenantId, existing.id, input.actorId);
      }
    }
    const updated = await this.deps.repository.updateDraft(input.tenantId, draft.id, {
      status: "rejected",
      updatedAt: now()
    });
    if (!updated) {
      throw new RailError(`Draft ${draft.id} disappeared during discard.`, { provider: "native", op: "discardDraft", status: 409 });
    }
    return { draft: updated, ...(approval ? { approval } : {}) };
  }

  async generateJobContent(input: {
    tenantId: string;
    jobId: string;
    actorId?: string | undefined;
    cadence?: "owner_on_demand" | "manual_batch" | undefined;
    requestedKinds?: ContentDraftKind[] | undefined;
  }): Promise<{
    eligibility: ContentEligibilityRecord;
    drafts: ContentDraft[];
    cadence: "owner_on_demand" | "manual_batch";
    selectedMedia: Media[];
  }> {
    await this.syncEligibility(input.tenantId);
    const [jobs, clients, properties] = await Promise.all([
      this.deps.crmRepository.listJobs(input.tenantId),
      this.deps.crmRepository.listClients(input.tenantId),
      this.deps.crmRepository.listProperties(input.tenantId)
    ]);
    const job = jobs.find((record) => record.id === input.jobId);
    if (!job || !isClosedJob(job)) {
      throw new RailError(`Closed job ${input.jobId} was not found.`, { provider: "native", op: "generateJobContent", status: 404 });
    }
    const client = clients.find((record) => record.id === job.clientId);
    if (!client || !marketingConsentEnabled(client)) {
      throw new RailError("I can't generate marketing content for that job yet because the client has not opted into marketing use.", {
        provider: "native",
        op: "generateJobContent",
        status: 409
      });
    }
    const property = job.propertyId ? properties.find((record) => record.id === job.propertyId) : undefined;
    const eligibility = (await this.deps.repository.getEligibilityByJob(input.tenantId, job.id)) ?? await this.saveEligibilityForJob(job, client, property, "eligible");
    const settings = await this.getSettings(input.tenantId);
    const tenant = await this.deps.platformRepository.getTenant(input.tenantId);
    const selectedMedia = await this.selectMediaForJob(input.tenantId, job.id);
    const city = property?.address.city ?? client.billingAddress?.city;
    const state = property?.address.province ?? client.billingAddress?.province;
    const completedAt = safeClosedAt(job);
    const jobWithContext: Job & { clientName?: string; city?: string; state?: string; completedAt?: string } = {
      ...job,
      clientName: client.name
    };
    if (city) {
      jobWithContext.city = city;
    }
    if (state) {
      jobWithContext.state = state;
    }
    if (completedAt) {
      jobWithContext.completedAt = completedAt;
    }
    const locality = localityLabel(property, client);
    const jobFact = contentJobFactFromJob(jobWithContext);
    const sanitizedJobFact: ContentJobFact = {
      ...jobFact,
      serviceType: serviceTypeLabel(jobFact, locality),
      lineItems: jobFact.lineItems?.map((item) => ({
        ...item,
        name: cleanPublicText(item.name, locality)
      }))
    };
    const drafts = await draftContentForJob({
      tenantId: input.tenantId,
      job: sanitizedJobFact,
      media: selectedMedia.map(contentMediaFactFromMedia),
      requestedKinds: input.requestedKinds ?? ["article", "social_post"],
      brandVoice: {
        businessName: tenant?.name ?? input.tenantId,
        assistantName: tenant?.branding.assistantName ?? "Nexi",
        serviceArea: [settings.serviceAreaLine],
        tone: settings.toneNotes,
        softCta: settings.ctaLine
      },
      repository: this.deps.repository,
      approvalQueue: this.deps.approvalQueue,
      now: now()
    });
    const localizedDrafts: ContentDraft[] = [];
    for (const draft of drafts) {
      const localized = await this.deps.repository.updateDraft(input.tenantId, draft.id, {
        title: cleanDraftTitle(draft.title, locality),
        body: cleanDraftBody(draft.body, locality),
        shortCaption: draft.shortCaption ? cleanDraftBody(draft.shortCaption, locality) : undefined,
        longCaption: draft.longCaption ? cleanDraftBody(draft.longCaption, locality) : undefined,
        clientId: client.id,
        clientName: client.name,
        locality,
        serviceType: serviceTypeLabel(sanitizedJobFact, locality),
        watermarkLabel: watermarkLabel(tenant?.name ?? input.tenantId),
        selectionNotes: selectedMedia.length ? [
          selectedMedia.some((item) => item.aiTags.some((tag) => tag.toLowerCase() === "before"))
            && selectedMedia.some((item) => item.aiTags.some((tag) => tag.toLowerCase() === "after"))
            ? "Before/after pair prioritized when available."
            : "Tagged job photos selected from NexCam search.",
          "Locality kept at city/state only."
        ] : ["No eligible public photo was attached yet."]
      });
      if (!localized) {
        throw new RailError(`Draft ${draft.id} disappeared after generation.`, { provider: "native", op: "generateJobContent", status: 409 });
      }
      localizedDrafts.push(localized);
    }
    const savedEligibility = await this.deps.repository.saveEligibility({
      ...eligibility,
      status: "drafted",
      draftIds: localizedDrafts.map((draft) => draft.id),
      updatedAt: now()
    });
    return {
      eligibility: savedEligibility,
      drafts: localizedDrafts,
      cadence: input.cadence ?? "owner_on_demand",
      selectedMedia
    };
  }

  async createShowcase(input: {
    tenantId: string;
    draftId: string;
    reviewIds?: string[] | undefined;
  }): Promise<ContentShowcase> {
    const draft = await this.requireDraft(input.tenantId, input.draftId);
    if (draft.status !== "publish_ready") {
      throw new RailError("Only publish-ready drafts can be assembled into a showcase.", { provider: "native", op: "createShowcase", status: 409 });
    }
    const client = draft.clientId
      ? (await this.deps.crmRepository.listClients(input.tenantId)).find((record) => record.id === draft.clientId)
      : undefined;
    if (!marketingConsentEnabled(client)) {
      throw new RailError("The client marketing consent is off, so this showcase preview cannot be created.", { provider: "native", op: "createShowcase", status: 409 });
    }
    const availableReviews = (await this.deps.reputationRepository.listReviews(input.tenantId))
      .filter((review) => review.rating >= 4)
      .sort(ratingSort);
    const selectedReviewIds = (input.reviewIds?.length ? input.reviewIds : availableReviews.slice(0, 2).map((review) => review.id))
      .filter((reviewId, index, all) => all.indexOf(reviewId) === index);
    const showcase: ContentShowcase = {
      id: `showcase_${randomUUID()}`,
      tenantId: input.tenantId,
      draftId: draft.id,
      clientId: draft.clientId ?? client?.id ?? "",
      title: draft.title,
      writeUp: draft.kind === "social_post" ? (draft.longCaption ?? draft.body) : draft.body,
      locality: draft.locality ?? "Local service area",
      serviceType: draft.serviceType ?? "Pool leak detection",
      mediaRefs: draft.mediaRefs,
      featuredReviewIds: selectedReviewIds,
      status: "preview_ready",
      createdAt: now(),
      updatedAt: now()
    };
    const saved = await this.deps.repository.saveShowcase(showcase);
    await this.deps.repository.updateDraft(input.tenantId, draft.id, {
      showcaseId: saved.id,
      updatedAt: now()
    });
    return saved;
  }

  async listShowcases(tenantId: string): Promise<ContentShowcase[]> {
    return this.deps.repository.listShowcases(tenantId);
  }

  async listReviewCandidates(tenantId: string): Promise<Array<{
    id: string;
    authorName: string;
    rating: number;
    comment: string;
    reviewedAt: string;
  }>> {
    return (await this.deps.reputationRepository.listReviews(tenantId))
      .filter((review) => review.rating >= 4)
      .sort(ratingSort)
      .map((review) => ({
        id: review.id,
        authorName: review.authorName,
        rating: review.rating,
        comment: review.comment,
        reviewedAt: review.reviewedAt
      }));
  }

  async ensurePortfolioToken(tenantId: string): Promise<{ token: string; settings: ContentSettings }> {
    const settings = await this.getSettings(tenantId);
    if (settings.portfolioTokenHash) {
      return { token: "", settings };
    }
    const token = `nexportal_portfolio_${randomUUID()}`;
    const saved = await this.deps.repository.saveSettings({
      ...settings,
      portfolioTokenHash: portfolioTokenHash(token),
      portfolioTokenIssuedAt: now(),
      updatedAt: now()
    });
    return { token, settings: saved };
  }

  async issuePortfolioLink(tenantId: string): Promise<{ token: string; settings: ContentSettings }> {
    const settings = await this.getSettings(tenantId);
    const token = `nexportal_portfolio_${randomUUID()}`;
    const saved = await this.deps.repository.saveSettings({
      ...settings,
      portfolioTokenHash: portfolioTokenHash(token),
      portfolioTokenIssuedAt: now(),
      updatedAt: now()
    });
    return { token, settings: saved };
  }

  async getPortfolioShell(tenantId: string): Promise<NexReachPortfolioShell> {
    const [tenant, branding] = await Promise.all([
      this.deps.platformRepository.getTenant(tenantId),
      this.deps.platformRepository.getTenantBranding(tenantId)
    ]);
    return {
      tenantId,
      tenantName: tenant?.name ?? tenantId,
      branding
    };
  }

  async buildPortfolioSnapshot(input: { tenantId: string; token?: string | undefined }): Promise<NexReachPortfolioSnapshot> {
    const settings = await this.getSettings(input.tenantId);
    if (settings.portfolioTokenHash) {
      const provided = input.token?.trim();
      if (!provided || portfolioTokenHash(provided) !== settings.portfolioTokenHash) {
        throw new RailError("Portfolio link is invalid or expired.", { provider: "native", op: "buildPortfolioSnapshot", status: 403 });
      }
    }
    const shell = await this.getPortfolioShell(input.tenantId);
    const previewShowcases = (await this.deps.repository.listShowcases(input.tenantId)).filter((showcase) => showcase.status === "preview_ready");
    const reviewIds = new Set(previewShowcases.flatMap((showcase) => showcase.featuredReviewIds));
    const reviews = (await this.deps.reputationRepository.listReviews(input.tenantId))
      .filter((review) => reviewIds.has(review.id))
      .map((review) => ({
        id: review.id,
        authorName: review.authorName,
        rating: review.rating,
        comment: review.comment,
        reviewedAt: review.reviewedAt
      }));
    return {
      tenantId: input.tenantId,
      tenantName: shell.tenantName,
      branding: shell.branding,
      showcases: previewShowcases,
      reviews,
      settings
    };
  }

  renderBundleText(input: { draft: ContentDraft; showcases?: ContentShowcase[] | undefined }): string {
    const lines = [
      `Title: ${input.draft.title}`,
      `Kind: ${input.draft.kind}`,
      `Locality: ${input.draft.locality ?? "Local service area"}`,
      `Service: ${input.draft.serviceType ?? "Pool leak detection"}`,
      `Watermark label: ${input.draft.watermarkLabel ?? "Tenant watermark required on export"}`,
      "",
      input.draft.shortCaption ? `Short caption:\n${input.draft.shortCaption}\n` : "",
      input.draft.longCaption ? `Long caption:\n${input.draft.longCaption}\n` : "",
      "Body:",
      input.draft.body,
      "",
      "Selected media refs:",
      ...(input.draft.mediaRefs.length ? input.draft.mediaRefs.map((ref) => `- ${ref}`) : ["- No media attached"]),
      "",
      "Notes:",
      ...(input.draft.selectionNotes?.length ? input.draft.selectionNotes.map((note) => `- ${note}`) : ["- Manual posting bundle only; provider publishing adapters remain unwired in v1."])
    ].filter(Boolean);
    return lines.join("\n");
  }

  async exportAudienceCsv(tenantId: string, filter: NexReachAudienceFilter = {}): Promise<string> {
    const rows = await this.listAudience(tenantId, filter);
    const header = ["clientId", "clientName", "locality", "serviceType", "lastClosedJobAt", "email", "phone", "marketingConsent"];
    const lines = rows.map((row) => [
      row.clientId,
      row.clientName,
      row.locality,
      row.serviceType,
      row.lastClosedJobAt ?? "",
      row.email ?? "",
      row.phone ?? "",
      row.marketingConsent ? "true" : "false"
    ].map(csvCell).join(","));
    return [header.join(","), ...lines].join("\n");
  }

  async executeApproval(item: ApprovalItem): Promise<{ draft: ContentDraft; action: "ready_for_use" }> {
    const parsedArgs = item.execute.args && typeof item.execute.args === "object"
      ? item.execute.args as { draftId?: unknown; tenantId?: unknown }
      : {};
    const draftId = typeof parsedArgs.draftId === "string" ? parsedArgs.draftId : "";
    const tenantId = typeof parsedArgs.tenantId === "string" ? parsedArgs.tenantId : item.tenantId;
    const draft = await this.requireDraft(tenantId, draftId);
    const updated = await this.deps.repository.updateDraft(tenantId, draft.id, {
      status: "publish_ready",
      updatedAt: now()
    });
    if (!updated) {
      throw new RailError(`Draft ${draft.id} could not be updated during approval execution.`, { provider: "native", op: "executeApproval", status: 409 });
    }
    return { draft: updated, action: "ready_for_use" };
  }

  async listEligibleJobs(tenantId: string): Promise<ContentEligibilityRecord[]> {
    return this.syncEligibility(tenantId);
  }

  private async selectMediaForJob(tenantId: string, jobId: string): Promise<Media[]> {
    const media = (await this.deps.mediaRepository.listMedia(tenantId))
      .filter((item) => item.jobId === jobId && item.type === "photo" && !item.hiddenFromClient && !item.trashedAt);
    return beforeAfterFirst(media).slice(0, 6);
  }

  private async requireDraft(tenantId: string, draftId: string): Promise<ContentDraft> {
    const draft = await this.deps.repository.getDraft(tenantId, draftId);
    if (!draft) {
      throw new RailError(`Draft ${draftId} was not found.`, { provider: "native", op: "requireDraft", status: 404 });
    }
    return draft;
  }

  private async saveEligibilityForJob(job: Job, client: Client, property: Property | undefined, status: ContentEligibilityRecord["status"]): Promise<ContentEligibilityRecord> {
    return this.deps.repository.saveEligibility({
      id: `content_eligibility_${job.id}`,
      tenantId: job.tenantId,
      jobId: job.id,
      clientId: client.id,
      status,
      locality: localityLabel(property, client),
      serviceType: serviceTypeLabel(contentJobFactFromJob(job), localityLabel(property, client)),
      ...(safeClosedAt(job) ? { closedAt: safeClosedAt(job) } : {}),
      ...(status === "blocked_consent" ? { blockedReason: "marketing_consent_off" } : {}),
      createdAt: now(),
      updatedAt: now()
    });
  }
}

function csvCell(value: string): string {
  const normalized = value.replace(/"/g, "\"\"");
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

export function nexReachBundleFileName(draft: ContentDraft): string {
  return bundleManifestName(draft);
}
