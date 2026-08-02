import React, { useEffect, useState } from "react";
import { NexOpsPageTitle } from "../../../nexopsShell/components/NexOpsPageTitle";
import type { AddressLike } from "@nexteam/shared";
import { PaymentScheduleEditor, paymentScheduleFromRecord, paymentScheduleToPayload, type PaymentScheduleDraft, type PaymentScheduleRecord } from "../../../../features/invoices/components/invoiceStructure/PaymentScheduleEditor";
import { NexOpsCatalogPicker, type ProductServiceCatalogItem } from "../../../settings/components/catalog/NexOpsCatalog";
import { QuoteTemplateEditor } from "../quoteTemplates/QuoteTemplateEditor";
import { NexopsActionButton, NexopsActionRail, NexopsBanner, NexopsProgressStrip, NexopsSectionCard, NexopsStatusPill } from "../../../../shared/ui/NexOpsUiKit";
import { quoteTemplateVariables, resolveTemplateDraft } from "../../../../shared/communications/communicationTemplates";
import { intakeDetailFacts, prominentIntakeFacts } from "../../../../shared/intake/intakePresentation";

type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "change_requested"
  | "approved"
  | "approved_internal"
  | "declined"
  | "expired"
  | "archived"
  // Defensive read compatibility for an API response from an unmigrated server.
  | "signed";

type DeliveryMode = "draft" | "email" | "sms" | "mark_sent";
type DiscountKind = "amount" | "percent";
type DepositKind = "amount" | "percent";
type DocumentKind = "request" | "quote" | "job" | "invoice" | "receipt";
type QuoteFilter = "all" | "draft" | "sent" | "change_requested" | "approved" | "approved_pending_conversion" | "expired";
type QuoteUiTone = "dominant" | "secondary" | "quiet" | "danger" | "success" | "warning" | "blocked";
type QuoteSurfaceAction = "send" | "manual-approve" | "renew" | "convert-to-job" | "invoice" | "copy-portal" | "edit" | "none";
type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

const QUOTE_FILTERS: Array<{ value: QuoteFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "change_requested", label: "Needs Changes" },
  { value: "approved", label: "Approved" },
  { value: "approved_pending_conversion", label: "Approved Queue" },
  { value: "expired", label: "Expired" }
];

interface ClientOption {
  id: string;
  name: string;
  company?: string;
  personName?: { firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  emails: string[];
  phones: string[];
  billingAddress?: AddressLike;
}

interface TenantUserRecord {
  id: string;
  email?: string;
  displayName: string;
  role: TenantRole;
  active: boolean;
}

interface QuoteLineItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  source?: "catalog" | "custom";
  catalogCode?: string;
  clientSelectable?: boolean;
  defaultSelected?: boolean;
}

interface QuoteApprovalRules {
  requireSignature: boolean;
  requireDeposit: boolean;
  requireCardOnFile: boolean;
  depositKind?: DepositKind;
  depositValue?: number;
}

interface QuoteDiscount {
  kind: DiscountKind;
  value: number;
}

interface QuoteTotals {
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  taxRate?: number;
}

interface QuoteDeliveryRecord {
  id: string;
  mode: Exclude<DeliveryMode, "draft">;
  sentAt: string;
  target?: string;
  sentBy?: string;
  receiptId?: string;
  note?: string;
}

interface QuoteChangeRequest {
  id: string;
  requestedAt: string;
  requestedBy?: string;
  lineComments: Array<{ lineItemId: string; comment: string }>;
  note?: string;
  resolvedAt?: string;
}

interface QuoteVersionSnapshot {
  version: number;
  archivedAt: string;
  reason: "renewed" | "edited_before_send";
  title: string;
  lineItems: QuoteLineItem[];
  totals: QuoteTotals;
  status: QuoteStatus;
  expiresAt?: string;
  terms?: string;
  discount?: QuoteDiscount;
  approvalRules: QuoteApprovalRules;
}

interface QuoteDepositBridge {
  required: boolean;
  kind: DepositKind;
  amount: number;
  capturedAt?: string;
  cardholderName?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardOnFileAuthorized?: boolean;
  autoSavedCardOnFile?: boolean;
}

interface QuoteRecord {
  id: string;
  tenantId: string;
  number?: string;
  clientId: string;
  salespersonUserId?: string;
  jobId?: string;
  requestId?: string;
  convertedJobId?: string;
  templateId?: string;
  version?: number;
  status: QuoteStatus;
  title: string;
  lineItems: QuoteLineItem[];
  totals: QuoteTotals;
  approvalRules: QuoteApprovalRules;
  discount?: QuoteDiscount;
  expiresAt?: string;
  sentAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByRole?: "client" | "OWNER" | "OFFICE_ADMIN";
  archivedAt?: string;
  signature?: { mode: "drawn" | "typed"; signedAt: string; typedName?: string; drawnDataUrl?: string };
  delivery?: QuoteDeliveryRecord[];
  changeRequests?: QuoteChangeRequest[];
  deposit?: QuoteDepositBridge;
  paymentSchedule?: PaymentScheduleRecord;
  terms?: string;
  versions?: QuoteVersionSnapshot[];
  createdAt?: string;
  updatedAt?: string;
}

interface QuoteTemplateRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  titlePrefix?: string;
  defaultLineItems?: QuoteLineItem[];
  defaultApprovalRules: QuoteApprovalRules;
  defaultPaymentSchedule?: PaymentScheduleRecord;
  expiryDays?: number;
  terms?: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentNumberingRule {
  prefix: string;
  separator: string;
  padWidth: number;
  nextValue: number;
}

interface CommunicationTemplateRecord {
  id: string;
  tenantId: string;
  category: string;
  label: string;
  description?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailSubject?: string;
  emailBody?: string;
  smsBody?: string;
  createdAt: string;
  updatedAt: string;
}

interface CrmSettingsRecord {
  tenantId: string;
  documentNumbering: Record<DocumentKind, DocumentNumberingRule>;
  quoteDefaults: {
    expiryDays: number;
    autoSaveCardOnDeposit: boolean;
    approvalRules: QuoteApprovalRules;
    terms: string;
  };
  catalogItems: ProductServiceCatalogItem[];
  communicationTemplates: CommunicationTemplateRecord[];
  createdAt: string;
  updatedAt: string;
}

interface QuotesResponse {
  ok: boolean;
  quotes?: QuoteRecord[];
  error?: string;
}

interface TemplatesResponse {
  ok: boolean;
  settings?: CrmSettingsRecord;
  templates?: QuoteTemplateRecord[];
  error?: string;
}

interface QuoteMutationResponse {
  ok: boolean;
  quote?: QuoteRecord;
  settings?: CrmSettingsRecord;
  template?: QuoteTemplateRecord;
  portalUrl?: string;
  delivery?: QuoteDeliveryRecord;
  job?: { id: string; number?: string; title?: string };
  invoice?: { id: string; number?: string; title?: string };
  error?: string;
}

interface SettingsMutationResponse {
  ok: boolean;
  settings?: CrmSettingsRecord;
  error?: string;
}

interface TemplateMutationResponse {
  ok: boolean;
  template?: QuoteTemplateRecord;
  error?: string;
}

interface QuoteLineDraft {
  rowId: string;
  kind: "catalog" | "custom";
  catalogCode: string;
  code: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  clientSelectable: boolean;
  defaultSelected: boolean;
}

interface QuoteComposerDraft {
  editingQuoteId: string;
  clientId: string;
  templateId: string;
  salespersonUserId: string;
  title: string;
  items: QuoteLineDraft[];
  discountKind: DiscountKind;
  discountValue: number;
  taxRate: number;
  expiryDate: string;
  terms: string;
  paymentSchedule: PaymentScheduleDraft;
  requireSignature: boolean;
  requireDeposit: boolean;
  requireCardOnFile: boolean;
  depositKind: DepositKind;
  depositValue: number;
  deliveryMode: DeliveryMode;
  deliveryTarget: string;
  deliveryNote: string;
}

interface SettingsDraft {
  documentNumbering: Record<DocumentKind, { prefix: string; separator: string; padWidth: number }>;
  expiryDays: number;
  autoSaveCardOnDeposit: boolean;
  requireSignature: boolean;
  requireDeposit: boolean;
  requireCardOnFile: boolean;
  depositKind: DepositKind;
  depositValue: number;
  terms: string;
}

interface TemplateDraft {
  id: string;
  name: string;
  description: string;
  titlePrefix: string;
  expiryDays: string;
  terms: string;
  requireSignature: boolean;
  requireDeposit: boolean;
  requireCardOnFile: boolean;
  depositKind: DepositKind;
  depositValue: number;
}

interface SendDraft {
  mode: Exclude<DeliveryMode, "draft">;
  target: string;
  subject: string;
  bodyText: string;
  note: string;
}

interface NexOpsQuotesPageProps {
  tenantId: string;
  clients: ClientOption[];
  tenantUsers: TenantUserRecord[];
  onCrmMutation?: () => void;
  focusedQuoteId?: string;
  initialFilter?: QuoteFilter;
}

function rowId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function formatTimestamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function isoDate(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function clientDisplayName(client?: ClientOption): string {
  if (!client) {
    return "Select Client";
  }
  const person = [client.personName?.firstName, client.personName?.lastName].filter(Boolean).join(" ").trim();
  if (client.company && client.displayNamePreference !== "person") {
    return client.company;
  }
  return person || client.name;
}

function quoteStatusLabel(status: QuoteStatus): string {
  return status === "signed" ? "approved" : status.replaceAll("_", " ");
}

export function quoteStatusTone(status: QuoteStatus): QuoteUiTone {
  switch (status) {
    case "approved":
    case "approved_internal":
    case "signed":
      return "success";
    case "change_requested":
    case "pending_approval":
      return "warning";
    case "expired":
      return "blocked";
    case "declined":
      return "danger";
    case "sent":
      return "secondary";
    case "archived":
      return "quiet";
    case "draft":
    default:
      return "quiet";
  }
}

export function quoteApprovalBlockedReason(quote: QuoteRecord, timestamp = new Date().toISOString()): string | null {
  if (quote.status === "archived") {
    return "Archived quotes cannot be approved.";
  }
  if (quote.status === "expired") {
    return "Expired quotes cannot be approved until they are renewed.";
  }
  if (quote.expiresAt && new Date(quote.expiresAt).getTime() < new Date(timestamp).getTime()) {
    return "Expired quotes cannot be approved until they are renewed.";
  }
  if (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") {
    return "Approved quotes are locked.";
  }
  if (quote.status === "declined") {
    return "Declined quotes cannot be approved.";
  }
  return null;
}

export function quoteLifecyclePercent(status: QuoteStatus): number {
  switch (status) {
    case "draft":
      return 20;
    case "pending_approval":
      return 35;
    case "sent":
      return 58;
    case "change_requested":
      return 46;
    case "approved":
    case "approved_internal":
    case "signed":
      return 84;
    case "expired":
      return 58;
    case "declined":
      return 42;
    case "archived":
      return 100;
    default:
      return 0;
  }
}

export function quoteLifecycleNarrative(quote: QuoteRecord): string {
  switch (quote.status) {
    case "draft":
      return "Still in office build mode. The client has not received an approval path yet.";
    case "pending_approval":
      return "Nexi has staged the quote in chat, but the real write is still waiting on explicit yes/no approval.";
    case "sent":
      return "The client-facing approval path is live. Signature, deposit, and card rules still enforce on the server.";
    case "change_requested":
      return "The client asked for revisions. Staff needs to update the quote and resend a fresh approval path.";
    case "approved":
    case "signed":
      return "The client cleared the commercial gate. This quote is now immutable and ready for downstream work.";
    case "approved_internal":
      return "Office staff approved on the client's behalf. The quote is locked and can move into work or billing.";
    case "declined":
      return "The quote is no longer moving forward commercially, but it stays visible for history.";
    case "expired":
      return "The client can still view the quote, but approval is hard-blocked until staff renews it.";
    case "archived":
      return "This quote version is retained only for audit history and is no longer actionable.";
    default:
      return "Quote lifecycle state is available.";
  }
}

export function quoteCanEdit(quote: QuoteRecord): boolean {
  return !["approved", "approved_internal", "signed", "archived", "declined", "expired"].includes(quote.status)
    && !quoteApprovalBlockedReason(quote);
}

export function quoteSendBlockedReason(quote: QuoteRecord): string | null {
  if (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") {
    return "Approved quotes are locked and no longer need a fresh send step.";
  }
  if (quote.status === "expired") {
    return "Expired quotes must be renewed before they can be sent again.";
  }
  if (quote.status === "declined") {
    return "Declined quotes stay visible for history but are not deliverable.";
  }
  if (quote.status === "archived") {
    return "Archived quote versions are history only and cannot be sent.";
  }
  return null;
}

export function quoteCanSend(quote: QuoteRecord): boolean {
  return !quoteSendBlockedReason(quote);
}

export function quoteManualApproveBlockedReason(quote: QuoteRecord): string | null {
  return quoteApprovalBlockedReason(quote);
}

export function quoteCanManualApprove(quote: QuoteRecord): boolean {
  return !quoteManualApproveBlockedReason(quote);
}

export function quoteRenewBlockedReason(quote: QuoteRecord): string | null {
  return quoteCanRenew(quote) ? null : "Only expired quotes can be renewed.";
}

export function quoteCanRenew(quote: QuoteRecord): boolean {
  return quote.status === "expired"
    || Boolean(quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now());
}

export function quoteConvertToJobBlockedReason(quote: QuoteRecord): string | null {
  if (!["approved", "approved_internal", "signed"].includes(quote.status)) {
    return "Only approved quotes can convert into jobs.";
  }
  if (quote.convertedJobId) {
    return `This quote already converted into job ${quote.convertedJobId}.`;
  }
  return null;
}

export function quoteCanConvertToJob(quote: QuoteRecord): boolean {
  return !quoteConvertToJobBlockedReason(quote);
}

export function quoteInvoiceBlockedReason(quote: QuoteRecord): string | null {
  if (!["approved", "approved_internal", "signed"].includes(quote.status)) {
    return "Quote must be approved before an invoice is created.";
  }
  return null;
}

export function quoteCanCreateInvoice(quote: QuoteRecord): boolean {
  return !quoteInvoiceBlockedReason(quote);
}

function quoteDepositRequirementAmount(quote: QuoteRecord): number {
  if (!quote.approvalRules.requireDeposit) {
    return 0;
  }
  if (typeof quote.deposit?.amount === "number") {
    return roundMoney(quote.deposit.amount);
  }
  const depositValue = quote.approvalRules.depositValue ?? 0;
  return quote.approvalRules.depositKind === "percent"
    ? roundMoney(quote.totals.total * (depositValue / 100))
    : roundMoney(depositValue);
}

export function quotePaymentScheduleHeadline(schedule: PaymentScheduleRecord | undefined): string {
  if (!schedule?.enabled || !schedule.milestones.length) {
    return "No staged milestones. Billing can happen later from the invoice side.";
  }
  return `${schedule.milestones.length} milestone${schedule.milestones.length === 1 ? "" : "s"} already staged from the quote rail.`;
}

export function quotePaymentScheduleLine(milestone: PaymentScheduleRecord["milestones"][number], total: number): string {
  const amount = milestone.amountKind === "percent"
    ? `${milestone.amount}% (${money(roundMoney(total * (milestone.amount / 100)))})`
    : money(milestone.amount);
  const trigger = milestone.trigger === "on_approval"
    ? "on approval"
    : milestone.trigger === "on_job_close"
      ? "on job close"
      : milestone.dueAt
        ? `on ${new Date(milestone.dueAt).toLocaleDateString()}`
        : "on a scheduled date";
  return `${amount} ${trigger}`;
}

export function quoteApprovalSummaryLabel(quote: QuoteRecord): string {
  if (quote.approvedByRole === "client") {
    return "Client accepted";
  }
  if (quote.approvedByRole === "OWNER" || quote.approvedByRole === "OFFICE_ADMIN") {
    return "Approved internally";
  }
  if (quote.status === "change_requested") {
    return "Revision requested";
  }
  if (quote.status === "expired") {
    return "Renewal needed";
  }
  if (quote.status === "sent") {
    return "Client action pending";
  }
  if (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") {
    return "Client accepted";
  }
  return "Not approved yet";
}

export function quoteDominantAction(quote: QuoteRecord): {
  action: QuoteSurfaceAction;
  label: string;
  hint: string;
  tone: QuoteUiTone;
} {
  if (quoteCanRenew(quote)) {
    return {
      action: "renew",
      label: "Renew Quote",
      hint: "Rotate the client link and reset the expiry window before approval can continue.",
      tone: "warning"
    };
  }
  if (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") {
    if (!quote.convertedJobId) {
      return {
        action: "convert-to-job",
        label: "Convert to Job",
        hint: "Take the approved quote snapshot into work exactly once.",
        tone: "dominant"
      };
    }
    return {
      action: "invoice",
      label: "Create Invoice",
      hint: "The job link already exists. Billing can start here or later from job closeout.",
      tone: "secondary"
    };
  }
  if (quote.status === "change_requested") {
    return {
      action: "edit",
      label: "Edit and Resend",
      hint: "Rework the line items or terms, then send a fresh approval path.",
      tone: "warning"
    };
  }
  if (quote.status === "sent") {
    return {
      action: "send",
      label: "Resend Quote",
      hint: "Share the approval path again without changing the quote payload.",
      tone: "secondary"
    };
  }
  if (quote.status === "declined") {
    return {
      action: "none",
      label: "History Only",
      hint: "Declined quotes stay readable but do not move forward.",
      tone: "blocked"
    };
  }
  if (quote.status === "archived") {
    return {
      action: "none",
      label: "Archived",
      hint: "This version is preserved for audit history only.",
      tone: "quiet"
    };
  }
  if (quote.status === "pending_approval") {
    return {
      action: "none",
      label: "Waiting on chat approval",
      hint: "The record is still parked behind ApprovalQueue and has not executed yet.",
      tone: "warning"
    };
  }
  return {
    action: "send",
    label: "Send Quote",
    hint: "Open the client approval path once the office draft is ready.",
    tone: "dominant"
  };
}

function catalogItem(catalogItems: ProductServiceCatalogItem[], code: string) {
  return catalogItems.find((item) => item.code === code);
}

function lineDraftFromCatalogItem(item: ProductServiceCatalogItem): QuoteLineDraft {
  return {
    rowId: rowId("catalog"),
    kind: "catalog",
    catalogCode: item.code,
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    quantity: 1,
    unitPrice: roundMoney(item.price),
    clientSelectable: false,
    defaultSelected: true
  };
}



function lineDraftFromQuoteItem(item: QuoteLineItem): QuoteLineDraft {
  return {
    rowId: rowId("line"),
    kind: item.source === "custom" ? "custom" : "catalog",
    catalogCode: item.catalogCode ?? "",
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    clientSelectable: Boolean(item.clientSelectable),
    defaultSelected: item.defaultSelected !== false
  };
}

function discountPreview(items: QuoteLineDraft[], kind: DiscountKind, value: number): number {
  const subtotal = items.reduce((sum, item) => sum + roundMoney(item.quantity * item.unitPrice), 0);
  if (!value) {
    return 0;
  }
  const raw = kind === "percent" ? subtotal * (value / 100) : value;
  return Math.min(subtotal, roundMoney(raw));
}

function calculateDraftTotals(items: QuoteLineDraft[], discountKind: DiscountKind, discountValue: number, taxRate: number): QuoteTotals {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(item.quantity * item.unitPrice), 0));
  const discount = discountPreview(items, discountKind, discountValue);
  const taxable = Math.max(0, subtotal - discount);
  const tax = roundMoney(taxable * (taxRate / 100));
  return {
    subtotal,
    ...(discount > 0 ? { discount } : {}),
    tax,
    total: roundMoney(taxable + tax),
    ...(taxRate > 0 ? { taxRate } : {})
  };
}

function quoteTitle(template: QuoteTemplateRecord | undefined, client: ClientOption | undefined): string {
  const base = template?.titlePrefix?.trim() || "Quote";
  const clientName = clientDisplayName(client);
  return clientName === "Select client" ? base : `${base} - ${clientName}`;
}

function settingsDraftFromRecord(settings: CrmSettingsRecord): SettingsDraft {
  return {
    documentNumbering: {
      request: {
        prefix: settings.documentNumbering.request.prefix,
        separator: settings.documentNumbering.request.separator,
        padWidth: settings.documentNumbering.request.padWidth
      },
      quote: {
        prefix: settings.documentNumbering.quote.prefix,
        separator: settings.documentNumbering.quote.separator,
        padWidth: settings.documentNumbering.quote.padWidth
      },
      job: {
        prefix: settings.documentNumbering.job.prefix,
        separator: settings.documentNumbering.job.separator,
        padWidth: settings.documentNumbering.job.padWidth
      },
      invoice: {
        prefix: settings.documentNumbering.invoice.prefix,
        separator: settings.documentNumbering.invoice.separator,
        padWidth: settings.documentNumbering.invoice.padWidth
      },
      receipt: {
        prefix: settings.documentNumbering.receipt.prefix,
        separator: settings.documentNumbering.receipt.separator,
        padWidth: settings.documentNumbering.receipt.padWidth
      }
    },
    expiryDays: settings.quoteDefaults.expiryDays,
    autoSaveCardOnDeposit: settings.quoteDefaults.autoSaveCardOnDeposit,
    requireSignature: settings.quoteDefaults.approvalRules.requireSignature,
    requireDeposit: settings.quoteDefaults.approvalRules.requireDeposit,
    requireCardOnFile: settings.quoteDefaults.approvalRules.requireCardOnFile,
    depositKind: settings.quoteDefaults.approvalRules.depositKind ?? "percent",
    depositValue: settings.quoteDefaults.approvalRules.depositValue ?? 0,
    terms: settings.quoteDefaults.terms
  };
}

function templateDraftFromRecord(template: QuoteTemplateRecord): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    titlePrefix: template.titlePrefix ?? "",
    expiryDays: template.expiryDays ? String(template.expiryDays) : "",
    terms: template.terms ?? "",
    requireSignature: template.defaultApprovalRules.requireSignature,
    requireDeposit: template.defaultApprovalRules.requireDeposit,
    requireCardOnFile: template.defaultApprovalRules.requireCardOnFile,
    depositKind: template.defaultApprovalRules.depositKind ?? "percent",
    depositValue: template.defaultApprovalRules.depositValue ?? 0
  };
}

function emptyTemplateDraft(settings: SettingsDraft | null): TemplateDraft {
  return {
    id: "",
    name: "",
    description: "",
    titlePrefix: "",
    expiryDays: "",
    terms: settings?.terms ?? "",
    requireSignature: settings?.requireSignature ?? false,
    requireDeposit: settings?.requireDeposit ?? false,
    requireCardOnFile: settings?.requireCardOnFile ?? false,
    depositKind: settings?.depositKind ?? "percent",
    depositValue: settings?.depositValue ?? 0
  };
}

function composerFromDefaults(
  clients: ClientOption[],
  tenantUsers: TenantUserRecord[],
  settingsRecord: CrmSettingsRecord | null,
  settings: SettingsDraft | null,
  template: QuoteTemplateRecord | undefined
): QuoteComposerDraft {
  const client = clients[0];
  const items = template?.defaultLineItems?.length
    ? template.defaultLineItems.map(lineDraftFromQuoteItem)
    : [];
  return {
    editingQuoteId: "",
    clientId: client?.id ?? "",
    templateId: template?.id ?? "",
    salespersonUserId: tenantUsers[0]?.id ?? "",
    title: quoteTitle(template, client),
    items,
    discountKind: "amount",
    discountValue: 0,
    taxRate: 0,
    expiryDate: "",
    terms: template?.terms ?? settings?.terms ?? "",
    paymentSchedule: paymentScheduleFromRecord(template?.defaultPaymentSchedule),
    requireSignature: template?.defaultApprovalRules.requireSignature ?? settings?.requireSignature ?? false,
    requireDeposit: template?.defaultApprovalRules.requireDeposit ?? settings?.requireDeposit ?? false,
    requireCardOnFile: template?.defaultApprovalRules.requireCardOnFile ?? settings?.requireCardOnFile ?? false,
    depositKind: template?.defaultApprovalRules.depositKind ?? settings?.depositKind ?? "percent",
    depositValue: template?.defaultApprovalRules.depositValue ?? settings?.depositValue ?? 0,
    deliveryMode: "draft",
    deliveryTarget: client?.emails[0] ?? "",
    deliveryNote: ""
  };
}

function composerFromQuote(quote: QuoteRecord, client: ClientOption | undefined): QuoteComposerDraft {
  return {
    editingQuoteId: quote.id,
    clientId: quote.clientId,
    templateId: quote.templateId ?? "",
    salespersonUserId: quote.salespersonUserId ?? "",
    title: quote.title,
    items: quote.lineItems.map(lineDraftFromQuoteItem),
    discountKind: quote.discount?.kind ?? "amount",
    discountValue: quote.discount?.value ?? 0,
    taxRate: quote.totals.taxRate ?? 0,
    expiryDate: isoDate(quote.expiresAt),
    terms: quote.terms ?? "",
    paymentSchedule: paymentScheduleFromRecord(quote.paymentSchedule),
    requireSignature: quote.approvalRules.requireSignature,
    requireDeposit: quote.approvalRules.requireDeposit,
    requireCardOnFile: quote.approvalRules.requireCardOnFile,
    depositKind: quote.approvalRules.depositKind ?? "percent",
    depositValue: quote.approvalRules.depositValue ?? 0,
    deliveryMode: "draft",
    deliveryTarget: client?.emails[0] ?? client?.phones[0] ?? "",
    deliveryNote: ""
  };
}

function quotePayload(composer: QuoteComposerDraft, tenantId: string) {
  return {
    tenantId,
    clientId: composer.clientId,
    ...(composer.templateId ? { templateId: composer.templateId } : {}),
    ...(composer.salespersonUserId ? { salespersonUserId: composer.salespersonUserId } : {}),
    title: composer.title.trim(),
    items: composer.items.map((item) => ({
      kind: item.kind,
      ...(item.kind === "catalog" ? { catalogCode: item.catalogCode, unitPrice: item.unitPrice } : {}),
      ...(item.code.trim() ? { code: item.code.trim() } : {}),
      ...(item.name.trim() ? { name: item.name.trim() } : {}),
      ...(item.description.trim() ? { description: item.description.trim() } : {}),
      quantity: item.quantity,
      ...(item.kind === "custom" || item.unitPrice ? { unitPrice: item.unitPrice } : {}),
      clientSelectable: item.clientSelectable,
      defaultSelected: item.defaultSelected
    })),
    approvalRules: {
      requireSignature: composer.requireSignature,
      requireDeposit: composer.requireDeposit,
      requireCardOnFile: composer.requireCardOnFile,
      ...(composer.requireDeposit || composer.requireCardOnFile ? { depositKind: composer.depositKind, depositValue: composer.depositValue } : {})
    },
    ...(composer.discountValue > 0 ? { discount: { kind: composer.discountKind, value: composer.discountValue } } : {}),
    ...(composer.taxRate > 0 ? { taxRate: composer.taxRate } : {}),
    ...(composer.expiryDate ? { expiresAt: new Date(`${composer.expiryDate}T23:59:59.000Z`).toISOString() } : {}),
    ...(composer.terms.trim() ? { terms: composer.terms.trim() } : {}),
    ...(paymentScheduleToPayload(composer.paymentSchedule) ? { paymentSchedule: paymentScheduleToPayload(composer.paymentSchedule) } : {}),
    delivery: {
      mode: composer.deliveryMode,
      ...(composer.deliveryTarget.trim() ? { target: composer.deliveryTarget.trim() } : {}),
      ...(composer.deliveryNote.trim() ? { note: composer.deliveryNote.trim() } : {})
    }
  };
}

function templateLineItemsFromComposer(items: QuoteLineDraft[]): QuoteLineItem[] {
  return items.map((item) => ({
    id: item.rowId,
    code: item.kind === "catalog" ? item.catalogCode : item.code.trim() || `CUSTOM-${item.rowId.slice(-4)}`,
    name: item.name.trim(),
    ...(item.description.trim() ? { description: item.description.trim() } : {}),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: roundMoney(item.quantity * item.unitPrice),
    source: item.kind,
    ...(item.catalogCode ? { catalogCode: item.catalogCode } : {}),
    clientSelectable: item.clientSelectable,
    defaultSelected: item.defaultSelected
  }));
}

function canSaveComposer(composer: QuoteComposerDraft): boolean {
  if (!composer.clientId || !composer.title.trim() || !composer.items.length) {
    return false;
  }
  return composer.items.every((item) => {
    if (item.quantity <= 0 || item.unitPrice < 0) {
      return false;
    }
    if (item.kind === "catalog") {
      return Boolean(item.catalogCode);
    }
    return Boolean(item.name.trim());
  });
}

function approvalSummary(rules: QuoteApprovalRules): string {
  const parts = [
    rules.requireSignature ? "signature required" : "signature optional",
    rules.requireDeposit ? `deposit required (${rules.depositKind === "percent" ? `${rules.depositValue ?? 0}%` : money(rules.depositValue ?? 0)})` : "no deposit gate",
    rules.requireCardOnFile ? "card-on-file required" : "card-on-file optional"
  ];
  return parts.join(" | ");
}

function quoteMatchesFilter(quote: QuoteRecord, filter: QuoteFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "approved") {
    return quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed";
  }
  if (filter === "approved_pending_conversion") {
    return (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") && !quote.convertedJobId;
  }
  return quote.status === filter;
}

function defaultQuoteSendDraft(
  quote: QuoteRecord,
  client: ClientOption | undefined,
  settings: CrmSettingsRecord | null,
  portalUrl: string | undefined,
  mode: Exclude<DeliveryMode, "draft"> = "email"
): SendDraft {
  const rendered = resolveTemplateDraft({
    templates: settings?.communicationTemplates ?? [],
    category: "quote_send",
    channel: mode === "sms" ? "sms" : "email",
    fallbackSubject: quote.number ? `Quote ${quote.number}` : quote.title,
    fallbackBodyText: [
      `Hi ${clientDisplayName(client)},`,
      "",
      `Your quote ${quote.number ?? quote.id} for ${quote.title} is ready to review.`,
      portalUrl ?? "",
      "",
      `Total: ${money(quote.totals.total)}`
    ].filter(Boolean).join("\n"),
    variables: quoteTemplateVariables({
      quote,
      client: client ? {
        id: client.id,
        name: clientDisplayName(client),
        emails: client.emails,
        phones: client.phones,
        billingAddress: client.billingAddress
      } : undefined,
      portalUrl
    })
  });
  return {
    mode,
    target: mode === "sms" ? (client?.phones[0] ?? "") : (client?.emails[0] ?? ""),
    subject: mode === "sms" ? "" : rendered.subject,
    bodyText: rendered.bodyText,
    note: ""
  };
}

export function NexOpsQuotesPage(props: NexOpsQuotesPageProps): React.ReactElement {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [templates, setTemplates] = useState<QuoteTemplateRecord[]>([]);
  const [settingsRecord, setSettingsRecord] = useState<CrmSettingsRecord | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplateDraft(null));
  const [captureComposerLinesInTemplate, setCaptureComposerLinesInTemplate] = useState(false);
  const [composer, setComposer] = useState<QuoteComposerDraft>(() => composerFromDefaults(props.clients, props.tenantUsers, null, null, undefined));
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("all");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading quotes...");
  const [busy, setBusy] = useState("");
  const [portalLinks, setPortalLinks] = useState<Record<string, string>>({});
  const [renewalDays, setRenewalDays] = useState(30);
  const [sendDraft, setSendDraft] = useState<SendDraft>({ mode: "email", target: "", subject: "", bodyText: "", note: "" });
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId);
  const selectedClient = props.clients.find((client) => client.id === selectedQuote?.clientId);
  const composerClient = props.clients.find((client) => client.id === composer.clientId);
  const selectedTemplate = templates.find((template) => template.id === composer.templateId);
  const selectedSalesperson = props.tenantUsers.find((user) => user.id === composer.salespersonUserId);
  const visibleCatalogItems = (settingsRecord?.catalogItems ?? [])
    .filter((item) => item.visible)
    .sort((left, right) => left.name.localeCompare(right.name));
  const draftTotals = calculateDraftTotals(composer.items, composer.discountKind, composer.discountValue, composer.taxRate);
  const selectedQuoteBlockedReason = selectedQuote ? quoteApprovalBlockedReason(selectedQuote) : null;
  const selectedQuoteDominantAction = selectedQuote ? quoteDominantAction(selectedQuote) : null;
  const selectedQuoteCanEdit = selectedQuote ? quoteCanEdit(selectedQuote) : false;
  const selectedQuoteCanSend = selectedQuote ? quoteCanSend(selectedQuote) : false;
  const selectedQuoteCanManualApprove = selectedQuote ? quoteCanManualApprove(selectedQuote) : false;
  const selectedQuoteCanRenew = selectedQuote ? quoteCanRenew(selectedQuote) : false;
  const selectedQuoteCanConvertToJob = selectedQuote ? quoteCanConvertToJob(selectedQuote) : false;
  const selectedQuoteCanCreateInvoice = selectedQuote ? quoteCanCreateInvoice(selectedQuote) : false;

  async function refresh(): Promise<void> {
    try {
      const [quotesBody, templatesBody] = await Promise.all([
        fetch(`/api/crm/quotes?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<QuotesResponse>),
        fetch(`/api/crm/quote-templates?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<TemplatesResponse>)
      ]);
      if (!quotesBody.ok) {
        setQuotes([]);
        setStatusMessage(quotesBody.error ?? "Quotes are unavailable right now.");
        return;
      }
      if (!templatesBody.ok || !templatesBody.settings) {
        setTemplates([]);
        setStatusMessage(templatesBody.error ?? "Quote settings are unavailable right now.");
        return;
      }
      const nextQuotes = quotesBody.quotes ?? [];
      const nextTemplates = templatesBody.templates ?? [];
      setSettingsRecord(templatesBody.settings);
      const nextSettingsDraft = settingsDraftFromRecord(templatesBody.settings);
      setQuotes(nextQuotes);
      setTemplates(nextTemplates);
      setSettingsDraft(nextSettingsDraft);
      setTemplateDraft((current) => current.id ? current : emptyTemplateDraft(nextSettingsDraft));
      setRenewalDays(templatesBody.settings.quoteDefaults.expiryDays);
      setSelectedQuoteId((current) => current && nextQuotes.some((quote) => quote.id === current) ? current : nextQuotes[0]?.id ?? "");
      setComposer((current) => current.clientId || current.items.length || current.title
        ? current
        : composerFromDefaults(props.clients, props.tenantUsers, templatesBody.settings, nextSettingsDraft, nextTemplates[0]));
      setStatusMessage(nextQuotes.length ? `${nextQuotes.length} quote${nextQuotes.length === 1 ? "" : "s"} loaded.` : "No quotes yet. Build one from the composer.");
    } catch {
      setQuotes([]);
      setTemplates([]);
      setSettingsRecord(null);
      setStatusMessage("Quote APIs are unreachable.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  useEffect(() => {
    if (props.initialFilter) {
      setQuoteFilter(props.initialFilter);
    }
  }, [props.initialFilter]);

  useEffect(() => {
    function handleMutation(): void {
      void refresh();
    }
    window.addEventListener("nexops:crm-mutated", handleMutation);
    return () => window.removeEventListener("nexops:crm-mutated", handleMutation);
  }, [props.tenantId]);

  useEffect(() => {
    if (!props.focusedQuoteId) {
      return;
    }
    if (props.focusedQuoteId === selectedQuoteId) {
      return;
    }
    if (quotes.some((quote) => quote.id === props.focusedQuoteId)) {
      setSelectedQuoteId(props.focusedQuoteId);
    }
  }, [props.focusedQuoteId, quotes, selectedQuoteId]);

  useEffect(() => {
    if (!settingsDraft || composer.clientId || !props.clients.length) {
      return;
    }
    setComposer(composerFromDefaults(props.clients, props.tenantUsers, settingsRecord, settingsDraft, templates[0]));
  }, [props.clients, props.tenantUsers, settingsRecord, settingsDraft, templates, composer.clientId]);

  useEffect(() => {
    if (!composer.clientId) {
      return;
    }
    const client = props.clients.find((candidate) => candidate.id === composer.clientId);
    setComposer((current) => {
      if (current.editingQuoteId) {
        return current;
      }
      return {
        ...current,
        title: current.title.trim() ? current.title : quoteTitle(selectedTemplate, client),
        deliveryTarget: current.deliveryMode === "sms"
          ? current.deliveryTarget || client?.phones[0] || ""
          : current.deliveryTarget || client?.emails[0] || ""
      };
    });
  }, [composer.clientId, props.clients, selectedTemplate]);

  useEffect(() => {
    if (!selectedQuote) {
      return;
    }
    setSendDraft(defaultQuoteSendDraft(selectedQuote, selectedClient, settingsRecord, portalLinks[selectedQuote.id]));
  }, [selectedQuoteId, selectedClient, settingsRecord, portalLinks, selectedQuote]);

  function resetComposer(templateId = templates[0]?.id ?? ""): void {
    const template = templates.find((candidate) => candidate.id === templateId) ?? templates[0];
    setComposer(composerFromDefaults(props.clients, props.tenantUsers, settingsRecord, settingsDraft, template));
  }

  function applyTemplate(templateId: string): void {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) {
      setComposer((current) => ({ ...current, templateId: "" }));
      return;
    }
    setComposer((current) => ({
      ...current,
      editingQuoteId: "",
      templateId,
      title: quoteTitle(template, props.clients.find((client) => client.id === current.clientId)),
      items: template.defaultLineItems?.length ? template.defaultLineItems.map(lineDraftFromQuoteItem) : current.items,
      terms: template.terms ?? settingsDraft?.terms ?? "",
      requireSignature: template.defaultApprovalRules.requireSignature,
      requireDeposit: template.defaultApprovalRules.requireDeposit,
      requireCardOnFile: template.defaultApprovalRules.requireCardOnFile,
      depositKind: template.defaultApprovalRules.depositKind ?? "percent",
      depositValue: template.defaultApprovalRules.depositValue ?? 0,
      expiryDate: ""
    }));
  }

  function updateLine(rowIdValue: string, patch: Partial<QuoteLineDraft>): void {
    setComposer((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.rowId !== rowIdValue) {
          return item;
        }
        const next = { ...item, ...patch };
        if (next.kind === "catalog" && next.catalogCode) {
          const source = catalogItem(settingsRecord?.catalogItems ?? [], next.catalogCode);
          if (source) {
            return {
              ...next,
              code: source.code,
              name: source.name,
              description: next.description || source.description,
              unitPrice: patch.unitPrice !== undefined ? next.unitPrice : roundMoney(source.price)
            };
          }
        }
        return next;
      })
    }));
  }

  function addCatalogLine(item: ProductServiceCatalogItem): void {
    setComposer((current) => ({
      ...current,
      items: [...current.items, lineDraftFromCatalogItem(item)]
    }));
    setCatalogPickerOpen(false);
    setCatalogSearch("");
  }


  async function saveSettings(): Promise<void> {
    if (!settingsDraft) {
      return;
    }
    setBusy("save-settings");
    setStatusMessage("Saving quote settings...");
    try {
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          documentNumbering: {
            request: settingsDraft.documentNumbering.request,
            quote: settingsDraft.documentNumbering.quote,
            job: settingsDraft.documentNumbering.job,
            invoice: settingsDraft.documentNumbering.invoice,
            receipt: settingsDraft.documentNumbering.receipt
          },
          quoteDefaults: {
            expiryDays: settingsDraft.expiryDays,
            autoSaveCardOnDeposit: settingsDraft.autoSaveCardOnDeposit,
            approvalRules: {
              requireSignature: settingsDraft.requireSignature,
              requireDeposit: settingsDraft.requireDeposit,
              requireCardOnFile: settingsDraft.requireCardOnFile,
              depositKind: settingsDraft.depositKind,
              depositValue: settingsDraft.depositValue
            },
            terms: settingsDraft.terms
          }
        })
      }).then((response) => response.json() as Promise<SettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Quote settings could not be saved.");
        return;
      }
      setSettingsRecord(body.settings);
      const nextDraft = settingsDraftFromRecord(body.settings);
      setSettingsDraft(nextDraft);
      setStatusMessage("Quote settings saved.");
    } catch {
      setStatusMessage("Quote settings save failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveTemplate(): Promise<void> {
    if (!templateDraft.name.trim() || !settingsDraft) {
      setStatusMessage("Give the template a name first.");
      return;
    }
    setBusy("save-template");
    setStatusMessage(templateDraft.id ? "Saving template..." : "Creating template...");
    try {
      const payload = {
        tenantId: props.tenantId,
        name: templateDraft.name.trim(),
        ...(templateDraft.description.trim() ? { description: templateDraft.description.trim() } : {}),
        ...(templateDraft.titlePrefix.trim() ? { titlePrefix: templateDraft.titlePrefix.trim() } : {}),
        ...(templateDraft.expiryDays.trim() ? { expiryDays: Number(templateDraft.expiryDays) } : {}),
        ...(templateDraft.terms.trim() ? { terms: templateDraft.terms.trim() } : {}),
        defaultApprovalRules: {
          requireSignature: templateDraft.requireSignature,
          requireDeposit: templateDraft.requireDeposit,
          requireCardOnFile: templateDraft.requireCardOnFile,
          ...(templateDraft.requireDeposit || templateDraft.requireCardOnFile ? { depositKind: templateDraft.depositKind, depositValue: templateDraft.depositValue } : {})
        },
        ...(captureComposerLinesInTemplate ? { defaultLineItems: templateLineItemsFromComposer(composer.items) } : {})
      };
      const body = await fetch(templateDraft.id ? `/api/crm/quote-templates/${encodeURIComponent(templateDraft.id)}` : "/api/crm/quote-templates", {
        method: templateDraft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then((response) => response.json() as Promise<TemplateMutationResponse>);
      if (!body.ok || !body.template) {
        setStatusMessage(body.error ?? "Template could not be saved.");
        return;
      }
      await refresh();
      setTemplateDraft(templateDraftFromRecord(body.template));
      setStatusMessage(`${body.template.name} saved.`);
    } catch {
      setStatusMessage("Template save failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveQuote(): Promise<void> {
    if (!canSaveComposer(composer)) {
      setStatusMessage("Client, title, and valid line items are required before the quote can be saved.");
      return;
    }
    setBusy("save-quote");
    setStatusMessage(composer.editingQuoteId ? "Saving quote changes..." : "Creating quote...");
    try {
      const body = await fetch(composer.editingQuoteId ? `/api/crm/quotes/${encodeURIComponent(composer.editingQuoteId)}` : "/api/crm/quotes", {
        method: composer.editingQuoteId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quotePayload(composer, props.tenantId))
      }).then((response) => response.json() as Promise<QuoteMutationResponse>);
      if (!body.ok || !body.quote) {
        setStatusMessage(body.error ?? "Quote save failed.");
        return;
      }
      if (body.portalUrl) {
        setPortalLinks((current) => ({ ...current, [body.quote!.id]: body.portalUrl! }));
      }
      setStatusMessage(`${body.quote.number ?? body.quote.id} saved.`);
      await refresh();
      setSelectedQuoteId(body.quote.id);
      props.onCrmMutation?.();
      resetComposer(composer.templateId);
    } catch {
      setStatusMessage("Quote save failed.");
    } finally {
      setBusy("");
    }
  }

  async function runQuoteAction(action: "manual-approve" | "renew" | "convert-to-job" | "invoice" | "send"): Promise<void> {
    if (!selectedQuote) {
      return;
    }
    const route = action === "manual-approve"
      ? `/api/crm/quotes/${encodeURIComponent(selectedQuote.id)}/manual-approve`
      : action === "renew"
        ? `/api/crm/quotes/${encodeURIComponent(selectedQuote.id)}/renew`
        : action === "convert-to-job"
          ? `/api/crm/quotes/${encodeURIComponent(selectedQuote.id)}/convert-to-job`
          : action === "invoice"
            ? `/api/crm/quotes/${encodeURIComponent(selectedQuote.id)}/invoice`
            : `/api/crm/quotes/${encodeURIComponent(selectedQuote.id)}/send`;
    const payload = action === "renew"
      ? { tenantId: props.tenantId, expiryDays: renewalDays }
      : action === "send"
        ? {
            tenantId: props.tenantId,
            mode: sendDraft.mode,
            ...(sendDraft.target.trim() ? { target: sendDraft.target.trim() } : {}),
            ...(sendDraft.subject.trim() ? { subject: sendDraft.subject.trim() } : {}),
            ...(sendDraft.bodyText.trim() ? { bodyText: sendDraft.bodyText.trim() } : {}),
            ...(sendDraft.note.trim() ? { note: sendDraft.note.trim() } : {})
          }
        : { tenantId: props.tenantId };
    const labels: Record<typeof action, string> = {
      "manual-approve": "Approving quote...",
      renew: "Renewing quote...",
      "convert-to-job": "Converting quote to job...",
      invoice: "Creating invoice...",
      send: "Sending quote..."
    };
    setBusy(action);
    setStatusMessage(labels[action]);
    try {
      const body = await fetch(route, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then((response) => response.json() as Promise<QuoteMutationResponse>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Quote action failed.");
        return;
      }
      if (body.portalUrl && body.quote) {
        setPortalLinks((current) => ({ ...current, [body.quote!.id]: body.portalUrl! }));
      }
      await refresh();
      props.onCrmMutation?.();
      if (action === "convert-to-job" && body.job) {
        setStatusMessage(`Job ${body.job.number ?? body.job.id} created from ${selectedQuote.number ?? selectedQuote.id}.`);
      } else if (action === "invoice" && body.invoice) {
        setStatusMessage(`Invoice ${body.invoice.number ?? body.invoice.id} created from ${selectedQuote.number ?? selectedQuote.id}.`);
      } else if (action === "send" && body.delivery) {
        setStatusMessage(`${selectedQuote.number ?? selectedQuote.id} sent by ${body.delivery.mode}.`);
      } else if (action === "manual-approve") {
        setStatusMessage(`${selectedQuote.number ?? selectedQuote.id} approved internally.`);
      } else {
        setStatusMessage(`${selectedQuote.number ?? selectedQuote.id} renewed with a fresh approval link.`);
      }
    } catch {
      setStatusMessage("Quote action failed.");
    } finally {
      setBusy("");
    }
  }

  async function copyPortalLink(): Promise<void> {
    if (!selectedQuote) {
      return;
    }
    const link = portalLinks[selectedQuote.id];
    if (!link) {
      setStatusMessage("Send or renew the quote first so there is a live client link to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setStatusMessage("Portal link copied.");
    } catch {
      setStatusMessage("Clipboard blocked here. Copy the link manually.");
    }
  }

  function runSurfaceAction(action: QuoteSurfaceAction): void {
    if (!selectedQuote) {
      return;
    }
    switch (action) {
      case "send":
        void runQuoteAction("send");
        return;
      case "manual-approve":
        void runQuoteAction("manual-approve");
        return;
      case "renew":
        void runQuoteAction("renew");
        return;
      case "convert-to-job":
        void runQuoteAction("convert-to-job");
        return;
      case "invoice":
        void runQuoteAction("invoice");
        return;
      case "copy-portal":
        void copyPortalLink();
        return;
      case "edit":
        setComposer(composerFromQuote(selectedQuote, selectedClient));
        return;
      case "none":
      default:
        return;
    }
  }

  const filteredQuotes = quotes.filter((quote) => {
    if (!quoteMatchesFilter(quote, quoteFilter)) {
      return false;
    }
    if (!quoteSearch.trim()) {
      return true;
    }
    const needle = quoteSearch.trim().toLowerCase();
    const client = props.clients.find((candidate) => candidate.id === quote.clientId);
    return [
      quote.number,
      quote.title,
      quote.status,
      clientDisplayName(client),
      ...(client?.emails ?? []),
      ...(client?.phones ?? [])
    ].some((value) => String(value ?? "").toLowerCase().includes(needle));
  });

  const counts = {
    all: quotes.length,
    draft: quotes.filter((quote) => quote.status === "draft").length,
    sent: quotes.filter((quote) => quote.status === "sent").length,
    change_requested: quotes.filter((quote) => quote.status === "change_requested").length,
    approved: quotes.filter((quote) => quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed").length,
    approved_pending_conversion: quotes.filter((quote) => (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") && !quote.convertedJobId).length,
    expired: quotes.filter((quote) => quote.status === "expired").length
  };

  useEffect(() => {
    if (!filteredQuotes.length) {
      if (selectedQuoteId) {
        setSelectedQuoteId("");
      }
      return;
    }
    if (!filteredQuotes.some((quote) => quote.id === selectedQuoteId)) {
      setSelectedQuoteId(filteredQuotes[0]?.id ?? "");
    }
  }, [filteredQuotes, selectedQuoteId]);

  const selectedQuoteSalesperson = selectedQuote?.salespersonUserId
    ? props.tenantUsers.find((user) => user.id === selectedQuote.salespersonUserId)
    : undefined;
  const selectedQuoteProminentFacts = prominentIntakeFacts(selectedQuote?.intake, "quote");
  const selectedQuoteCarryForwardFacts = intakeDetailFacts(selectedQuote?.intake, "quote", 10);

  return (
    <section className="nexops-module-page quote-engine-page">
      <div className="nexops-page-heading">
        <div>
          <NexOpsPageTitle module="quotes">Quotes</NexOpsPageTitle>
          <p>Real numbering, real templates, real delivery, and the client approval gate all live on this rail now.</p>
        </div>
        <div className="nexops-inline-actions">
          <button type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>Refresh</button>
          <button type="button" onClick={() => resetComposer()} disabled={Boolean(busy)}>New Quote</button>
        </div>
      </div>

      <div className="nexops-workflow-strip">
        <article>
          <span>Draft</span>
          <strong>{counts.draft}</strong>
          <p>Still in office build mode.</p>
        </article>
        <article>
          <span>Sent</span>
          <strong>{counts.sent}</strong>
          <p>Client approval link is live.</p>
        </article>
        <article>
          <span>Needs Changes</span>
          <strong>{counts.change_requested}</strong>
          <p>Client asked for revisions.</p>
        </article>
        <article>
          <span>Approved</span>
          <strong>{counts.approved}</strong>
          <p>Ready to convert to a job.</p>
        </article>
        <article>
          <span>Expired</span>
          <strong>{counts.expired}</strong>
          <p>Renew to rotate the link.</p>
        </article>
      </div>

      <div className="nexops-module-grid nexops-module-grid-wide">
        <article className="nexops-module-card nexops-quote-composer-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Single-Page Composer</p>
              <h2>{composer.editingQuoteId ? "Edit Quote" : "Build a Quote"}</h2>
            </div>
            <div className="nexops-inline-actions">
              {composer.editingQuoteId ? <button type="button" onClick={() => resetComposer(composer.templateId)} disabled={Boolean(busy)}>Stop Editing</button> : null}
              <button type="button" onClick={() => void saveQuote()} disabled={Boolean(busy) || !canSaveComposer(composer)}>
                {busy === "save-quote" ? "Saving..." : composer.editingQuoteId ? "Save Changes" : "Create Quote"}
              </button>
            </div>
          </div>

          <div className="nexops-quote-composer-grid">
            <section className="nexops-quote-panel">
              <div className="nexops-quote-section-head">
                <h3>Basics</h3>
                <span>{composer.editingQuoteId ? "Loaded from an existing quote." : "Choose the client and title first."}</span>
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Client</span>
                  <select value={composer.clientId} onChange={(event) => setComposer((current) => ({ ...current, clientId: event.target.value }))}>
                    <option value="">Select Client</option>
                    {props.clients.map((client) => <option value={client.id} key={client.id}>{clientDisplayName(client)}</option>)}
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Template</span>
                  <select value={composer.templateId} onChange={(event) => applyTemplate(event.target.value)}>
                    <option value="">No Template</option>
                    {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Salesperson / Rep</span>
                  <select value={composer.salespersonUserId} onChange={(event) => setComposer((current) => ({ ...current, salespersonUserId: event.target.value }))}>
                    <option value="">Assign Later</option>
                    {props.tenantUsers.filter((user) => user.active).map((user) => (
                      <option value={user.id} key={user.id}>{user.displayName} ({user.role.replaceAll("_", " ")})</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="nexops-field">
                <span>Quote Title</span>
                <input value={composer.title} onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <div className="nexops-quote-summary-pills">
                <span>{composerClient ? clientDisplayName(composerClient) : "No Client Selected"}</span>
                <span>{selectedTemplate?.name ?? "Manual Build"}</span>
                <span>{selectedSalesperson?.displayName ?? "Salesperson Not Assigned"}</span>
                <span>{draftTotals.total ? `${money(draftTotals.total)} Preview Total` : "No Total Yet"}</span>
              </div>
            </section>

            <section className="nexops-quote-panel">
              <div className="nexops-quote-section-head">
                <h3>Line Items</h3>
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => setCatalogPickerOpen(true)}>Add Line Item</button>
                </div>
              </div>
              {!composer.items.length ? (
                <div className="nexops-catalog-picker-empty">
                  <strong>No Line Items Yet</strong>
                  <small>Pick from Products &amp; Services or create one on the fly, then edit the price or description per quote if needed.</small>
                </div>
              ) : null}
              <div className="nexops-quote-line-list">
                {composer.items.map((item) => (
                  <div className="nexops-quote-line-card" key={item.rowId}>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Catalog Code</span>
                        <input value={item.catalogCode || item.code} onChange={(event) => updateLine(item.rowId, { catalogCode: event.target.value, code: event.target.value })} />
                      </label>
                      <label className="nexops-field">
                        <span>Saved Source</span>
                        <input value={item.kind === "catalog" ? "Catalog Item" : "Manual Line"} disabled />
                      </label>
                    </div>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Name</span>
                        <input value={item.name} onChange={(event) => updateLine(item.rowId, { name: event.target.value })} />
                      </label>
                      <label className="nexops-field">
                        <span>Description</span>
                        <input value={item.description} onChange={(event) => updateLine(item.rowId, { description: event.target.value })} />
                      </label>
                    </div>
                    <div className="nexops-request-builder-grid nexops-quote-line-metrics">
                      <label className="nexops-field">
                        <span>Qty</span>
                        <input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateLine(item.rowId, { quantity: Math.max(1, Number(event.target.value || 1)) })} />
                      </label>
                      <label className="nexops-field">
                        <span>Unit Price</span>
                        <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(item.rowId, { unitPrice: Math.max(0, Number(event.target.value || 0)) })} />
                      </label>
                      <label className="nexops-check-field inline">
                        <input type="checkbox" checked={item.clientSelectable} onChange={(event) => updateLine(item.rowId, { clientSelectable: event.target.checked })} />
                        Client can opt in later
                      </label>
                      <label className="nexops-check-field inline">
                        <input type="checkbox" checked={item.defaultSelected} onChange={(event) => updateLine(item.rowId, { defaultSelected: event.target.checked })} />
                        Selected by default
                      </label>
                    </div>
                    <div className="nexops-quote-line-footer">
                      <strong>{money(roundMoney(item.quantity * item.unitPrice))}</strong>
                      <button type="button" onClick={() => setComposer((current) => ({ ...current, items: current.items.filter((candidate) => candidate.rowId !== item.rowId) }))} disabled={composer.items.length === 1}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="nexops-quote-panel">
              <div className="nexops-quote-section-head">
                <h3>Approval Rules</h3>
                <span>Client approval must satisfy these. Internal approval can bypass them later.</span>
              </div>
              <div className="nexops-quote-toggle-grid">
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={composer.requireSignature} onChange={(event) => setComposer((current) => ({ ...current, requireSignature: event.target.checked }))} />
                  Require Signature
                </label>
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={composer.requireDeposit} onChange={(event) => setComposer((current) => ({ ...current, requireDeposit: event.target.checked }))} />
                  Require Deposit
                </label>
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={composer.requireCardOnFile} onChange={(event) => setComposer((current) => ({ ...current, requireCardOnFile: event.target.checked }))} />
                  Require Card on File
                </label>
              </div>
              {composer.requireDeposit || composer.requireCardOnFile ? (
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Deposit Type</span>
                    <select value={composer.depositKind} onChange={(event) => setComposer((current) => ({ ...current, depositKind: event.target.value as DepositKind }))}>
                      <option value="amount">Flat amount</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Deposit Value</span>
                    <input type="number" min="0" step="0.01" value={composer.depositValue} onChange={(event) => setComposer((current) => ({ ...current, depositValue: Math.max(0, Number(event.target.value || 0)) }))} />
                  </label>
                </div>
              ) : null}
              <p className="nexops-form-note">{approvalSummary({
                requireSignature: composer.requireSignature,
                requireDeposit: composer.requireDeposit,
                requireCardOnFile: composer.requireCardOnFile,
                depositKind: composer.depositKind,
                depositValue: composer.depositValue
              })}</p>
            </section>

            <section className="nexops-quote-panel">
              <div className="nexops-quote-section-head">
                <h3>Expiry and Terms</h3>
                <span>Leave expiry blank to use the template or tenant default.</span>
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Expiry Date Override</span>
                  <input type="date" value={composer.expiryDate} onChange={(event) => setComposer((current) => ({ ...current, expiryDate: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Tax Rate (%)</span>
                  <input type="number" min="0" step="0.01" value={composer.taxRate} onChange={(event) => setComposer((current) => ({ ...current, taxRate: Math.max(0, Number(event.target.value || 0)) }))} />
                </label>
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Discount Kind</span>
                  <select value={composer.discountKind} onChange={(event) => setComposer((current) => ({ ...current, discountKind: event.target.value as DiscountKind }))}>
                    <option value="amount">Flat amount</option>
                    <option value="percent">Percent</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Discount Value</span>
                  <input type="number" min="0" step="0.01" value={composer.discountValue} onChange={(event) => setComposer((current) => ({ ...current, discountValue: Math.max(0, Number(event.target.value || 0)) }))} />
                </label>
              </div>
              <label className="nexops-field">
                <span>Terms and Disclaimer</span>
                <textarea rows={6} value={composer.terms} onChange={(event) => setComposer((current) => ({ ...current, terms: event.target.value }))} />
              </label>
              <PaymentScheduleEditor
                value={composer.paymentSchedule}
                onChange={(paymentSchedule) => setComposer((current) => ({ ...current, paymentSchedule }))}
                title="Payment Schedule"
                hint="Set deposit and milestone billing now, then edit it again later from the job or invoice side."
              />
            </section>

            <section className="nexops-quote-panel">
              <div className="nexops-quote-section-head">
                <h3>Send</h3>
                <span>Email, SMS, or mark sent without an electronic delivery.</span>
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Delivery Mode</span>
                  <select value={composer.deliveryMode} onChange={(event) => setComposer((current) => ({ ...current, deliveryMode: event.target.value as DeliveryMode }))}>
                    <option value="draft">Save as Draft</option>
                    <option value="email">Create and Email</option>
                    <option value="sms">Create and Text</option>
                    <option value="mark_sent">Create and Mark Sent</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Target</span>
                  <input
                    value={composer.deliveryTarget}
                    onChange={(event) => setComposer((current) => ({ ...current, deliveryTarget: event.target.value }))}
                    placeholder={composer.deliveryMode === "sms" ? (composerClient?.phones[0] ?? "Use client phone") : (composerClient?.emails[0] ?? "Use client email")}
                  />
                </label>
              </div>
              <label className="nexops-field">
                <span>Internal Note</span>
                <input value={composer.deliveryNote} onChange={(event) => setComposer((current) => ({ ...current, deliveryNote: event.target.value }))} placeholder="Optional delivery context" />
              </label>
              <div className="nexops-quote-totals">
                <article>
                  <span>Subtotal</span>
                  <strong>{money(draftTotals.subtotal)}</strong>
                </article>
                <article>
                  <span>Discount</span>
                  <strong>{money(draftTotals.discount ?? 0)}</strong>
                </article>
                <article>
                  <span>Tax</span>
                  <strong>{money(draftTotals.tax)}</strong>
                </article>
                <article>
                  <span>Total</span>
                  <strong>{money(draftTotals.total)}</strong>
                </article>
              </div>
            </section>
          </div>
        </article>

        <article className="nexops-module-card">
          <p className="eyebrow">Settings and Templates</p>
          <h2>Quote Defaults</h2>
          <p>{statusMessage}</p>
          {settingsDraft ? (
            <>
              <div className="nexops-quote-numbering-grid">
                {(["request", "quote", "job", "invoice", "receipt"] as DocumentKind[]).map((kind) => (
                  <section key={kind}>
                    <h3>{kind}</h3>
                    <label className="nexops-field">
                      <span>Prefix</span>
                      <input value={settingsDraft.documentNumbering[kind].prefix} onChange={(event) => setSettingsDraft((current) => current ? {
                        ...current,
                        documentNumbering: {
                          ...current.documentNumbering,
                          [kind]: { ...current.documentNumbering[kind], prefix: event.target.value }
                        }
                      } : current)} />
                    </label>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Separator</span>
                        <input value={settingsDraft.documentNumbering[kind].separator} onChange={(event) => setSettingsDraft((current) => current ? {
                          ...current,
                          documentNumbering: {
                            ...current.documentNumbering,
                            [kind]: { ...current.documentNumbering[kind], separator: event.target.value }
                          }
                        } : current)} />
                      </label>
                      <label className="nexops-field">
                        <span>Pad Width</span>
                        <input type="number" min="1" step="1" value={settingsDraft.documentNumbering[kind].padWidth} onChange={(event) => setSettingsDraft((current) => current ? {
                          ...current,
                          documentNumbering: {
                            ...current.documentNumbering,
                            [kind]: { ...current.documentNumbering[kind], padWidth: Math.max(1, Number(event.target.value || 1)) }
                          }
                        } : current)} />
                      </label>
                    </div>
                  </section>
                ))}
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Default Expiry Days</span>
                  <input type="number" min="1" step="1" value={settingsDraft.expiryDays} onChange={(event) => setSettingsDraft((current) => current ? { ...current, expiryDays: Math.max(1, Number(event.target.value || 1)) } : current)} />
                </label>
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={settingsDraft.autoSaveCardOnDeposit} onChange={(event) => setSettingsDraft((current) => current ? { ...current, autoSaveCardOnDeposit: event.target.checked } : current)} />
                  Auto-Save Card on Any Deposit
                </label>
              </div>
              <div className="nexops-quote-toggle-grid">
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={settingsDraft.requireSignature} onChange={(event) => setSettingsDraft((current) => current ? { ...current, requireSignature: event.target.checked } : current)} />
                  Default Signature Gate
                </label>
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={settingsDraft.requireDeposit} onChange={(event) => setSettingsDraft((current) => current ? { ...current, requireDeposit: event.target.checked } : current)} />
                  Default Deposit Gate
                </label>
                <label className="nexops-check-field inline">
                  <input type="checkbox" checked={settingsDraft.requireCardOnFile} onChange={(event) => setSettingsDraft((current) => current ? { ...current, requireCardOnFile: event.target.checked } : current)} />
                  Default Card-on-File Gate
                </label>
              </div>
              {(settingsDraft.requireDeposit || settingsDraft.requireCardOnFile) ? (
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Default Deposit Type</span>
                    <select value={settingsDraft.depositKind} onChange={(event) => setSettingsDraft((current) => current ? { ...current, depositKind: event.target.value as DepositKind } : current)}>
                      <option value="amount">Flat amount</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Default Deposit Value</span>
                    <input type="number" min="0" step="0.01" value={settingsDraft.depositValue} onChange={(event) => setSettingsDraft((current) => current ? { ...current, depositValue: Math.max(0, Number(event.target.value || 0)) } : current)} />
                  </label>
                </div>
              ) : null}
              <label className="nexops-field">
                <span>Tenant Default Terms</span>
                <textarea rows={4} value={settingsDraft.terms} onChange={(event) => setSettingsDraft((current) => current ? { ...current, terms: event.target.value } : current)} />
              </label>
              <div className="nexops-inline-actions">
                <button type="button" onClick={() => void saveSettings()} disabled={Boolean(busy)}>{busy === "save-settings" ? "Saving..." : "Save Quote Settings"}</button>
              </div>

              <QuoteTemplateEditor
                templates={templates}
                draft={templateDraft}
                captureComposerLines={captureComposerLinesInTemplate}
                busy={busy === "save-template"}
                onSelect={(template) => setTemplateDraft(templateDraftFromRecord(template))}
                onClear={() => setTemplateDraft(emptyTemplateDraft(settingsDraft))}
                onDraftChange={setTemplateDraft}
                onCaptureComposerLinesChange={setCaptureComposerLinesInTemplate}
                onSave={() => void saveTemplate()}
              />
            </>
          ) : (
            <p>Quote defaults are still loading.</p>
          )}
        </article>
      </div>

      <div className="nexops-two-column">
        <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Quote List</p>
              <h2>{filteredQuotes.length} visible</h2>
            </div>
            <div className="nexops-inline-actions">
              <input placeholder="Search quotes" value={quoteSearch} onChange={(event) => setQuoteSearch(event.target.value)} />
            </div>
          </div>
          <div className="nexops-jobs-filter-row" aria-label="Quote status filters">
            {QUOTE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`nexops-jobs-filter-pill${quoteFilter === filter.value ? " active" : ""}`}
                onClick={() => setQuoteFilter(filter.value)}
              >
                <span>{filter.label}</span>
                <small>{counts[filter.value]}</small>
              </button>
            ))}
          </div>
          <ul className="nexops-record-list">
            {filteredQuotes.map((quote) => {
              const client = props.clients.find((candidate) => candidate.id === quote.clientId);
              return (
                <li className={quote.id === selectedQuoteId ? "selected" : ""} key={quote.id}>
                  <button className="nexops-request-row-button" type="button" onClick={() => setSelectedQuoteId(quote.id)}>
                    <span>
                      <strong>{quote.number ?? quote.id}</strong>
                      <small>{quote.title}</small>
                      <small>{clientDisplayName(client)} - {formatTimestamp(quote.updatedAt ?? quote.createdAt)}</small>
                    </span>
                    <mark>{quoteStatusLabel(quote.status)}</mark>
                    <b>{money(quote.totals.total)}</b>
                  </button>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="nexops-module-card">
          {selectedQuote ? (
            <div className="nexops-quote-detail">
              <div className="nexops-page-heading">
                <div>
              <p className="eyebrow">Quote Detail</p>
                  <h2>{selectedQuote.number ?? selectedQuote.id}</h2>
                  <p>{selectedQuote.title}</p>
                </div>
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => setComposer(composerFromQuote(selectedQuote, selectedClient))} disabled={Boolean(busy) || !selectedQuoteCanEdit}>Edit in Composer</button>
                  <a href={`/api/crm/quotes/${encodeURIComponent(selectedQuote.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} rel="noreferrer" target="_blank">Open PDF</a>
                  <button type="button" onClick={() => void copyPortalLink()} disabled={Boolean(busy)}>Copy Portal Link</button>
                </div>
              </div>
              <div className="nexops-jobs-filter-row" aria-label="Quote detail filters">
                {QUOTE_FILTERS.map((filter) => (
                  <button
                    key={`detail-${filter.value}`}
                    type="button"
                    className={`nexops-jobs-filter-pill${quoteFilter === filter.value ? " active" : ""}`}
                    onClick={() => setQuoteFilter(filter.value)}
                  >
                    <span>{filter.label}</span>
                    <small>{counts[filter.value]}</small>
                  </button>
                ))}
              </div>

              <div className="nexops-density-inline-facts">
                <article>
                  <h3>Client</h3>
                  <p>{clientDisplayName(selectedClient)}</p>
                  <small>{selectedClient?.emails[0] ?? "No email"} | {selectedClient?.phones[0] ?? "No phone"}</small>
                </article>
                <article>
                  <h3>Status</h3>
                  <p>{quoteStatusLabel(selectedQuote.status)}</p>
                  <small>{quoteApprovalSummaryLabel(selectedQuote)} | Approved: {formatTimestamp(selectedQuote.approvedAt)}</small>
                </article>
                <article>
                  <h3>Expiry</h3>
                  <p>{selectedQuote.expiresAt ? new Date(selectedQuote.expiresAt).toLocaleDateString() : "Uses default window"}</p>
                  <small>Version {selectedQuote.version ?? 1}</small>
                </article>
                <article>
                  <h3>Approval Policy</h3>
                  <p>{approvalSummary(selectedQuote.approvalRules)}</p>
                  <small>{selectedQuote.approvedBy ? `Approved by ${selectedQuote.approvedBy}` : "No approval yet"}</small>
                </article>
                <article>
                  <h3>Salesperson / Rep</h3>
                  <p>{selectedQuoteSalesperson?.displayName ?? "Unassigned"}</p>
                  <small>{selectedQuoteSalesperson ? selectedQuoteSalesperson.role.replaceAll("_", " ") : "Defaults to the quote creator until reassigned"}</small>
                </article>
              </div>

              {selectedQuoteProminentFacts.length ? (
                <div className="nexops-request-alert-strip">
                  {selectedQuoteProminentFacts.map((fact) => (
                    <span key={`${selectedQuote.id}-${fact.key}`}>{fact.label}: {fact.text}</span>
                  ))}
                </div>
              ) : null}

              <div className="nexops-quote-detail-grid">
                <NexopsSectionCard
                  className="nexops-density-full-span"
                  eyebrow="Commercial State"
                  title={quoteStatusLabel(selectedQuote.status)}
                  detail={quoteLifecycleNarrative(selectedQuote)}
                  actions={<NexopsStatusPill label={quoteApprovalSummaryLabel(selectedQuote)} tone={quoteStatusTone(selectedQuote.status)} />}
                >
                  <NexopsProgressStrip
                    label="Quote Lifecycle Rail"
                    detail={selectedQuote.convertedJobId ? "Commercial approval is complete and the work snapshot already exists." : "The commercial state drives whether this quote can still be edited, approved, renewed, or converted."}
                    percent={quoteLifecyclePercent(selectedQuote.status)}
                  />
                  <div className="nexops-kit-pill-row">
                    <NexopsStatusPill label={selectedQuote.approvalRules.requireSignature ? "Signature gate on" : "Signature optional"} tone={selectedQuote.approvalRules.requireSignature ? "secondary" : "quiet"} />
                    <NexopsStatusPill label={selectedQuote.approvalRules.requireDeposit ? "Deposit gate on" : "No deposit gate"} tone={selectedQuote.approvalRules.requireDeposit ? "warning" : "quiet"} />
                    <NexopsStatusPill label={selectedQuote.approvalRules.requireCardOnFile ? "Card-on-file on" : "Card optional"} tone={selectedQuote.approvalRules.requireCardOnFile ? "secondary" : "quiet"} />
                    <NexopsStatusPill label={selectedQuote.paymentSchedule?.enabled ? "Milestones staged" : "Single-stage billing"} tone={selectedQuote.paymentSchedule?.enabled ? "secondary" : "quiet"} />
                    <NexopsStatusPill label={selectedQuote.convertedJobId ? "Job snapshot exists" : "No job snapshot yet"} tone={selectedQuote.convertedJobId ? "success" : "quiet"} />
                  </div>
                  {selectedQuoteBlockedReason ? (
                    <NexopsBanner
                      tone={selectedQuote.status === "expired" ? "warning" : "blocked"}
                      title={selectedQuote.status === "expired" ? "Renewal required" : "Approval blocked"}
                      detail={selectedQuoteBlockedReason}
                    />
                  ) : null}
                  {selectedQuoteDominantAction ? (
                    <NexopsActionRail
                      dominant={(
                        <NexopsActionButton
                          label={selectedQuoteDominantAction.label}
                          hint={selectedQuoteDominantAction.hint}
                          tone={selectedQuoteDominantAction.tone}
                          disabled={Boolean(busy) || selectedQuoteDominantAction.action === "none"}
                          onClick={() => runSurfaceAction(selectedQuoteDominantAction.action)}
                        />
                      )}
                      secondary={(
                        <>
                          <NexopsActionButton label="Send" tone="secondary" disabled={Boolean(busy) || !selectedQuoteCanSend} onClick={() => runSurfaceAction("send")} />
                          <NexopsActionButton label="Manual Approve" tone="secondary" disabled={Boolean(busy) || !selectedQuoteCanManualApprove} onClick={() => runSurfaceAction("manual-approve")} />
                          <NexopsActionButton label="Convert to Job" tone="secondary" disabled={Boolean(busy) || !selectedQuoteCanConvertToJob} onClick={() => runSurfaceAction("convert-to-job")} />
                          <NexopsActionButton label="Create Invoice" tone="secondary" disabled={Boolean(busy) || !selectedQuoteCanCreateInvoice} onClick={() => runSurfaceAction("invoice")} />
                        </>
                      )}
                      utility={(
                        <>
                          <NexopsActionButton label="Edit" tone="quiet" disabled={Boolean(busy) || !selectedQuoteCanEdit} onClick={() => runSurfaceAction("edit")} />
                          <NexopsActionButton label="Renew" tone="warning" disabled={Boolean(busy) || !selectedQuoteCanRenew} onClick={() => runSurfaceAction("renew")} />
                          <NexopsActionButton label="Copy Link" tone="quiet" disabled={Boolean(busy)} onClick={() => runSurfaceAction("copy-portal")} />
                        </>
                      )}
                    />
                  ) : null}
                </NexopsSectionCard>
              </div>

              <div className="nexops-quote-detail-grid">
                <section className="nexops-quote-panel nexops-density-full-span">
                  <div className="nexops-quote-section-head">
                    <h3>Line Items</h3>
                    <span>{selectedQuote.lineItems.length} line{selectedQuote.lineItems.length === 1 ? "" : "s"} | {money(selectedQuote.totals.total)} total</span>
                  </div>
                  <div className="nexops-mini-list">
                    {selectedQuote.lineItems.map((line) => (
                      <div className="nexops-quote-detail-line" key={line.id}>
                        <span>
                          <strong>{line.code}</strong>
                          <small>{line.name}</small>
                        </span>
                        <b>{line.quantity} x {money(line.unitPrice)}</b>
                        <mark>{money(line.total)}</mark>
                      </div>
                    ))}
                  </div>
                  <div className="nexops-quote-totals compact">
                    <article>
                      <span>Subtotal</span>
                      <strong>{money(selectedQuote.totals.subtotal)}</strong>
                    </article>
                    <article>
                      <span>Discount</span>
                      <strong>{money(selectedQuote.totals.discount ?? 0)}</strong>
                    </article>
                    <article>
                      <span>Tax</span>
                      <strong>{money(selectedQuote.totals.tax)}</strong>
                    </article>
                    <article>
                      <span>Total</span>
                      <strong>{money(selectedQuote.totals.total)}</strong>
                    </article>
                  </div>
                </section>
              </div>

              <details className="nexops-quote-panel nexops-density-disclosure-panel">
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3>Request Carry-Forward</h3>
                    <small>Open for site contact, referral, promo, and the rest of the intake context now living on this quote.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  {selectedQuoteCarryForwardFacts.length ? (
                    <div className="nexops-density-inline-facts">
                      {selectedQuoteCarryForwardFacts.map((fact) => (
                        <article key={`${selectedQuote.id}-carry-${fact.key}`}>
                          <h3>{fact.label}</h3>
                          <p>{fact.text}</p>
                          <small>Still visible on the quote surface by default.</small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="nexops-empty-copy">No request-specific intake fields are attached to this quote.</p>
                  )}
                </div>
              </details>

              <details className="nexops-quote-panel nexops-density-disclosure-panel">
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3>Approval and Billing Details</h3>
                    <small>Audit proof, deposit evidence, and milestone setup live here when you need them.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  <div className="nexops-density-inline-facts">
                    <article>
                      <h3>Signature</h3>
                      <p>{selectedQuote.signature ? `${selectedQuote.signature.mode === "drawn" ? "Drawn" : "Typed"} captured` : selectedQuote.approvalRules.requireSignature ? "Required" : "Optional"}</p>
                      <small>{selectedQuote.signature ? formatTimestamp(selectedQuote.signature.signedAt) : "No captured signature yet"}</small>
                    </article>
                    <article>
                      <h3>Deposit</h3>
                      <p>{selectedQuote.approvalRules.requireDeposit ? money(quoteDepositRequirementAmount(selectedQuote)) : "Not required"}</p>
                      <small>{selectedQuote.deposit?.capturedAt ? `Captured ${formatTimestamp(selectedQuote.deposit.capturedAt)}` : "No captured deposit yet"}</small>
                    </article>
                    <article>
                      <h3>Card on File</h3>
                      <p>{selectedQuote.approvalRules.requireCardOnFile ? "Required" : "Optional"}</p>
                      <small>{selectedQuote.deposit?.cardOnFileAuthorized ? "Authorization stored" : "No authorization stored"}</small>
                    </article>
                    <article>
                      <h3>Billing Rail</h3>
                      <p>{selectedQuote.paymentSchedule?.enabled ? "Milestones active" : "Single stage"}</p>
                      <small>{quotePaymentScheduleHeadline(selectedQuote.paymentSchedule)}</small>
                    </article>
                  </div>
                  {selectedQuote.paymentSchedule?.enabled && selectedQuote.paymentSchedule.milestones.length ? (
                    <ul className="nexops-mini-list">
                      {selectedQuote.paymentSchedule.milestones.map((milestone) => (
                        <li key={milestone.id}>
                          <strong>{milestone.label}</strong>
                          <span>{quotePaymentScheduleLine(milestone, selectedQuote.totals.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>

              <details className="nexops-quote-panel nexops-density-disclosure-panel" open={selectedQuoteCanSend}>
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3>Delivery and Office Controls</h3>
                    <small>Open this only when you need to send, override, renew, or push the quote downstream.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  <div className="nexops-quote-action-stack">
                <section className="nexops-quote-panel">
                  <div className="nexops-quote-section-head">
                    <h3>Delivery</h3>
                    <span>Send by email or SMS, or mark it sent after a phone call.</span>
                  </div>
                  <div className="nexops-request-builder-grid">
                    <label className="nexops-field">
                      <span>Mode</span>
                      <select
                        value={sendDraft.mode}
                        onChange={(event) => {
                          if (!selectedQuote) {
                            return;
                          }
                          setSendDraft(defaultQuoteSendDraft(
                            selectedQuote,
                            selectedClient,
                            settingsRecord,
                            portalLinks[selectedQuote.id],
                            event.target.value as SendDraft["mode"]
                          ));
                        }}
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="mark_sent">Mark sent</option>
                      </select>
                    </label>
                    <label className="nexops-field">
                      <span>Target</span>
                      <input value={sendDraft.target} onChange={(event) => setSendDraft((current) => ({ ...current, target: event.target.value }))} placeholder={sendDraft.mode === "sms" ? (selectedClient?.phones[0] ?? "Use client phone") : (selectedClient?.emails[0] ?? "Use client email")} />
                    </label>
                  </div>
                  {sendDraft.mode !== "sms" ? (
                    <label className="nexops-field">
                      <span>Subject</span>
                      <input value={sendDraft.subject} onChange={(event) => setSendDraft((current) => ({ ...current, subject: event.target.value }))} />
                    </label>
                  ) : null}
                  <label className="nexops-field">
                    <span>Message body</span>
                    <textarea rows={5} value={sendDraft.bodyText} onChange={(event) => setSendDraft((current) => ({ ...current, bodyText: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Office note</span>
                    <input value={sendDraft.note} onChange={(event) => setSendDraft((current) => ({ ...current, note: event.target.value }))} />
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void runQuoteAction("send")} disabled={Boolean(busy) || !selectedQuoteCanSend}>{busy === "send" ? "Sending..." : selectedQuote.status === "sent" || selectedQuote.status === "approved" || selectedQuote.status === "approved_internal" || selectedQuote.status === "signed" ? "Resend Quote" : "Send Quote"}</button>
                    {portalLinks[selectedQuote.id] ? <small>{portalLinks[selectedQuote.id]}</small> : <small>Live portal link appears here after send or renew.</small>}
                  </div>
                  {!selectedQuoteCanSend && quoteSendBlockedReason(selectedQuote) ? <p className="nexops-quote-blocked-note">{quoteSendBlockedReason(selectedQuote)}</p> : null}
                </section>

                <section className="nexops-quote-panel">
                  <div className="nexops-quote-section-head">
                    <h3>Manual Overrides and Downstream</h3>
                    <span>Internal approval can bypass client-side gates. Client approval keeps signature and payment checks live.</span>
                  </div>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void runQuoteAction("manual-approve")} disabled={Boolean(busy) || !selectedQuoteCanManualApprove}>Manual Approve</button>
                    <button type="button" onClick={() => void runQuoteAction("convert-to-job")} disabled={Boolean(busy) || !selectedQuoteCanConvertToJob}>{selectedQuote.convertedJobId ? "Job Already Created" : "Convert to Job"}</button>
                    <button type="button" onClick={() => void runQuoteAction("invoice")} disabled={Boolean(busy) || !selectedQuoteCanCreateInvoice}>Create Invoice</button>
                  </div>
                  <div className="nexops-quote-blocked-list">
                    {!selectedQuoteCanManualApprove && quoteManualApproveBlockedReason(selectedQuote) ? <p className="nexops-quote-blocked-note">{quoteManualApproveBlockedReason(selectedQuote)}</p> : null}
                    {!selectedQuoteCanConvertToJob && quoteConvertToJobBlockedReason(selectedQuote) ? <p className="nexops-quote-blocked-note">{quoteConvertToJobBlockedReason(selectedQuote)}</p> : null}
                    {!selectedQuoteCanCreateInvoice && quoteInvoiceBlockedReason(selectedQuote) ? <p className="nexops-quote-blocked-note">{quoteInvoiceBlockedReason(selectedQuote)}</p> : null}
                    {!selectedQuoteCanRenew && quoteRenewBlockedReason(selectedQuote) ? <p className="nexops-quote-blocked-note">{quoteRenewBlockedReason(selectedQuote)}</p> : null}
                  </div>
                  <div className="nexops-request-builder-grid">
                    <label className="nexops-field">
                      <span>Renewal days</span>
                      <input type="number" min="1" step="1" value={renewalDays} onChange={(event) => setRenewalDays(Math.max(1, Number(event.target.value || 1)))} />
                    </label>
                    <label className="nexops-field">
                      <span>Renew action</span>
                      <button type="button" onClick={() => void runQuoteAction("renew")} disabled={Boolean(busy) || !selectedQuoteCanRenew}>{busy === "renew" ? "Renewing..." : "Renew expired quote"}</button>
                    </label>
                  </div>
                  <ul className="nexops-mini-list">
                    <li>
                      <strong>Request link</strong>
                      <span>{selectedQuote.requestId ? `Connected to request ${selectedQuote.requestId}` : "This quote was not created from a tracked request."}</span>
                    </li>
                    <li>
                      <strong>Job link</strong>
                      <span>{selectedQuote.convertedJobId ? `Converted once into job ${selectedQuote.convertedJobId}` : "No job snapshot has been created from this quote yet."}</span>
                    </li>
                    <li>
                      <strong>Portal delivery</strong>
                      <span>{selectedQuote.delivery?.length ? `${selectedQuote.delivery.length} delivery event${selectedQuote.delivery.length === 1 ? "" : "s"} recorded.` : "No delivery history recorded yet."}</span>
                    </li>
                  </ul>
                </section>
              </div>
                </div>
              </details>

              {selectedQuote.changeRequests?.length ? (
                <section className="nexops-quote-panel">
                  <div className="nexops-quote-section-head">
                    <h3>Change requests</h3>
                    <span>Client feedback recorded before approval.</span>
                  </div>
                  <div className="nexops-quote-history-list">
                    {selectedQuote.changeRequests.map((entry) => (
                      <article key={entry.id}>
                        <strong>{entry.requestedBy ?? "Client"} - {formatTimestamp(entry.requestedAt)}</strong>
                        {entry.note ? <p>{entry.note}</p> : null}
                        {entry.lineComments.length ? (
                          <ul className="nexops-mini-list">
                            {entry.lineComments.map((comment) => <li key={`${entry.id}-${comment.lineItemId}`}>{comment.lineItemId}: {comment.comment}</li>)}
                          </ul>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedQuote.versions?.length ? (
                <section className="nexops-quote-panel">
                  <div className="nexops-quote-section-head">
                    <h3>Archived versions</h3>
                    <span>Renewals and pre-send edits stay on the same quote record.</span>
                  </div>
                  <div className="nexops-quote-history-list">
                    {selectedQuote.versions.map((version) => (
                      <article key={`${selectedQuote.id}-v${version.version}`}>
                        <strong>Version {version.version} - {version.reason.replaceAll("_", " ")}</strong>
                        <p>{version.title}</p>
                        <small>{formatTimestamp(version.archivedAt)} | {quoteStatusLabel(version.status)} | {money(version.totals.total)}</small>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="nexops-quote-empty">
              <h2>No quote selected</h2>
              <p>Pick a quote from the list or create one above.</p>
            </div>
          )}
        </article>
      </div>
      <NexOpsCatalogPicker
        open={catalogPickerOpen}
        search={catalogSearch}
        catalogItems={visibleCatalogItems}
        title="Add Line Item"
        onSearchChange={setCatalogSearch}
        onClose={() => {
          setCatalogPickerOpen(false);
          setCatalogSearch("");
        }}
        onSelect={addCatalogLine}
        onCreateRequested={() => {
          setCatalogPickerOpen(false);
          setCatalogSearch("");
          setStatusMessage("Add reusable catalog items in Settings > Catalog, then return to select them here.");
        }}
      />
    </section>
  );
}
