import { z } from "zod";
import {
  addressSchema,
  clientCommunicationSettingsSchema,
  clientContactSchema,
  personNameSchema,
  RailError,
  quoteSchema,
  type ApprovalQueueService,
  type NexiTool,
  type Source,
  type TenantUserRole
} from "@nexteam/core";
import { extractCreateClientInput } from "@nexteam/nexi";
import type { NativeCrmRepository } from "@nexteam/providers";
import {
  clientSaveClarification,
  clientSaveMissingFields,
  queueClientCreateApproval,
  type CreateClientInput
} from "../crm/nexiTools.js";
import type { JobLifecycleService } from "../crm/jobLifecycle.js";
import type { LedgerService } from "../crm/ledgerFoundation.js";
import { materializeQuoteRecord, quotePreviewBody } from "../crm/quoteFoundation.js";

const approvalActionSchema = z.object({
  approvalId: z.string().min(1)
});

const revisePendingClientCreateApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingQuoteCreateApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingJobCreateApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingJobActionApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingJobVisitSeriesApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingVisitShiftApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const ledgerListInputSchema = z.object({
  q: z.string().default("")
});

const getPaymentDetailInputSchema = z.object({
  paymentId: z.string().optional(),
  query: z.string().optional()
});

const getInvoiceDetailInputSchema = z.object({
  invoiceId: z.string().optional(),
  query: z.string().optional()
});

const queueInvoiceComposeApprovalSchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1).optional(),
  query: z.string().optional(),
  title: z.string().optional(),
  discountKind: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
  taxRate: z.number().min(0).optional(),
  terms: z.string().optional()
}).superRefine((value, ctx) => {
  if ((!value.jobIds || value.jobIds.length === 0) && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jobIds"], message: "jobIds or query is required to combine jobs into one invoice." });
  }
});

const queueInvoiceSendApprovalSchema = z.object({
  invoiceId: z.string().optional(),
  query: z.string().optional(),
  mode: z.enum(["email", "sms", "mark_sent"]).default("email"),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  includePdf: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  includePayLink: z.boolean().optional(),
  includeHostedLink: z.boolean().optional()
}).superRefine((value, ctx) => {
  if (!value.invoiceId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invoiceId"], message: "invoiceId or query is required to send an invoice." });
  }
});

const queueCollectPaymentApprovalSchema = z.object({
  invoiceId: z.string().optional(),
  query: z.string().optional(),
  amount: z.number().positive().optional(),
  provider: z.enum(["stripe", "paypal", "manual", "quote_bridge"]).optional(),
  method: z.enum(["card", "ach", "cash", "check", "bank_transfer", "other", "paypal", "venmo"]).optional(),
  savedCardId: z.string().optional(),
  savedCardLast4: z.string().optional(),
  note: z.string().optional(),
  payerName: z.string().optional(),
  checkNumber: z.string().optional(),
  bankTransferReference: z.string().optional(),
  otherReference: z.string().optional(),
  failureMessage: z.string().optional(),
  status: z.enum(["pending", "failed", "succeeded", "refunded", "partially_refunded"]).optional()
}).superRefine((value, ctx) => {
  if (!value.invoiceId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invoiceId"], message: "invoiceId or query is required to collect a payment." });
  }
});

const queueReceiptReviewApprovalSchema = z.object({
  receiptReviewId: z.string().optional(),
  invoiceId: z.string().optional(),
  query: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  emailRecipients: z.array(z.string()).optional(),
  smsRecipients: z.array(z.string()).optional(),
  sendChannels: z.array(z.enum(["email", "sms"])).optional(),
  attachmentIds: z.array(z.string()).optional()
}).superRefine((value, ctx) => {
  if (!value.receiptReviewId && !value.invoiceId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["receiptReviewId"], message: "receiptReviewId, invoiceId, or query is required to send a receipt review." });
  }
});

const queueLedgerActionApprovalSchema = z.object({
  action: z.enum(["refund_payment", "void_invoice", "mark_bad_debt"]),
  paymentId: z.string().optional(),
  invoiceId: z.string().optional(),
  query: z.string().optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional()
}).superRefine((value, ctx) => {
  if (value.action === "refund_payment" && !value.paymentId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentId"], message: "paymentId or query is required for refunds." });
  }
  if (value.action !== "refund_payment" && !value.invoiceId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invoiceId"], message: "invoiceId or query is required for invoice billing actions." });
  }
});

const revisePendingLedgerActionApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingInvoiceComposeApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingInvoiceSendApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingCollectPaymentApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const revisePendingReceiptReviewApprovalSchema = z.object({
  approvalId: z.string().min(1),
  changeRequest: z.string().min(1)
});

const clientApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  client: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    company: z.string().optional(),
    personName: personNameSchema.optional(),
    displayNamePreference: z.enum(["person", "company"]).optional(),
    billingAddress: addressSchema.optional(),
    billingSameAsPrimaryProperty: z.boolean().optional(),
    contacts: z.array(clientContactSchema).optional(),
    communicationSettings: clientCommunicationSettingsSchema.optional(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    consent: z.object({ email: z.boolean(), sms: z.boolean(), marketing: z.boolean().default(false) })
  }),
  addressNote: z.string().optional()
});

const quoteApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  quote: quoteSchema
});

const jobCreateApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  input: z.object({
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    propertyId: z.string().optional(),
    requestId: z.string().optional(),
    quoteId: z.string().optional(),
    title: z.string().min(1),
    lineItems: z.array(z.object({
      id: z.string().min(1),
      source: z.enum(["catalog", "custom"]),
      catalogCode: z.string().optional(),
      code: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      quantity: z.number(),
      unitPrice: z.number(),
      total: z.number(),
      taxable: z.boolean().optional(),
      clientSelectable: z.boolean().optional(),
      defaultSelected: z.boolean().optional()
    })).optional(),
    intake: z.any().optional(),
    createdBy: z.string().optional()
  })
});

const jobActionApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"]),
  actorId: z.string().optional()
});

const scheduleJobVisitSeriesApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  visits: z.array(z.object({
    title: z.string().optional(),
    start: z.string().min(1),
    end: z.string().min(1),
    assignedTo: z.array(z.string().min(1)).optional(),
    details: z.string().optional()
  })).min(1)
});

const moveJobVisitSeriesApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  visitId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  shiftRemaining: z.boolean().optional()
});

const ledgerActionApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  action: z.enum(["refund_payment", "void_invoice", "mark_bad_debt"]),
  paymentId: z.string().optional(),
  invoiceId: z.string().optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
  actorId: z.string().optional()
});

const invoiceComposeApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobIds: z.array(z.string().min(1)).min(1),
  title: z.string().optional(),
  discount: z.object({
    kind: z.enum(["amount", "percent"]),
    value: z.number().min(0)
  }).optional(),
  taxRate: z.number().min(0).optional(),
  terms: z.string().optional(),
  actorId: z.string().optional()
});

const invoiceSendApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  invoiceId: z.string().min(1),
  mode: z.enum(["email", "sms", "mark_sent"]),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  includePdf: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  includePayLink: z.boolean().optional(),
  includeHostedLink: z.boolean().optional(),
  actorId: z.string().optional(),
  publicBaseUrl: z.string().min(1)
});

const collectPaymentApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  provider: z.enum(["stripe", "paypal", "manual", "quote_bridge"]),
  method: z.enum(["card", "ach", "cash", "check", "bank_transfer", "other", "paypal", "venmo"]),
  actorId: z.string().optional(),
  note: z.string().optional(),
  savedCardId: z.string().optional(),
  methodDetails: z.object({
    checkNumber: z.string().optional(),
    bankTransferReference: z.string().optional(),
    otherReference: z.string().optional(),
    payerName: z.string().optional(),
    failureMessage: z.string().optional()
  }).optional(),
  status: z.enum(["pending", "failed", "succeeded", "refunded", "partially_refunded"]).optional()
});

const receiptReviewApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  receiptReviewId: z.string().min(1),
  actorId: z.string().optional(),
  publicBaseUrl: z.string().min(1),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  emailRecipients: z.array(z.string()).optional(),
  smsRecipients: z.array(z.string()).optional(),
  sendChannels: z.array(z.enum(["email", "sms"])).optional(),
  attachmentIds: z.array(z.string()).optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function ensureBillingRole(actorRole: TenantUserRole | undefined): void {
  if (!actorRole || actorRole === "OWNER" || actorRole === "OFFICE_ADMIN") {
    return;
  }
  throw new RailError("Only OWNER and OFFICE_ADMIN can open billing tools or run billing actions.", {
    provider: "approval",
    op: "ledgerAccess",
    status: 403
  });
}

function savedCardPreviewLabel(card: { label: string; last4?: string | undefined }): string {
  if (!card.last4) {
    return card.label;
  }
  return /\bending\s+\d{4}\b/i.test(card.label) || new RegExp(`${card.last4}$`).test(card.label)
    ? card.label
    : `${card.label} ending ${card.last4}`;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function firstEmailAddress(text: string): string | undefined {
  return text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
}

function firstPhoneNumber(text: string): string | undefined {
  const labeled = text.match(/\b(?:phone|telephone|number|mobile|cell|call|text)\s*(?:is|=|:|to)?\s*([+()\d][+()\d\s.-]{6,})\b/i)?.[1];
  const fallback = text.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0];
  return (labeled ?? fallback)?.replace(/[^\d+]/g, "").trim();
}

function addressFromText(text: string): string | undefined {
  return text.match(/\b(?:address\s*(?:is|=|:|to)?|use)\s+(.+?)(?=\s+(?:email|phone|telephone|mobile|cell|number)\b|[?.!]|$)/i)?.[1]?.trim()
    ?? text.match(/\b\d{1,6}\s+[A-Za-z0-9.' -]+,\s*[^,]+,\s*[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/i)?.[0]?.trim();
}

function streetPhraseFromText(text: string): string | undefined {
  return text.match(/\b([A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|road|rd|drive|dr|lane|ln|avenue|ave|court|ct|boulevard|blvd|trail|trl|way|circle|cir|highway|hwy|place|pl))\b/i)?.[1]?.trim();
}

function mergeStreetCorrectionIntoAddress(text: string, baselineAddress?: string): string | undefined {
  if (!baselineAddress?.trim()) {
    return undefined;
  }
  const replacementStreet = streetPhraseFromText(text);
  if (!replacementStreet) {
    return undefined;
  }
  const baselineMatch = baselineAddress.match(/^\s*(\d{1,6})\s+(.+?\b(?:street|st|road|rd|drive|dr|lane|ln|avenue|ave|court|ct|boulevard|blvd|trail|trl|way|circle|cir|highway|hwy|place|pl)\b)([\s,].*)?$/i);
  if (!baselineMatch) {
    return undefined;
  }
  const streetNumber = baselineMatch[1]?.trim();
  const suffix = baselineMatch[3] ?? "";
  if (!streetNumber) {
    return undefined;
  }
  return `${streetNumber} ${replacementStreet}${suffix}`.replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
}

function nameFromChangeRequest(text: string): string | undefined {
  return text.match(/\b(?:name|client)\s*(?:is|=|:|to)\s*([a-z][a-z' -]+?)(?=\s+(?:address|email|phone|telephone|mobile|cell|number)\b|[?.!]|$)/i)?.[1]?.trim()
    ?? text.match(/\buse\s+([a-z][a-z' -]+?)(?=\s+instead\b|[?.!]|$)/i)?.[1]?.trim();
}

function looksLikeRestatedClientDetails(text: string): boolean {
  const compact = text.trim();
  if (!compact) {
    return false;
  }
  return compact.split(/\s+/).length >= 6
    && (Boolean(firstEmailAddress(text)) || Boolean(firstPhoneNumber(text)) || /\b\d{1,6}\s+[A-Za-z]/.test(text));
}

async function clientChangePatch(text: string, baseline: CreateClientInput): Promise<Partial<CreateClientInput>> {
  const lower = text.toLowerCase();
  const patch: Partial<CreateClientInput> = {};
  const email = firstEmailAddress(text);
  const phone = firstPhoneNumber(text);
  const address = addressFromText(text);
  const name = nameFromChangeRequest(text);
  if (name) {
    patch.name = name;
  }
  if (address) {
    patch.address = address;
  } else {
    const mergedAddress = mergeStreetCorrectionIntoAddress(text, baseline.address);
    if (mergedAddress) {
      patch.address = mergedAddress;
    }
  }
  if (email && /\bemail\b/i.test(lower)) {
    patch.emails = [email];
    patch.consent = { email: true, sms: false };
  }
  if (phone && /\b(?:phone|telephone|mobile|cell|number|text)\b/i.test(lower)) {
    patch.phones = [phone];
  }
  if (!hasPatch(patch) && looksLikeRestatedClientDetails(text)) {
    const extracted = await extractCreateClientInput({ text, env: process.env });
    if (extracted.name?.trim()) {
      patch.name = extracted.name.trim();
    }
    if (extracted.address?.trim()) {
      patch.address = extracted.address.trim();
    }
    if (extracted.emails.length > 0) {
      patch.emails = extracted.emails;
      patch.consent = {
        email: extracted.consent.email ?? baseline.consent.email,
        sms: extracted.consent.sms ?? baseline.consent.sms,
        ...(baseline.consent.marketing !== undefined ? { marketing: baseline.consent.marketing } : {})
      };
    }
    if (extracted.phones.length > 0) {
      patch.phones = extracted.phones;
    }
  }
  return patch;
}

function hasPatch(patch: Partial<CreateClientInput>): boolean {
  return Object.values(patch).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
}

function quoteChangePatch(text: string): {
  title?: string;
  terms?: string;
  expiryDays?: number;
  discount?: { kind: "amount" | "percent"; value: number };
  approvalRules?: {
    requireSignature?: boolean;
    requireDeposit?: boolean;
    requireCardOnFile?: boolean;
    depositKind?: "amount" | "percent";
    depositValue?: number;
  };
} {
  const patch: {
    title?: string;
    terms?: string;
    expiryDays?: number;
    discount?: { kind: "amount" | "percent"; value: number };
    approvalRules?: {
      requireSignature?: boolean;
      requireDeposit?: boolean;
      requireCardOnFile?: boolean;
      depositKind?: "amount" | "percent";
      depositValue?: number;
    };
  } = {};
  const title = text.match(/\b(?:title|quote\s+title)\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
  const terms = text.match(/\bterms?\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
  const expiryDays = text.match(/\b(?:expire|expiry|expiration)\b.*?\b(\d{1,3})\s+days?\b/i)?.[1];
  const discountPercent = text.match(/\bdiscount\b.*?\b(\d{1,3}(?:\.\d+)?)\s*%\b/i)?.[1];
  const discountAmount = text.match(/\bdiscount\b.*?\$\s*(\d+(?:\.\d{1,2})?)\b/i)?.[1];
  if (title) patch.title = title;
  if (terms) patch.terms = terms;
  if (expiryDays) patch.expiryDays = Number(expiryDays);
  if (discountPercent) patch.discount = { kind: "percent", value: Number(discountPercent) };
  if (discountAmount) patch.discount = { kind: "amount", value: Number(discountAmount) };
  const approvalRules: NonNullable<typeof patch.approvalRules> = {};
  if (/\b(?:require|needs?)\s+signature\b/i.test(text)) approvalRules.requireSignature = true;
  if (/\b(?:no|skip|remove|without)\s+signature\b/i.test(text)) approvalRules.requireSignature = false;
  if (/\b(?:require|needs?)\s+deposit\b/i.test(text)) approvalRules.requireDeposit = true;
  if (/\b(?:no|skip|remove|without)\s+deposit\b/i.test(text)) approvalRules.requireDeposit = false;
  if (/\b(?:require|needs?)\s+card(?:\s+on\s+file)?\b/i.test(text)) approvalRules.requireCardOnFile = true;
  if (/\b(?:no|skip|remove|without)\s+card(?:\s+on\s+file)?\b/i.test(text)) approvalRules.requireCardOnFile = false;
  const depositPercent = text.match(/\bdeposit\b.*?\b(\d{1,3}(?:\.\d+)?)\s*%\b/i)?.[1]
    ?? text.match(/\bdeposit\b.*?\b(\d{1,3}(?:\.\d+)?)\s+percent\b/i)?.[1];
  const depositAmount = text.match(/\bdeposit\b.*?\$\s*(\d+(?:\.\d{1,2})?)\b/i)?.[1];
  if (depositPercent) {
    approvalRules.requireDeposit = true;
    approvalRules.depositKind = "percent";
    approvalRules.depositValue = Number(depositPercent);
  }
  if (depositAmount) {
    approvalRules.requireDeposit = true;
    approvalRules.depositKind = "amount";
    approvalRules.depositValue = Number(depositAmount);
  }
  if (Object.keys(approvalRules).length) patch.approvalRules = approvalRules;
  return patch;
}

function hasQuotePatch(patch: ReturnType<typeof quoteChangePatch>): boolean {
  return Object.values(patch).some((value) => value !== undefined && value !== null);
}

function jobCreateChangePatch(text: string): { title?: string } {
  const title = text.match(/\b(?:title|job\s+title)\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim()
    ?? text.match(/\brename\s+(?:it|job)\s+to\s+([^.!?\n]+)/i)?.[1]?.trim();
  return title ? { title } : {};
}

function hasJobCreatePatch(patch: ReturnType<typeof jobCreateChangePatch>): boolean {
  return Object.values(patch).some((value) => value !== undefined && value !== null && String(value).trim().length > 0);
}

function jobActionChangePatch(text: string): { action?: "close" | "invoice" | "close_and_invoice" | "dismiss_invoice_reminder" } {
  if (/\bclose\s+and\s+invoice\b/i.test(text)) {
    return { action: "close_and_invoice" };
  }
  if (/\bdismiss\b.*\breminder\b/i.test(text) || /\barchive\b.*\bwithout\s+invoice\b/i.test(text)) {
    return { action: "dismiss_invoice_reminder" };
  }
  if (/\binvoice\b/i.test(text) && !/\bclose\b/i.test(text)) {
    return { action: "invoice" };
  }
  if (/\bclose\b/i.test(text) && !/\binvoice\b/i.test(text)) {
    return { action: "close" };
  }
  return {};
}

function shiftIso(value: string, deltaMs: number): string {
  return new Date(new Date(value).getTime() + deltaMs).toISOString();
}

function visitMomentLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}-${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function shiftDeltaFromText(text: string): number | undefined {
  let deltaMs = 0;
  let matched = false;
  for (const match of text.matchAll(/\b(?:back|later|forward)\s+(\d+)\s+days?\b/ig)) {
    deltaMs += Number(match[1]) * 24 * 60 * 60 * 1000;
    matched = true;
  }
  for (const match of text.matchAll(/\b(?:earlier|sooner)\s+(\d+)\s+days?\b/ig)) {
    deltaMs -= Number(match[1]) * 24 * 60 * 60 * 1000;
    matched = true;
  }
  for (const match of text.matchAll(/\b(?:back|later|forward)\s+(\d+)\s+hours?\b/ig)) {
    deltaMs += Number(match[1]) * 60 * 60 * 1000;
    matched = true;
  }
  for (const match of text.matchAll(/\b(?:earlier|sooner)\s+(\d+)\s+hours?\b/ig)) {
    deltaMs -= Number(match[1]) * 60 * 60 * 1000;
    matched = true;
  }
  return matched ? deltaMs : undefined;
}

function scheduleVisitSeriesPreviewBody(visits: Array<{ title?: string | undefined; start: string; end: string; assignedTo?: string[] | undefined; details?: string | undefined }>): string {
  return [
    `Visit count: ${visits.length}`,
    ...visits.map((visit, index) => `${index + 1}. ${visitMomentLabel(visit.start, visit.end)}${visit.title ? ` | ${visit.title}` : ""}${visit.assignedTo?.length ? ` | assigned: ${visit.assignedTo.join(", ")}` : ""}${visit.details ? ` | ${visit.details}` : ""}`)
  ].join("\n");
}

function shiftRemainingChoiceFromText(text: string, current: boolean | undefined): boolean {
  if (/\b(?:just this one|only this visit|do not shift remaining|don't shift remaining)\b/i.test(text)) {
    return false;
  }
  if (/\bshift(?:ing)? all remaining\b/i.test(text) || /\bmove all remaining\b/i.test(text)) {
    return true;
  }
  return current ?? true;
}

function normalizeLedgerText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesLedgerQuery(values: Array<string | undefined>, query: string): boolean {
  const normalizedQuery = normalizeLedgerText(query);
  if (!normalizedQuery) {
    return false;
  }
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .some((value) => {
      const normalizedValue = normalizeLedgerText(value);
      return normalizedValue === normalizedQuery || normalizedValue.includes(normalizedQuery);
    });
}

function refundAmountFromText(text: string): number | undefined {
  const raw = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1]
    ?? text.match(/\brefund\b.*?\bfor\b\s*(\d+(?:\.\d{1,2})?)/i)?.[1]
    ?? text.match(/\brefund\s+(\d+(?:\.\d{1,2})?)\b/i)?.[1]
    ?? text.match(/\bamount\s*(?:is|to|=|:)?\s*(\d+(?:\.\d{1,2})?)\b/i)?.[1];
  if (!raw) {
    return undefined;
  }
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function ledgerActionChangePatch(text: string): {
  action?: "refund_payment" | "void_invoice" | "mark_bad_debt";
  amount?: number;
  reason?: string;
} {
  const patch: { action?: "refund_payment" | "void_invoice" | "mark_bad_debt"; amount?: number; reason?: string } = {};
  if (/\brefund\b/i.test(text)) {
    patch.action = "refund_payment";
  }
  if (/\bvoid\b/i.test(text)) {
    patch.action = "void_invoice";
  }
  if (/\bbad debt\b/i.test(text) || /\bwrite\s+off\b/i.test(text)) {
    patch.action = "mark_bad_debt";
  }
  const amount = refundAmountFromText(text);
  if (amount !== undefined) {
    patch.amount = amount;
  }
  const reason = text.match(/\breason\s*(?:is|=|:)\s*(.+)$/i)?.[1]?.trim()
    ?? text.match(/\bbecause\s+(.+)$/i)?.[1]?.trim();
  if (reason) {
    patch.reason = reason;
  }
  return patch;
}

async function resolveQueuedPaymentId(
  ledgerService: Pick<LedgerService, "listPayments">,
  tenantId: string,
  input: { paymentId?: string | undefined; query?: string | undefined }
): Promise<string | undefined> {
  if (input.paymentId?.trim()) {
    return input.paymentId.trim();
  }
  if (!input.query?.trim()) {
    return undefined;
  }
  const payments = await ledgerService.listPayments(tenantId);
  return payments.find((payment) => matchesLedgerQuery([
    payment.id,
    payment.invoiceId,
    payment.quoteId,
    payment.provider,
    payment.cardSummary?.last4
  ], input.query ?? ""))?.id;
}

async function resolveQueuedInvoiceId(
  ledgerService: Pick<LedgerService, "listInvoices">,
  tenantId: string,
  input: { invoiceId?: string | undefined; query?: string | undefined }
): Promise<string | undefined> {
  if (input.invoiceId?.trim()) {
    return input.invoiceId.trim();
  }
  if (!input.query?.trim()) {
    return undefined;
  }
  const invoices = await ledgerService.listInvoices(tenantId);
  return invoices.find((invoice) => matchesLedgerQuery([
    invoice.id,
    invoice.number,
    invoice.title,
    invoice.jobId,
    invoice.quoteId
  ], input.query ?? ""))?.id;
}

function invoiceComposeChangePatch(text: string): {
  title?: string;
  discount?: { kind: "amount" | "percent"; value: number };
  taxRate?: number;
  terms?: string;
} {
  const title = text.match(/\b(?:title|invoice\s+title)\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim()
    ?? text.match(/\brename\s+(?:it|invoice)\s+to\s+([^.!?\n]+)/i)?.[1]?.trim();
  const discountPercent = text.match(/\bdiscount\b.*?\b(\d+(?:\.\d+)?)\s*%\b/i)?.[1];
  const discountAmount = text.match(/\bdiscount\b.*?\$\s*(\d+(?:\.\d{1,2})?)\b/i)?.[1];
  const taxRate = text.match(/\btax(?:\s+rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)\s*%?\b/i)?.[1];
  const terms = text.match(/\bterms?\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
  return {
    ...(title ? { title } : {}),
    ...(discountPercent ? { discount: { kind: "percent" as const, value: Number(discountPercent) } } : {}),
    ...(discountAmount ? { discount: { kind: "amount" as const, value: Number(discountAmount) } } : {}),
    ...(taxRate ? { taxRate: Number(taxRate) } : {}),
    ...(terms ? { terms } : {})
  };
}

function invoiceSendChangePatch(text: string): {
  mode?: "email" | "sms" | "mark_sent";
  target?: string;
  note?: string;
  subject?: string;
  includePdf?: boolean;
  includeSummary?: boolean;
  includePayLink?: boolean;
  includeHostedLink?: boolean;
} {
  const patch: {
    mode?: "email" | "sms" | "mark_sent";
    target?: string;
    note?: string;
    subject?: string;
    includePdf?: boolean;
    includeSummary?: boolean;
    includePayLink?: boolean;
    includeHostedLink?: boolean;
  } = {};
  const email = firstEmailAddress(text);
  const phone = firstPhoneNumber(text);
  if (/\bmark\s+sent\b/i.test(text)) patch.mode = "mark_sent";
  else if (/\b(?:text|sms)\b/i.test(text)) patch.mode = "sms";
  else if (/\bemail\b/i.test(text)) patch.mode = "email";
  if (patch.mode === "email" && email) patch.target = email;
  if (patch.mode === "sms" && phone) patch.target = phone;
  const subject = text.match(/\bsubject\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
  const note = text.match(/\bnote\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
  if (subject) patch.subject = subject;
  if (note) patch.note = note;
  if (/\binclude\b.*\bpdf\b/i.test(text)) patch.includePdf = true;
  if (/\b(?:no|without|skip|remove)\b.*\bpdf\b/i.test(text)) patch.includePdf = false;
  if (/\binclude\b.*\bsummary\b/i.test(text)) patch.includeSummary = true;
  if (/\b(?:no|without|skip|remove)\b.*\bsummary\b/i.test(text)) patch.includeSummary = false;
  if (/\binclude\b.*\bpay\s+link\b/i.test(text)) patch.includePayLink = true;
  if (/\b(?:no|without|skip|remove)\b.*\bpay\s+link\b/i.test(text)) patch.includePayLink = false;
  if (/\binclude\b.*\bhosted\s+link\b/i.test(text)) patch.includeHostedLink = true;
  if (/\b(?:no|without|skip|remove)\b.*\bhosted\s+link\b/i.test(text)) patch.includeHostedLink = false;
  return patch;
}

function collectPaymentChangePatch(text: string): {
  amount?: number;
  provider?: "stripe" | "paypal" | "manual" | "quote_bridge";
  method?: "card" | "ach" | "cash" | "check" | "bank_transfer" | "other" | "paypal" | "venmo";
  savedCardLast4?: string;
  note?: string;
  status?: "failed" | "succeeded";
  methodDetails?: {
    payerName?: string;
    checkNumber?: string;
    bankTransferReference?: string;
    otherReference?: string;
    failureMessage?: string;
  };
} {
  const amount = refundAmountFromText(text);
  const savedCardLast4 = text.match(/\b(?:card|saved\s+card|last\s*4)\D*(\d{4})\b/i)?.[1];
  const note = text.match(/\bnote\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
  const payerName = text.match(/\bpayer\s+name\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
  const checkNumber = text.match(/\bcheck\s*(?:number|#)\s*(?:is|to|=|:)?\s*([A-Za-z0-9-]+)/i)?.[1]?.trim();
  const bankTransferReference = text.match(/\b(?:bank\s+transfer|reference)\s*(?:number|#)?\s*(?:is|to|=|:)?\s*([A-Za-z0-9-]+)/i)?.[1]?.trim();
  const failureMessage = text.match(/\b(?:failed|declined|error|reason)\s*(?:is|to|=|:)?\s*([\s\S]+)$/i)?.[1]?.trim();
  const otherReference = text.match(/\bother\s+reference\s*(?:is|to|=|:)\s*([A-Za-z0-9-]+)/i)?.[1]?.trim();
  const provider = /\bvenmo\b/i.test(text) || /\bpaypal\b/i.test(text)
    ? "paypal"
    : /\bmanual\b/i.test(text) || /\bcash\b/i.test(text) || /\bcheck\b/i.test(text) || /\bbank\s+transfer\b/i.test(text)
      ? "manual"
      : /\bquote\s+bridge\b/i.test(text)
        ? "quote_bridge"
        : /\bstripe\b/i.test(text) || /\bcard\b/i.test(text) || /\bach\b/i.test(text)
          ? "stripe"
          : undefined;
  const method = /\bvenmo\b/i.test(text)
    ? "venmo"
    : /\bpaypal\b/i.test(text)
      ? "paypal"
      : /\bach\b/i.test(text)
        ? "ach"
        : /\bcash\b/i.test(text)
          ? "cash"
          : /\bcheck\b/i.test(text)
            ? "check"
            : /\bbank\s+transfer\b/i.test(text)
              ? "bank_transfer"
              : /\bother\b/i.test(text)
                ? "other"
                : /\bcard\b/i.test(text)
                  ? "card"
                  : undefined;
  const methodDetails = {
    ...(payerName ? { payerName } : {}),
    ...(checkNumber ? { checkNumber } : {}),
    ...(bankTransferReference ? { bankTransferReference } : {}),
    ...(otherReference ? { otherReference } : {}),
    ...(failureMessage && /\b(?:failed|declined|error)\b/i.test(text) ? { failureMessage } : {})
  };
  return {
    ...(amount !== undefined ? { amount } : {}),
    ...(provider ? { provider } : {}),
    ...(method ? { method } : {}),
    ...(savedCardLast4 ? { savedCardLast4 } : {}),
    ...(note ? { note } : {}),
    ...(/\b(?:fail|failed|declined)\b/i.test(text) ? { status: "failed" as const } : /\b(?:succeeded|success|charge it|run it|take it)\b/i.test(text) ? { status: "succeeded" as const } : {}),
    ...(Object.keys(methodDetails).length ? { methodDetails } : {})
  };
}

function receiptReviewChangePatch(text: string): {
  subject?: string;
  bodyText?: string;
  emailRecipients?: string[];
  smsRecipients?: string[];
  sendChannels?: Array<"email" | "sms">;
} {
  const subject = text.match(/\bsubject\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
  const bodyText = text.match(/\bbody\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
  const email = firstEmailAddress(text);
  const phone = firstPhoneNumber(text);
  const sendChannels = /\bemail\b/i.test(text) && /\b(?:text|sms)\b/i.test(text)
    ? ["email", "sms"] as Array<"email" | "sms">
    : /\b(?:text|sms)\b/i.test(text)
      ? ["sms"] as Array<"email" | "sms">
      : /\bemail\b/i.test(text)
        ? ["email"] as Array<"email" | "sms">
        : undefined;
  return {
    ...(subject ? { subject } : {}),
    ...(bodyText ? { bodyText } : {}),
    ...(email ? { emailRecipients: [email] } : {}),
    ...(phone ? { smsRecipients: [phone] } : {}),
    ...(sendChannels ? { sendChannels } : {})
  };
}

async function loadPendingApproval(approvalQueue: ApprovalQueueService, tenantId: string, approvalId: string) {
  const item = await approvalQueue.get(tenantId, approvalId);
  if (!item) {
    throw new RailError(`Approval item ${approvalId} was not found for this tenant.`, { provider: "approval", op: "get", status: 404 });
  }
  return item;
}

function approvalPublicBaseUrl(configured?: string): string {
  return configured?.trim().replace(/\/$/, "") || process.env.PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "") || "http://127.0.0.1:4175";
}

async function resolveInvoiceReviewId(
  ledgerService: Pick<LedgerService, "listReceiptReviews" | "listInvoices">,
  tenantId: string,
  input: { receiptReviewId?: string | undefined; invoiceId?: string | undefined; query?: string | undefined }
): Promise<string | undefined> {
  if (input.receiptReviewId?.trim()) {
    return input.receiptReviewId.trim();
  }
  let invoiceId = input.invoiceId?.trim();
  if (!invoiceId && input.query?.trim()) {
    invoiceId = await resolveQueuedInvoiceId(ledgerService, tenantId, { query: input.query });
  }
  if (!invoiceId) {
    return undefined;
  }
  const reviews = await ledgerService.listReceiptReviews(tenantId);
  return reviews
    .filter((review) => review.invoiceId === invoiceId)
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .at(0)?.id;
}

async function resolveInvoiceComposeJobs(
  jobLifecycleService: Pick<JobLifecycleService, "listJobs">,
  tenantId: string,
  input: z.infer<typeof queueInvoiceComposeApprovalSchema>
): Promise<string[]> {
  if (input.jobIds?.length) {
    return [...new Set(input.jobIds.map((jobId) => jobId.trim()).filter(Boolean))];
  }
  if (!input.query?.trim()) {
    return [];
  }
  const jobs = await jobLifecycleService.listJobs(tenantId);
  const filtered = jobs.filter((job) =>
    (job.status === "Requires Invoicing" || job.status === "Action Required")
    && matchesLedgerQuery([
      job.id,
      job.number,
      job.title,
      job.client?.name,
      job.client?.company
    ], input.query ?? "")
  );
  return filtered.map((job) => job.id);
}

export function createApprovalNexiTools(input: {
  approvalQueue: ApprovalQueueService;
  actorId: string;
  actorRole?: TenantUserRole | undefined;
  publicBaseUrl?: string | undefined;
  crmRepository?: NativeCrmRepository | undefined;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: Pick<LedgerService,
    "listInvoices"
    | "getInvoiceDetail"
    | "composeInvoiceFromJobs"
    | "sendInvoice"
    | "listPayments"
    | "listDeposits"
    | "listRefunds"
    | "listCredits"
    | "listReceiptReviews"
    | "getPaymentDetail"
    | "recordInvoicePayment"
    | "previewLedgerAction"
    | "performLedgerAction"
    | "sendReceiptReview"
  > | undefined;
}): NexiTool[] {
  return [
    {
      name: "listPayments",
      description: "List native ledger payments for the current tenant.",
      inputSchema: ledgerListInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger read tools are not wired for this tenant yet.", { provider: "native", op: "listPayments", status: 501 });
        }
        const parsed = ledgerListInputSchema.parse(args);
        const payments = await input.ledgerService.listPayments(tenant.id);
        const filtered = parsed.q.trim()
          ? payments.filter((payment) => matchesLedgerQuery([payment.id, payment.invoiceId, payment.quoteId, payment.provider, payment.cardSummary?.last4], parsed.q))
          : payments;
        return {
          result: { payments: filtered },
          sources: filtered.length
            ? filtered.map((payment) => source(payment.id, `Ledger payment ${payment.id}`))
            : [source("payments", "Native ledger payments")]
        };
      }
    },
    {
      name: "getPaymentDetail",
      description: "Read one native ledger payment in detail, including invoice link, refunds, receipt review, and saved card profile.",
      inputSchema: getPaymentDetailInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger read tools are not wired for this tenant yet.", { provider: "native", op: "getPaymentDetail", status: 501 });
        }
        const parsed = getPaymentDetailInputSchema.parse(args);
        const paymentId = parsed.paymentId?.trim()
          || (parsed.query?.trim()
            ? (await input.ledgerService.listPayments(tenant.id)).find((payment) => matchesLedgerQuery([payment.id, payment.invoiceId, payment.quoteId, payment.provider, payment.cardSummary?.last4], parsed.query ?? ""))?.id
            : undefined);
        if (!paymentId) {
          return {
            result: { payment: null, needsClarification: "Tell me which payment to open by id, invoice number, or card last four." },
            sources: []
          };
        }
        const detail = await input.ledgerService.getPaymentDetail(tenant.id, paymentId);
        return {
          result: detail,
          sources: [source(paymentId, `Ledger payment ${paymentId}`)]
        };
      }
    },
    {
      name: "listInvoices",
      description: "List native invoices for the current tenant, including draft, awaiting payment, partial, paid, void, and bad-debt states.",
      inputSchema: ledgerListInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Invoice read tools are not wired for this tenant yet.", { provider: "native", op: "listInvoices", status: 501 });
        }
        const parsed = ledgerListInputSchema.parse(args);
        const invoices = await input.ledgerService.listInvoices(tenant.id);
        const filtered = parsed.q.trim()
          ? invoices.filter((invoice) => matchesLedgerQuery([invoice.id, invoice.number, invoice.title, invoice.clientId, invoice.jobId, invoice.quoteId], parsed.q))
          : invoices;
        return {
          result: { invoices: filtered },
          sources: filtered.length
            ? filtered.map((invoice) => source(invoice.id, `Invoice ${invoice.number ?? invoice.id}`))
            : [source("invoices", "Native invoices")]
        };
      }
    },
    {
      name: "getInvoiceDetail",
      description: "Read one native invoice in detail, including balance due, payments, refunds, receipt review, and saved cards.",
      inputSchema: getInvoiceDetailInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Invoice detail tools are not wired for this tenant yet.", { provider: "native", op: "getInvoiceDetail", status: 501 });
        }
        const parsed = getInvoiceDetailInputSchema.parse(args);
        const invoiceId = await resolveQueuedInvoiceId(input.ledgerService, tenant.id, parsed);
        if (!invoiceId) {
          return {
            result: { invoice: null, needsClarification: "Tell me which invoice to open by invoice id, invoice number, or title." },
            sources: []
          };
        }
        const detail = await input.ledgerService.getInvoiceDetail(tenant.id, invoiceId);
        return {
          result: detail,
          sources: [source(invoiceId, `Invoice ${detail.invoice.number ?? detail.invoice.id}`)]
        };
      }
    },
    {
      name: "queueInvoiceCompose",
      description: "Read back a combined invoice draft from selected jobs, then park the real invoice creation behind approval.",
      inputSchema: queueInvoiceComposeApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.jobLifecycleService || !input.ledgerService) {
          throw new RailError("Combined invoice tools are not wired for this tenant yet.", { provider: "native", op: "queueInvoiceCompose", status: 501 });
        }
        const parsed = queueInvoiceComposeApprovalSchema.parse(args);
        const jobIds = await resolveInvoiceComposeJobs(input.jobLifecycleService, tenant.id, parsed);
        if (!jobIds.length) {
          return {
            result: {
              preview: null,
              needsClarification: "Tell me which jobs to combine by job id, or give me one client and I'll gather that client's jobs waiting on invoicing."
            },
            sources: []
          };
        }
        const allJobs = await input.jobLifecycleService.listJobs(tenant.id);
        const selectedJobs = jobIds
          .map((jobId) => allJobs.find((job) => job.id === jobId))
          .filter((job): job is NonNullable<typeof job> => Boolean(job));
        const clientIds = [...new Set(selectedJobs.map((job) => job.clientId))];
        if (clientIds.length !== 1) {
          return {
            result: {
              preview: null,
              needsClarification: "Combined invoices can only include jobs from one client at a time. Pick a single client's jobs and I'll restate the draft."
            },
            sources: []
          };
        }
        const subtotal = selectedJobs.reduce((sum, job) => sum + (job.totals?.subtotal ?? job.totals?.total ?? 0), 0);
        const discount = parsed.discountValue && parsed.discountValue > 0 && parsed.discountKind
          ? {
              kind: parsed.discountKind,
              value: parsed.discountValue
            }
          : undefined;
        const discountAmount = !discount
          ? 0
          : discount.kind === "percent"
            ? subtotal * (discount.value / 100)
            : discount.value;
        const taxable = Math.max(0, subtotal - Math.min(subtotal, discountAmount));
        const taxAmount = parsed.taxRate ? taxable * (parsed.taxRate / 100) : 0;
        const title = parsed.title?.trim() || (selectedJobs.length === 1 ? `Invoice - ${selectedJobs[0]?.title ?? "Job"}` : `Invoice - ${selectedJobs.length} jobs combined`);
        const preview = {
          title: `Combine invoice: ${title}`,
          body: [
            `Jobs selected: ${selectedJobs.length}`,
            ...selectedJobs.map((job) => `- ${job.number ?? job.id}: ${job.title} ($${(job.totals?.total ?? 0).toFixed(2)})`),
            discount ? `Discount: ${discount.kind === "percent" ? `${discount.value}%` : `$${discount.value.toFixed(2)}`}` : "",
            parsed.taxRate !== undefined ? `Tax rate: ${parsed.taxRate}%` : "",
            parsed.terms?.trim() ? `Terms: ${parsed.terms.trim()}` : "",
            `Draft total: $${(taxable + taxAmount).toFixed(2)}`,
            "The combined receipt will keep a per-job reference for every job covered by this invoice."
          ].filter(Boolean).join("\n")
        };
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "invoice",
          preview,
          execute: {
            service: "crm",
            op: "composeInvoiceFromJobs",
            args: {
              tenantId: tenant.id,
              jobIds,
              ...(parsed.title?.trim() ? { title: parsed.title.trim() } : {}),
              ...(discount ? { discount } : {}),
              ...(parsed.taxRate !== undefined ? { taxRate: parsed.taxRate } : {}),
              ...(parsed.terms?.trim() ? { terms: parsed.terms.trim() } : {})
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true
          },
          sources: [source(approval.id, `ApprovalQueue invoice compose ${approval.id}`)]
        };
      }
    },
    {
      name: "queueInvoiceSend",
      description: "Read back invoice delivery details in chat, then park the real send behind approval.",
      inputSchema: queueInvoiceSendApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Invoice send tools are not wired for this tenant yet.", { provider: "native", op: "queueInvoiceSend", status: 501 });
        }
        const parsed = queueInvoiceSendApprovalSchema.parse(args);
        const invoiceId = await resolveQueuedInvoiceId(input.ledgerService, tenant.id, parsed);
        if (!invoiceId) {
          return {
            result: { preview: null, needsClarification: "Tell me which invoice to send by invoice id, invoice number, or title." },
            sources: []
          };
        }
        const detail = await input.ledgerService.getInvoiceDetail(tenant.id, invoiceId);
        const defaults = detail.invoice.deliveryDefaults ?? {
          emailIncludePdf: true,
          emailIncludeSummary: true,
          emailIncludePayLink: true,
          smsIncludeSummary: true,
          smsIncludePayLink: true,
          smsIncludeHostedLink: true
        };
        const mode = parsed.mode;
        const target = parsed.target?.trim()
          || (mode === "sms" ? detail.client?.phones?.[0] : detail.client?.emails?.[0])
          || "";
        const preview = {
          title: `Send invoice: ${detail.invoice.number ?? detail.invoice.id}`,
          body: [
            `Invoice: ${detail.invoice.title}`,
            `Mode: ${mode === "mark_sent" ? "Mark sent only" : mode.toUpperCase()}`,
            target ? `Target: ${target}` : "Target: use the saved contact on file",
            `Balance due: $${(detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total).toFixed(2)}`,
            `Attach PDF: ${String(parsed.includePdf ?? defaults.emailIncludePdf)}`,
            `Include summary: ${String(parsed.includeSummary ?? (mode === "sms" ? defaults.smsIncludeSummary : defaults.emailIncludeSummary))}`,
            `Include pay link: ${String(parsed.includePayLink ?? (mode === "sms" ? defaults.smsIncludePayLink : defaults.emailIncludePayLink))}`,
            mode === "sms" ? `Include hosted link: ${String(parsed.includeHostedLink ?? defaults.smsIncludeHostedLink)}` : ""
          ].filter(Boolean).join("\n")
        };
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "invoice",
          preview,
          execute: {
            service: "crm",
            op: "sendInvoice",
            args: {
              tenantId: tenant.id,
              invoiceId,
              mode,
              ...(target ? { target } : {}),
              ...(parsed.note?.trim() ? { note: parsed.note.trim() } : {}),
              ...(parsed.subject?.trim() ? { subject: parsed.subject.trim() } : {}),
              ...(parsed.includePdf !== undefined ? { includePdf: parsed.includePdf } : {}),
              ...(parsed.includeSummary !== undefined ? { includeSummary: parsed.includeSummary } : {}),
              ...(parsed.includePayLink !== undefined ? { includePayLink: parsed.includePayLink } : {}),
              ...(parsed.includeHostedLink !== undefined ? { includeHostedLink: parsed.includeHostedLink } : {}),
              publicBaseUrl: approvalPublicBaseUrl(input.publicBaseUrl)
            }
          },
          createdBy: "nexi"
        });
        return {
          result: { approval, preview, writesAreApprovalQueuedOnly: true },
          sources: [source(approval.id, `ApprovalQueue invoice send ${approval.id}`)]
        };
      }
    },
    {
      name: "queueCollectPayment",
      description: "Read back an invoice payment collection action in chat, then park the real collection behind approval.",
      inputSchema: queueCollectPaymentApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Payment collection tools are not wired for this tenant yet.", { provider: "native", op: "queueCollectPayment", status: 501 });
        }
        const parsed = queueCollectPaymentApprovalSchema.parse(args);
        const invoiceId = await resolveQueuedInvoiceId(input.ledgerService, tenant.id, parsed);
        if (!invoiceId) {
          return {
            result: { preview: null, needsClarification: "Tell me which invoice to collect on by invoice id, invoice number, or title." },
            sources: []
          };
        }
        const detail = await input.ledgerService.getInvoiceDetail(tenant.id, invoiceId);
        const sortedCards = [...(detail.billingProfile?.savedCards ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const matchedCard = parsed.savedCardId
          ? sortedCards.find((card) => card.id === parsed.savedCardId)
          : parsed.savedCardLast4
            ? sortedCards.find((card) => card.last4 === parsed.savedCardLast4)
            : sortedCards[0];
        const provider = parsed.provider ?? (matchedCard ? "stripe" : "manual");
        const method = parsed.method ?? (matchedCard ? "card" : "cash");
        if ((provider === "paypal" || method === "paypal" || method === "venmo") && !matchedCard) {
          return {
            result: {
              preview: null,
              needsClarification: "Chat can charge a saved card or log a manual payment right now. Use the invoice workspace if you need the hosted PayPal or Venmo handoff."
            },
            sources: []
          };
        }
        const amount = parsed.amount ?? detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total;
        const methodDetails = {
          ...(parsed.payerName?.trim() ? { payerName: parsed.payerName.trim() } : {}),
          ...(parsed.checkNumber?.trim() ? { checkNumber: parsed.checkNumber.trim() } : {}),
          ...(parsed.bankTransferReference?.trim() ? { bankTransferReference: parsed.bankTransferReference.trim() } : {}),
          ...(parsed.otherReference?.trim() ? { otherReference: parsed.otherReference.trim() } : {}),
          ...(parsed.failureMessage?.trim() ? { failureMessage: parsed.failureMessage.trim() } : {})
        };
        const status = parsed.status ?? "succeeded";
        const preview = {
          title: `Collect payment: ${detail.invoice.number ?? detail.invoice.id}`,
          body: [
            `Invoice: ${detail.invoice.title}`,
            `Balance due now: $${(detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total).toFixed(2)}`,
            `Amount to collect: $${amount.toFixed(2)}`,
            `Provider: ${provider}`,
            `Method: ${method}`,
            matchedCard ? `Saved card: ${savedCardPreviewLabel(matchedCard)}` : "",
            status === "failed" ? "This logs a failed charge only. No money will be applied, and recovery options stay open." : "",
            status === "succeeded" && amount < (detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total) ? "This is a partial payment. The remaining balance can be sent right after collection." : ""
          ].filter(Boolean).join("\n")
        };
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "payment",
          preview,
          execute: {
            service: "crm",
            op: "recordInvoicePayment",
            args: {
              tenantId: tenant.id,
              invoiceId,
              amount,
              provider,
              method,
              ...(matchedCard ? { savedCardId: matchedCard.id } : {}),
              ...(parsed.note?.trim() ? { note: parsed.note.trim() } : {}),
              ...(Object.keys(methodDetails).length ? { methodDetails } : {}),
              status
            }
          },
          createdBy: "nexi"
        });
        return {
          result: { approval, preview, writesAreApprovalQueuedOnly: true },
          sources: [source(approval.id, `ApprovalQueue payment collection ${approval.id}`)]
        };
      }
    },
    {
      name: "queueReceiptReviewSend",
      description: "Read back a receipt-review send in chat, then park the real send behind approval.",
      inputSchema: queueReceiptReviewApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Receipt review tools are not wired for this tenant yet.", { provider: "native", op: "queueReceiptReviewSend", status: 501 });
        }
        const parsed = queueReceiptReviewApprovalSchema.parse(args);
        const receiptReviewId = await resolveInvoiceReviewId(input.ledgerService, tenant.id, parsed);
        if (!receiptReviewId) {
          return {
            result: { preview: null, needsClarification: "Tell me which receipt review to send by receipt id or invoice number." },
            sources: []
          };
        }
        const reviews = await input.ledgerService.listReceiptReviews(tenant.id);
        const review = reviews.find((candidate) => candidate.id === receiptReviewId);
        if (!review) {
          return {
            result: { preview: null, needsClarification: "I couldn't find that receipt review draft yet." },
            sources: []
          };
        }
        const channels = parsed.sendChannels?.length ? parsed.sendChannels : review.sendChannels;
        const emailRecipients = parsed.emailRecipients?.length ? parsed.emailRecipients : review.emailRecipients;
        const smsRecipients = parsed.smsRecipients?.length ? parsed.smsRecipients : review.smsRecipients;
        const attachmentIds = parsed.attachmentIds?.length ? parsed.attachmentIds : review.attachments.map((attachment) => attachment.id);
        const selectedAttachments = review.attachments.filter((attachment) => attachmentIds.includes(attachment.id));
        const preview = {
          title: `Send receipt review: ${receiptReviewId}`,
          body: [
            `Channels: ${channels.join(" + ")}`,
            emailRecipients.length ? `Email to: ${emailRecipients.join(", ")}` : "",
            smsRecipients.length ? `Text to: ${smsRecipients.join(", ")}` : "",
            `Subject: ${parsed.subject?.trim() || review.subject}`,
            `Attachments: ${selectedAttachments.map((attachment) => attachment.label).join(", ") || "None selected"}`,
            channels.includes("sms") ? "SMS sends the secure hosted link instead of file attachments." : ""
          ].filter(Boolean).join("\n")
        };
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "invoice",
          preview,
          execute: {
            service: "crm",
            op: "sendReceiptReview",
            args: {
              tenantId: tenant.id,
              receiptReviewId,
              publicBaseUrl: approvalPublicBaseUrl(input.publicBaseUrl),
              ...(parsed.subject?.trim() ? { subject: parsed.subject.trim() } : {}),
              ...(parsed.bodyText?.trim() ? { bodyText: parsed.bodyText.trim() } : {}),
              ...(parsed.emailRecipients?.length ? { emailRecipients: parsed.emailRecipients } : {}),
              ...(parsed.smsRecipients?.length ? { smsRecipients: parsed.smsRecipients } : {}),
              ...(parsed.sendChannels?.length ? { sendChannels: parsed.sendChannels } : {}),
              ...(parsed.attachmentIds?.length ? { attachmentIds: parsed.attachmentIds } : {})
            }
          },
          createdBy: "nexi"
        });
        return {
          result: { approval, preview, writesAreApprovalQueuedOnly: true },
          sources: [source(approval.id, `ApprovalQueue receipt review ${approval.id}`)]
        };
      }
    },
    {
      name: "listDeposits",
      description: "List native ledger deposits for the current tenant.",
      inputSchema: ledgerListInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger read tools are not wired for this tenant yet.", { provider: "native", op: "listDeposits", status: 501 });
        }
        const parsed = ledgerListInputSchema.parse(args);
        const deposits = await input.ledgerService.listDeposits(tenant.id);
        const filtered = parsed.q.trim()
          ? deposits.filter((deposit) => matchesLedgerQuery([deposit.id, deposit.paymentId, deposit.quoteId, deposit.invoiceId], parsed.q))
          : deposits;
        return {
          result: { deposits: filtered },
          sources: filtered.length
            ? filtered.map((deposit) => source(deposit.id, `Ledger deposit ${deposit.id}`))
            : [source("deposits", "Native ledger deposits")]
        };
      }
    },
    {
      name: "listRefunds",
      description: "List native ledger refunds for the current tenant.",
      inputSchema: ledgerListInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger read tools are not wired for this tenant yet.", { provider: "native", op: "listRefunds", status: 501 });
        }
        const parsed = ledgerListInputSchema.parse(args);
        const refunds = await input.ledgerService.listRefunds(tenant.id);
        const filtered = parsed.q.trim()
          ? refunds.filter((refund) => matchesLedgerQuery([refund.id, refund.paymentId, refund.invoiceId, refund.provider], parsed.q))
          : refunds;
        return {
          result: { refunds: filtered },
          sources: filtered.length
            ? filtered.map((refund) => source(refund.id, `Ledger refund ${refund.id}`))
            : [source("refunds", "Native ledger refunds")]
        };
      }
    },
    {
      name: "listCredits",
      description: "List native ledger credits for the current tenant.",
      inputSchema: ledgerListInputSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger read tools are not wired for this tenant yet.", { provider: "native", op: "listCredits", status: 501 });
        }
        const parsed = ledgerListInputSchema.parse(args);
        const credits = await input.ledgerService.listCredits(tenant.id);
        const filtered = parsed.q.trim()
          ? credits.filter((credit) => matchesLedgerQuery([credit.id, credit.paymentId, credit.depositId, credit.invoiceId, credit.source], parsed.q))
          : credits;
        return {
          result: { credits: filtered },
          sources: filtered.length
            ? filtered.map((credit) => source(credit.id, `Ledger credit ${credit.id}`))
            : [source("credits", "Native ledger credits")]
        };
      }
    },
    {
      name: "queueLedgerAction",
      description: "Read back a billing refund, void, or bad-debt action in chat, then park the real execution behind approval.",
      inputSchema: queueLedgerActionApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger actions are not wired for this tenant yet.", { provider: "native", op: "queueLedgerAction", status: 501 });
        }
        const parsed = queueLedgerActionApprovalSchema.parse(args);
        const paymentId = parsed.action === "refund_payment"
          ? await resolveQueuedPaymentId(input.ledgerService, tenant.id, parsed)
          : undefined;
        const invoiceId = parsed.action === "refund_payment"
          ? undefined
          : await resolveQueuedInvoiceId(input.ledgerService, tenant.id, parsed);
        if (parsed.action === "refund_payment" && !paymentId) {
          return {
            result: {
              preview: null,
              needsClarification: "Tell me which payment to refund by payment id, invoice number, or card last four."
            },
            sources: []
          };
        }
        if (parsed.action !== "refund_payment" && !invoiceId) {
          return {
            result: {
              preview: null,
              needsClarification: "Tell me which invoice to change by invoice id, invoice number, or title."
            },
            sources: []
          };
        }
        const preview = await input.ledgerService.previewLedgerAction({
          tenantId: tenant.id,
          action: parsed.action,
          ...(paymentId ? { paymentId } : {}),
          ...(invoiceId ? { invoiceId } : {}),
          ...(parsed.amount !== undefined ? { amount: parsed.amount } : {})
        });
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: parsed.action === "refund_payment" ? "payment" : "invoice",
          preview: {
            title: preview.title,
            body: preview.body
          },
          execute: {
            service: "crm",
            op: "performLedgerAction",
            args: {
              tenantId: tenant.id,
              action: parsed.action,
              ...(paymentId ? { paymentId } : {}),
              ...(invoiceId ? { invoiceId } : {}),
              ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
              ...(parsed.reason?.trim() ? { reason: parsed.reason.trim() } : {})
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true
          },
          sources: [source(approval.id, `ApprovalQueue ledger action ${approval.id}`)]
        };
      }
    },
    {
      name: "approvePendingApproval",
      description: "Approve and execute the referenced approval item directly from chat while preserving the queue audit trail.",
      inputSchema: approvalActionSchema,
      handler: async (tenant, args) => {
        const parsed = approvalActionSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        const approved = await input.approvalQueue.approve(tenant.id, item.id, input.actorId);
        const executed = await input.approvalQueue.executeApproved(tenant.id, item.id, input.actorId);
        return {
          result: {
            approval: approved,
            executedApproval: executed.item,
            execution: executed.result
          },
          sources: [source(item.id, `ApprovalQueue approval ${item.id}`)]
        };
      }
    },
    {
      name: "rejectPendingApproval",
      description: "Reject the referenced approval item directly from chat while preserving the queue audit trail.",
      inputSchema: approvalActionSchema,
      handler: async (tenant, args) => {
        const parsed = approvalActionSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        const rejected = await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        return {
          result: {
            approval: rejected
          },
          sources: [source(item.id, `ApprovalQueue rejection ${item.id}`)]
        };
      }
    },
    {
      name: "revisePendingClientCreateApproval",
      description: "Revise a queued create-client approval from chat, then restate the updated record for confirmation.",
      inputSchema: revisePendingClientCreateApprovalSchema,
      handler: async (tenant, args) => {
        const parsed = revisePendingClientCreateApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "createClient" || item.kind !== "client") {
          throw new RailError("That pending approval is not a client-create draft I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingClientCreateApproval",
            status: 409
          });
        }
        const approvalArgs = clientApprovalArgsSchema.parse(item.execute.args);
        const baseline: CreateClientInput = {
          name: approvalArgs.client.name,
          ...(approvalArgs.client.company ? { company: approvalArgs.client.company } : {}),
          ...(approvalArgs.client.personName ? { personName: approvalArgs.client.personName } : {}),
          ...(approvalArgs.client.displayNamePreference ? { displayNamePreference: approvalArgs.client.displayNamePreference } : {}),
          ...(approvalArgs.client.billingAddress ? { billingAddress: approvalArgs.client.billingAddress } : {}),
          ...(approvalArgs.client.billingSameAsPrimaryProperty !== undefined ? { billingSameAsPrimaryProperty: approvalArgs.client.billingSameAsPrimaryProperty } : {}),
          ...(approvalArgs.client.contacts ? { contacts: approvalArgs.client.contacts } : {}),
          ...(approvalArgs.client.communicationSettings ? { communicationSettings: approvalArgs.client.communicationSettings } : {}),
          ...(approvalArgs.addressNote ? { address: approvalArgs.addressNote } : {}),
          emails: approvalArgs.client.emails,
          phones: approvalArgs.client.phones,
          consent: approvalArgs.client.consent
        };
        const patch = await clientChangePatch(parsed.changeRequest, baseline);
        if (!hasPatch(patch)) {
          return {
            result: {
              needsClarification: "Tell me the changed name, address, phone, or email and I'll restate the client before I save anything.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue client create ${item.id}`)]
          };
        }
        const revised: CreateClientInput = {
          ...baseline,
          ...patch,
          emails: patch.emails ?? baseline.emails,
          phones: patch.phones ?? baseline.phones,
          consent: patch.consent ? {
            email: patch.consent.email ?? baseline.consent.email,
            sms: patch.consent.sms ?? baseline.consent.sms,
            marketing: patch.consent.marketing ?? baseline.consent.marketing
          } : baseline.consent
        };
        const missingFields = clientSaveMissingFields(revised);
        if (missingFields.length > 0) {
          return {
            result: {
              needsClarification: clientSaveClarification(missingFields),
              missingFields,
              saveBlocked: true,
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue client create ${item.id}`)]
          };
        }
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const queued = await queueClientCreateApproval(tenant, revised, input.approvalQueue);
        return {
          result: {
            ...queued,
            replacedApprovalId: item.id
          },
          sources: [source(queued.approval.id, `ApprovalQueue client create ${queued.approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingQuoteCreateApproval",
      description: "Revise a queued create-quote approval from chat, then restate the updated quote before anything is written.",
      inputSchema: revisePendingQuoteCreateApprovalSchema,
      handler: async (tenant, args) => {
        if (!input.crmRepository) {
          throw new RailError("Quote revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingQuoteCreateApproval", status: 501 });
        }
        const parsed = revisePendingQuoteCreateApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "createQuote" || item.kind !== "quote") {
          throw new RailError("That pending approval is not a quote-create draft I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingQuoteCreateApproval",
            status: 409
          });
        }
        const approvalArgs = quoteApprovalArgsSchema.parse(item.execute.args);
        const patch = quoteChangePatch(parsed.changeRequest);
        if (!hasQuotePatch(patch)) {
          return {
            result: {
              needsClarification: "Tell me the changed title, terms, expiry window, discount, or approval toggle and I'll restate the quote before I create it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue quote create ${item.id}`)]
          };
        }
        const baselineQuote = approvalArgs.quote;
        const revisedQuote = await materializeQuoteRecord(input.crmRepository, {
          tenantId: tenant.id,
          clientId: baselineQuote.clientId,
          ...(baselineQuote.requestId ? { requestId: baselineQuote.requestId } : {}),
          ...(baselineQuote.jobId ? { jobId: baselineQuote.jobId } : {}),
          ...(baselineQuote.templateId ? { templateId: baselineQuote.templateId } : {}),
          title: patch.title ?? baselineQuote.title,
          items: baselineQuote.lineItems.map((lineItem) => ({
            kind: lineItem.source === "custom" ? "custom" as const : "catalog" as const,
            ...(lineItem.catalogCode ? { catalogCode: lineItem.catalogCode } : {}),
            code: lineItem.code,
            name: lineItem.name,
            description: lineItem.description,
            quantity: lineItem.quantity,
            unitPrice: lineItem.unitPrice,
            clientSelectable: lineItem.clientSelectable,
            defaultSelected: lineItem.defaultSelected
          })),
          approvalRules: patch.approvalRules ? { ...baselineQuote.approvalRules, ...patch.approvalRules } : baselineQuote.approvalRules,
          discount: patch.discount ?? baselineQuote.discount,
          taxRate: baselineQuote.totals.taxRate,
          ...(patch.expiryDays !== undefined ? { expiryDays: patch.expiryDays } : baselineQuote.expiresAt ? { expiresAt: baselineQuote.expiresAt } : {}),
          terms: patch.terms ?? baselineQuote.terms,
          ...(baselineQuote.intake ? { intake: baselineQuote.intake } : {})
        }, {
          existingId: baselineQuote.id,
          existingNumber: baselineQuote.number,
          status: "draft",
          intake: baselineQuote.intake,
          version: baselineQuote.version
        });
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "quote",
          preview: {
            title: `Create quote: ${revisedQuote.title}`,
            body: quotePreviewBody(revisedQuote)
          },
          execute: {
            service: "crm",
            op: "createQuote",
            args: {
              tenantId: tenant.id,
              quote: jsonClone(revisedQuote)
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            pendingQuote: {
              ...revisedQuote,
              approvalId: approval.id,
              status: "pending_approval"
            },
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue quote create ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingJobCreateApproval",
      description: "Revise a queued create-job approval from chat, then restate the updated job before anything is written.",
      inputSchema: revisePendingJobCreateApprovalSchema,
      handler: async (tenant, args) => {
        const parsed = revisePendingJobCreateApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "createJob" || item.kind !== "job") {
          throw new RailError("That pending approval is not a job-create draft I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingJobCreateApproval",
            status: 409
          });
        }
        const approvalArgs = jobCreateApprovalArgsSchema.parse(item.execute.args);
        const patch = jobCreateChangePatch(parsed.changeRequest);
        if (!hasJobCreatePatch(patch)) {
          return {
            result: {
              needsClarification: "Tell me the changed job title and I'll restate the job before I create it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue job create ${item.id}`)]
          };
        }
        const revisedInput = {
          ...approvalArgs.input,
          ...(patch.title ? { title: patch.title } : {})
        };
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "job",
          preview: {
            title: `Create job: ${revisedInput.title}`,
            body: [
              `Title: ${revisedInput.title}`,
              `Client id: ${revisedInput.clientId}`,
              revisedInput.propertyId ? `Property id: ${revisedInput.propertyId}` : "Property: not attached yet",
              revisedInput.requestId ? `Request link: ${revisedInput.requestId}` : "",
              revisedInput.quoteId ? `Quote link: ${revisedInput.quoteId}` : "",
              revisedInput.lineItems?.length ? `Line items: ${revisedInput.lineItems.map((lineItem) => `${lineItem.name} x${lineItem.quantity}`).join("; ")}` : "Line items: none yet",
              "Lifecycle starts at Unscheduled until a visit is booked."
            ].filter(Boolean).join("\n")
          },
          execute: {
            service: "crm",
            op: "createJob",
            args: {
              tenantId: tenant.id,
              input: jsonClone(revisedInput)
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            pendingJob: {
              ...revisedInput,
              approvalId: approval.id,
              status: "pending_approval"
            },
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue job create ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingJobActionApproval",
      description: "Revise a queued job close/invoice approval from chat, then restate the updated action before it executes.",
      inputSchema: revisePendingJobActionApprovalSchema,
      handler: async (tenant, args) => {
        if (!input.jobLifecycleService) {
          throw new RailError("Job action revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingJobActionApproval", status: 501 });
        }
        const parsed = revisePendingJobActionApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "performJobAction" || item.kind !== "job") {
          throw new RailError("That pending approval is not a job action I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingJobActionApproval",
            status: 409
          });
        }
        const approvalArgs = jobActionApprovalArgsSchema.parse(item.execute.args);
        const patch = jobActionChangePatch(parsed.changeRequest);
        if (!patch.action) {
          return {
            result: {
              needsClarification: "Tell me whether to close, invoice, close and invoice, or dismiss the reminder, and I'll restate the action before I run it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue job action ${item.id}`)]
          };
        }
        const preview = await input.jobLifecycleService.prepareJobActionPreview(tenant.id, approvalArgs.jobId, patch.action);
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
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
              jobId: approvalArgs.jobId,
              action: patch.action
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue job action ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingJobVisitSeriesApproval",
      description: "Revise a queued visit-series draft from chat, then restate the updated schedule before anything is booked.",
      inputSchema: revisePendingJobVisitSeriesApprovalSchema,
      handler: async (tenant, args) => {
        const parsed = revisePendingJobVisitSeriesApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "scheduleJobVisitSeries" || item.kind !== "job") {
          throw new RailError("That pending approval is not a visit-series draft I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingJobVisitSeriesApproval",
            status: 409
          });
        }
        const approvalArgs = scheduleJobVisitSeriesApprovalArgsSchema.parse(item.execute.args);
        const deltaMs = shiftDeltaFromText(parsed.changeRequest);
        if (deltaMs === undefined) {
          return {
            result: {
              needsClarification: "Tell me how far to push the drafted visits, like back two days or forward three hours, and I'll restate the schedule before I book it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue visit series ${item.id}`)]
          };
        }
        const revisedVisits = approvalArgs.visits.map((visit) => ({
          ...visit,
          start: shiftIso(visit.start, deltaMs),
          end: shiftIso(visit.end, deltaMs)
        }));
        const jobTitle = item.preview.title.replace(/^Schedule job visits:\s*/i, "") || "Job";
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "job",
          preview: {
            title: `Schedule job visits: ${jobTitle}`,
            body: scheduleVisitSeriesPreviewBody(revisedVisits)
          },
          execute: {
            service: "crm",
            op: "scheduleJobVisitSeries",
            args: {
              tenantId: tenant.id,
              jobId: approvalArgs.jobId,
              visits: jsonClone(revisedVisits)
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            pendingVisits: revisedVisits,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue visit series ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingVisitShiftApproval",
      description: "Revise a queued visit shift from chat, then restate the updated move before it executes.",
      inputSchema: revisePendingVisitShiftApprovalSchema,
      handler: async (tenant, args) => {
        const parsed = revisePendingVisitShiftApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "moveJobVisitSeries" || item.kind !== "job") {
          throw new RailError("That pending approval is not a visit-shift draft I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingVisitShiftApproval",
            status: 409
          });
        }
        const approvalArgs = moveJobVisitSeriesApprovalArgsSchema.parse(item.execute.args);
        const deltaMs = shiftDeltaFromText(parsed.changeRequest);
        if (deltaMs === undefined && !/\b(?:just this one|only this visit|do not shift remaining|don't shift remaining|shift all remaining)\b/i.test(parsed.changeRequest)) {
          return {
            result: {
              needsClarification: "Tell me how far to move that visit, like back two days or forward four hours, and whether the remaining visits should move too.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue visit shift ${item.id}`)]
          };
        }
        const revisedStart = deltaMs === undefined ? approvalArgs.start : shiftIso(approvalArgs.start, deltaMs);
        const revisedEnd = deltaMs === undefined ? approvalArgs.end : shiftIso(approvalArgs.end, deltaMs);
        const shiftRemaining = shiftRemainingChoiceFromText(parsed.changeRequest, approvalArgs.shiftRemaining);
        const jobTitle = item.preview.title.replace(/^Shift job visit series:\s*/i, "") || "Job";
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "job",
          preview: {
            title: `Shift job visit series: ${jobTitle}`,
            body: [
              `New anchor window: ${visitMomentLabel(revisedStart, revisedEnd)}`,
              `Shift remaining visits: ${shiftRemaining ? "yes" : "no"}`
            ].join("\n")
          },
          execute: {
            service: "crm",
            op: "moveJobVisitSeries",
            args: {
              tenantId: tenant.id,
              visitId: approvalArgs.visitId,
              start: revisedStart,
              end: revisedEnd,
              shiftRemaining
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue visit shift ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingInvoiceComposeApproval",
      description: "Revise a queued combined-invoice draft from chat, then restate the updated draft before it executes.",
      inputSchema: revisePendingInvoiceComposeApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.jobLifecycleService) {
          throw new RailError("Invoice compose revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingInvoiceComposeApproval", status: 501 });
        }
        const parsed = revisePendingInvoiceComposeApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "composeInvoiceFromJobs" || item.kind !== "invoice") {
          throw new RailError("That pending approval is not a combined invoice draft I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingInvoiceComposeApproval",
            status: 409
          });
        }
        const approvalArgs = invoiceComposeApprovalArgsSchema.parse(item.execute.args);
        const patch = invoiceComposeChangePatch(parsed.changeRequest);
        if (!Object.keys(patch).length) {
          return {
            result: {
              needsClarification: "Tell me the changed title, discount, tax rate, or terms and I'll restate the combined invoice before I create it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue invoice compose ${item.id}`)]
          };
        }
        const nextArgs = {
          ...approvalArgs,
          ...(patch.title ? { title: patch.title } : {}),
          ...(patch.discount ? { discount: patch.discount } : {}),
          ...(patch.taxRate !== undefined ? { taxRate: patch.taxRate } : {}),
          ...(patch.terms ? { terms: patch.terms } : {})
        };
        const allJobs = await input.jobLifecycleService.listJobs(tenant.id);
        const selectedJobs = nextArgs.jobIds
          .map((jobId) => allJobs.find((job) => job.id === jobId))
          .filter((job): job is NonNullable<typeof job> => Boolean(job));
        const subtotal = selectedJobs.reduce((sum, job) => sum + (job.totals?.subtotal ?? job.totals?.total ?? 0), 0);
        const discountAmount = !nextArgs.discount
          ? 0
          : nextArgs.discount.kind === "percent"
            ? subtotal * (nextArgs.discount.value / 100)
            : nextArgs.discount.value;
        const taxable = Math.max(0, subtotal - Math.min(subtotal, discountAmount));
        const taxAmount = nextArgs.taxRate ? taxable * (nextArgs.taxRate / 100) : 0;
        const preview = {
          title: `Combine invoice: ${nextArgs.title?.trim() || (selectedJobs.length === 1 ? `Invoice - ${selectedJobs[0]?.title ?? "Job"}` : `Invoice - ${selectedJobs.length} jobs combined`)}`,
          body: [
            `Jobs selected: ${selectedJobs.length}`,
            ...selectedJobs.map((job) => `- ${job.number ?? job.id}: ${job.title} ($${(job.totals?.total ?? 0).toFixed(2)})`),
            nextArgs.discount ? `Discount: ${nextArgs.discount.kind === "percent" ? `${nextArgs.discount.value}%` : `$${nextArgs.discount.value.toFixed(2)}`}` : "",
            nextArgs.taxRate !== undefined ? `Tax rate: ${nextArgs.taxRate}%` : "",
            nextArgs.terms?.trim() ? `Terms: ${nextArgs.terms.trim()}` : "",
            `Draft total: $${(taxable + taxAmount).toFixed(2)}`
          ].filter(Boolean).join("\n")
        };
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "invoice",
          preview,
          execute: {
            service: "crm",
            op: "composeInvoiceFromJobs",
            args: nextArgs
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue invoice compose ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingInvoiceSendApproval",
      description: "Revise a queued invoice send from chat, then restate the updated delivery before it executes.",
      inputSchema: revisePendingInvoiceSendApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Invoice send revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingInvoiceSendApproval", status: 501 });
        }
        const parsed = revisePendingInvoiceSendApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "sendInvoice" || item.kind !== "invoice") {
          throw new RailError("That pending approval is not an invoice send I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingInvoiceSendApproval",
            status: 409
          });
        }
        const approvalArgs = invoiceSendApprovalArgsSchema.parse(item.execute.args);
        const patch = invoiceSendChangePatch(parsed.changeRequest);
        if (!Object.keys(patch).length) {
          return {
            result: {
              needsClarification: "Tell me the changed delivery mode, target, subject, note, or link settings and I'll restate the send before I run it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue invoice send ${item.id}`)]
          };
        }
        const nextArgs = { ...approvalArgs, ...patch };
        const detail = await input.ledgerService.getInvoiceDetail(tenant.id, approvalArgs.invoiceId);
        const preview = {
          title: `Send invoice: ${detail.invoice.number ?? detail.invoice.id}`,
          body: [
            `Invoice: ${detail.invoice.title}`,
            `Mode: ${nextArgs.mode === "mark_sent" ? "Mark sent only" : nextArgs.mode.toUpperCase()}`,
            nextArgs.target ? `Target: ${nextArgs.target}` : "",
            `Balance due: $${(detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total).toFixed(2)}`,
            `Attach PDF: ${String(nextArgs.includePdf ?? true)}`,
            `Include summary: ${String(nextArgs.includeSummary ?? true)}`,
            `Include pay link: ${String(nextArgs.includePayLink ?? true)}`,
            nextArgs.mode === "sms" ? `Include hosted link: ${String(nextArgs.includeHostedLink ?? true)}` : ""
          ].filter(Boolean).join("\n")
        };
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "invoice",
          preview,
          execute: {
            service: "crm",
            op: "sendInvoice",
            args: nextArgs
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue invoice send ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingCollectPaymentApproval",
      description: "Revise a queued payment collection in chat, then restate the updated charge before it executes.",
      inputSchema: revisePendingCollectPaymentApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Payment collection revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingCollectPaymentApproval", status: 501 });
        }
        const parsed = revisePendingCollectPaymentApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "recordInvoicePayment" || item.kind !== "payment") {
          throw new RailError("That pending approval is not a payment collection I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingCollectPaymentApproval",
            status: 409
          });
        }
        const approvalArgs = collectPaymentApprovalArgsSchema.parse(item.execute.args);
        const patch = collectPaymentChangePatch(parsed.changeRequest);
        if (!Object.keys(patch).length) {
          return {
            result: {
              needsClarification: "Tell me the changed amount, card, method, status, or payment note and I'll restate the collection before I run it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue payment collection ${item.id}`)]
          };
        }
        const detail = await input.ledgerService.getInvoiceDetail(tenant.id, approvalArgs.invoiceId);
        const sortedCards = [...(detail.billingProfile?.savedCards ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const matchedCard = patch.savedCardLast4
          ? sortedCards.find((card) => card.last4 === patch.savedCardLast4)
          : approvalArgs.savedCardId
            ? sortedCards.find((card) => card.id === approvalArgs.savedCardId)
            : sortedCards[0];
        const nextArgs = {
          ...approvalArgs,
          ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
          ...(patch.provider ? { provider: patch.provider } : {}),
          ...(patch.method ? { method: patch.method } : {}),
          ...(patch.note ? { note: patch.note } : {}),
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.methodDetails ? {
            methodDetails: {
              ...(approvalArgs.methodDetails ?? {}),
              ...patch.methodDetails
            }
          } : {}),
          ...(matchedCard ? { savedCardId: matchedCard.id } : {})
        };
        const preview = {
          title: `Collect payment: ${detail.invoice.number ?? detail.invoice.id}`,
          body: [
            `Invoice: ${detail.invoice.title}`,
            `Balance due now: $${(detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total).toFixed(2)}`,
            `Amount to collect: $${nextArgs.amount.toFixed(2)}`,
            `Provider: ${nextArgs.provider}`,
            `Method: ${nextArgs.method}`,
            matchedCard ? `Saved card: ${savedCardPreviewLabel(matchedCard)}` : "",
            nextArgs.status === "failed" ? "This logs a failed charge only. No money will be applied." : ""
          ].filter(Boolean).join("\n")
        };
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "payment",
          preview,
          execute: {
            service: "crm",
            op: "recordInvoicePayment",
            args: nextArgs
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue payment collection ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingReceiptReviewApproval",
      description: "Revise a queued receipt review send from chat, then restate the updated send before it executes.",
      inputSchema: revisePendingReceiptReviewApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Receipt review revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingReceiptReviewApproval", status: 501 });
        }
        const parsed = revisePendingReceiptReviewApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "sendReceiptReview" || item.kind !== "invoice") {
          throw new RailError("That pending approval is not a receipt review send I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingReceiptReviewApproval",
            status: 409
          });
        }
        const approvalArgs = receiptReviewApprovalArgsSchema.parse(item.execute.args);
        const patch = receiptReviewChangePatch(parsed.changeRequest);
        if (!Object.keys(patch).length) {
          return {
            result: {
              needsClarification: "Tell me the changed subject, body, recipients, or channels and I'll restate the receipt before I send it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue receipt review ${item.id}`)]
          };
        }
        const review = (await input.ledgerService.listReceiptReviews(tenant.id)).find((candidate) => candidate.id === approvalArgs.receiptReviewId);
        if (!review) {
          throw new RailError("That receipt review no longer exists.", { provider: "approval", op: "revisePendingReceiptReviewApproval", status: 404 });
        }
        const nextArgs = {
          ...approvalArgs,
          ...(patch.subject ? { subject: patch.subject } : {}),
          ...(patch.bodyText ? { bodyText: patch.bodyText } : {}),
          ...(patch.emailRecipients ? { emailRecipients: patch.emailRecipients } : {}),
          ...(patch.smsRecipients ? { smsRecipients: patch.smsRecipients } : {}),
          ...(patch.sendChannels ? { sendChannels: patch.sendChannels } : {})
        };
        const preview = {
          title: `Send receipt review: ${approvalArgs.receiptReviewId}`,
          body: [
            `Channels: ${(nextArgs.sendChannels ?? review.sendChannels).join(" + ")}`,
            (nextArgs.emailRecipients ?? review.emailRecipients).length ? `Email to: ${(nextArgs.emailRecipients ?? review.emailRecipients).join(", ")}` : "",
            (nextArgs.smsRecipients ?? review.smsRecipients).length ? `Text to: ${(nextArgs.smsRecipients ?? review.smsRecipients).join(", ")}` : "",
            `Subject: ${nextArgs.subject ?? review.subject}`,
            `Attachments: ${review.attachments.filter((attachment) => (nextArgs.attachmentIds ?? review.attachments.map((candidate) => candidate.id)).includes(attachment.id)).map((attachment) => attachment.label).join(", ")}`
          ].filter(Boolean).join("\n")
        };
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: "invoice",
          preview,
          execute: {
            service: "crm",
            op: "sendReceiptReview",
            args: nextArgs
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue receipt review ${approval.id}`)]
        };
      }
    },
    {
      name: "revisePendingLedgerActionApproval",
      description: "Revise a queued refund, void, or bad-debt action from chat, then restate the updated billing action before it executes.",
      inputSchema: revisePendingLedgerActionApprovalSchema,
      handler: async (tenant, args) => {
        ensureBillingRole(input.actorRole);
        if (!input.ledgerService) {
          throw new RailError("Ledger action revision is not wired for this tenant yet.", { provider: "approval", op: "revisePendingLedgerActionApproval", status: 501 });
        }
        const parsed = revisePendingLedgerActionApprovalSchema.parse(args);
        const item = await loadPendingApproval(input.approvalQueue, tenant.id, parsed.approvalId);
        if (item.execute.service !== "crm" || item.execute.op !== "performLedgerAction" || !["payment", "invoice"].includes(item.kind)) {
          throw new RailError("That pending approval is not a billing action I can revise in chat yet.", {
            provider: "approval",
            op: "revisePendingLedgerActionApproval",
            status: 409
          });
        }
        const approvalArgs = ledgerActionApprovalArgsSchema.parse(item.execute.args);
        const patch = ledgerActionChangePatch(parsed.changeRequest);
        if (!patch.action && patch.amount === undefined && !patch.reason) {
          return {
            result: {
              needsClarification: "Tell me whether to refund, void, or mark bad debt, plus any refund amount or reason, and I'll restate it before I run it.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue ledger action ${item.id}`)]
          };
        }
        let nextAction = patch.action ?? approvalArgs.action;
        let paymentId = approvalArgs.paymentId;
        let invoiceId = approvalArgs.invoiceId;
        if (nextAction === "refund_payment") {
          if (!paymentId && invoiceId) {
            paymentId = (await input.ledgerService.listPayments(tenant.id))
              .find((payment) => payment.invoiceId === invoiceId && payment.status !== "failed")?.id;
          }
          invoiceId = undefined;
        } else {
          if (!invoiceId && paymentId) {
            invoiceId = (await input.ledgerService.getPaymentDetail(tenant.id, paymentId)).invoice?.id;
          }
          paymentId = undefined;
        }
        if (nextAction === "refund_payment" && !paymentId) {
          return {
            result: {
              needsClarification: "I still need a payment to refund. Tell me the payment id, invoice number, or card last four.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue ledger action ${item.id}`)]
          };
        }
        if (nextAction !== "refund_payment" && !invoiceId) {
          return {
            result: {
              needsClarification: "I still need an invoice to change. Tell me the invoice id or invoice number.",
              approval: item
            },
            sources: [source(item.id, `ApprovalQueue ledger action ${item.id}`)]
          };
        }
        const preview = await input.ledgerService.previewLedgerAction({
          tenantId: tenant.id,
          action: nextAction,
          ...(paymentId ? { paymentId } : {}),
          ...(invoiceId ? { invoiceId } : {}),
          ...(nextAction === "refund_payment" && (patch.amount ?? approvalArgs.amount) !== undefined ? { amount: patch.amount ?? approvalArgs.amount } : {})
        });
        await input.approvalQueue.reject(tenant.id, item.id, input.actorId);
        const approval = await input.approvalQueue.create({
          tenantId: tenant.id,
          kind: nextAction === "refund_payment" ? "payment" : "invoice",
          preview: {
            title: preview.title,
            body: preview.body
          },
          execute: {
            service: "crm",
            op: "performLedgerAction",
            args: {
              tenantId: tenant.id,
              action: nextAction,
              ...(paymentId ? { paymentId } : {}),
              ...(invoiceId ? { invoiceId } : {}),
              ...(nextAction === "refund_payment" && (patch.amount ?? approvalArgs.amount) !== undefined ? { amount: patch.amount ?? approvalArgs.amount } : {}),
              ...((patch.reason ?? approvalArgs.reason)?.trim() ? { reason: (patch.reason ?? approvalArgs.reason)?.trim() } : {})
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            approval,
            preview,
            writesAreApprovalQueuedOnly: true,
            replacedApprovalId: item.id
          },
          sources: [source(approval.id, `ApprovalQueue ledger action ${approval.id}`)]
        };
      }
    }
  ];
}
