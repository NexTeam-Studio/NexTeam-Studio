import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type CrmSettings,
  type Invoice,
  type InvoiceDeliveryMode,
  type InvoiceDeliveryPreferences,
  type InvoiceJobReference,
  type Job,
  type LineItem,
  type PaymentScheduleMilestone,
  type PaymentSchedulePlan,
  type Quote,
  type QuoteDiscount,
  type QuoteTotals
} from "@nexteam/core";

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function hashInvoicePortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createInvoicePortalToken(): string {
  return randomBytes(18).toString("hex");
}

export function invoicePortalUrlForInvoice(invoice: Invoice, token: string): string {
  return `/portal/invoices/${encodeURIComponent(invoice.id)}?tenantId=${encodeURIComponent(invoice.tenantId)}&token=${encodeURIComponent(token)}`;
}

export function deliveryDefaultsForInvoice(
  settings: CrmSettings,
  override?: InvoiceDeliveryPreferences | undefined
): InvoiceDeliveryPreferences {
  return override ?? settings.invoiceDefaults.delivery;
}

export function invoiceDueAt(settings: CrmSettings, createdAt = now()): string {
  const base = new Date(createdAt);
  base.setUTCDate(base.getUTCDate() + settings.invoiceDefaults.dueDays);
  return base.toISOString();
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

export function calculateInvoiceTotals(lineItems: LineItem[], discount?: QuoteDiscount | undefined, taxRate = 0): QuoteTotals {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0));
  const discountValue = Math.min(subtotal, discountAmount(subtotal, discount));
  const taxable = Math.max(0, subtotal - discountValue);
  const tax = roundMoney(taxable * (taxRate / 100));
  return {
    subtotal,
    ...(discountValue > 0 ? { discount: discountValue } : {}),
    tax,
    total: roundMoney(taxable + tax),
    ...(taxRate > 0 ? { taxRate } : {})
  };
}

export function milestoneAmount(total: number, milestone: PaymentScheduleMilestone): number {
  if (milestone.amountKind === "percent") {
    return roundMoney(total * (milestone.amount / 100));
  }
  return roundMoney(milestone.amount);
}

export function scheduleBalanceSummary(schedule: PaymentSchedulePlan | undefined, total: number): Array<{ id: string; label: string; dueLabel: string; amount: number }> {
  if (!schedule?.enabled || !schedule.milestones.length) {
    return [];
  }
  return schedule.milestones.map((milestone) => ({
    id: milestone.id,
    label: milestone.label,
    dueLabel: milestone.trigger === "on_date"
      ? (milestone.dueAt ?? "Custom date")
      : milestone.trigger === "on_approval"
        ? "Due on approval"
        : "Due on job close",
    amount: milestoneAmount(total, milestone)
  }));
}

export function invoiceJobReferences(jobs: Job[]): InvoiceJobReference[] {
  return jobs.map((job) => ({
    jobId: job.id,
    ...(job.number ? { number: job.number } : {}),
    title: job.title,
    amount: roundMoney(job.totals.total)
  }));
}

function copiedLineItems(jobs: Job[]): LineItem[] {
  if (jobs.length === 1) {
    return jobs[0]?.lineItems.map((item) => ({ ...item })) ?? [];
  }
  return jobs.flatMap((job) => job.lineItems.map((item, index) => ({
    ...item,
    id: `${job.id}_${item.id}_${index + 1}`,
    description: item.description
      ? `${job.title}: ${item.description}`
      : `From ${job.title}`
  })));
}

function defaultInvoiceTitle(jobs: Job[]): string {
  if (jobs.length === 1) {
    return `Invoice - ${jobs[0]?.title ?? "Job"}`;
  }
  return `Invoice - ${jobs.length} jobs combined`;
}

export function buildInvoiceDraftFromJobs(input: {
  tenantId: string;
  jobs: Job[];
  settings: CrmSettings;
  number: string;
  title?: string | undefined;
  quoteId?: string | undefined;
  requestId?: string | undefined;
  intake?: Job["intake"] | undefined;
  paymentSchedule?: PaymentSchedulePlan | undefined;
  discount?: QuoteDiscount | undefined;
  taxRate?: number | undefined;
  terms?: string | undefined;
}): Invoice {
  const timestamp = now();
  const lineItems = copiedLineItems(input.jobs);
  const totals = calculateInvoiceTotals(lineItems, input.discount, input.taxRate ?? 0);
  const jobReferences = invoiceJobReferences(input.jobs);
  const primaryJob = input.jobs[0];
  return {
    id: `invoice_${randomUUID()}`,
    tenantId: input.tenantId,
    number: input.number,
    clientId: primaryJob?.clientId ?? "",
    ...(primaryJob?.id ? { jobId: primaryJob.id } : {}),
    ...(input.jobs.length ? { jobIds: input.jobs.map((job) => job.id), jobReferences } : {}),
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    status: "draft",
    title: input.title?.trim() || defaultInvoiceTitle(input.jobs),
    lineItems,
    totals,
    ...(input.discount ? { discount: input.discount } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    dueAt: invoiceDueAt(input.settings, timestamp),
    terms: input.terms ?? input.settings.invoiceDefaults.terms,
    deliveryDefaults: deliveryDefaultsForInvoice(input.settings),
    portal: {},
    delivery: [],
    ...(input.paymentSchedule ? { paymentSchedule: input.paymentSchedule } : {}),
    ...(input.intake ? { intake: input.intake } : {}),
    statusHistory: [{
      status: "draft",
      changedAt: timestamp,
      note: "Invoice draft created."
    }],
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: totals.total,
      overdue: false
    }
  };
}

export function buildInvoiceDraftFromQuote(input: {
  quote: Quote;
  settings: CrmSettings;
  number: string;
}): Invoice {
  const timestamp = now();
  return {
    id: `invoice_${randomUUID()}`,
    tenantId: input.quote.tenantId,
    number: input.number,
    clientId: input.quote.clientId,
    ...(input.quote.jobId ? { jobId: input.quote.jobId, jobIds: [input.quote.jobId], jobReferences: [{ jobId: input.quote.jobId, title: input.quote.title, amount: input.quote.totals.total }] } : {}),
    quoteId: input.quote.id,
    ...(input.quote.requestId ? { requestId: input.quote.requestId } : {}),
    status: "draft",
    title: `Invoice - ${input.quote.title}`,
    lineItems: input.quote.lineItems.map((item) => ({ ...item })),
    totals: input.quote.totals,
    ...(input.quote.discount ? { discount: input.quote.discount } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    dueAt: invoiceDueAt(input.settings, timestamp),
    terms: input.quote.terms ?? input.settings.invoiceDefaults.terms,
    deliveryDefaults: deliveryDefaultsForInvoice(input.settings),
    portal: {},
    delivery: [],
    ...(input.quote.paymentSchedule ? { paymentSchedule: input.quote.paymentSchedule } : {}),
    ...(input.quote.intake ? { intake: input.quote.intake } : {}),
    statusHistory: [{
      status: "draft",
      changedAt: timestamp,
      note: "Invoice draft created from approved quote."
    }],
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: input.quote.totals.total,
      overdue: false
    }
  };
}

export function invoiceDeliveryMessage(input: {
  invoice: Invoice;
  mode: Extract<InvoiceDeliveryMode, "email" | "sms">;
  portalUrl: string;
  deliveryDefaults: InvoiceDeliveryPreferences;
}): { subject: string; bodyText: string } {
  const number = input.invoice.number ? ` ${input.invoice.number}` : "";
  const summary = `Invoice${number}: ${input.invoice.title}`;
  const lines = [
    `Balance due: $${(input.invoice.ledger?.balanceDue ?? input.invoice.totals.total).toFixed(2)}`,
    input.invoice.dueAt ? `Due: ${input.invoice.dueAt}` : "",
    input.deliveryDefaults.emailIncludePayLink || input.deliveryDefaults.smsIncludePayLink ? `Pay here: ${input.portalUrl}` : "",
    input.deliveryDefaults.smsIncludeHostedLink ? `Receipt and files: ${input.portalUrl}#receipt` : "",
    input.deliveryDefaults.emailIncludeSummary || input.deliveryDefaults.smsIncludeSummary
      ? `Summary total: $${input.invoice.totals.total.toFixed(2)}`
      : ""
  ].filter(Boolean);
  if (input.mode === "sms") {
    return {
      subject: summary,
      bodyText: [summary, ...lines].join("\n")
    };
  }
  return {
    subject: summary,
    bodyText: [
      `Your ${summary.toLowerCase()} is ready.`,
      ...lines
    ].join("\n")
  };
}
