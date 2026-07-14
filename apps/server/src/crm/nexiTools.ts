import { z } from "zod";
import {
  addressSchema,
  clientCommunicationSettingsSchema,
  clientContactSchema,
  RailError,
  personNameSchema,
  type ApprovalQueueService,
  type Client,
  type CRMProvider,
  type Invoice,
  type Job,
  type NexiTool,
  type Quote,
  type RequestForm,
  type ServiceRequest,
  type Source,
  type Tenant
} from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../comms/gmailRegistry.js";
import type { PlatformRepository } from "../platform/repository.js";
import type { JobLifecycleService } from "./jobLifecycle.js";
import type { LedgerService } from "./ledgerFoundation.js";
import {
  availableRequestFields,
  buildServiceRequest,
  defaultRequestForms,
  ensureRequestForms,
  notifyRequestCreated
} from "./requestFoundation.js";
import { materializeQuoteRecord, quoteComposerInputSchema, quotePreviewBody } from "./quoteFoundation.js";

const clientLookupInputSchema = z.object({ q: z.string().default("") });
const createClientInputSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1).optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  billingAddress: addressSchema.optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  address: z.string().min(1).optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  consent: z.object({ email: z.boolean(), sms: z.boolean() }).default({ email: false, sms: false })
});
export type CreateClientInput = z.infer<typeof createClientInputSchema>;
const quoteStatusSchema = z.enum(["draft", "pending_approval", "sent", "change_requested", "approved", "approved_internal", "declined", "expired", "archived"]);
const createQuoteToolInputSchema = quoteComposerInputSchema
  .omit({ tenantId: true, clientId: true })
  .extend({
    clientId: z.string().min(1).optional(),
    clientQuery: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.clientId && !value.clientQuery?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
    }
  });
const listQuotesInputSchema = z.object({
  q: z.string().default(""),
  status: quoteStatusSchema.optional()
});
const getQuoteDetailInputSchema = z.object({
  quoteId: z.string().optional(),
  query: z.string().optional()
});
const getPipelineInputSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});
const invoiceStatusInputSchema = z.object({
  invoiceId: z.string().optional(),
  clientId: z.string().optional()
});
const listRequestsInputSchema = z.object({
  q: z.string().default(""),
  status: z.enum(["new", "archived", "converted_to_quote", "converted_to_job"]).optional()
});
const getRequestDetailInputSchema = z.object({
  requestId: z.string().optional(),
  query: z.string().optional(),
  fieldKey: z.string().optional()
});
const listJobsInputSchema = z.object({
  q: z.string().default(""),
  status: z.enum(["Upcoming", "Today", "Late", "Unscheduled", "Action Required", "Requires Invoicing", "Archived"]).optional()
});
const getJobDetailInputSchema = z.object({
  jobId: z.string().optional(),
  query: z.string().optional()
});
const createJobToolInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  quoteId: z.string().min(1).optional(),
  title: z.string().min(1),
  lineItems: z.array(z.object({
    kind: z.enum(["catalog", "custom"]).default("custom"),
    catalogCode: z.string().optional(),
    code: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().min(0).default(0),
    taxable: z.boolean().optional()
  })).optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
  }
});
const jobActionToolInputSchema = z.object({
  jobId: z.string().min(1).optional(),
  query: z.string().optional(),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"])
});
const createRequestToolInputSchema = z.object({
  rawText: z.string().default(""),
  clientName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  poolConfiguration: z.string().optional(),
  poolType: z.string().optional(),
  gateCode: z.string().optional(),
  petPresent: z.boolean().optional(),
  petName: z.string().optional(),
  waterLossRate: z.string().optional(),
  issueSummary: z.string().optional()
});

interface InvoiceReadableProvider extends CRMProvider {
  getInvoices?: () => Promise<Invoice[]>;
}

export interface CrmReadToolOptions {
  fallbackClientProvider?: Pick<CRMProvider, "getClients"> | undefined;
  requestRepository?: NativeCrmRepository | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
  commsRail?: CommsRail | undefined;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: Pick<LedgerService, "listInvoices"> | undefined;
}

function source(ref: string, label: string, rail: Source["rail"] = "native"): Source {
  return { rail, ref, label };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultRange(): { from: string; to: string } {
  return { from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };
}

function normalizedPhone(value: string): string {
  return value.replace(/\D+/g, "");
}

function parseRequestAddress(value: string): { street1: string; city: string; province: string; postalCode: string } | null {
  const match = value.trim().match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!match) {
    return null;
  }
  const street1 = match[1]!;
  const city = match[2]!;
  const province = match[3]!;
  const postalCode = match[4]!;
  return {
    street1: street1.trim(),
    city: city.trim(),
    province: province.trim().toUpperCase(),
    postalCode: postalCode.trim()
  };
}

function hasClientSavePhone(input: CreateClientInput): boolean {
  return input.phones.some((phone) => phone.trim().length > 0)
    || (input.contacts ?? []).some((contact) => contact.phones.some((phone) => phone.value.trim().length > 0));
}

export function clientSaveMissingFields(input: CreateClientInput): string[] {
  const missing: string[] = [];
  if (!input.name.trim()) {
    missing.push("name");
  }
  if (!input.address?.trim()) {
    missing.push("address");
  }
  if (!hasClientSavePhone(input)) {
    missing.push("telephone");
  }
  return missing;
}

export function clientSaveClarification(missing: string[]): string {
  const summary = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(", ")}, and ${missing.at(-1)}`;
  return `I still need ${summary} before I can save this client. Email is helpful, but it is not required.`;
}

function queuedClientRecord(tenantId: string, input: CreateClientInput) {
  const parsedAddress = input.address ? parseRequestAddress(input.address) : null;
  return {
    tenantId,
    name: input.name,
    ...(input.company ? { company: input.company } : {}),
    ...(input.personName ? { personName: input.personName } : {}),
    ...(input.displayNamePreference ? { displayNamePreference: input.displayNamePreference } : {}),
    ...(input.billingAddress ? { billingAddress: input.billingAddress } : parsedAddress ? {
      billingAddress: {
        ...parsedAddress,
        country: "USA"
      }
    } : {}),
    ...(input.billingSameAsPrimaryProperty !== undefined ? { billingSameAsPrimaryProperty: input.billingSameAsPrimaryProperty } : {}),
    ...(input.contacts ? { contacts: input.contacts } : {}),
    ...(input.communicationSettings ? { communicationSettings: input.communicationSettings } : {}),
    emails: input.emails,
    phones: input.phones,
    consent: input.consent
  };
}

function queuedClientPreviewBody(client: ReturnType<typeof queuedClientRecord>, input: CreateClientInput): string {
  const contactSummary = (client.contacts ?? []).map((contact) => {
    const person = [contact.personName?.firstName, contact.personName?.lastName].filter(Boolean).join(" ");
    const channels = contact.channelPreference === "both" ? "email + one-way text" : contact.channelPreference;
    return `${person || contact.company || "Contact"}: ${channels}`;
  });
  return [
    `Name: ${client.name}`,
    client.company ? `Company: ${client.company}` : "",
    client.displayNamePreference ? `Display as: ${client.displayNamePreference === "company" ? "company name" : "first and last name"}` : "",
    client.emails.length ? `Email: ${client.emails.join(", ")}` : "Email: not provided",
    client.phones.length ? `Phone: ${client.phones.join(", ")}` : "",
    contactSummary.length ? `Contacts: ${contactSummary.join("; ")}` : "",
    client.billingSameAsPrimaryProperty === false ? "Billing address: separate address on file" : "",
    input.address ? `Address note: ${input.address}` : "",
    `Email OK: ${client.consent.email ? "yes" : "no"}`,
    `Text OK: ${client.consent.sms ? "yes, one-way outbound unless upgraded" : "no"}`
  ].filter(Boolean).join("\n");
}

export async function queueClientCreateApproval(
  tenant: Tenant,
  input: CreateClientInput,
  approvalQueue: ApprovalQueueService
): Promise<{ approval: Awaited<ReturnType<ApprovalQueueService["create"]>>; pendingClient: ReturnType<typeof queuedClientRecord>; addressNote?: string | undefined; writesAreApprovalQueuedOnly: true }> {
  const client = queuedClientRecord(tenant.id, input);
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "client",
    preview: {
      title: `Create client: ${client.name}`,
      body: queuedClientPreviewBody(client, input)
    },
    execute: {
      service: "crm",
      op: "createClient",
      args: {
        tenantId: tenant.id,
        client,
        ...(input.address ? { addressNote: input.address } : {})
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingClient: client,
    addressNote: input.address,
    writesAreApprovalQueuedOnly: true
  };
}

async function queueQuoteCreateApproval(
  tenant: Tenant,
  input: z.infer<typeof createQuoteToolInputSchema>,
  provider: CRMProvider,
  repository: NativeCrmRepository,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  pendingQuote: Quote;
  writesAreApprovalQueuedOnly: true;
}> {
  const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "createQuote");
  const quote = await materializeQuoteRecord(repository, {
    ...input,
    tenantId: tenant.id,
    clientId
  });
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "quote",
    preview: {
      title: `Create quote: ${quote.title}`,
      body: quotePreviewBody(quote)
    },
    execute: {
      service: "crm",
      op: "createQuote",
      args: {
        tenantId: tenant.id,
        quote: jsonClone(quote)
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingQuote: {
      ...quote,
      approvalId: approval.id,
      status: "pending_approval"
    },
    writesAreApprovalQueuedOnly: true
  };
}

async function resolveExactClientId(
  provider: CRMProvider,
  clientId: string | undefined,
  clientQuery: string | undefined,
  op: "createQuote" | "createJob"
): Promise<string> {
  if (clientId) {
    return clientId;
  }
  if (clientQuery?.trim()) {
    const matches = await provider.getClients(clientQuery.trim());
    if (matches.length !== 1 || !exactOrStrongClientMatch(matches, clientQuery.trim())) {
      throw new RailError("I need one exact client match before I can save that. Give me the saved client name or client id.", {
        provider: "native",
        op,
        status: 400
      });
    }
    return matches[0]!.id;
  }
  throw new RailError("A client match is required before I can save that.", { provider: "native", op, status: 400 });
}

async function queueJobCreateApproval(
  tenant: Tenant,
  input: z.infer<typeof createJobToolInputSchema>,
  provider: CRMProvider,
  repository: NativeCrmRepository,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  pendingJob: {
    tenantId: string;
    clientId: string;
    propertyId?: string | undefined;
    requestId?: string | undefined;
    quoteId?: string | undefined;
    title: string;
    lineItems: NonNullable<Job["lineItems"]>;
    status: "pending_approval";
  };
  writesAreApprovalQueuedOnly: true;
}> {
  const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "createJob");
  const clientProperties = (await repository.listProperties(tenant.id)).filter((property) => property.clientId === clientId);
  const propertyId = input.propertyId ?? (clientProperties.length === 1 ? clientProperties[0]!.id : undefined);
  const lineItems = materializeJobLineItems(input.lineItems);
  const previewBody = [
    `Title: ${input.title}`,
    `Client id: ${clientId}`,
    propertyId ? `Property id: ${propertyId}` : "Property: not attached yet",
    input.requestId ? `Request link: ${input.requestId}` : "",
    input.quoteId ? `Quote link: ${input.quoteId}` : "",
    lineItems.length ? `Line items: ${lineItems.map((item) => `${item.name} x${item.quantity}`).join("; ")}` : "Line items: none yet",
    "Lifecycle starts at Unscheduled until a visit is booked."
  ].filter(Boolean).join("\n");
  const executeInput = {
    tenantId: tenant.id,
    clientId,
    ...(propertyId ? { propertyId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    title: input.title.trim(),
    lineItems,
    createdBy: "nexi"
  };
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: {
      title: `Create job: ${executeInput.title}`,
      body: previewBody
    },
    execute: {
      service: "crm",
      op: "createJob",
      args: {
        tenantId: tenant.id,
        input: executeInput
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingJob: {
      ...executeInput,
      status: "pending_approval"
    },
    writesAreApprovalQueuedOnly: true
  };
}

async function resolveJobForAction(
  tenantId: string,
  input: z.infer<typeof jobActionToolInputSchema> | z.infer<typeof getJobDetailInputSchema>,
  jobLifecycleService: JobLifecycleService
) {
  if (input.jobId) {
    const detail = await jobLifecycleService.getJobDetail(tenantId, input.jobId);
    if (!detail) {
      throw new RailError(`Native job ${input.jobId} was not found.`, { provider: "native", op: "getJobDetail", status: 404 });
    }
    return detail;
  }
  const matches = (await jobLifecycleService.listJobs(tenantId)).filter((job) => jobMatchesQuery(job, input.query ?? ""));
  if (matches.length !== 1) {
    throw new RailError("I need one exact native job match before I can continue. Give me the job title, number, or job id.", {
      provider: "native",
      op: "getJobDetail",
      status: 400
    });
  }
  return (await jobLifecycleService.getJobDetail(tenantId, matches[0]!.id))!;
}

async function queueJobActionApproval(
  tenant: Tenant,
  input: z.infer<typeof jobActionToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  preview: Awaited<ReturnType<JobLifecycleService["prepareJobActionPreview"]>>;
  writesAreApprovalQueuedOnly: true;
}> {
  const job = await resolveJobForAction(tenant.id, input, jobLifecycleService);
  const preview = await jobLifecycleService.prepareJobActionPreview(tenant.id, job.id, input.action);
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: {
      title: preview.title,
      body: preview.body
    },
    execute: {
      service: "crm",
      op: "performJobAction",
      args: {
        tenantId: tenant.id,
        jobId: job.id,
        action: input.action
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    preview,
    writesAreApprovalQueuedOnly: true
  };
}

function requestQueryValue(request: ServiceRequest, key: string): string | number | boolean | undefined {
  return request.intake.fieldIndex[key];
}

function findRequestFieldLabel(key: string): string {
  return availableRequestFields().find((field) => field.key === key)?.label ?? key;
}

function requestFieldText(request: ServiceRequest, key: string): string | undefined {
  const value = requestQueryValue(request, key);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
}

function quoteMatchesQuery(quote: Quote, query: string, clients: Client[]): boolean {
  const needle = normalized(query.trim());
  if (!needle) {
    return true;
  }
  const client = clients.find((candidate) => candidate.id === quote.clientId);
  return [
    quote.id,
    quote.number,
    quote.title,
    quote.status,
    client?.name,
    ...(client?.emails ?? []),
    ...(client?.phones ?? [])
  ].some((value) => normalized(String(value ?? "")).includes(needle));
}

function quoteSummary(quote: Quote, clients: Client[]): {
  id: string;
  number?: string | undefined;
  title: string;
  clientName: string;
  status: Quote["status"];
  total: number;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
} {
  return {
    id: quote.id,
    ...(quote.number ? { number: quote.number } : {}),
    title: quote.title,
    clientName: clients.find((candidate) => candidate.id === quote.clientId)?.name ?? quote.clientId,
    status: quote.status,
    total: quote.totals.total,
    ...(quote.expiresAt ? { expiresAt: quote.expiresAt } : {}),
    ...(quote.requestId ? { requestId: quote.requestId } : {})
  };
}

function requestSource(ref: string, label: string): Source {
  return source(ref, label);
}

function simplifiedRequestQuery(value: string): string {
  return value
    .replace(/[?.!]+$/g, " ")
    .replace(/\b(?:is|what|tell|show|me|the|details?|request|pool|spa|gate|code|pet|name|combo|only|plus|and|or|losing|daily|water|loss)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestMatchesQuery(request: ServiceRequest, query: string): boolean {
  const needles = [normalized(query), normalized(simplifiedRequestQuery(query))].filter(Boolean);
  return !needles.length || [
    request.clientName,
    request.subject,
    request.email,
    request.phone,
    request.narrative,
    ...request.intake.fieldValues.map((field) => `${field.label} ${String(field.value)}`)
  ]
    .filter(Boolean)
    .map((value) => normalized(String(value)))
    .some((value) => needles.some((needle) => value.includes(needle)));
}

function parseLooseCreateRequestInput(text: string): z.input<typeof createRequestToolInputSchema> {
  const email = text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/)?.[0];
  const clientName = text.match(/\b(?:create|add|new)\s+(?:a\s+)?request\s+for\s+(.+?)(?=\s+(?:at|phone|email|pool|gate|pet|losing|issue|because|summary)\b|[.!?]|$)/i)?.[1]?.trim().replace(/[,\s]+$/g, "");
  const explicitAddress = text.match(/\b(\d+\s+[a-z0-9.' -]+,\s*[^,]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?)\b/i)?.[1]?.trim();
  const address = explicitAddress ?? text.match(/\bat\s+(.+?)(?=\s+(?:phone|email|pool|gate|pet|losing|issue|summary)\b|[.!?]|$)/i)?.[1]?.trim();
  const poolConfiguration = /\b(?:pool\s*\+\s*spa|pool\s+and\s+spa|pool\/spa|combo)\b/i.test(text)
    ? "pool_and_spa"
    : /\bspa\s+only\b/i.test(text)
      ? "spa_only"
      : /\bpool\s+only\b/i.test(text)
        ? "pool_only"
        : undefined;
  const poolType = text.match(/\b(vinyl|fiberglass|gunite|plaster|commercial|residential|custom)\b/i)?.[1]?.toLowerCase();
  const gateCode = text.match(/\bgate\s+code\s+(?:is|=|:)?\s*([a-z0-9-]+)/i)?.[1];
  const petName = text.match(/\bpet\s+(?:name\s+is|named)\s+([a-z0-9' -]+)/i)?.[1]?.trim();
  const petPresent = /\bpet\b/i.test(text) ? true : undefined;
  const waterLossRate = text.match(/\b(?:losing|loss(?:ing)?\s+about|water\s+loss(?:\s+is)?)\s+(.+?)(?=\s+(?:a\s+day|daily|per\s+day)\b|[.!?]|$)/i)?.[1]?.trim();
  return {
    rawText: text,
    ...(clientName ? { clientName } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
    ...(poolConfiguration ? { poolConfiguration } : {}),
    ...(poolType ? { poolType } : {}),
    ...(gateCode ? { gateCode } : {}),
    ...(petPresent !== undefined ? { petPresent } : {}),
    ...(petName ? { petName } : {}),
    ...(waterLossRate ? { waterLossRate } : {}),
    issueSummary: text.trim()
  };
}

function mergedCreateRequestInput(input: z.infer<typeof createRequestToolInputSchema>): z.infer<typeof createRequestToolInputSchema> {
  const loose = input.rawText.trim() ? parseLooseCreateRequestInput(input.rawText) : { rawText: input.rawText };
  return {
    rawText: input.rawText.trim() || loose.rawText || "",
    clientName: input.clientName ?? loose.clientName,
    email: input.email ?? loose.email,
    phone: input.phone ?? loose.phone,
    address: input.address ?? loose.address,
    poolConfiguration: input.poolConfiguration ?? loose.poolConfiguration,
    poolType: input.poolType ?? loose.poolType,
    gateCode: input.gateCode ?? loose.gateCode,
    petPresent: input.petPresent ?? loose.petPresent,
    petName: input.petName ?? loose.petName,
    waterLossRate: input.waterLossRate ?? loose.waterLossRate,
    issueSummary: input.issueSummary ?? loose.issueSummary
  };
}

function groupJobs(jobs: Job[]): Record<Job["status"], number> {
  return jobs.reduce<Record<Job["status"], number>>((groups, job) => {
    groups[job.status] = (groups[job.status] ?? 0) + 1;
    return groups;
  }, {
    Upcoming: 0,
    Today: 0,
    Late: 0,
    Unscheduled: 0,
    "Action Required": 0,
    "Requires Invoicing": 0,
    Archived: 0
  });
}

function jobMatchesQuery(job: {
  id: string;
  number?: string | undefined;
  title: string;
  status: string;
  client?: Client | undefined;
  property?: { label?: string | undefined; siteName?: string | undefined; address?: { street1?: string | undefined; city?: string | undefined } } | undefined;
}, query: string): boolean {
  const needle = normalized(query);
  if (!needle) {
    return true;
  }
  const values = [
    job.id,
    job.number ?? "",
    job.title,
    job.status,
    job.client?.name ?? "",
    job.client?.company ?? "",
    job.property?.label ?? "",
    job.property?.siteName ?? "",
    job.property?.address?.street1 ?? "",
    job.property?.address?.city ?? ""
  ].map(normalized).filter(Boolean);
  return values.some((value) => value === needle || value.includes(needle));
}

function materializeJobLineItems(items: z.infer<typeof createJobToolInputSchema>["lineItems"]): NonNullable<Job["lineItems"]> {
  return (items ?? []).map((item, index) => {
    const quantity = item.quantity ?? 1;
    const unitPrice = item.unitPrice ?? 0;
    return {
      id: `job_line_${index + 1}`,
      source: item.kind === "catalog" ? "catalog" : "custom",
      ...(item.catalogCode ? { catalogCode: item.catalogCode } : {}),
      code: item.code?.trim() || `LINE-${index + 1}`,
      name: item.name.trim(),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      quantity,
      unitPrice,
      total: Number((quantity * unitPrice).toFixed(2)),
      ...(item.taxable !== undefined ? { taxable: item.taxable } : {}),
      clientSelectable: false,
      defaultSelected: true
    };
  });
}

export function createCrmReadTools(provider: CRMProvider): NexiTool[] {
  return createCrmReadToolsWithOptions(provider);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function exactOrStrongClientMatch(clients: Client[], query: string): boolean {
  const needle = normalized(query);
  return !needle || clients.some((client) => {
    const contactValues = (client.contacts ?? []).flatMap((contact) => [
      contact.personName?.firstName,
      contact.personName?.lastName,
      contact.company,
      contact.role,
      ...contact.emails.map((email) => email.value),
      ...contact.phones.map((phone) => phone.value)
    ]);
    const values = [
      client.name,
      client.company ?? "",
      client.personName?.firstName ?? "",
      client.personName?.lastName ?? "",
      ...client.emails,
      ...client.phones,
      ...contactValues
    ].filter((value): value is string => Boolean(value)).map(normalized).filter(Boolean);
    return values.some((value) => value === needle || value.includes(needle));
  });
}

function dedupeClients(clients: Client[]): Client[] {
  const seen = new Set<string>();
  return clients.filter((client) => {
    const key = client.externalIds?.jobber ? `jobber:${client.externalIds.jobber}` : `native:${client.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function createCrmReadToolsWithOptions(provider: CRMProvider, options: CrmReadToolOptions = {}): NexiTool[] {
  const readable = provider as InvoiceReadableProvider;
  return [
    {
      name: "listRequests",
      description: "Read native NexOps requests by client name, address, email, phone, or request text.",
      inputSchema: listRequestsInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native request tools are not wired for this tenant yet.", { provider: "native", op: "listRequests", status: 501 });
        }
        await ensureRequestForms(options.requestRepository, tenant.id);
        const input = listRequestsInputSchema.parse(args);
        const requests = (await options.requestRepository.listRequests(tenant.id))
          .filter((request) => !input.status || request.status === input.status)
          .filter((request) => requestMatchesQuery(request, input.q));
        return {
          result: {
            requests: requests.map((request) => ({
              id: request.id,
              clientName: request.clientName,
              subject: request.subject,
              status: request.status,
              createdAt: request.createdAt,
              poolConfiguration: requestFieldText(request, "pool_configuration"),
              waterLossRate: requestFieldText(request, "water_loss_rate")
            }))
          },
          sources: requests.length
            ? requests.map((request) => requestSource(request.id, `Native request ${request.clientName}`))
            : [requestSource("requests", "Native request list")]
        };
      }
    },
    {
      name: "getRequestDetail",
      description: "Read one native request in detail, or read a single saved field from that request with sources.",
      inputSchema: getRequestDetailInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native request tools are not wired for this tenant yet.", { provider: "native", op: "getRequestDetail", status: 501 });
        }
        await ensureRequestForms(options.requestRepository, tenant.id);
        const input = getRequestDetailInputSchema.parse(args);
        const requests = await options.requestRepository.listRequests(tenant.id);
        const request = input.requestId
          ? await options.requestRepository.getRequest(tenant.id, input.requestId)
          : requests.find((candidate) => requestMatchesQuery(candidate, input.query ?? ""));
        if (!request) {
          return {
            result: {
              request: null,
              fieldKey: input.fieldKey,
              fieldLabel: input.fieldKey ? findRequestFieldLabel(input.fieldKey) : null,
              value: null,
              missing: true
            },
            sources: [requestSource("requests", "Native request list")]
          };
        }
        const value = input.fieldKey ? requestQueryValue(request, input.fieldKey) ?? null : null;
        return {
          result: {
            request,
            fieldKey: input.fieldKey,
            fieldLabel: input.fieldKey ? findRequestFieldLabel(input.fieldKey) : null,
            value,
            missing: input.fieldKey ? value === null : false
          },
          sources: [requestSource(request.id, `Native request ${request.clientName}`)]
        };
      }
    },
    {
      name: "clientLookup",
      description: "Read native CRM clients by name, company, email, or phone. Pass an empty query for the tenant client list.",
      inputSchema: clientLookupInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = clientLookupInputSchema.parse(args);
        const query = input.q.trim();
        const nativeClients = await provider.getClients(query);
        let jobberClients: Client[] = [];
        if (query && options.fallbackClientProvider && !exactOrStrongClientMatch(nativeClients, query)) {
          jobberClients = await options.fallbackClientProvider.getClients(query);
        }
        const clients = dedupeClients([...nativeClients, ...jobberClients]);
        return {
          result: {
            clients,
            nativeCount: nativeClients.length,
            jobberFallbackCount: jobberClients.length,
            fallbackUsed: jobberClients.length > 0
          },
          sources: [
            source("clients", "Native CRM clients"),
            ...(jobberClients.length ? [source("jobber-clients", "Live Jobber client search fallback", "jobber")] : [])
          ]
        };
      }
    },
    {
      name: "getPipeline",
      description: "Read native CRM jobs grouped by pipeline status.",
      inputSchema: getPipelineInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = getPipelineInputSchema.parse(args);
        const jobs = options.jobLifecycleService
          ? await options.jobLifecycleService.listJobs(_tenant.id)
          : await provider.getJobs({ from: input.from ?? defaultRange().from, to: input.to ?? defaultRange().to });
        return {
          result: { counts: groupJobs(jobs), jobs },
          sources: [source("jobs", "Native CRM jobs")]
        };
      }
    },
    {
      name: "listJobs",
      description: "Read native NexOps jobs with lifecycle-derived statuses, reminder state, and visit counts.",
      inputSchema: listJobsInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native job lifecycle tools are not wired for this tenant yet.", { provider: "native", op: "listJobs", status: 501 });
        }
        const input = listJobsInputSchema.parse(args);
        const jobs = (await options.jobLifecycleService.listJobs(tenant.id))
          .filter((job) => !input.status || job.status === input.status)
          .filter((job) => jobMatchesQuery(job, input.q));
        return {
          result: {
            jobs
          },
          sources: jobs.length
            ? jobs.map((job) => source(job.id, `Native job ${job.title}`))
            : [source("jobs", "Native job list")]
        };
      }
    },
    {
      name: "getJobDetail",
      description: "Read one native job in detail, including visits, reminders, invoices, and lifecycle history.",
      inputSchema: getJobDetailInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native job lifecycle tools are not wired for this tenant yet.", { provider: "native", op: "getJobDetail", status: 501 });
        }
        const input = getJobDetailInputSchema.parse(args);
        const job = await resolveJobForAction(tenant.id, input, options.jobLifecycleService);
        return {
          result: { job },
          sources: [source(job.id, `Native job ${job.title}`)]
        };
      }
    },
    {
      name: "listQuotes",
      description: "Read native NexOps quotes by client, quote number, title, or status.",
      inputSchema: listQuotesInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!provider.getQuotes) {
          throw new RailError("The configured CRM provider cannot read native quotes.", { provider: "native", op: "listQuotes", status: 501 });
        }
        const input = listQuotesInputSchema.parse(args);
        const [quotes, clients] = await Promise.all([
          provider.getQuotes(),
          provider.getClients("")
        ]);
        const matches = quotes
          .filter((quote) => !input.status || quote.status === input.status)
          .filter((quote) => quoteMatchesQuery(quote, input.q, clients));
        return {
          result: {
            quotes: matches.map((quote) => quoteSummary(quote, clients))
          },
          sources: matches.length
            ? matches.map((quote) => source(quote.id, `Native quote ${quote.title}`))
            : [source("quotes", "Native quote list")]
        };
      }
    },
    {
      name: "getQuoteDetail",
      description: "Read one native quote in detail, including number, totals, approval rules, expiry, and request link.",
      inputSchema: getQuoteDetailInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!provider.getQuotes) {
          throw new RailError("The configured CRM provider cannot read native quotes.", { provider: "native", op: "getQuoteDetail", status: 501 });
        }
        const input = getQuoteDetailInputSchema.parse(args);
        const [quotes, clients] = await Promise.all([
          provider.getQuotes(),
          provider.getClients("")
        ]);
        const quote = input.quoteId
          ? quotes.find((candidate) => candidate.id === input.quoteId || candidate.number === input.quoteId)
          : quotes.find((candidate) => quoteMatchesQuery(candidate, input.query ?? "", clients));
        if (!quote) {
          return {
            result: { quote: null },
            sources: [source("quotes", "Native quote list")]
          };
        }
        const client = clients.find((candidate) => candidate.id === quote.clientId);
        return {
          result: {
            quote,
            client: client ? {
              id: client.id,
              name: client.name,
              emails: client.emails,
              phones: client.phones
            } : null
          },
          sources: [source(quote.id, `Native quote ${quote.title}`)]
        };
      }
    },
    {
      name: "invoiceStatus",
      description: "Read native CRM invoice status by invoice id or client id.",
      inputSchema: invoiceStatusInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!readable.getInvoices && !options.ledgerService) {
          throw new RailError("The configured CRM provider cannot read native invoices.", { provider: "native", op: "invoiceStatus", status: 501 });
        }
        const input = invoiceStatusInputSchema.parse(args);
        const invoices = (options.ledgerService ? await options.ledgerService.listInvoices(_tenant.id) : await readable.getInvoices!()).filter((invoice) =>
          (input.invoiceId ? invoice.id === input.invoiceId : true)
          && (input.clientId ? invoice.clientId === input.clientId : true)
        );
        return {
          result: { invoices },
          sources: invoices.length
            ? invoices.map((invoice) => source(invoice.id, `Native invoice ${invoice.title}`))
            : [source("invoices", "Native CRM invoices")]
        };
      }
    }
  ];
}

export function createCrmTools(provider: CRMProvider, approvalQueue: ApprovalQueueService): NexiTool[] {
  return createCrmToolsWithOptions(provider, approvalQueue);
}

export function createCrmToolsWithOptions(provider: CRMProvider, approvalQueue: ApprovalQueueService, options: CrmReadToolOptions = {}): NexiTool[] {
  return [
    ...createCrmReadToolsWithOptions(provider, options),
    {
      name: "createRequest",
      description: "Create a native NexOps request immediately from conversational intake details. Ask for clarification instead of guessing if required details are missing.",
      inputSchema: createRequestToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native request tools are not wired for this tenant yet.", { provider: "native", op: "createRequest", status: 501 });
        }
        const input = mergedCreateRequestInput(createRequestToolInputSchema.parse(args));
        await ensureRequestForms(options.requestRepository, tenant.id);
        const fallbackForm = defaultRequestForms(tenant.id)[0]!;
        const defaultForm = (await options.requestRepository.listRequestForms(tenant.id))[0] ?? fallbackForm;
        const parsedAddress = input.address ? parseRequestAddress(input.address) : null;
        const fieldValues = [
          ...(input.clientName ? [{ key: "client_name", value: input.clientName }] : []),
          ...(input.email ? [{ key: "email", value: input.email }] : []),
          ...(input.phone ? [{ key: "phone", value: normalizedPhone(input.phone) }] : []),
          ...(parsedAddress ? [
            { key: "property_street1", value: parsedAddress.street1 },
            { key: "property_city", value: parsedAddress.city },
            { key: "property_province", value: parsedAddress.province },
            { key: "property_postal_code", value: parsedAddress.postalCode }
          ] : []),
          ...(input.poolConfiguration ? [{ key: "pool_configuration", value: input.poolConfiguration }] : []),
          ...(input.poolType ? [{ key: "pool_type", value: input.poolType }] : []),
          ...(input.gateCode ? [{ key: "gate_code", value: input.gateCode }] : []),
          ...(input.petPresent !== undefined ? [{ key: "pet_present", value: input.petPresent }] : []),
          ...(input.petName ? [{ key: "pet_name", value: input.petName }] : []),
          ...(input.waterLossRate ? [{ key: "water_loss_rate", value: input.waterLossRate }] : []),
          ...(input.issueSummary ? [{ key: "issue_summary", value: input.issueSummary }] : [])
        ];
        try {
          const built = await buildServiceRequest(options.requestRepository, {
            tenantId: tenant.id,
            source: "office_new_client",
            formId: defaultForm.id,
            formSlug: defaultForm.slug,
            fieldValues
          });
          const created = await options.requestRepository.createRequest(built);
          const notified = await notifyRequestCreated(created, {
            approvalQueue,
            commsRail: options.commsRail,
            platformRepository: options.platformRepository
          });
          const request = notified.notifications
            ? await options.requestRepository.updateRequest(created.id, {
              notifications: notified.notifications,
              updatedAt: notified.updatedAt
            })
            : created;
          return {
            result: { request, needsClarification: null },
            sources: [requestSource(request.id, `Native request ${request.clientName}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                request: null,
                needsClarification: error.message,
                availableFields: availableRequestFields().map((field) => field.key)
              },
              sources: []
            };
          }
          throw error;
        }
      }
    },
    {
      name: "createClient",
      description: "Create a native CRM client. This writes only to the native client collection for the current tenant.",
      inputSchema: createClientInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!provider.createClient) {
          throw new RailError("The configured CRM provider cannot create native clients.", { provider: "native", op: "createClient", status: 501 });
        }
        const input = createClientInputSchema.parse(args);
        const missingFields = clientSaveMissingFields(input);
        if (missingFields.length > 0) {
          return {
            result: {
              needsClarification: clientSaveClarification(missingFields),
              missingFields,
              saveBlocked: true
            },
            sources: []
          };
        }
        const queued = await queueClientCreateApproval(tenant, input, approvalQueue);
        return {
          result: queued,
          sources: [source(queued.approval.id, `ApprovalQueue client create ${queued.approval.id}`)]
        };
      }
    },
    {
      name: "createQuote",
      description: "Build a native NexOps quote draft, read it back in chat, and park the real write behind approval.",
      inputSchema: createQuoteToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native quote tools are not wired for this tenant yet.", { provider: "native", op: "createQuote", status: 501 });
        }
        try {
          const input = createQuoteToolInputSchema.parse(args);
          const queued = await queueQuoteCreateApproval(tenant, input, provider, options.requestRepository, approvalQueue);
          return {
            result: queued,
            sources: [
              source(queued.approval.id, `ApprovalQueue quote create ${queued.approval.id}`),
              source("native-quote-config", "Native quote templates, numbering, and totals")
            ]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                quote: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    },
    {
      name: "createJob",
      description: "Build a native NexOps job draft, read it back in chat, and park the real write behind approval.",
      inputSchema: createJobToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository || !options.jobLifecycleService) {
          throw new RailError("Native job tools are not wired for this tenant yet.", { provider: "native", op: "createJob", status: 501 });
        }
        try {
          const input = createJobToolInputSchema.parse(args);
          const queued = await queueJobCreateApproval(tenant, input, provider, options.requestRepository, approvalQueue);
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue job create ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                job: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    },
    {
      name: "queueJobAction",
      description: "Read back a job close/invoice action in chat, then park the real execution behind approval.",
      inputSchema: jobActionToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native job lifecycle tools are not wired for this tenant yet.", { provider: "native", op: "queueJobAction", status: 501 });
        }
        try {
          const input = jobActionToolInputSchema.parse(args);
          const queued = await queueJobActionApproval(tenant, input, options.jobLifecycleService, approvalQueue);
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue job action ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                preview: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    }
  ];
}
