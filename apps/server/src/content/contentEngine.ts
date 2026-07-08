import type { ArtifactKind, Job, Media, Source } from "@nexteam/core";

export type ContentDraftKind = Extract<ArtifactKind, "gbp_post" | "social_post" | "article">;

export interface TenantBrandVoice {
  businessName: string;
  assistantName: string;
  serviceArea: string[];
  tone: string;
  softCta: string;
}

export interface ContentJobFact {
  id: string;
  tenantId: string;
  title: string;
  clientName?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  outcome?: string | undefined;
  completedAt?: string | undefined;
  lineItems?: Array<{ name: string; total?: number | undefined }> | undefined;
}

export interface ContentMediaFact {
  id: string;
  type: "photo" | "video" | "pdf";
  thumbRef?: string | undefined;
  storageRef?: string | undefined;
  caption?: string | undefined;
}

export interface ContentDraft {
  id: string;
  tenantId: string;
  kind: ContentDraftKind;
  title: string;
  body: string;
  mediaRefs: string[];
  jobId?: string | undefined;
  status: "draft" | "approval_pending" | "publish_ready" | "published_deferred" | "rejected";
  approvalId?: string | undefined;
  sources: Source[];
  calendarSlot?: string | undefined;
  createdAt: string;
}

export interface ContentCalendarItem {
  id: string;
  tenantId: string;
  kind: ContentDraftKind;
  title: string;
  scheduledFor: string;
  cadenceReason: string;
  draftId?: string | undefined;
}

export interface ContentPerformanceSnapshot {
  id: string;
  tenantId: string;
  provider: "gbp" | "meta" | "native";
  metricDate: string;
  impressions: number;
  clicks: number;
  calls: number;
  bookings: number;
  notes: string;
}

export interface DraftGenerationInput {
  tenantId: string;
  job: ContentJobFact;
  media: ContentMediaFact[];
  brandVoice?: Partial<TenantBrandVoice> | undefined;
  requestedKinds?: ContentDraftKind[] | undefined;
  now?: string | undefined;
}

export function contentJobFactFromJob(job: Job & { clientName?: string; city?: string; state?: string; outcome?: string; completedAt?: string }): ContentJobFact {
  return {
    id: job.id,
    tenantId: job.tenantId,
    title: job.title,
    clientName: job.clientName,
    city: job.city,
    state: job.state,
    outcome: job.outcome,
    completedAt: job.completedAt,
    lineItems: job.lineItems?.map((item) => ({ name: item.name, total: item.total }))
  };
}

export function contentMediaFactFromMedia(media: Media): ContentMediaFact {
  return {
    id: media.id,
    type: media.type,
    thumbRef: media.thumbRef,
    storageRef: media.storageRef,
    caption: media.aiCaption
  };
}

function defaultBrandVoice(input?: Partial<TenantBrandVoice>): TenantBrandVoice {
  return {
    businessName: input?.businessName ?? "Aquatrace Swimming Pool Leak Detection",
    assistantName: input?.assistantName ?? "Nexi",
    serviceArea: input?.serviceArea ?? ["Western North Carolina", "Upstate South Carolina"],
    tone: input?.tone ?? "clear, helpful, evidence-first, and never alarmist",
    softCta: input?.softCta ?? "If your pool is losing more water than evaporation explains, schedule a professional leak detection."
  };
}

function jobPlace(job: ContentJobFact): string {
  return [job.city, job.state].filter(Boolean).join(", ") || "a local pool";
}

function findingsLine(job: ContentJobFact): string {
  if (job.outcome) {
    return job.outcome;
  }
  const itemNames = job.lineItems?.map((item) => item.name).filter(Boolean).slice(0, 3) ?? [];
  return itemNames.length ? `Work completed included ${itemNames.join(", ")}.` : "The completed job was reviewed and documented.";
}

function source(job: ContentJobFact): Source {
  return { rail: "native", ref: job.id, label: `Native completed job ${job.title}` };
}

function mediaSources(media: ContentMediaFact[]): Source[] {
  return media.map((item) => ({ rail: "native", ref: item.id, label: `Native content media ${item.id}` }));
}

function makeDraftId(kind: ContentDraftKind): string {
  return `content_${kind}_${crypto.randomUUID()}`;
}

function makeDraft(kind: ContentDraftKind, input: DraftGenerationInput, title: string, body: string): ContentDraft {
  const mediaRefs = input.media.filter((item) => item.type === "photo").map((item) => item.id);
  return {
    id: makeDraftId(kind),
    tenantId: input.tenantId,
    kind,
    title,
    body,
    mediaRefs,
    jobId: input.job.id,
    status: "draft",
    sources: [source(input.job), ...mediaSources(input.media)],
    createdAt: input.now ?? new Date().toISOString()
  };
}

export function generateGbpPost(input: DraftGenerationInput): ContentDraft {
  const brand = defaultBrandVoice(input.brandVoice);
  const title = `${brand.businessName}: completed leak detection in ${jobPlace(input.job)}`;
  const body = [
    `${brand.businessName} completed a pool leak detection visit in ${jobPlace(input.job)}.`,
    findingsLine(input.job),
    input.media.length ? `Field photos are attached for owner review (${input.media.length} media item${input.media.length === 1 ? "" : "s"}).` : "No public photo is attached yet; add one before publishing.",
    brand.softCta
  ].join("\n\n");
  return makeDraft("gbp_post", input, title, body);
}

export function generateSocialPost(input: DraftGenerationInput): ContentDraft {
  const brand = defaultBrandVoice(input.brandVoice);
  const title = `Field note: ${jobPlace(input.job)} leak detection`;
  const body = [
    `Field note from ${brand.businessName}: not every leak is obvious from the surface.`,
    findingsLine(input.job),
    "A documented inspection gives owners a cleaner next step than guessing with water bills and buckets."
  ].join("\n\n");
  return makeDraft("social_post", input, title, body);
}

export function generateSeoArticle(input: DraftGenerationInput): ContentDraft {
  const brand = defaultBrandVoice(input.brandVoice);
  const place = jobPlace(input.job);
  const title = `How pool leak detection works in ${place}`;
  const body = [
    `# ${title}`,
    `${brand.businessName} uses a structured inspection process so pool owners can separate normal evaporation from actual water loss.`,
    `A recent completed job in ${place} followed the same evidence-first workflow: confirm reported loss, inspect structure and plumbing systems, document findings, and leave the owner with a clear next step.`,
    findingsLine(input.job),
    `For pool owners in ${brand.serviceArea.join(" and ")}, the useful lesson is simple: measure daily loss, compare it against evaporation, and get a professional test when the numbers do not line up.`
  ].join("\n\n");
  return makeDraft("article", input, title, body);
}

export function generateDraftsForJob(input: DraftGenerationInput): ContentDraft[] {
  const kinds = input.requestedKinds ?? ["gbp_post", "social_post", "article"];
  const generators: Record<ContentDraftKind, (draftInput: DraftGenerationInput) => ContentDraft> = {
    gbp_post: generateGbpPost,
    social_post: generateSocialPost,
    article: generateSeoArticle
  };
  return kinds.map((kind) => generators[kind](input));
}

export function planContentCalendar(input: {
  tenantId: string;
  startDate: string;
  drafts?: ContentDraft[] | undefined;
}): ContentCalendarItem[] {
  const start = new Date(`${input.startDate.slice(0, 10)}T09:00:00.000Z`);
  const items: ContentCalendarItem[] = [];
  const cadence: Array<{ kind: ContentDraftKind; days: number; reason: string }> = [
    { kind: "gbp_post", days: 0, reason: "GBP cadence: one job proof post per week." },
    { kind: "social_post", days: 2, reason: "Social cadence: midweek field lesson." },
    { kind: "article", days: 5, reason: "SEO cadence: one education article slot." }
  ];
  for (const rule of cadence) {
    const scheduledFor = new Date(start);
    scheduledFor.setUTCDate(start.getUTCDate() + rule.days);
    const draft = input.drafts?.find((candidate) => candidate.kind === rule.kind);
    items.push({
      id: `cal_${rule.kind}_${scheduledFor.toISOString().slice(0, 10)}`,
      tenantId: input.tenantId,
      kind: rule.kind,
      title: draft?.title ?? `${rule.kind.replace("_", " ")} slot`,
      scheduledFor: scheduledFor.toISOString(),
      cadenceReason: rule.reason,
      draftId: draft?.id
    });
  }
  return items;
}

export function summarizeContentStats(drafts: ContentDraft[], performance: ContentPerformanceSnapshot[]): Record<string, number> {
  return {
    drafts: drafts.length,
    pendingApproval: drafts.filter((draft) => draft.status === "approval_pending").length,
    publishReady: drafts.filter((draft) => draft.status === "publish_ready").length,
    publishedDeferred: drafts.filter((draft) => draft.status === "published_deferred").length,
    rejected: drafts.filter((draft) => draft.status === "rejected").length,
    impressions: performance.reduce((sum, item) => sum + item.impressions, 0),
    clicks: performance.reduce((sum, item) => sum + item.clicks, 0),
    calls: performance.reduce((sum, item) => sum + item.calls, 0),
    bookings: performance.reduce((sum, item) => sum + item.bookings, 0)
  };
}
