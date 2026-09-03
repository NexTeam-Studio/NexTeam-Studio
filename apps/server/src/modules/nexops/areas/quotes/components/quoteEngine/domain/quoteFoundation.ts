import { createHash, randomBytes, randomUUID } from "node:crypto";
import { RailError, catalogSelectionSnapshot, quoteApprovalRulesSchema, quoteDiscountSchema, paymentSchedulePlanSchema, quoteSchema, type CrmSettings, type IntakeSnapshot, type LineItem, type Quote, type QuoteApprovalRules, type QuoteDepositBridge, type QuoteDiscount, type QuoteStatus, type QuoteTemplate, type QuoteTotals } from "@nexteam/core";
import { z } from "zod";
import type { NativeCrmRepository } from "@nexteam/providers";
import { reserveDocumentNumber } from "../../../../../../../shared/numbering/numberingService.js";
import { ensureQuoteConfiguration } from "../../quoteTemplates/server/quoteTemplateService.js";

export { ensureQuoteConfiguration, quoteTemplateInputSchema } from "../../quoteTemplates/server/quoteTemplateService.js";

const EMPTY_LINE_ITEMS: LineItem[] = [];

export const quoteLineItemInputSchema = z.object({
  kind: z.enum(["catalog", "custom"]).default("catalog"),
  catalogItemId: z.string().min(1).optional(),
  catalogCode: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0).optional(),
  taxable: z.boolean().optional(),
  clientSelectable: z.boolean().optional(),
  defaultSelected: z.boolean().optional()
}).superRefine((value, ctx) => {
  if (value.kind === "catalog" && !value.catalogItemId && !value.catalogCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Catalog line items require a catalogItemId.", path: ["catalogItemId"] });
  }
  if (value.kind === "custom") {
    if (!value.name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Custom line items require a name.", path: ["name"] });
    }
    if (value.unitPrice === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Custom line items require a unitPrice.", path: ["unitPrice"] });
    }
  }
});

export const quoteDeliverySelectionSchema = z.object({
  mode: z.enum(["draft", "email", "sms", "mark_sent"]).default("draft"),
  target: z.string().optional(),
  note: z.string().optional()
});

export const quoteComposerInputSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  salespersonUserId: z.string().min(1).optional(),
  title: z.string().min(1),
  items: z.array(quoteLineItemInputSchema).default([]),
  approvalRules: quoteApprovalRulesSchema.partial().optional(),
  discount: quoteDiscountSchema.optional(),
  taxRate: z.number().min(0).optional(),
  expiresAt: z.string().min(1).optional(),
  expiryDays: z.number().int().min(1).optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  delivery: quoteDeliverySelectionSchema.optional(),
  intake: z.custom<IntakeSnapshot>().optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

export const quoteCreateApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  quote: quoteSchema
});

export const portalQuoteApprovalInputSchema = z.object({
  tenantId: z.string().min(1),
  token: z.string().min(1),
  customerName: z.string().min(1),
  signatureMode: z.enum(["drawn", "typed"]).optional(),
  typedName: z.string().optional(),
  drawnDataUrl: z.string().optional(),
  deposit: z.object({
    cardholderName: z.string().min(1).optional(),
    cardBrand: z.string().optional(),
    cardLast4: z.string().regex(/^\d{4}$/).optional(),
    cardOnFileAuthorized: z.boolean().optional()
  }).optional()
});

export const portalQuoteChangeRequestInputSchema = z.object({
  tenantId: z.string().min(1),
  token: z.string().min(1),
  customerName: z.string().optional(),
  note: z.string().optional(),
  lineComments: z.array(z.object({
    lineItemId: z.string().min(1),
    comment: z.string().min(1)
  })).default([])
});

export const quoteRenewInputSchema = z.object({
  tenantId: z.string().min(1),
  expiryDays: z.number().int().min(1).optional(),
  expiresAt: z.string().optional()
});

type QuoteComposerInput = z.infer<typeof quoteComposerInputSchema>;

function now(): string {
  return new Date().toISOString();
}

function addDays(baseIso: string, days: number): string {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function catalogItemFromSettings(settings: CrmSettings, catalogItemId?: string, catalogCode?: string) {
  const id = catalogItemId?.trim();
  const normalizedCode = catalogCode?.trim().toLowerCase();
  const tenantItem = settings.catalogItems.find((item) =>
    item.tenantId === settings.tenantId
    && (id ? item.id === id : Boolean(normalizedCode) && item.code.trim().toLowerCase() === normalizedCode)
  );
  return tenantItem ?? null;
}

function buildLineItem(settings: CrmSettings, input: z.infer<typeof quoteLineItemInputSchema>, index: number): LineItem {
  if (input.kind === "catalog") {
    const catalogItem = catalogItemFromSettings(settings, input.catalogItemId, input.catalogCode);
    if (!catalogItem) {
      throw new RailError(`Tenant catalog item ${input.catalogItemId ?? input.catalogCode ?? "unknown"} was not found.`, { provider: "native", op: "buildQuoteLineItem", status: 400 });
    }
    return catalogSelectionSnapshot({
      id: input.code ? `line_${input.code.toLowerCase()}_${index + 1}` : `line_${catalogItem.code.toLowerCase()}_${index + 1}`,
      code: catalogItem.code,
      name: catalogItem.name,
      description: input.description ?? catalogItem.description,
      price: catalogItem.price,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      taxable: input.taxable ?? catalogItem.taxable ?? false,
      clientSelectable: input.clientSelectable,
      defaultSelected: input.defaultSelected
    });
  }
  const code = input.code?.trim() || `CUSTOM-${index + 1}`;
  const unitPrice = roundMoney(input.unitPrice ?? 0);
  return {
    id: `line_${code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
    code,
    name: input.name ?? "Custom line item",
    description: input.description,
    quantity: input.quantity,
    unitPrice,
    total: roundMoney(input.quantity * unitPrice),
    taxable: input.taxable ?? false,
    source: "custom",
    clientSelectable: input.clientSelectable,
    defaultSelected: input.defaultSelected
  };
}

function buildLineItems(settings: CrmSettings, inputs: z.infer<typeof quoteLineItemInputSchema>[]): LineItem[] {
  return inputs.map((input, index) => buildLineItem(settings, input, index));
}

function discountAmount(subtotal: number, discount?: QuoteDiscount | undefined): number {
  if (!discount) {
    return 0;
  }
  if (discount.kind === "percent") {
    return roundMoney(subtotal * (discount.value / 100));
  }
  return roundMoney(discount.value);
}

export function calculateQuoteTotals(lineItems: LineItem[], discount?: QuoteDiscount | undefined, taxRate = 0): QuoteTotals {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0));
  const discountValue = Math.min(subtotal, discountAmount(subtotal, discount));
  const taxableSubtotal = roundMoney(lineItems.filter((item) => item.taxable === true).reduce((sum, item) => sum + item.total, 0));
  const taxableDiscount = subtotal > 0 ? roundMoney(discountValue * (taxableSubtotal / subtotal)) : 0;
  const taxable = Math.max(0, taxableSubtotal - taxableDiscount);
  const tax = roundMoney(taxable * (taxRate / 100));
  return {
    subtotal,
    ...(discountValue > 0 ? { discount: discountValue } : {}),
    tax,
    total: roundMoney(subtotal - discountValue + tax),
    ...(taxRate > 0 ? { taxRate } : {})
  };
}

function mergedApprovalRules(base: QuoteApprovalRules, override?: {
  requireSignature?: boolean | undefined;
  requireDeposit?: boolean | undefined;
  requireCardOnFile?: boolean | undefined;
  depositKind?: QuoteApprovalRules["depositKind"] | undefined;
  depositValue?: number | undefined;
} | undefined): QuoteApprovalRules {
  const sanitized = override ? {
    ...(override.requireSignature !== undefined ? { requireSignature: override.requireSignature } : {}),
    ...(override.requireDeposit !== undefined ? { requireDeposit: override.requireDeposit } : {}),
    ...(override.requireCardOnFile !== undefined ? { requireCardOnFile: override.requireCardOnFile } : {}),
    ...(override.depositKind !== undefined ? { depositKind: override.depositKind } : {}),
    ...(override.depositValue !== undefined ? { depositValue: override.depositValue } : {})
  } : {};
  return {
    ...base,
    ...sanitized
  };
}

function quoteDepositFromRules(totals: QuoteTotals, rules: QuoteApprovalRules): QuoteDepositBridge | undefined {
  if (!rules.requireDeposit) {
    return undefined;
  }
  const kind = rules.depositKind ?? "percent";
  const rawAmount = kind === "percent"
    ? totals.total * ((rules.depositValue ?? 0) / 100)
    : (rules.depositValue ?? 0);
  return {
    required: true,
    kind,
    amount: roundMoney(rawAmount)
  };
}

function selectedTemplate(templates: QuoteTemplate[], templateId?: string | undefined): QuoteTemplate | undefined {
  if (!templateId) {
    return undefined;
  }
  return templates.find((template) => template.id === templateId);
}

function quoteTerms(settings: CrmSettings, template: QuoteTemplate | undefined, override?: string | undefined): string {
  return override ?? template?.terms ?? settings.quoteDefaults.terms;
}

function quotePaymentSchedule(template: QuoteTemplate | undefined, override?: QuoteComposerInput["paymentSchedule"] | undefined) {
  return override ?? template?.defaultPaymentSchedule;
}

function quoteExpiry(settings: CrmSettings, template: QuoteTemplate | undefined, input: QuoteComposerInput, timestamp: string): string {
  if (input.expiresAt) {
    return input.expiresAt;
  }
  const days = input.expiryDays ?? template?.expiryDays ?? settings.quoteDefaults.expiryDays;
  return addDays(timestamp, days);
}

function intakeString(input: IntakeSnapshot | undefined, key: string): string | undefined {
  const value = input?.fieldIndex?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function materializeQuoteRecord(
  repository: Pick<NativeCrmRepository, "getCrmSettings" | "saveCrmSettings" | "listQuoteTemplates" | "upsertQuoteTemplate" | "reserveDocumentNumber">,
  input: QuoteComposerInput,
  options: {
    existingId?: string | undefined;
    existingNumber?: string | undefined;
    status?: QuoteStatus | undefined;
    intake?: IntakeSnapshot | undefined;
    version?: number | undefined;
  } = {}
): Promise<Quote> {
  const timestamp = now();
  const { settings, templates } = await ensureQuoteConfiguration(repository, input.tenantId);
  const template = selectedTemplate(templates, input.templateId);
  const defaultLineItems = template?.defaultLineItems ?? EMPTY_LINE_ITEMS;
  const lineItems = buildLineItems(settings, input.items.length ? input.items : defaultLineItems.map((item) => {
    return {
      // Template lines are document defaults, never live catalog references.
      kind: "custom" as const,
      code: item.code,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxable: item.taxable,
      clientSelectable: item.clientSelectable,
      defaultSelected: item.defaultSelected
    };
  }));
  const approvalRules = mergedApprovalRules(template?.defaultApprovalRules ?? settings.quoteDefaults.approvalRules, input.approvalRules);
  const totals = calculateQuoteTotals(lineItems, input.discount, input.taxRate ?? 0);
  const number = options.existingNumber ?? await reserveDocumentNumber(repository, input.tenantId, "quote");
  const salespersonUserId = input.salespersonUserId ?? intakeString(options.intake ?? input.intake, "salesperson_user_id");
  const quote: Quote = {
    id: options.existingId ?? `quote_${randomUUID()}`,
    tenantId: input.tenantId,
    number,
    clientId: input.clientId,
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.templateId ? { templateId: input.templateId } : template?.id ? { templateId: template.id } : {}),
    ...(salespersonUserId ? { salespersonUserId } : {}),
    version: options.version ?? 1,
    status: options.status ?? "draft",
    title: input.title.trim(),
    lineItems,
    totals,
    approvalRules,
    ...(input.discount ? { discount: input.discount } : {}),
    expiresAt: quoteExpiry(settings, template, input, timestamp),
    ...(quoteDepositFromRules(totals, approvalRules) ? { deposit: quoteDepositFromRules(totals, approvalRules) } : {}),
    ...(quotePaymentSchedule(template, input.paymentSchedule) ? { paymentSchedule: quotePaymentSchedule(template, input.paymentSchedule) } : {}),
    terms: quoteTerms(settings, template, input.terms),
    portal: {},
    delivery: [],
    changeRequests: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(options.intake ?? input.intake ? { intake: options.intake ?? input.intake } : {}),
    ...(input.customFields ? { customFields: input.customFields } : {})
  };
  return quoteSchema.parse(quote) as Quote;
}

export function quotePreviewBody(quote: Quote): string {
  const lines = quote.lineItems.map((item) => `${item.code} ${item.name} x${item.quantity}: $${item.total.toFixed(2)}`);
  const ruleBits = [
    quote.approvalRules.requireSignature ? "signature required" : "signature optional",
    quote.approvalRules.requireDeposit ? `deposit required (${quote.deposit?.kind === "percent" ? `${quote.approvalRules.depositValue ?? 0}%` : `$${(quote.deposit?.amount ?? 0).toFixed(2)}`})` : "no deposit required",
    quote.approvalRules.requireCardOnFile ? "card on file required" : "card on file optional"
  ];
  return [
    quote.number ? `Quote #: ${quote.number}` : "",
    `Title: ${quote.title}`,
    ...lines,
    quote.discount ? `Discount: ${quote.discount.kind === "percent" ? `${quote.discount.value}%` : `$${quote.discount.value.toFixed(2)}`}` : "",
    quote.totals.taxRate ? `Tax rate: ${quote.totals.taxRate}%` : "",
    `Total: $${quote.totals.total.toFixed(2)}`,
    quote.expiresAt ? `Expires: ${quote.expiresAt}` : "",
    `Approval rules: ${ruleBits.join(", ")}`
  ].filter(Boolean).join("\n");
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createPortalToken(): string {
  return randomBytes(18).toString("hex");
}

export function portalUrlForQuote(quote: Quote, token: string): string {
  return `/portal/quotes/${encodeURIComponent(quote.id)}?tenantId=${encodeURIComponent(quote.tenantId)}&token=${encodeURIComponent(token)}`;
}

export function quoteLocked(quote: Quote): boolean {
  return quote.status === "approved" || quote.status === "approved_internal" || quote.status === "archived";
}

export function quoteApprovalBlockedReason(quote: Quote, timestamp = now()): string | null {
  if (quote.status === "archived") {
    return "Archived quotes cannot be approved.";
  }
  if (quote.status === "expired") {
    return "Expired quotes cannot be approved until they are renewed.";
  }
  if (quote.expiresAt && new Date(quote.expiresAt).getTime() < new Date(timestamp).getTime()) {
    return "Expired quotes cannot be approved until they are renewed.";
  }
  if (quote.status === "approved" || quote.status === "approved_internal") {
    return "Approved quotes are locked.";
  }
  if (quote.status === "declined") {
    return "Declined quotes cannot be approved.";
  }
  return null;
}

export function derivedQuoteStatus(quote: Quote, timestamp = now()): QuoteStatus {
  if (
    quote.expiresAt
    && ["sent", "change_requested", "pending_approval"].includes(quote.status)
    && new Date(quote.expiresAt).getTime() < new Date(timestamp).getTime()
  ) {
    return "expired";
  }
  return quote.status;
}

export async function syncExpiredQuote(
  repository: Pick<NativeCrmRepository, "updateQuote">,
  quote: Quote,
  timestamp = now()
): Promise<Quote> {
  const status = derivedQuoteStatus(quote, timestamp);
  if (status === quote.status) {
    return quote;
  }
  return repository.updateQuote(quote.id, { tenantId: quote.tenantId, status, updatedAt: timestamp });
}

export function archiveQuoteVersion(quote: Quote, reason: "renewed" | "edited_before_send", timestamp = now()) {
  return [
    ...(quote.versions ?? []),
    {
      version: quote.version ?? 1,
      archivedAt: timestamp,
      reason,
      title: quote.title,
      lineItems: quote.lineItems,
      totals: quote.totals,
      status: quote.status,
      ...(quote.expiresAt ? { expiresAt: quote.expiresAt } : {}),
      ...(quote.terms ? { terms: quote.terms } : {}),
      ...(quote.discount ? { discount: quote.discount } : {}),
      approvalRules: quote.approvalRules
    }
  ];
}

export function quoteDeliveryMessage(quote: Quote, mode: "email" | "sms", portalUrl: string): { subject: string; bodyText: string } {
  const number = quote.number ? ` ${quote.number}` : "";
  const summary = `Quote${number}: ${quote.title}`;
  if (mode === "sms") {
    return {
      subject: summary,
      bodyText: `${summary}\nReview and approve here: ${portalUrl}`
    };
  }
  return {
    subject: summary,
    bodyText: [
      `Your ${summary.toLowerCase()} is ready to review.`,
      `Total: $${quote.totals.total.toFixed(2)}`,
      quote.expiresAt ? `Expires: ${quote.expiresAt}` : "",
      `Open the quote here: ${portalUrl}`
    ].filter(Boolean).join("\n")
  };
}

export type QuoteCreateApprovalArgs = z.infer<typeof quoteCreateApprovalArgsSchema>;
