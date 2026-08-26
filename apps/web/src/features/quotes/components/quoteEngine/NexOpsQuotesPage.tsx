import React, { useEffect, useState } from "react";
import { NexOpsPageTitle } from "../../../nexopsShell/components/NexOpsPageTitle";
import { MobileClientEditGlyph, MobileClientSummaryGlyph, NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import type { AddressLike } from "@nexteam/shared";
import { PaymentScheduleEditor, paymentScheduleFromRecord, paymentScheduleToPayload, type PaymentScheduleDraft, type PaymentScheduleRecord } from "../../../../features/invoices/components/invoiceStructure/PaymentScheduleEditor";
import { blankCatalogItemDraft, catalogItemFromDraft, NexOpsCatalogEditorModal, NexOpsCatalogPicker, type CatalogItemDraft, type ProductServiceCatalogItem } from "../../../settings/components/catalog/NexOpsCatalog";
import { QuoteTemplateEditor } from "../quoteTemplates/QuoteTemplateEditor";
import { NexopsActionButton, NexopsActionRail, NexopsBanner, NexopsProgressStrip, NexopsSectionCard, NexopsStatusPill } from "../../../../shared/ui/NexOpsUiKit";
import { quoteTemplateVariables, resolveTemplateDraft } from "../../../../shared/communications/communicationTemplates";
import { intakeDetailFacts, prominentIntakeFacts } from "../../../../shared/intake/intakePresentation";
import { NexOpsCreationTemplate, NexOpsDetailTemplate, NexOpsRosterSurface, NexOpsRosterTemplate } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { QUOTE_CREATION_ROTATING_LINES } from "./quoteCreationCopy";

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
type QuoteRosterFilter = "draft" | "awaiting_response" | "change_requested" | "approved" | "converted";
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

const QUOTE_ROSTER_FILTERS: Array<{ value: QuoteRosterFilter; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "awaiting_response", label: "Awaiting Response" },
  { value: "change_requested", label: "Changes Requested" },
  { value: "approved", label: "Approved" },
  { value: "converted", label: "Converted" }
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

interface PropertyOption {
  id: string;
  tenantId: string;
  clientId: string;
  siteName?: string;
  label?: string;
  address?: AddressLike;
}

interface NewPropertyDraft {
  siteName: string;
  street1: string;
  street2: string;
  city: string;
  province: string;
  postalCode: string;
  gateCodeNeeded: boolean;
  gateCode: string;
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
  catalogItemId?: string;
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
  propertyId?: string;
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

function pickQuoteCreationLine(): string {
  return QUOTE_CREATION_ROTATING_LINES[Math.floor(Math.random() * QUOTE_CREATION_ROTATING_LINES.length)] ?? QUOTE_CREATION_ROTATING_LINES[0];
}

interface PropertyMutationResponse {
  ok: boolean;
  property?: PropertyOption;
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
  catalogItemId: string;
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
  propertyId: string;
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
  properties: PropertyOption[];
  tenantUsers: TenantUserRecord[];
  onCrmMutation?: () => void;
  focusedQuoteId?: string;
  initialClientId?: string;
  initialFilter?: QuoteFilter;
  onCreateClientRequested?: () => void;
  inlineClientCreateForm?: React.ReactNode;
  onOpenInlineClientCreate?: () => void;
  inlineCreatedClientId?: string;
  onInlineCreatedClientHandled?: () => void;
}

function blankNewPropertyDraft(): NewPropertyDraft {
  return {
    siteName: "",
    street1: "",
    street2: "",
    city: "",
    province: "",
    postalCode: "",
    gateCodeNeeded: false,
    gateCode: ""
  };
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

function propertyDisplayAddress(property?: PropertyOption): string {
  if (!property) {
    return "Service property selected";
  }

  const address = property.address;
  return [
    property.siteName ?? property.label,
    address?.street1,
    [address?.city, address?.province, address?.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(" · ") || "Service property selected";
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

function catalogItem(catalogItems: ProductServiceCatalogItem[], id: string) {
  return catalogItems.find((item) => item.id === id);
}

function lineDraftFromCatalogItem(item: ProductServiceCatalogItem): QuoteLineDraft {
  return {
    rowId: rowId("catalog"),
    kind: "catalog",
    catalogItemId: item.id,
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



export function lineDraftFromQuoteItem(item: QuoteLineItem): QuoteLineDraft {
  // Older tenant templates can contain a priced line before it has been linked
  // to the newer Products & Services catalog. Preserve that authoritative line
  // as an editable manual line instead of emitting an invalid catalog payload.
  const isCatalogLine = item.source !== "custom" && Boolean(item.catalogItemId);
  return {
    rowId: rowId("line"),
    kind: isCatalogLine ? "catalog" : "custom",
    catalogItemId: item.catalogItemId ?? "",
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
  properties: PropertyOption[],
  tenantUsers: TenantUserRecord[],
  settingsRecord: CrmSettingsRecord | null,
  settings: SettingsDraft | null,
  template: QuoteTemplateRecord | undefined,
  initialClientId?: string
): QuoteComposerDraft {
  const client = clients.find((candidate) => candidate.id === initialClientId) ?? clients[0];
  const property = client ? properties.filter((candidate) => candidate.clientId === client.id)[0] : undefined;
  const items = template?.defaultLineItems?.length
    ? template.defaultLineItems.map(lineDraftFromQuoteItem)
    : [];
  return {
    editingQuoteId: "",
    clientId: client?.id ?? "",
    propertyId: property?.id ?? "",
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
    propertyId: quote.propertyId ?? "",
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
    ...(composer.propertyId ? { propertyId: composer.propertyId } : {}),
    ...(composer.templateId ? { templateId: composer.templateId } : {}),
    ...(composer.salespersonUserId ? { salespersonUserId: composer.salespersonUserId } : {}),
    title: composer.title.trim(),
    items: composer.items.map((item) => ({
      kind: item.kind,
      ...(item.kind === "catalog" ? { catalogItemId: item.catalogItemId, unitPrice: item.unitPrice } : {}),
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
    ...(item.catalogItemId ? { catalogItemId: item.catalogItemId } : {}),
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
      return Boolean(item.catalogItemId);
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

function quoteMatchesRosterFilter(quote: QuoteRecord, filter: QuoteRosterFilter): boolean {
  if (filter === "draft") {
    return quote.status === "draft";
  }
  if (filter === "awaiting_response") {
    return quote.status === "sent";
  }
  if (filter === "change_requested") {
    return quote.status === "change_requested";
  }
  if (filter === "converted") {
    return Boolean(quote.convertedJobId);
  }
  return (quote.status === "approved" || quote.status === "approved_internal" || quote.status === "signed") && !quote.convertedJobId;
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
  const [composer, setComposer] = useState<QuoteComposerDraft>(() => composerFromDefaults(props.clients, props.properties, props.tenantUsers, null, null, undefined, props.initialClientId));
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("all");
  const [quoteRosterFilters, setQuoteRosterFilters] = useState<QuoteRosterFilter[]>([]);
  const [quoteRosterFilterOpen, setQuoteRosterFilterOpen] = useState(false);
  const [expandedFilteredQuoteId, setExpandedFilteredQuoteId] = useState("");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading quotes...");
  const [busy, setBusy] = useState("");
  const [portalLinks, setPortalLinks] = useState<Record<string, string>>({});
  const [renewalDays, setRenewalDays] = useState(30);
  const [sendDraft, setSendDraft] = useState<SendDraft>({ mode: "email", target: "", subject: "", bodyText: "", note: "" });
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [pendingCatalogCreateSeed, setPendingCatalogCreateSeed] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  const [clientSelectionSaved, setClientSelectionSaved] = useState(false);
  const [quoteBuilderMode, setQuoteBuilderMode] = useState<"new" | "template" | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<CatalogItemDraft>(() => blankCatalogItemDraft());
  const [workspaceView, setWorkspaceView] = useState<"roster" | "builder" | "detail">(props.initialClientId ? "builder" : "roster");
  const [quoteCreationLine, setQuoteCreationLine] = useState(() => pickQuoteCreationLine());
  const [clientSelectionMode, setClientSelectionMode] = useState<"existing" | "new">("existing");
  const [propertySelectionMode, setPropertySelectionMode] = useState<"existing" | "new">("existing");
  const [newPropertyDraft, setNewPropertyDraft] = useState<NewPropertyDraft>(() => blankNewPropertyDraft());
  const [newPropertyBusy, setNewPropertyBusy] = useState(false);
  const [newPropertyStatus, setNewPropertyStatus] = useState("");
  const [createdProperties, setCreatedProperties] = useState<PropertyOption[]>([]);

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId);
  const selectedClient = props.clients.find((client) => client.id === selectedQuote?.clientId);
  const composerClient = props.clients.find((client) => client.id === composer.clientId);
  const composerProperties = [...props.properties, ...createdProperties.filter((created) => !props.properties.some((property) => property.id === created.id))]
    .filter((property) => property.clientId === composer.clientId);
  const composerProperty = composerProperties.find((property) => property.id === composer.propertyId);
  const selectedTemplate = templates.find((template) => template.id === composer.templateId);
  const selectedSalesperson = props.tenantUsers.find((user) => user.id === composer.salespersonUserId);
  const visibleCatalogItems = (settingsRecord?.catalogItems ?? [])
    .filter((item) => item.visible)
    .sort((left, right) => left.name.localeCompare(right.name));
  const normalizedClientSearch = clientSearch.trim().toLowerCase();
  const clientSearchResults = props.clients.filter((client) => {
    if (!normalizedClientSearch) {
      return false;
    }
    return [clientDisplayName(client), client.company, ...client.emails, ...client.phones]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedClientSearch));
  });
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
        : composerFromDefaults(props.clients, props.properties, props.tenantUsers, templatesBody.settings, nextSettingsDraft, nextTemplates[0]));
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
    if (!props.initialClientId) {
      return;
    }
    setComposer((current) => current.editingQuoteId ? current : { ...current, clientId: props.initialClientId! });
    setWorkspaceView("builder");
  }, [props.initialClientId]);

  useEffect(() => {
    if (!props.inlineCreatedClientId) {
      return;
    }
    setComposer((current) => current.editingQuoteId ? current : { ...current, clientId: props.inlineCreatedClientId!, propertyId: "" });
    setClientSelectionMode("existing");
    setClientPickerOpen(false);
    setClientSearch("");
    setPropertyPickerOpen(true);
    setClientSelectionSaved(false);
    setWorkspaceView("builder");
    props.onInlineCreatedClientHandled?.();
  }, [props.inlineCreatedClientId]);

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
    setComposer(composerFromDefaults(props.clients, props.properties, props.tenantUsers, settingsRecord, settingsDraft, templates[0]));
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
      const clientProperties = props.properties.filter((property) => property.clientId === current.clientId);
      const propertyId = clientProperties.some((property) => property.id === current.propertyId)
        ? current.propertyId
        : clientProperties[0]?.id ?? "";
      return {
        ...current,
        propertyId,
        title: current.title.trim() ? current.title : quoteTitle(selectedTemplate, client),
        deliveryTarget: current.deliveryMode === "sms"
          ? current.deliveryTarget || client?.phones[0] || ""
          : current.deliveryTarget || client?.emails[0] || ""
      };
    });
  }, [composer.clientId, props.clients, props.properties, selectedTemplate]);

  useEffect(() => {
    if (!selectedQuote) {
      return;
    }
    setSendDraft(defaultQuoteSendDraft(selectedQuote, selectedClient, settingsRecord, portalLinks[selectedQuote.id]));
  }, [selectedQuoteId, selectedClient, settingsRecord, portalLinks, selectedQuote]);

  function resetComposer(templateId = templates[0]?.id ?? ""): void {
    const template = templates.find((candidate) => candidate.id === templateId) ?? templates[0];
    setComposer(composerFromDefaults(props.clients, props.properties, props.tenantUsers, settingsRecord, settingsDraft, template, props.initialClientId));
  }

  function openBuilder(): void {
    resetComposer();
    setQuoteCreationLine(pickQuoteCreationLine());
    setClientSelectionSaved(false);
    setQuoteBuilderMode(null);
    setTemplatePickerOpen(false);
    setClientSelectionMode("existing");
    setPropertySelectionMode("existing");
    setNewPropertyDraft(blankNewPropertyDraft());
    setNewPropertyStatus("");
    setWorkspaceView("builder");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function chooseClient(clientId: string): void {
    setComposer((current) => ({ ...current, clientId, propertyId: "" }));
    setPropertySelectionMode("existing");
    setNewPropertyDraft(blankNewPropertyDraft());
    setNewPropertyStatus("");
    setPropertyPickerOpen(true);
    setClientSelectionSaved(false);
  }

  function saveClientSelection(): void {
    if (!composer.clientId || !composer.propertyId) {
      setNewPropertyStatus("Choose or save a service property before continuing.");
      return;
    }
    setNewPropertyStatus("");
    setClientSelectionSaved(true);
    setPropertyPickerOpen(false);
  }

  async function createPropertyForQuote(): Promise<void> {
    if (!composer.clientId || newPropertyBusy) {
      return;
    }
    if (![newPropertyDraft.street1, newPropertyDraft.city, newPropertyDraft.province].every((value) => value.trim())) {
      setNewPropertyStatus("Add the property address, city, and state before saving it to this quote.");
      return;
    }
    setNewPropertyBusy(true);
    setNewPropertyStatus("Saving the new property...");
    try {
      const body = await fetch("/api/crm/properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: composer.clientId,
          siteName: newPropertyDraft.siteName.trim() || undefined,
          label: newPropertyDraft.siteName.trim() || newPropertyDraft.street1.trim(),
          address: {
            street1: newPropertyDraft.street1.trim(),
            ...(newPropertyDraft.street2.trim() ? { street2: newPropertyDraft.street2.trim() } : {}),
            city: newPropertyDraft.city.trim(),
            province: newPropertyDraft.province.trim(),
            postalCode: newPropertyDraft.postalCode.trim(),
            country: "US"
          },
          access: newPropertyDraft.gateCodeNeeded ? { gateCode: newPropertyDraft.gateCode.trim() || undefined } : undefined,
          customFields: { gatedEntry: newPropertyDraft.gateCodeNeeded }
        })
      }).then((response) => response.json() as Promise<PropertyMutationResponse>);
      if (!body.ok || !body.property) {
        setNewPropertyStatus(body.error ?? "The new property could not be saved.");
        return;
      }
      setCreatedProperties((current) => [...current.filter((property) => property.id !== body.property!.id), body.property!]);
      setComposer((current) => ({ ...current, propertyId: body.property!.id }));
      setPropertySelectionMode("existing");
      setNewPropertyDraft(blankNewPropertyDraft());
      setNewPropertyStatus("New property selected for this quote.");
      props.onCrmMutation?.();
    } catch {
      setNewPropertyStatus("The new property could not be saved.");
    } finally {
      setNewPropertyBusy(false);
    }
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

  function startNewQuoteBuilder(): void {
    setComposer((current) => ({ ...current, templateId: "", items: [] }));
    setQuoteBuilderMode("new");
  }

  function startTemplateQuoteBuilder(templateId: string): void {
    applyTemplate(templateId);
    setTemplatePickerOpen(false);
    setQuoteBuilderMode("template");
  }

  function updateLine(rowIdValue: string, patch: Partial<QuoteLineDraft>): void {
    setComposer((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.rowId !== rowIdValue) {
          return item;
        }
        const next = { ...item, ...patch };
        if (next.kind === "catalog" && next.catalogItemId) {
          const source = catalogItem(settingsRecord?.catalogItems ?? [], next.catalogItemId);
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

  function addCustomLine(seed: string): void {
    const name = seed.trim() || "Custom service";
    setComposer((current) => ({
      ...current,
      items: [...current.items, {
        rowId: rowId("custom"), kind: "custom", catalogItemId: "", catalogCode: "", code: "",
        name, description: "", quantity: 1, unitPrice: 0, clientSelectable: false, defaultSelected: true
      }]
    }));
    setCatalogPickerOpen(false);
    setCatalogSearch("");
  }

  async function saveCatalogItemFromBuilder(): Promise<void> {
    if (!settingsRecord || !catalogDraft.name.trim()) {
      return;
    }
    setBusy("save-catalog-item");
    try {
      const item = catalogItemFromDraft(props.tenantId, catalogDraft);
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, catalogItems: [...settingsRecord.catalogItems, item] })
      }).then((response) => response.json() as Promise<SettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Product or service could not be saved.");
        return;
      }
      setSettingsRecord(body.settings);
      addCatalogLine(item);
      setCatalogEditorOpen(false);
      setStatusMessage(`${item.name} was added to Products & Services and this quote.`);
    } catch {
      setStatusMessage("Product or service could not be saved.");
    } finally {
      setBusy("");
    }
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
      setWorkspaceView("detail");
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
    if (quoteRosterFilters.length && !quoteRosterFilters.some((filter) => quoteMatchesRosterFilter(quote, filter))) {
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
  const quoteRosterCounts: Record<QuoteRosterFilter, number> = {
    draft: quotes.filter((quote) => quoteMatchesRosterFilter(quote, "draft")).length,
    awaiting_response: quotes.filter((quote) => quoteMatchesRosterFilter(quote, "awaiting_response")).length,
    change_requested: quotes.filter((quote) => quoteMatchesRosterFilter(quote, "change_requested")).length,
    approved: quotes.filter((quote) => quoteMatchesRosterFilter(quote, "approved")).length,
    converted: quotes.filter((quote) => quoteMatchesRosterFilter(quote, "converted")).length
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

  useEffect(() => {
    if (expandedFilteredQuoteId && !filteredQuotes.some((quote) => quote.id === expandedFilteredQuoteId)) {
      setExpandedFilteredQuoteId("");
    }
  }, [expandedFilteredQuoteId, filteredQuotes]);

  const selectedQuoteSalesperson = selectedQuote?.salespersonUserId
    ? props.tenantUsers.find((user) => user.id === selectedQuote.salespersonUserId)
    : undefined;
  const selectedQuoteProminentFacts = prominentIntakeFacts(selectedQuote?.intake, "quote");
  const selectedQuoteCarryForwardFacts = intakeDetailFacts(selectedQuote?.intake, "quote", 10);

  return (
    <section className="nexops-module-page quote-engine-page">
      <NexOpsRosterTemplate
        title={workspaceView === "builder" ? "Create Quote" : "Quotes"}
        detail={workspaceView === "builder" ? quoteCreationLine : "Build clear client-ready proposals, keep pricing in one place, and move the approved work forward."}
        icon={<NexOpsNavGlyph module="quotes" />}
        heroClassName="module-hero-card--quote"
        showHero={workspaceView !== "builder"}
        primaryAction={workspaceView === "builder" ? <button className="nexops-quote-primary-button nexops-quote-back-to-roster" type="button" onClick={() => { setWorkspaceView("roster"); setQuoteBuilderMode(null); }}>← Quotes</button> : <button className="nexops-quote-primary-button" type="button" onClick={openBuilder} disabled={Boolean(busy)}>+ New Quote</button>}
        metrics={undefined}
      >
      {workspaceView === "roster" ? <NexOpsRosterSurface ariaLabel="Search and filter quotes" searchTitle="Search Quotes" resultNoun="Quote" resultCount={filteredQuotes.length} search={<label className="nexops-quote-roster-search"><span className="sr-only">Search quotes</span><input placeholder="Search quotes" value={quoteSearch} onChange={(event) => setQuoteSearch(event.target.value)} /></label>} filter={<button className="nexops-jobs-filter-pill nexops-quote-filter-trigger" type="button" aria-expanded={quoteRosterFilterOpen} aria-controls="quote-status-filter-options" onClick={() => setQuoteRosterFilterOpen((current) => !current)}><span className="nexops-quote-filter-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16" /><path d="M7 12h10" /><path d="M10 17h4" /></svg></span><span className="nexops-quote-filter-label">Filter</span>{quoteRosterFilters.length ? <small>{filteredQuotes.length}</small> : null}</button>} filterOptions={quoteRosterFilterOpen ? <div className="nexops-quote-filter-options" id="quote-status-filter-options" aria-label="Quote status filters">{QUOTE_ROSTER_FILTERS.map((filter) => { const selected = quoteRosterFilters.includes(filter.value); return <button key={filter.value} type="button" role="checkbox" aria-checked={selected} className={`nexops-jobs-filter-pill${selected ? " active" : ""}`} onClick={() => setQuoteRosterFilters((current) => selected ? current.filter((value) => value !== filter.value) : [...current, filter.value])}><span className="nexops-quote-filter-check" aria-hidden="true">{selected ? "✓" : ""}</span><span>{filter.label}</span><small>{quoteRosterCounts[filter.value]}</small></button>; })}</div> : undefined} empty={!filteredQuotes.length ? <div className="nexops-quote-filtered-empty"><h2>No Quotes Match This View Yet</h2><p>Adjust the selected statuses or search terms to see quotes here.</p></div> : undefined}>
          {filteredQuotes.map((quote) => {
            const client = props.clients.find((candidate) => candidate.id === quote.clientId);
            const expanded = expandedFilteredQuoteId === quote.id;
            return <article className={`nexops-quote-filtered-row${expanded ? " expanded" : ""}`} key={quote.id}>
              <button className="nexops-quote-filtered-identity-banner" type="button" aria-expanded={expanded} onClick={() => setExpandedFilteredQuoteId((current) => current === quote.id ? "" : quote.id)}>
                <span className="nexops-quote-filtered-identity" data-label="Quote">
                  <strong>{quote.number ?? quote.id}</strong>
                  <small>{clientDisplayName(client)}</small>
                </span>
              </button>
              {expanded ? <div className="nexops-quote-filtered-details">
                <span className="nexops-quote-filtered-title" data-label="Quote title">{quote.title}</span>
                <span className="nexops-quote-filtered-updated" data-label="Updated">{formatTimestamp(quote.updatedAt ?? quote.createdAt)}</span>
                <span className="nexops-quote-filtered-status" data-label="Status"><mark>{quoteStatusLabel(quote.status)}</mark></span>
                <span className="nexops-quote-filtered-activity" data-label="Quote record">
                  <small>{money(quote.totals.total)}</small>
                  <button className="nexops-quote-filtered-open" type="button" onClick={() => { setSelectedQuoteId(quote.id); setWorkspaceView("detail"); }}>Open Quote <span aria-hidden="true">→</span></button>
                </span>
              </div> : null}
            </article>;
          })}
      </NexOpsRosterSurface> : null}
      {workspaceView === "builder" ? (
      <NexOpsCreationTemplate
        title="Create Quote"
        detail={quoteCreationLine}
        icon={<NexOpsNavGlyph module="quotes" />}
        heroClassName="module-hero-card--quote"
        backAction={<button className="nexops-quote-primary-button nexops-quote-back-to-roster" type="button" onClick={() => { setWorkspaceView("roster"); setQuoteBuilderMode(null); }}>← Quotes</button>}
      >

      <div className="nexops-module-grid nexops-module-grid-wide">
        <article className="nexops-module-card nexops-quote-composer-card">
          <div className="nexops-quote-composer-grid">
            <section className={`nexops-quote-panel${clientSelectionSaved && composerClient ? " nexops-quote-client-profile-panel" : ""}`}>
              <div className={clientSelectionSaved && composerClient ? "nexops-mobile-profile-body" : "nexops-quote-setup-body"}>
                {clientSelectionSaved && composerClient ? <section className="nexops-mobile-profile-summary" aria-label="Client details">
                  <button className="nexops-mobile-profile-back-bubble" type="button" onClick={() => { setClientSelectionSaved(false); setClientSelectionMode("existing"); }}>
                    ← Change Client
                  </button>
                  <div className="nexops-mobile-profile-summary-head">
                    <h1>{clientDisplayName(composerClient)}</h1>
                    <button className="nexops-mobile-profile-edit-button" type="button" aria-label="Edit selected client" onClick={() => { setClientSelectionSaved(false); setClientSelectionMode("existing"); }}>
                      <MobileClientEditGlyph />
                    </button>
                  </div>
                  <div className="nexops-mobile-profile-contact-rail">
                    {composerClient.phones[0] ? <a className="nexops-mobile-profile-contact-link" href={`tel:${composerClient.phones[0]}`}>
                      <span className="nexops-mobile-profile-contact-icon"><MobileClientSummaryGlyph kind="phone" /></span>
                      <span>{composerClient.phones[0]}</span>
                    </a> : null}
                    {composerClient.emails[0] ? <a className="nexops-mobile-profile-contact-link" href={`mailto:${composerClient.emails[0]}`}>
                      <span className="nexops-mobile-profile-contact-icon"><MobileClientSummaryGlyph kind="email" /></span>
                      <span>{composerClient.emails[0]}</span>
                    </a> : null}
                    <span className="nexops-mobile-profile-contact-link">
                      <span className="nexops-mobile-profile-contact-icon"><MobileClientSummaryGlyph kind="directions" /></span>
                      <span>{propertyDisplayAddress(composerProperty)}</span>
                    </span>
                  </div>
                  <div className="nexops-mobile-balance-row">
                    <span>Client balance</span>
                    <strong>{money(0)}</strong>
                  </div>
                  <button className="nexops-mobile-create-button" type="button" onClick={() => { setClientSelectionSaved(false); setClientSelectionMode("existing"); }}>
                    Edit Client
                  </button>
                </section> : <section className="nexops-quote-client-hero" aria-label="Select Client">
                  <h3>Select Client</h3>
                  <div className="nexops-quote-choice-tabs" role="tablist" aria-label="Client selection">
                    <button type="button" role="tab" aria-selected={clientSelectionMode === "new"} className={clientSelectionMode === "new" ? "active" : ""} onClick={() => { setClientSelectionMode("new"); props.onOpenInlineClientCreate?.(); }}>Add New</button>
                    <button type="button" role="tab" aria-selected={clientSelectionMode === "existing"} className={clientSelectionMode === "existing" ? "active" : ""} onClick={() => { setClientSelectionMode("existing"); setClientSearch(""); setClientPickerOpen(true); }}>Existing</button>
                  </div>
                </section>}
              </div>
            </section>

            <section className="nexops-quote-panel">
              <div className="nexops-quote-setup-body">
                <section className="nexops-quote-client-hero" aria-label="Quote Builder">
                  <h3>Quote Builder</h3>
                  <div className="nexops-quote-choice-tabs" role="tablist" aria-label="Quote builder selection">
                    <button type="button" role="tab" aria-selected={quoteBuilderMode === "new"} onClick={startNewQuoteBuilder}>Add New</button>
                    <button type="button" role="tab" aria-selected={quoteBuilderMode === "template"} onClick={() => setTemplatePickerOpen(true)}>From Template</button>
                  </div>
                </section>
              </div>
            </section>

            {quoteBuilderMode ? <>
            <section className="nexops-quote-panel">
              <div className="nexops-quote-simple-heading nexops-quote-details-banner">
                <h3>Quote Details</h3>
                <span>Set the quote name, then add products or services.</span>
              </div>
              <div className="nexops-quote-setup-body">
                <label className="nexops-field nexops-quote-job-title">
                  <span>Quote Name</span>
                  <input value={composer.title} placeholder="What is this quote for?" onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="nexops-field nexops-quote-line-search">
                  <span>Line Item</span>
                  <div>
                    <input value={catalogSearch} placeholder="Search products and services" onFocus={() => setCatalogPickerOpen(true)} onChange={(event) => { setCatalogSearch(event.target.value); setCatalogPickerOpen(true); }} />
                    <button type="button" aria-label="Add line item" onClick={() => setCatalogPickerOpen(true)}>+</button>
                  </div>
                </label>
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
                    </div>
                    <div className="nexops-quote-line-footer">
                      <strong>{money(roundMoney(item.quantity * item.unitPrice))}</strong>
                      <button type="button" onClick={() => setComposer((current) => ({ ...current, items: current.items.filter((candidate) => candidate.rowId !== item.rowId) }))} disabled={composer.items.length === 1}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="nexops-quote-pricing-summary" aria-label="Quote pricing summary">
                <div><span>Subtotal</span><strong>{money(draftTotals.subtotal)}</strong></div>
                <div><span>Discount</span><strong>{money(draftTotals.discount ?? 0)}</strong></div>
                <div><span>Tax</span><strong>{money(draftTotals.tax)}</strong></div>
                <div className="nexops-quote-pricing-summary__total"><span>Total</span><strong>{money(draftTotals.total)}</strong></div>
                <div><span>Required deposit</span><strong>{composer.requireDeposit ? money(composer.depositKind === "percent" ? draftTotals.total * (composer.depositValue / 100) : composer.depositValue) : money(0)}</strong></div>
              </div>
            </section>

            <section className="nexops-quote-panel nexops-quote-simple-section">
              <h3>Client Message</h3>
              <label className="nexops-field">
                <span>Message for the client</span>
                <textarea rows={4} value={composer.deliveryNote} onChange={(event) => setComposer((current) => ({ ...current, deliveryNote: event.target.value }))} placeholder="Optional message included with this quote" />
              </label>
            </section>

            <section className="nexops-quote-panel">
              <h3>Contract / Disclaimer</h3>
              <label className="nexops-field">
                <span>Terms and Disclaimer</span>
                <textarea rows={6} value={composer.terms} onChange={(event) => setComposer((current) => ({ ...current, terms: event.target.value }))} />
              </label>
            </section>

            <section className="nexops-quote-final-action">
              <button className="nexops-quote-primary-button" type="button" onClick={() => void saveQuote()} disabled={Boolean(busy) || !canSaveComposer(composer)}>{busy === "save-quote" ? "Saving..." : "Review & Send"}</button>
            </section>
            </> : null}
          </div>
        </article>

        {quoteBuilderMode ? <details hidden className="nexops-quote-panel nexops-density-disclosure-panel nexops-quote-builder-settings">
          <summary>
            <div className="nexops-density-disclosure-copy">
              <h3>Quote defaults and templates</h3>
              <small>Office configuration stays available without interrupting this quote.</small>
            </div>
            <span className="nexops-density-disclosure-caret">Open</span>
          </summary>
          <article className="nexops-module-card">
          <p className="eyebrow">Office Settings</p>
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
      </details> : null}
      </div>
      </NexOpsCreationTemplate>
      ) : null}

      {workspaceView === "detail" ? <div className={`nexops-two-column quote-workspace-${workspaceView}`}>
        <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Quote List</p>
              <h2>{filteredQuotes.length} visible</h2>
            </div>
          </div>
          <ul className="nexops-record-list">
            {filteredQuotes.map((quote) => {
              const client = props.clients.find((candidate) => candidate.id === quote.clientId);
              return (
                <li className={quote.id === selectedQuoteId ? "selected" : ""} key={quote.id}>
                  <button className="nexops-request-row-button" type="button" onClick={() => { setSelectedQuoteId(quote.id); setWorkspaceView("detail"); }}>
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

        <article className="nexops-module-card nexops-quote-roster-helper">
          {workspaceView === "detail" ? <NexOpsDetailTemplate
            back={<button type="button" onClick={() => setWorkspaceView("roster")}>← Back to Quote Roster</button>}
            eyebrow="Quote details"
            title={selectedQuote?.number ?? "Quote"}
            detail={selectedQuote ? `${selectedQuote.title} · ${clientDisplayName(selectedClient)}` : "Choose a quote from the roster."}
            status={selectedQuote ? <NexopsStatusPill label={quoteStatusLabel(selectedQuote.status)} tone={quoteStatusTone(selectedQuote.status)} /> : undefined}
            actions={<button className="nexops-quote-primary-button" type="button" onClick={() => { if (selectedQuote) { setComposer(composerFromQuote(selectedQuote, selectedClient)); setWorkspaceView("builder"); } }}>Edit Quote</button>}
            navigation={<><button className="active" type="button" aria-current="page">Overview</button><button type="button" onClick={() => { if (selectedQuote) { setComposer(composerFromQuote(selectedQuote, selectedClient)); setWorkspaceView("builder"); } }}>Pricing</button><button type="button" onClick={() => selectedQuote && runQuoteAction("send")}>Approval &amp; Send</button></>}
          >{null}</NexOpsDetailTemplate> : null}
          {selectedQuote ? (
            <div className="nexops-quote-detail">
              <div className="nexops-page-heading">
                <div>
              <p className="eyebrow">Quote Detail</p>
                  <h2>{selectedQuote.number ?? selectedQuote.id}</h2>
                  <p>{selectedQuote.title}</p>
                </div>
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => { setComposer(composerFromQuote(selectedQuote, selectedClient)); setWorkspaceView("builder"); }} disabled={Boolean(busy) || !selectedQuoteCanEdit}>Edit in Composer</button>
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
      </div> : null}

      </NexOpsRosterTemplate>
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
        onCreateRequested={(seed) => {
          setCatalogPickerOpen(false);
          setPendingCatalogCreateSeed(seed);
        }}
      />
      {clientPickerOpen ? <div className="nexops-modal-layer" role="presentation">
        <button className="nexops-modal-backdrop" type="button" aria-label="Close client search" onClick={() => setClientPickerOpen(false)} />
        <section className="nexops-modal-card nexops-quote-client-search-modal" role="dialog" aria-modal="true" aria-label="Find existing client">
          <div className="nexops-modal-head">
            <div><p className="eyebrow">Client search</p><h2>Find Existing Client</h2></div>
            <button type="button" onClick={() => setClientPickerOpen(false)}>Close</button>
          </div>
          <label className="nexops-field">
            <span>Search clients</span>
            <input autoFocus value={clientSearch} placeholder="Type a client name, email, or phone" onChange={(event) => setClientSearch(event.target.value)} />
          </label>
          <div className="nexops-catalog-picker-list">
            {clientSearchResults.map((client) => <button className="nexops-catalog-picker-item" type="button" key={client.id} onClick={() => { chooseClient(client.id); setClientPickerOpen(false); setClientSearch(""); }}>
              <span><strong>{clientDisplayName(client)}</strong><small>{[client.emails[0], client.phones[0]].filter(Boolean).join(" · ") || "No email or phone saved"}</small></span>
            </button>)}
            {normalizedClientSearch && !clientSearchResults.length ? <div className="nexops-catalog-picker-empty"><strong>No client matches</strong><small>Keep typing or choose Add New to create a client without leaving this quote.</small></div> : null}
          </div>
        </section>
      </div> : null}
      {propertyPickerOpen && composer.clientId ? <div className="nexops-modal-layer" role="presentation">
        <button className="nexops-modal-backdrop" type="button" aria-label="Close service property selection" onClick={() => setPropertyPickerOpen(false)} />
        <section className="nexops-modal-card nexops-quote-property-modal" role="dialog" aria-modal="true" aria-label="Select service property">
          <div className="nexops-modal-head"><div><p className="eyebrow">Service location</p><h2>Select Property</h2></div><button type="button" onClick={() => setPropertyPickerOpen(false)}>Close</button></div>
          <div className="nexops-quote-property-picker">
            <div className="nexops-quote-property-picker__head"><h4>Service Property</h4><p>{composerProperties.length > 1 ? "This client has multiple properties. Choose one or add a new address." : "Choose the saved property or add a new address for this quote."}</p></div>
            <div className="nexops-quote-choice-tabs" role="tablist" aria-label="Property selection">
              <button type="button" role="tab" aria-selected={propertySelectionMode === "existing"} className={propertySelectionMode === "existing" ? "active" : ""} onClick={() => setPropertySelectionMode("existing")}>Existing Property</button>
              <button type="button" role="tab" aria-selected={propertySelectionMode === "new"} className={propertySelectionMode === "new" ? "active" : ""} onClick={() => setPropertySelectionMode("new")}>New Property</button>
            </div>
            {propertySelectionMode === "existing" ? <label className="nexops-field"><span>Property</span><select value={composer.propertyId} onChange={(event) => setComposer((current) => ({ ...current, propertyId: event.target.value }))} disabled={!composerProperties.length}><option value="">{composerProperties.length ? "Select Service Property" : "No saved properties"}</option>{composerProperties.map((property) => <option value={property.id} key={property.id}>{property.siteName ?? property.label ?? property.address?.line1 ?? property.id}</option>)}</select></label> : <div className="nexops-quote-new-property-form">
              <div className="nexops-request-builder-grid">
                <label className="nexops-field"><span>Property Name</span><input value={newPropertyDraft.siteName} placeholder="e.g. Northside Pool" onChange={(event) => setNewPropertyDraft((current) => ({ ...current, siteName: event.target.value }))} /></label>
                <label className="nexops-field"><span>Property Address</span><input value={newPropertyDraft.street1} placeholder="Street address" onChange={(event) => setNewPropertyDraft((current) => ({ ...current, street1: event.target.value }))} /></label>
                <label className="nexops-field"><span>City</span><input value={newPropertyDraft.city} onChange={(event) => setNewPropertyDraft((current) => ({ ...current, city: event.target.value }))} /></label>
                <label className="nexops-field"><span>State</span><input value={newPropertyDraft.province} onChange={(event) => setNewPropertyDraft((current) => ({ ...current, province: event.target.value }))} /></label>
                <label className="nexops-field"><span>ZIP Code</span><input value={newPropertyDraft.postalCode} onChange={(event) => setNewPropertyDraft((current) => ({ ...current, postalCode: event.target.value }))} /></label>
              </div>
              <label className="nexops-check-field inline"><input type="checkbox" checked={newPropertyDraft.gateCodeNeeded} onChange={(event) => setNewPropertyDraft((current) => ({ ...current, gateCodeNeeded: event.target.checked, gateCode: event.target.checked ? current.gateCode : "" }))} />Gate code needed</label>
              {newPropertyDraft.gateCodeNeeded ? <label className="nexops-field"><span>Gate Code</span><input value={newPropertyDraft.gateCode} onChange={(event) => setNewPropertyDraft((current) => ({ ...current, gateCode: event.target.value }))} /></label> : null}
              {newPropertyStatus ? <p className="nexops-form-note">{newPropertyStatus}</p> : null}
              <button className="nexops-quote-primary-button" type="button" onClick={() => void createPropertyForQuote()} disabled={newPropertyBusy}>{newPropertyBusy ? "Saving Property..." : "Save New Property"}</button>
            </div>}
            {newPropertyStatus ? <p className="nexops-form-note">{newPropertyStatus}</p> : null}
            <button className="nexops-quote-primary-button" type="button" onClick={saveClientSelection}>Save Client Selection</button>
          </div>
        </section>
      </div> : null}
      {templatePickerOpen ? <div className="nexops-modal-layer" role="presentation">
        <button className="nexops-modal-backdrop" type="button" aria-label="Close quote template selection" onClick={() => setTemplatePickerOpen(false)} />
        <section className="nexops-modal-card nexops-quote-client-search-modal nexops-quote-template-picker-modal" role="dialog" aria-modal="true" aria-label="Choose quote template">
          <div className="nexops-modal-head">
            <div><h2>Choose a Template</h2></div>
            <button type="button" onClick={() => setTemplatePickerOpen(false)}>Close</button>
          </div>
          <div className="nexops-catalog-picker-list">
            {templates.length ? templates.map((template) => <button className="nexops-catalog-picker-item nexops-quote-template-picker-item" type="button" key={template.id} onClick={() => startTemplateQuoteBuilder(template.id)}>
              <span><strong>{template.name}</strong><small>{template.description ?? "Start with this saved quote structure."}</small></span>
            </button>) : <div className="nexops-catalog-picker-empty"><strong>No quote templates yet</strong><small>Create a template in Quote Defaults, or use Add New to start from a blank quote.</small></div>}
          </div>
        </section>
      </div> : null}
      {clientSelectionMode === "new" && props.inlineClientCreateForm ? <div className="nexops-modal-layer" role="presentation">
        <button className="nexops-modal-backdrop" type="button" aria-label="Close new client form" onClick={() => setClientSelectionMode("existing")} />
        <section className="nexops-modal-card nexops-quote-client-create-modal" role="dialog" aria-modal="true" aria-label="Add new client">
          {props.inlineClientCreateForm}
        </section>
      </div> : null}
      {pendingCatalogCreateSeed ? <div className="nexops-modal-layer" role="presentation">
        <button className="nexops-modal-backdrop" type="button" aria-label="Close new line item confirmation" onClick={() => setPendingCatalogCreateSeed("")} />
        <section className="nexops-modal-card nexops-quote-confirm-modal" role="dialog" aria-modal="true" aria-label="Save new line item">
          <p className="eyebrow">Products &amp; services</p>
          <h2>Save as New Line Item?</h2>
          <p><strong>{pendingCatalogCreateSeed}</strong> is not in the library. Save it now so it can be reused on future quotes?</p>
          <div className="nexops-inline-actions">
            <button type="button" onClick={() => setPendingCatalogCreateSeed("")}>No</button>
            <button className="nexops-quote-primary-button" type="button" onClick={() => { setCatalogDraft(blankCatalogItemDraft(pendingCatalogCreateSeed)); setPendingCatalogCreateSeed(""); setCatalogEditorOpen(true); }}>Yes, Save New Line Item</button>
          </div>
        </section>
      </div> : null}
      <NexOpsCatalogEditorModal
        open={catalogEditorOpen}
        title="Create Product or Service"
        saveLabel={busy === "save-catalog-item" ? "Saving..." : "Save to Products & Services"}
        busy={busy === "save-catalog-item"}
        draft={catalogDraft}
        onDraftChange={setCatalogDraft}
        onClose={() => setCatalogEditorOpen(false)}
        onSave={() => void saveCatalogItemFromBuilder()}
      />
    </section>
  );
}
