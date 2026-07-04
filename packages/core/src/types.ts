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

export type ArtifactKind =
  | "email"
  | "sms"
  | "gbp_post"
  | "social_post"
  | "article"
  | "quote"
  | "invoice"
  | "site_publish"
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
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | undefined;
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
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp";
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
  createdAt: string;
}

export interface UsageLogRecord {
  tenantId: ID;
  provider: "anthropic";
  model: string;
  routeActionName: string;
  taskType: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    totalTokens: number;
  };
  estimatedCostUsd: number | null;
  ok: boolean;
  errorSummary: string;
  createdAt: string;
}
