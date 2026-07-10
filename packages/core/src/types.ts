import type { Readable } from "node:stream";
import type { ZodSchema } from "zod";

export type ID = string;

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export type IndustryPack = "pool_leak" | "hvac" | "plumbing";
export type CrmAdapterKind = "jobber" | "native";
export type MediaAdapterKind = "companycam" | "native";
export type EmailAdapterKind = "gmail_relay" | "sendgrid";
export type SmsAdapterKind = "twilio";
export type TenantPlan = "nexi" | "marketing" | "suite";
export type TenantUserRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
export type JobAccessScope = "job.read" | "checklist.write" | "media.upload" | "notes.write";
export type PlatformModule =
  | "nexi"
  | "crm"
  | "fielddocs"
  | "scheduling"
  | "content"
  | "campaigns"
  | "reputation"
  | "comms"
  | "voice"
  | "platform"
  | "evaporation"
  | "seo"
  | "sites";

export type ArtifactKind =
  | "client"
  | "tenant_provisioning"
  | "email"
  | "sms"
  | "gbp_post"
  | "social_post"
  | "article"
  | "quote"
  | "invoice"
  | "site_publish"
  | "gbp_profile_update"
  | "seo_fix"
  | "review_reply";

export interface Tenant {
  id: ID;
  name: string;
  industryPack: IndustryPack;
  branding: {
    assistantName: string;
    logoRef?: string | undefined;
    colors?: Record<string, string> | undefined;
  };
  adapters: {
    crm: CrmAdapterKind;
    media: MediaAdapterKind;
    email: EmailAdapterKind;
    sms?: SmsAdapterKind | undefined;
  };
  approval: Record<ArtifactKind, { autoApprove: boolean; cleanStreak: number }>;
  timezone: string;
  plan: TenantPlan;
}

export interface TenantBranding {
  tenantId: ID;
  displayName: string;
  logo?: {
    storageRef?: string | undefined;
    mediaId?: ID | undefined;
    url?: string | undefined;
    mimeType?: "image/png" | "image/jpeg" | "image/webp" | undefined;
    alt?: string | undefined;
    updatedAt?: string | undefined;
  } | undefined;
  colors: {
    primary?: string | undefined;
    secondary?: string | undefined;
    accent?: string | undefined;
    accentText?: string | undefined;
    background?: string | undefined;
    surface?: string | undefined;
    text?: string | undefined;
    mutedText?: string | undefined;
    userBubble?: string | undefined;
    assistantBubble?: string | undefined;
  };
  fontFamily?: string | undefined;
  source: "default" | "manual" | "extracted";
  updatedBy: ID;
  updatedAt: string;
}

export interface PlatformPlan {
  id: TenantPlan;
  name: string;
  monthlyUsd: number;
  modules: PlatformModule[];
}

export interface TenantSubscription {
  id: ID;
  tenantId: ID;
  plan: TenantPlan;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  currentPeriodEnd?: string | undefined;
  updatedAt: string;
}

export interface TenantUser {
  id: ID;
  tenantId: ID;
  authUid?: string | undefined;
  email?: string | undefined;
  displayName: string;
  role: TenantUserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobAccessLink {
  id: ID;
  tenantId: ID;
  jobId: ID;
  propertyId?: ID | undefined;
  externalName: string;
  externalEmail?: string | undefined;
  tokenHash: string;
  scopes: JobAccessScope[];
  expiresAt: string;
  revokedAt?: string | undefined;
  createdAt: string;
  createdBy: ID;
}

export interface TenantAdapterStatus {
  tenantId: ID;
  adapter: "crm" | "media" | "email" | "sms" | "maps" | "llm" | "voice";
  provider: string;
  configured: boolean;
  ok: boolean;
  checkedAt: string;
  detail?: string | undefined;
}

export interface TenantCostSummary {
  tenantId: ID;
  periodStart: string;
  periodEnd: string;
  estimatedCostUsd: number;
  usageLogCount: number;
}

export interface PlatformBackupRecord {
  id: ID;
  tenantId: ID;
  storageRef: string;
  collectionCounts: Record<string, number>;
  createdAt: string;
}

export interface TenantDataExport {
  tenantId: ID;
  exportedAt: string;
  collections: Record<string, unknown[]>;
}

export type JobStatus =
  | "lead"
  | "quoted"
  | "scheduled"
  | "in_progress"
  | "complete"
  | "invoiced"
  | "paid";

export interface Client {
  id: ID;
  tenantId: ID;
  name: string;
  company?: string | undefined;
  emails: string[];
  phones: string[];
  tags: string[];
  consent: { email: boolean; sms: boolean };
  externalIds?: { jobber?: string | undefined } | undefined;
}

export interface Asset {
  id: ID;
  kind: string;
  label: string;
  fields: Record<string, string | number | boolean>;
}

export interface Property {
  id: ID;
  tenantId: ID;
  clientId: ID;
  address: Address;
  geo?: { lat: number; lng: number } | undefined;
  assets: Asset[];
  externalIds?: { jobber?: string | undefined } | undefined;
}

export interface LineItem {
  id: ID;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Job {
  id: ID;
  tenantId: ID;
  clientId: ID;
  propertyId?: ID;
  status: JobStatus;
  title: string;
  startAt?: string | undefined;
  endAt?: string | undefined;
  lineItems: LineItem[];
  totals: { subtotal: number; tax: number; total: number };
  externalIds?: { jobber?: string | undefined } | undefined;
}

export interface Visit {
  id: ID;
  tenantId: ID;
  jobId: ID;
  start: string;
  end: string;
  assignedTo: ID[];
  checklistRef?: ID | undefined;
  outcome?: string | undefined;
}

export interface Media {
  id: ID;
  tenantId: ID;
  jobId?: ID | undefined;
  propertyId?: ID | undefined;
  type: "photo" | "video" | "pdf";
  storageRef: string;
  thumbRef?: string | undefined;
  exif?: { gps?: { lat: number; lng: number } | undefined; ts?: string | undefined } | undefined;
  aiTags: string[];
  aiCaption?: string | undefined;
  capturedBy?: string | undefined;
  externalIds?: { companycam?: string | undefined } | undefined;
  sourceUrlNeverExposed?: never;
}

export interface ServiceDef {
  id: ID;
  name: string;
  description: string;
  active: boolean;
}

export interface SiteJobBlueprint {
  id: ID;
  tenantId: ID;
  jobId?: ID | undefined;
  kind: "site_blueprint";
  fields: Record<string, string | number>;
  extractedFrom: ID;
  extractedAt: string;
}

export interface NexiBlueprint {
  id: ID;
  tenantId: ID;
  services: ServiceDef[];
  pricingNotes: string;
  serviceArea: string[];
  brandVoice: string;
  terminology: Record<string, string>;
}

export interface NewClient {
  tenantId: ID;
  name: string;
  company?: string | undefined;
  emails: string[];
  phones: string[];
  consent: { email: boolean; sms: boolean };
}

export interface QuoteDraft {
  tenantId: ID;
  clientId: ID;
  jobId?: ID | undefined;
  title: string;
  lineItems: LineItem[];
}

export interface Quote {
  id: ID;
  tenantId: ID;
  clientId: ID;
  jobId?: ID | undefined;
  status: "draft" | "pending_approval" | "sent" | "signed" | "declined";
  title: string;
  lineItems: LineItem[];
  totals: { subtotal: number; tax: number; total: number };
  approvalId?: ID | undefined;
  pdfRef?: string | undefined;
  portalTokenHash?: string | undefined;
  signedBy?: string | undefined;
  signedAt?: string | undefined;
  signatureIp?: string | undefined;
  externalIds?: { jobber?: string | undefined; stripe?: string | undefined } | undefined;
}

export interface Invoice {
  id: ID;
  tenantId: ID;
  clientId: ID;
  jobId?: ID | undefined;
  quoteId?: ID | undefined;
  status: "draft" | "sent" | "paid" | "void" | "overdue";
  title: string;
  lineItems: LineItem[];
  totals: { subtotal: number; tax: number; total: number };
  dueAt?: string | undefined;
  paidAt?: string | undefined;
  externalIds?: { jobber?: string | undefined; stripe?: string | undefined } | undefined;
}

export interface JobDetail extends Job {
  client?: Client | undefined;
  property?: Property | undefined;
  candidates?: Job[] | undefined;
  notes?: string | undefined;
}

export interface ProjectRef {
  id: ID;
  name: string;
  externalIds?: { companycam?: string | undefined } | undefined;
  address?: Partial<Address> | undefined;
}

export interface DocRef {
  id: ID;
  tenantId: ID;
  label: string;
  storageRef: string;
  mime?: string | undefined;
  byteSize?: number | undefined;
  updatedAt?: string | undefined;
  externalIds?: { companycam?: string | undefined } | undefined;
}

export interface Binary {
  stream: Readable | ReadableStream<Uint8Array>;
  mime: string;
  filename?: string | undefined;
}

export interface MediaMeta {
  filename: string;
  mime: string;
  capturedAt?: string | undefined;
  tags?: string[] | undefined;
}

export interface OutboundEmail {
  tenantId: ID;
  mailbox?: string | undefined;
  to: string[];
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  bodyText: string;
  bodyHtml?: string | undefined;
  attachments?: OutboundEmailAttachment[] | undefined;
  replyToMessageId?: ID | undefined;
}

export interface OutboundEmailAttachment {
  filename: string;
  mime: string;
  contentBase64: string;
}

export interface OutboundSms {
  tenantId: ID;
  to: string;
  body: string;
}

export interface SendReceipt {
  provider: string;
  id: ID;
  acceptedAt: string;
  mailbox?: string | undefined;
  threadId?: ID | undefined;
}

export interface EmailSearchQuery {
  mailbox?: string | undefined;
  sender?: string | undefined;
  subject?: string | undefined;
  keywords?: string | undefined;
  after?: string | undefined;
  before?: string | undefined;
  maxResults?: number | undefined;
}

export interface EmailMessageSummary {
  id: ID;
  tenantId: ID;
  mailbox: string;
  threadId: ID;
  from?: string | undefined;
  to?: string | undefined;
  subject?: string | undefined;
  receivedAt?: string | undefined;
  snippet?: string | undefined;
  labels: string[];
}

export interface EmailAttachmentSummary {
  id: ID;
  tenantId: ID;
  mailbox: string;
  messageId: ID;
  filename: string;
  mime?: string | undefined;
  byteSize?: number | undefined;
  inline: boolean;
}

export interface EmailMessageDetail extends EmailMessageSummary {
  bodyText?: string | undefined;
  bodyHtml?: string | undefined;
  attachments: EmailAttachmentSummary[];
}

export interface EmailThread {
  id: ID;
  tenantId: ID;
  mailbox: string;
  messages: EmailMessageSummary[] | EmailMessageDetail[];
}

export interface CRMProvider {
  getClients(q: string): Promise<Client[]>;
  getJobs(range: { from: string; to: string }): Promise<Job[]>;
  getJobDetail(ref: { id?: ID; nameQuery?: string }): Promise<JobDetail>;
  createClient?(d: NewClient): Promise<Client>;
  draftQuote?(d: QuoteDraft): Promise<Quote>;
  updateJobStatus?(id: ID, s: JobStatus): Promise<Job>;
}

export interface MediaProvider {
  findProjects(q: string): Promise<ProjectRef[]>;
  getMedia(projectRef: ProjectRef): Promise<Media[]>;
  getDocuments(projectRef: ProjectRef): Promise<DocRef[]>;
  fetchBinary(mediaId: ID): Promise<{ stream: Readable | ReadableStream<Uint8Array>; mime: string }>;
  upload?(jobId: ID, file: Binary, meta: MediaMeta): Promise<Media>;
}

export interface CommsProvider {
  sendEmail(m: OutboundEmail): Promise<SendReceipt>;
  sendSms?(m: OutboundSms): Promise<SendReceipt>;
  suppressionCheck(clientId: ID, channel: "email" | "sms"): Promise<boolean>;
}

export interface EmailReadProvider {
  readonly mailbox: string;
  searchEmail(query: EmailSearchQuery): Promise<EmailMessageSummary[]>;
  getEmailThread(threadId: ID): Promise<EmailThread>;
  getEmailMessage(messageId: ID): Promise<EmailMessageDetail>;
  getEmailAttachment(messageId: ID, attachmentId: ID): Promise<Binary>;
}

export interface EmailSendProvider {
  readonly mailbox: string;
  sendEmail(message: OutboundEmail): Promise<SendReceipt>;
}

export type EventType =
  | "client.created"
  | "job.created"
  | "job.completed"
  | "visit.booked"
  | "visit.completed"
  | "media.uploaded"
  | "quote.sent"
  | "quote.signed"
  | "invoice.paid"
  | "lead.received"
  | "review.received"
  | "content.published";

export interface BusEvent {
  id: ID;
  tenantId: ID;
  type: EventType;
  payload: unknown;
  ts: string;
  processedBy: string[];
}

export interface EventBus {
  emit(e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void>;
  subscribe(type: EventType, handlerName: string, h: (e: BusEvent) => Promise<void>): void;
}

export interface ApprovalItem {
  id: ID;
  tenantId: ID;
  kind: ArtifactKind;
  preview: { title: string; body: string; mediaRefs?: ID[] | undefined };
  execute: { service: string; op: string; args: unknown };
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  createdBy: "nexi" | "system" | "user";
  decidedAt?: string | undefined;
}

export interface NexiTool {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  inputJsonSchema?: Record<string, unknown> | undefined;
  handler: (tenant: Tenant, args: unknown) => Promise<{ result: unknown; sources: Source[] }>;
}

export interface Source {
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp" | "email";
  ref: string;
  label: string;
}

export interface ConversationRecord {
  id: ID;
  tenantId: ID;
  conversationId?: ID | undefined;
  userText: string;
  assistantText: string;
  sources: Source[];
  toolRuns?: Array<{ name: string; sources: Source[]; result: unknown }> | undefined;
  createdAt: string;
}

export interface FailureLogRecord {
  id: ID;
  tenantId: ID;
  module: "nexi";
  op: string;
  question: string;
  reason: string;
  sources: Source[];
  correctionText?: string | undefined;
  flaggedConversationId?: ID | undefined;
  flaggedQuestion?: string | undefined;
  flaggedAnswer?: string | undefined;
  flaggedAnswerSources?: Source[] | undefined;
  createdAt: string;
}

export interface UsageLogRecord {
  tenantId: ID;
  provider: "anthropic" | "elevenlabs";
  model: string;
  routeActionName: string;
  taskType: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    totalTokens: number;
    characters?: number | undefined;
    audioBytes?: number | undefined;
  };
  estimatedCostUsd: number | null;
  ok: boolean;
  errorSummary: string;
  createdAt: string;
}
