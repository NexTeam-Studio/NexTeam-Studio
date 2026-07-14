import React, { useEffect, useMemo, useState } from "react";
import {
  PaymentScheduleEditor,
  blankPaymentSchedule,
  paymentScheduleFromRecord,
  paymentScheduleToPayload,
  type PaymentScheduleDraft,
  type PaymentScheduleRecord
} from "./nexopsPaymentSchedule";

type InvoiceStatus = "draft" | "sent" | "awaiting_payment" | "partial_pay" | "paid" | "void" | "bad_debt";
type InvoiceDeliveryMode = "email" | "sms" | "mark_sent";
type PaymentProvider = "stripe" | "paypal" | "manual" | "quote_bridge";
type PaymentMethodKind = "card" | "ach" | "cash" | "check" | "bank_transfer" | "other" | "paypal" | "venmo";
type PaymentStatus = "pending" | "failed" | "succeeded" | "refunded" | "partially_refunded";
type ReceiptReviewChannel = "email" | "sms";

interface ClientOption {
  id: string;
  name: string;
  company?: string;
  personName?: { firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  emails: string[];
  phones: string[];
}

interface InvoiceLineItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface QuoteDiscount {
  kind: "amount" | "percent";
  value: number;
}

interface InvoiceDeliveryPreferences {
  emailIncludePdf: boolean;
  emailIncludeSummary: boolean;
  emailIncludePayLink: boolean;
  smsIncludeSummary: boolean;
  smsIncludePayLink: boolean;
  smsIncludeHostedLink: boolean;
}

interface InvoiceRecord {
  id: string;
  tenantId: string;
  number?: string;
  clientId: string;
  jobId?: string;
  jobIds?: string[];
  jobReferences?: Array<{ jobId: string; number?: string; title: string; amount: number }>;
  quoteId?: string;
  requestId?: string;
  status: InvoiceStatus;
  title: string;
  lineItems: InvoiceLineItem[];
  totals: { subtotal: number; discount?: number; tax: number; total: number; taxRate?: number };
  discount?: QuoteDiscount;
  dueAt?: string;
  terms?: string;
  paymentSchedule?: PaymentScheduleRecord;
  deliveryDefaults?: InvoiceDeliveryPreferences;
  ledger?: {
    depositApplied: number;
    creditApplied: number;
    paymentApplied: number;
    refundedAmount: number;
    balanceDue: number;
    overdue: boolean;
    writtenOffAmount?: number;
  };
  delivery?: Array<{
    id: string;
    mode: InvoiceDeliveryMode;
    sentAt: string;
    target?: string;
    subject?: string;
    note?: string;
    includePdf?: boolean;
    includeSummary?: boolean;
    includePayLink?: boolean;
    includeHostedLink?: boolean;
  }>;
  createdAt?: string;
  updatedAt?: string;
  sentAt?: string;
  paidAt?: string;
}

interface SavedBillingCard {
  id: string;
  label: string;
  cardholderName?: string;
  brand?: string;
  last4?: string;
  updatedAt: string;
}

interface PaymentRecord {
  id: string;
  invoiceId?: string;
  quoteId?: string;
  clientId: string;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  status: PaymentStatus;
  amount: number;
  appliedAmount: number;
  excessCreditAmount?: number;
  note?: string;
  savedCardId?: string;
  cardSummary?: { cardholderName?: string; brand?: string; last4?: string };
  methodDetails?: {
    checkNumber?: string;
    bankTransferReference?: string;
    otherReference?: string;
    payerName?: string;
    failureMessage?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface RefundRecord {
  id: string;
  paymentId: string;
  invoiceId?: string;
  amount: number;
  reason?: string;
  status: "pending" | "succeeded" | "failed";
  createdAt: string;
}

interface CreditRecord {
  id: string;
  clientId: string;
  invoiceId?: string;
  amount: number;
  availableAmount: number;
  status: "available" | "partially_applied" | "applied";
}

interface ReceiptReviewAttachment {
  id: string;
  kind: "invoice_pdf" | "quote_pdf" | "field_report" | "photo" | "job_file";
  label: string;
}

interface ReceiptReviewRecord {
  id: string;
  invoiceId?: string;
  paymentId?: string;
  refundId?: string;
  status: "draft" | "ready_to_send" | "sent";
  subject: string;
  bodyText: string;
  emailRecipients: string[];
  smsRecipients: string[];
  sendChannels: ReceiptReviewChannel[];
  attachments: ReceiptReviewAttachment[];
  hostedLink: string;
  sentAt?: string;
}

interface ClientBillingProfile {
  savedCards: SavedBillingCard[];
}

interface JobSummary {
  id: string;
  clientId: string;
  number?: string;
  title: string;
  status: string;
  invoiceCount: number;
  paymentSchedule?: PaymentScheduleRecord;
}

interface InvoicesResponse {
  ok: boolean;
  invoices?: InvoiceRecord[];
  error?: string;
}

interface InvoiceDetailResponse {
  ok: boolean;
  invoice?: InvoiceRecord;
  client?: ClientOption;
  payments?: PaymentRecord[];
  refunds?: RefundRecord[];
  receiptReviews?: ReceiptReviewRecord[];
  billingProfile?: ClientBillingProfile;
  error?: string;
}

interface PaymentsResponse {
  ok: boolean;
  payments?: PaymentRecord[];
  error?: string;
}

interface RefundsResponse {
  ok: boolean;
  refunds?: RefundRecord[];
  error?: string;
}

interface CreditsResponse {
  ok: boolean;
  credits?: CreditRecord[];
  error?: string;
}

interface JobsResponse {
  ok: boolean;
  jobs?: JobSummary[];
  error?: string;
}

interface InvoiceMutationResponse {
  ok: boolean;
  invoice?: InvoiceRecord;
  payment?: PaymentRecord;
  refund?: RefundRecord;
  receiptReview?: ReceiptReviewRecord;
  checkout?: {
    provider: "stripe" | "paypal";
    method: "card" | "paypal" | "venmo";
    sessionId?: string;
    orderId?: string;
    url?: string;
  };
  portalUrl?: string;
  delivery?: {
    mode: InvoiceDeliveryMode;
    target?: string;
  };
  preview?: { title: string; body: string };
  error?: string;
}

interface ReceiptReviewMutationResponse {
  ok: boolean;
  receiptReview?: ReceiptReviewRecord;
  invoice?: InvoiceRecord;
  error?: string;
}

interface ComposeInvoiceResponse {
  ok: boolean;
  invoice?: InvoiceRecord;
  jobs?: JobSummary[];
  error?: string;
}

interface InvoiceDraftState {
  title: string;
  dueAt: string;
  terms: string;
  lineItems: InvoiceLineItem[];
  discountKind: "amount" | "percent";
  discountValue: number;
  taxRate: number;
  paymentSchedule: PaymentScheduleDraft;
  deliveryDefaults: InvoiceDeliveryPreferences;
}

interface SendDraftState {
  mode: InvoiceDeliveryMode;
  target: string;
  subject: string;
  note: string;
  includePdf: boolean;
  includeSummary: boolean;
  includePayLink: boolean;
  includeHostedLink: boolean;
}

interface PaymentDraftState {
  amount: number;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  note: string;
  savedCardId: string;
  payerName: string;
  checkNumber: string;
  bankTransferReference: string;
  otherReference: string;
  failureMessage: string;
  status: "succeeded" | "failed";
}

interface ReceiptReviewDraftState {
  subject: string;
  bodyText: string;
  emailRecipients: string;
  smsRecipients: string;
  sendChannels: ReceiptReviewChannel[];
  attachmentIds: string[];
}

interface CombineDraftState {
  title: string;
  discountKind: "amount" | "percent";
  discountValue: number;
  taxRate: number;
  terms: string;
  paymentSchedule: PaymentScheduleDraft;
}

interface RefundDraftState {
  paymentId: string;
  amount: number;
  reason: string;
}

interface NexOpsInvoicesPageProps {
  tenantId: string;
  clients: ClientOption[];
  entryPoint: "invoices" | "payments";
  focusedInvoiceId?: string;
  onCrmMutation?: () => void;
}

function money(value?: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function clientDisplayName(client?: ClientOption): string {
  if (!client) {
    return "Unknown client";
  }
  const person = [client.personName?.firstName, client.personName?.lastName].filter(Boolean).join(" ").trim();
  if (client.company && client.displayNamePreference !== "person") {
    return client.company;
  }
  return person || client.name;
}

function isoDate(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function formatTimestamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function splitRecipients(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function latestSavedCardId(cards: SavedBillingCard[]): string {
  return [...cards]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ?? "";
}

function invoiceDraftFromRecord(invoice: InvoiceRecord): InvoiceDraftState {
  return {
    title: invoice.title,
    dueAt: isoDate(invoice.dueAt),
    terms: invoice.terms ?? "",
    lineItems: invoice.lineItems.map((item) => ({ ...item })),
    discountKind: invoice.discount?.kind ?? "amount",
    discountValue: invoice.discount?.value ?? 0,
    taxRate: invoice.totals.taxRate ?? 0,
    paymentSchedule: paymentScheduleFromRecord(invoice.paymentSchedule),
    deliveryDefaults: invoice.deliveryDefaults ?? {
      emailIncludePdf: true,
      emailIncludeSummary: true,
      emailIncludePayLink: true,
      smsIncludeSummary: true,
      smsIncludePayLink: true,
      smsIncludeHostedLink: true
    }
  };
}

function lineItemTotal(item: InvoiceLineItem): number {
  return roundMoney(item.quantity * item.unitPrice);
}

function invoiceTotalsPreview(state: InvoiceDraftState): { subtotal: number; discount: number; tax: number; total: number } {
  const subtotal = roundMoney(state.lineItems.reduce((sum, item) => sum + lineItemTotal(item), 0));
  const discount = state.discountValue > 0
    ? roundMoney(state.discountKind === "percent" ? subtotal * (state.discountValue / 100) : state.discountValue)
    : 0;
  const taxable = Math.max(0, subtotal - Math.min(subtotal, discount));
  const tax = roundMoney(taxable * (state.taxRate / 100));
  return {
    subtotal,
    discount: Math.min(subtotal, discount),
    tax,
    total: roundMoney(taxable + tax)
  };
}

function receiptReviewDraftFromRecord(review: ReceiptReviewRecord, client?: ClientOption): ReceiptReviewDraftState {
  return {
    subject: review.subject,
    bodyText: review.bodyText,
    emailRecipients: review.emailRecipients.join(", ") || client?.emails[0] || "",
    smsRecipients: review.smsRecipients.join(", ") || client?.phones[0] || "",
    sendChannels: review.sendChannels.length ? review.sendChannels : ["email"],
    attachmentIds: review.attachments.map((attachment) => attachment.id)
  };
}

function defaultSendDraft(invoice: InvoiceRecord, client?: ClientOption): SendDraftState {
  const defaults = invoice.deliveryDefaults ?? {
    emailIncludePdf: true,
    emailIncludeSummary: true,
    emailIncludePayLink: true,
    smsIncludeSummary: true,
    smsIncludePayLink: true,
    smsIncludeHostedLink: true
  };
  return {
    mode: "email",
    target: client?.emails[0] ?? "",
    subject: invoice.number ? `Invoice ${invoice.number}` : invoice.title,
    note: "",
    includePdf: defaults.emailIncludePdf,
    includeSummary: defaults.emailIncludeSummary,
    includePayLink: defaults.emailIncludePayLink,
    includeHostedLink: true
  };
}

function defaultPaymentDraft(invoice: InvoiceRecord, cards: SavedBillingCard[]): PaymentDraftState {
  return {
    amount: invoice.ledger?.balanceDue ?? invoice.totals.total,
    provider: cards.length ? "stripe" : "manual",
    method: cards.length ? "card" : "cash",
    note: "",
    savedCardId: latestSavedCardId(cards),
    payerName: "",
    checkNumber: "",
    bankTransferReference: "",
    otherReference: "",
    failureMessage: "",
    status: "succeeded"
  };
}

function emptyCombineDraft(): CombineDraftState {
  return {
    title: "",
    discountKind: "amount",
    discountValue: 0,
    taxRate: 0,
    terms: "",
    paymentSchedule: blankPaymentSchedule()
  };
}

export function NexOpsInvoicesPage(props: NexOpsInvoicesPageProps): React.ReactElement {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [credits, setCredits] = useState<CreditRecord[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading billing workspace...");
  const [detailStatus, setDetailStatus] = useState("Pick an invoice to review draft edits, payments, and receipt review.");
  const [busy, setBusy] = useState("");
  const [detail, setDetail] = useState<InvoiceDetailResponse | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraftState | null>(null);
  const [sendDraft, setSendDraft] = useState<SendDraftState | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState | null>(null);
  const [selectedReceiptReviewId, setSelectedReceiptReviewId] = useState("");
  const [receiptReviewDraft, setReceiptReviewDraft] = useState<ReceiptReviewDraftState | null>(null);
  const [combineDraft, setCombineDraft] = useState<CombineDraftState>(() => emptyCombineDraft());
  const [combineSelection, setCombineSelection] = useState<string[]>([]);
  const [refundDraft, setRefundDraft] = useState<RefundDraftState>({ paymentId: "", amount: 0, reason: "" });
  const [lastHostedCheckoutUrl, setLastHostedCheckoutUrl] = useState("");
  const [recoveryHint, setRecoveryHint] = useState("");

  const filteredInvoices = useMemo(() => {
    const needle = invoiceSearch.trim().toLowerCase();
    if (!needle) {
      return invoices;
    }
    return invoices.filter((invoice) => {
      const client = props.clients.find((candidate) => candidate.id === invoice.clientId);
      return [
        invoice.number,
        invoice.title,
        invoice.status,
        clientDisplayName(client)
      ].some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [invoiceSearch, invoices, props.clients]);

  const combineCandidates = useMemo(
    () => jobs.filter((job) => job.status === "Requires Invoicing" || job.status === "Action Required"),
    [jobs]
  );

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId);
  const selectedClient = props.clients.find((client) => client.id === detail?.invoice?.clientId);
  const selectedReview = detail?.receiptReviews?.find((review) => review.id === selectedReceiptReviewId)
    ?? detail?.receiptReviews?.[0];
  const sortedCards = [...(detail?.billingProfile?.savedCards ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const selectedPayment = detail?.payments?.find((payment) => payment.id === refundDraft.paymentId)
    ?? detail?.payments?.find((payment) => payment.status === "succeeded");
  const totalsPreview = invoiceDraft ? invoiceTotalsPreview(invoiceDraft) : null;

  async function loadWorkspace(preferredInvoiceId?: string): Promise<void> {
    try {
      const [invoicesBody, paymentsBody, refundsBody, creditsBody, jobsBody] = await Promise.all([
        fetch(`/api/crm/invoices?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<InvoicesResponse>),
        fetch(`/api/crm/payments?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<PaymentsResponse>),
        fetch(`/api/crm/refunds?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<RefundsResponse>),
        fetch(`/api/crm/credits?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<CreditsResponse>),
        fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<JobsResponse>)
      ]);
      if (!invoicesBody.ok) {
        setStatusMessage(invoicesBody.error ?? "Invoices are unavailable right now.");
        setInvoices([]);
        return;
      }
      setInvoices(invoicesBody.invoices ?? []);
      setPayments(paymentsBody.ok ? paymentsBody.payments ?? [] : []);
      setRefunds(refundsBody.ok ? refundsBody.refunds ?? [] : []);
      setCredits(creditsBody.ok ? creditsBody.credits ?? [] : []);
      setJobs(jobsBody.ok ? jobsBody.jobs ?? [] : []);
      const nextSelected = preferredInvoiceId && (invoicesBody.invoices ?? []).some((invoice) => invoice.id === preferredInvoiceId)
        ? preferredInvoiceId
        : selectedInvoiceId && (invoicesBody.invoices ?? []).some((invoice) => invoice.id === selectedInvoiceId)
          ? selectedInvoiceId
          : invoicesBody.invoices?.[0]?.id ?? "";
      setSelectedInvoiceId(nextSelected);
      setStatusMessage((invoicesBody.invoices ?? []).length
        ? `${invoicesBody.invoices?.length ?? 0} invoice${(invoicesBody.invoices?.length ?? 0) === 1 ? "" : "s"} loaded.`
        : "No invoices yet. Use Close and Invoice from Jobs or combine ready jobs here.");
    } catch {
      setInvoices([]);
      setStatusMessage("Billing APIs are unreachable.");
    }
  }

  async function loadDetail(invoiceId: string): Promise<void> {
    if (!invoiceId) {
      setDetail(null);
      setDetailStatus("Pick an invoice to review draft edits, payments, and receipt review.");
      return;
    }
    setDetailStatus("Loading invoice detail...");
    try {
      const body = await fetch(`/api/crm/invoices/${encodeURIComponent(invoiceId)}?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<InvoiceDetailResponse>);
      if (!body.ok || !body.invoice) {
        setDetail(null);
        setDetailStatus(body.error ?? "Invoice detail is unavailable right now.");
        return;
      }
      setDetail(body);
      setInvoiceDraft(invoiceDraftFromRecord(body.invoice));
      setSendDraft(defaultSendDraft(body.invoice, body.client));
      setPaymentDraft(defaultPaymentDraft(body.invoice, body.billingProfile?.savedCards ?? []));
      const review = body.receiptReviews?.[0];
      setSelectedReceiptReviewId(review?.id ?? "");
      setReceiptReviewDraft(review ? receiptReviewDraftFromRecord(review, body.client) : null);
      const latestSucceededPayment = body.payments?.find((payment) => payment.status === "succeeded");
      setRefundDraft({
        paymentId: latestSucceededPayment?.id ?? "",
        amount: latestSucceededPayment?.appliedAmount ?? latestSucceededPayment?.amount ?? 0,
        reason: ""
      });
      setDetailStatus(`Viewing ${body.invoice.number ?? body.invoice.id}.`);
    } catch {
      setDetail(null);
      setDetailStatus("Invoice detail API unreachable.");
    }
  }

  useEffect(() => {
    void loadWorkspace(props.focusedInvoiceId);
    const handleMutation = () => void loadWorkspace();
    window.addEventListener("nexops:crm-mutated", handleMutation);
    return () => window.removeEventListener("nexops:crm-mutated", handleMutation);
  }, [props.tenantId]);

  useEffect(() => {
    if (!props.focusedInvoiceId) {
      return;
    }
    if (props.focusedInvoiceId === selectedInvoiceId) {
      return;
    }
    if (invoices.some((invoice) => invoice.id === props.focusedInvoiceId)) {
      setSelectedInvoiceId(props.focusedInvoiceId);
    }
  }, [props.focusedInvoiceId, invoices, selectedInvoiceId]);

  useEffect(() => {
    void loadDetail(selectedInvoiceId);
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!selectedReview) {
      return;
    }
    setReceiptReviewDraft(receiptReviewDraftFromRecord(selectedReview, selectedClient));
  }, [selectedReceiptReviewId, selectedReview?.id, selectedClient?.id]);

  async function saveInvoiceDraft(): Promise<void> {
    if (!detail?.invoice || !invoiceDraft) {
      return;
    }
    setBusy("save-invoice");
    setDetailStatus("Saving invoice draft...");
    try {
      const body = await fetch(`/api/crm/invoices/${encodeURIComponent(detail.invoice.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          title: invoiceDraft.title.trim(),
          dueAt: invoiceDraft.dueAt ? new Date(`${invoiceDraft.dueAt}T23:59:59.000Z`).toISOString() : undefined,
          terms: invoiceDraft.terms,
          lineItems: invoiceDraft.lineItems.map((item) => ({
            ...item,
            total: lineItemTotal(item)
          })),
          discount: { kind: invoiceDraft.discountKind, value: invoiceDraft.discountValue },
          taxRate: invoiceDraft.taxRate,
          paymentSchedule: paymentScheduleToPayload(invoiceDraft.paymentSchedule),
          deliveryDefaults: invoiceDraft.deliveryDefaults
        })
      }).then((response) => response.json() as Promise<InvoiceMutationResponse>);
      if (!body.ok || !body.invoice) {
        setDetailStatus(body.error ?? "Invoice save failed.");
        return;
      }
      await loadWorkspace(body.invoice.id);
      await loadDetail(body.invoice.id);
      props.onCrmMutation?.();
      setDetailStatus("Invoice draft saved.");
    } catch {
      setDetailStatus("Invoice save failed.");
    } finally {
      setBusy("");
    }
  }

  async function sendInvoice(): Promise<void> {
    if (!detail?.invoice || !sendDraft) {
      return;
    }
    setBusy("send-invoice");
    setDetailStatus("Sending invoice...");
    try {
      const body = await fetch(`/api/crm/invoices/${encodeURIComponent(detail.invoice.id)}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          mode: sendDraft.mode,
          ...(sendDraft.target.trim() ? { target: sendDraft.target.trim() } : {}),
          ...(sendDraft.subject.trim() ? { subject: sendDraft.subject.trim() } : {}),
          ...(sendDraft.note.trim() ? { note: sendDraft.note.trim() } : {}),
          includePdf: sendDraft.includePdf,
          includeSummary: sendDraft.includeSummary,
          includePayLink: sendDraft.includePayLink,
          includeHostedLink: sendDraft.includeHostedLink
        })
      }).then((response) => response.json() as Promise<InvoiceMutationResponse>);
      if (!body.ok || !body.invoice) {
        setDetailStatus(body.error ?? "Invoice send failed.");
        return;
      }
      if (body.portalUrl) {
        setLastHostedCheckoutUrl(body.portalUrl);
      }
      await loadWorkspace(body.invoice.id);
      await loadDetail(body.invoice.id);
      props.onCrmMutation?.();
      setDetailStatus(`Invoice sent by ${body.delivery?.mode ?? sendDraft.mode}.`);
    } catch {
      setDetailStatus("Invoice send failed.");
    } finally {
      setBusy("");
    }
  }

  async function launchHostedCheckout(provider: "stripe" | "paypal", method: "card" | "paypal" | "venmo"): Promise<void> {
    if (!detail?.invoice) {
      return;
    }
    setBusy("checkout");
    setDetailStatus(`Opening ${provider === "paypal" ? method.toUpperCase() : "hosted card"} checkout...`);
    try {
      const body = await fetch(`/api/crm/invoices/${encodeURIComponent(detail.invoice.id)}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          provider,
          method
        })
      }).then((response) => response.json() as Promise<InvoiceMutationResponse>);
      if (!body.ok || !body.checkout?.url) {
        setDetailStatus(body.error ?? "Hosted checkout is unavailable.");
        return;
      }
      setLastHostedCheckoutUrl(body.checkout.url);
      window.open(body.checkout.url, "_blank", "noopener,noreferrer");
      setDetailStatus(`${provider === "paypal" ? method.toUpperCase() : "Stripe"} checkout opened in a new tab.`);
    } catch {
      setDetailStatus("Hosted checkout is unavailable.");
    } finally {
      setBusy("");
    }
  }

  async function collectPayment(): Promise<void> {
    if (!detail?.invoice || !paymentDraft) {
      return;
    }
    const usesHostedCheckout = paymentDraft.provider === "paypal"
      || (paymentDraft.provider === "stripe" && paymentDraft.method === "card" && !paymentDraft.savedCardId);
    if (usesHostedCheckout) {
      await launchHostedCheckout(
        paymentDraft.provider === "paypal" ? "paypal" : "stripe",
        paymentDraft.provider === "paypal"
          ? (paymentDraft.method === "venmo" ? "venmo" : "paypal")
          : "card"
      );
      return;
    }
    setBusy("collect-payment");
    setDetailStatus("Recording payment...");
    setRecoveryHint("");
    try {
      const methodDetails = {
        ...(paymentDraft.payerName.trim() ? { payerName: paymentDraft.payerName.trim() } : {}),
        ...(paymentDraft.checkNumber.trim() ? { checkNumber: paymentDraft.checkNumber.trim() } : {}),
        ...(paymentDraft.bankTransferReference.trim() ? { bankTransferReference: paymentDraft.bankTransferReference.trim() } : {}),
        ...(paymentDraft.otherReference.trim() ? { otherReference: paymentDraft.otherReference.trim() } : {}),
        ...(paymentDraft.failureMessage.trim() ? { failureMessage: paymentDraft.failureMessage.trim() } : {})
      };
      const body = await fetch(`/api/crm/invoices/${encodeURIComponent(detail.invoice.id)}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          amount: paymentDraft.amount,
          provider: paymentDraft.provider,
          method: paymentDraft.method,
          ...(paymentDraft.note.trim() ? { note: paymentDraft.note.trim() } : {}),
          ...(paymentDraft.savedCardId ? { savedCardId: paymentDraft.savedCardId } : {}),
          ...(Object.keys(methodDetails).length ? { methodDetails } : {}),
          status: paymentDraft.status
        })
      }).then((response) => response.json() as Promise<InvoiceMutationResponse>);
      if (!body.ok || !body.invoice) {
        setDetailStatus(body.error ?? "Payment collection failed.");
        return;
      }
      await loadWorkspace(body.invoice.id);
      await loadDetail(body.invoice.id);
      props.onCrmMutation?.();
      if (paymentDraft.status === "failed") {
        setRecoveryHint("Choose what to do next: retry this card, switch to another saved card, take a manual payment, or send a client pay link.");
        setDetailStatus("Card attempt failed. Recovery options are ready below.");
        return;
      }
      if (body.invoice.status === "partial_pay" && (body.invoice.ledger?.balanceDue ?? 0) > 0) {
        setDetailStatus(`Partial payment recorded. ${money(body.invoice.ledger?.balanceDue)} remains. Send the balance request now.`);
        return;
      }
      setDetailStatus(`Payment recorded. Invoice is now ${body.invoice.status.replaceAll("_", " ")}.`);
    } catch {
      setDetailStatus("Payment collection failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveReceiptReview(): Promise<void> {
    if (!selectedReview || !receiptReviewDraft) {
      return;
    }
    setBusy("save-receipt");
    setDetailStatus("Saving receipt review...");
    try {
      const body = await fetch(`/api/crm/receipt-reviews/${encodeURIComponent(selectedReview.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          subject: receiptReviewDraft.subject,
          bodyText: receiptReviewDraft.bodyText,
          emailRecipients: splitRecipients(receiptReviewDraft.emailRecipients),
          smsRecipients: splitRecipients(receiptReviewDraft.smsRecipients),
          sendChannels: receiptReviewDraft.sendChannels,
          attachmentIds: receiptReviewDraft.attachmentIds
        })
      }).then((response) => response.json() as Promise<ReceiptReviewMutationResponse>);
      if (!body.ok || !body.receiptReview || !detail?.invoice) {
        setDetailStatus(body.error ?? "Receipt review save failed.");
        return;
      }
      await loadDetail(detail.invoice.id);
      setSelectedReceiptReviewId(body.receiptReview.id);
      setDetailStatus("Receipt review saved.");
    } catch {
      setDetailStatus("Receipt review save failed.");
    } finally {
      setBusy("");
    }
  }

  async function sendReceiptReview(): Promise<void> {
    if (!selectedReview || !receiptReviewDraft) {
      return;
    }
    setBusy("send-receipt");
    setDetailStatus("Sending receipt review...");
    try {
      const body = await fetch(`/api/crm/receipt-reviews/${encodeURIComponent(selectedReview.id)}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          subject: receiptReviewDraft.subject,
          bodyText: receiptReviewDraft.bodyText,
          emailRecipients: splitRecipients(receiptReviewDraft.emailRecipients),
          smsRecipients: splitRecipients(receiptReviewDraft.smsRecipients),
          sendChannels: receiptReviewDraft.sendChannels,
          attachmentIds: receiptReviewDraft.attachmentIds
        })
      }).then((response) => response.json() as Promise<ReceiptReviewMutationResponse>);
      if (!body.ok || !body.receiptReview || !detail?.invoice) {
        setDetailStatus(body.error ?? "Receipt send failed.");
        return;
      }
      await loadDetail(detail.invoice.id);
      setSelectedReceiptReviewId(body.receiptReview.id);
      setDetailStatus("Receipt reviewed and sent.");
    } catch {
      setDetailStatus("Receipt send failed.");
    } finally {
      setBusy("");
    }
  }

  async function runInvoiceLedgerAction(action: "void" | "bad_debt"): Promise<void> {
    if (!detail?.invoice) {
      return;
    }
    setBusy(action);
    setDetailStatus(action === "void" ? "Voiding invoice..." : "Marking bad debt...");
    try {
      const body = await fetch(`/api/crm/invoices/${encodeURIComponent(detail.invoice.id)}/${action === "void" ? "void" : "bad-debt"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<InvoiceMutationResponse>);
      if (!body.ok || !body.invoice) {
        setDetailStatus(body.error ?? "Billing action failed.");
        return;
      }
      await loadWorkspace(body.invoice.id);
      await loadDetail(body.invoice.id);
      props.onCrmMutation?.();
      setDetailStatus(action === "void" ? "Invoice voided." : "Invoice marked bad debt.");
    } catch {
      setDetailStatus("Billing action failed.");
    } finally {
      setBusy("");
    }
  }

  async function refundPayment(): Promise<void> {
    if (!refundDraft.paymentId) {
      setDetailStatus("Pick a payment to refund first.");
      return;
    }
    setBusy("refund");
    setDetailStatus("Refunding payment...");
    try {
      const body = await fetch(`/api/crm/payments/${encodeURIComponent(refundDraft.paymentId)}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          amount: refundDraft.amount,
          ...(refundDraft.reason.trim() ? { reason: refundDraft.reason.trim() } : {})
        })
      }).then((response) => response.json() as Promise<InvoiceMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Refund failed.");
        return;
      }
      const nextInvoiceId = body.invoice?.id ?? detail?.invoice?.id;
      if (nextInvoiceId) {
        await loadWorkspace(nextInvoiceId);
        await loadDetail(nextInvoiceId);
      }
      props.onCrmMutation?.();
      setDetailStatus("Refund recorded and paused in receipt review.");
    } catch {
      setDetailStatus("Refund failed.");
    } finally {
      setBusy("");
    }
  }

  async function combineSelectedJobs(): Promise<void> {
    if (!combineSelection.length) {
      setStatusMessage("Choose at least one job to combine.");
      return;
    }
    setBusy("combine");
    setStatusMessage("Combining jobs into one invoice...");
    try {
      const body = await fetch("/api/crm/invoices/compose-from-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          jobIds: combineSelection,
          ...(combineDraft.title.trim() ? { title: combineDraft.title.trim() } : {}),
          discount: { kind: combineDraft.discountKind, value: combineDraft.discountValue },
          taxRate: combineDraft.taxRate,
          ...(combineDraft.terms.trim() ? { terms: combineDraft.terms.trim() } : {}),
          paymentSchedule: paymentScheduleToPayload(combineDraft.paymentSchedule)
        })
      }).then((response) => response.json() as Promise<ComposeInvoiceResponse>);
      if (!body.ok || !body.invoice) {
        setStatusMessage(body.error ?? "Combined invoice create failed.");
        return;
      }
      setCombineSelection([]);
      setCombineDraft(emptyCombineDraft());
      await loadWorkspace(body.invoice.id);
      await loadDetail(body.invoice.id);
      props.onCrmMutation?.();
      setStatusMessage(`Combined invoice ${body.invoice.number ?? body.invoice.id} created.`);
    } catch {
      setStatusMessage("Combined invoice create failed.");
    } finally {
      setBusy("");
    }
  }

  const counts = {
    draft: invoices.filter((invoice) => invoice.status === "draft").length,
    awaiting: invoices.filter((invoice) => invoice.status === "awaiting_payment" || invoice.status === "sent").length,
    partial: invoices.filter((invoice) => invoice.status === "partial_pay").length,
    paid: invoices.filter((invoice) => invoice.status === "paid").length,
    refunds: refunds.length,
    credits: credits.filter((credit) => credit.availableAmount > 0).length
  };

  return (
    <section className="nexops-module-page">
      <div className="nexops-page-heading">
        <div>
          <h1>{props.entryPoint === "payments" ? "Payments" : "Invoices"}</h1>
          <p>Draft, send, collect, recover, and pause at receipt review before anything goes out the door.</p>
        </div>
        <div className="nexops-inline-actions">
          <button type="button" onClick={() => void loadWorkspace()} disabled={Boolean(busy)}>Refresh</button>
          {detail?.invoice ? <a href={`/api/crm/invoices/${encodeURIComponent(detail.invoice.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} rel="noreferrer" target="_blank">Open PDF</a> : null}
        </div>
      </div>

      <div className="nexops-workflow-strip">
        <article><span>Draft</span><strong>{counts.draft}</strong><p>Still editable before send.</p></article>
        <article><span>Awaiting</span><strong>{counts.awaiting}</strong><p>Sent or outstanding balances.</p></article>
        <article><span>Partial</span><strong>{counts.partial}</strong><p>Prompt the remaining balance immediately.</p></article>
        <article><span>Paid</span><strong>{counts.paid}</strong><p>Receipt review should be waiting next.</p></article>
        <article><span>Refunds</span><strong>{counts.refunds}</strong><p>Tracked separately from void and bad debt.</p></article>
        <article><span>Credits</span><strong>{counts.credits}</strong><p>Available client balance still on hand.</p></article>
      </div>

      <div className="nexops-two-column">
        <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Invoice roster</p>
              <h2>{filteredInvoices.length} visible</h2>
            </div>
            <input placeholder="Search invoices" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} />
          </div>
          <p>{statusMessage}</p>
          <ul className="nexops-record-list">
            {filteredInvoices.map((invoice) => {
              const client = props.clients.find((candidate) => candidate.id === invoice.clientId);
              return (
                <li className={invoice.id === selectedInvoiceId ? "selected" : ""} key={invoice.id}>
                  <button className="nexops-request-row-button" type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    <span>
                      <strong>{invoice.number ?? invoice.id}</strong>
                      <small>{invoice.title}</small>
                      <small>{clientDisplayName(client)} - due {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "now"}</small>
                    </span>
                    <mark>{invoice.status.replaceAll("_", " ")}</mark>
                    <b>{money(invoice.ledger?.balanceDue ?? invoice.totals.total)}</b>
                  </button>
                </li>
              );
            })}
            {!filteredInvoices.length ? <li><p className="nexops-empty-copy">No invoices match right now.</p></li> : null}
          </ul>
        </article>

        <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Combine ready jobs</p>
              <h2>{combineSelection.length} selected</h2>
            </div>
            <button type="button" onClick={() => void combineSelectedJobs()} disabled={Boolean(busy) || !combineSelection.length}>
              {busy === "combine" ? "Combining..." : "Create combined invoice"}
            </button>
          </div>
          <p>Pick any subset of jobs that need invoicing. The resulting invoice keeps each job reference visible on the record and on the receipt path.</p>
          <div className="nexops-jobs-sublist">
            {combineCandidates.map((job) => (
              <label className="nexops-jobs-sublist-item" key={job.id}>
                <div>
                  <strong>{job.number ?? job.id}</strong>
                  <span>{job.title}</span>
                </div>
                <div>
                  <span className={`nexops-job-status status-${job.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{job.status}</span>
                  <input
                    type="checkbox"
                    checked={combineSelection.includes(job.id)}
                    onChange={(event) => setCombineSelection((current) => event.target.checked ? [...current, job.id] : current.filter((candidate) => candidate !== job.id))}
                  />
                </div>
              </label>
            ))}
            {!combineCandidates.length ? <p className="nexops-empty-copy">No jobs are waiting for combine-ready invoicing right now.</p> : null}
          </div>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Combined invoice title</span>
              <input value={combineDraft.title} onChange={(event) => setCombineDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Optional override" />
            </label>
            <label className="nexops-field">
              <span>Tax rate (%)</span>
              <input type="number" min="0" step="0.01" value={combineDraft.taxRate} onChange={(event) => setCombineDraft((current) => ({ ...current, taxRate: Math.max(0, Number(event.target.value || 0)) }))} />
            </label>
          </div>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Discount kind</span>
              <select value={combineDraft.discountKind} onChange={(event) => setCombineDraft((current) => ({ ...current, discountKind: event.target.value as "amount" | "percent" }))}>
                <option value="amount">Flat amount</option>
                <option value="percent">Percent</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Discount value</span>
              <input type="number" min="0" step="0.01" value={combineDraft.discountValue} onChange={(event) => setCombineDraft((current) => ({ ...current, discountValue: Math.max(0, Number(event.target.value || 0)) }))} />
            </label>
          </div>
          <label className="nexops-field">
            <span>Terms</span>
            <textarea rows={4} value={combineDraft.terms} onChange={(event) => setCombineDraft((current) => ({ ...current, terms: event.target.value }))} />
          </label>
          <PaymentScheduleEditor
            value={combineDraft.paymentSchedule}
            onChange={(paymentSchedule) => setCombineDraft((current) => ({ ...current, paymentSchedule }))}
            title="Combined invoice payment schedule"
            hint="Use this when the grouped jobs still need a deposit or staged balance plan."
          />
        </article>
      </div>

      <article className="nexops-module-card">
        {detail?.invoice && invoiceDraft && sendDraft && paymentDraft ? (
          <div className="nexops-billing-detail">
            <div className="nexops-page-heading">
              <div>
                <p className="eyebrow">Invoice detail</p>
                <h2>{detail.invoice.number ?? detail.invoice.id}</h2>
                <p>{detail.invoice.title}</p>
              </div>
              <div className="nexops-inline-actions">
                <span className={`nexops-job-status status-${detail.invoice.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{detail.invoice.status.replaceAll("_", " ")}</span>
              </div>
            </div>
            <p>{detailStatus}</p>

            <div className="nexops-request-summary-grid">
              <article><h3>Client</h3><p>{clientDisplayName(selectedClient)}</p><small>{selectedClient?.emails[0] ?? "No email"} | {selectedClient?.phones[0] ?? "No phone"}</small></article>
              <article><h3>Balance due</h3><p>{money(detail.invoice.ledger?.balanceDue ?? detail.invoice.totals.total)}</p><small>Paid applied {money(detail.invoice.ledger?.paymentApplied)}</small></article>
              <article><h3>Due</h3><p>{detail.invoice.dueAt ? new Date(detail.invoice.dueAt).toLocaleDateString() : "Immediate"}</p><small>Updated {formatTimestamp(detail.invoice.updatedAt)}</small></article>
              <article><h3>Receipt review</h3><p>{detail.receiptReviews?.length ?? 0}</p><small>{selectedReview ? `Latest ${selectedReview.status}` : "Created after payment/refund"}</small></article>
            </div>

            {detail.invoice.jobReferences?.length ? (
              <section className="nexops-quote-panel">
                <div className="nexops-quote-section-head">
                  <h3>Jobs covered by this invoice</h3>
                  <span>Combined receipts keep each source job visible.</span>
                </div>
                <div className="nexops-mini-list">
                  {detail.invoice.jobReferences.map((reference) => (
                    <div className="nexops-quote-detail-line" key={reference.jobId}>
                      <span>
                        <strong>{reference.number ?? reference.jobId}</strong>
                        <small>{reference.title}</small>
                      </span>
                      <mark>{money(reference.amount)}</mark>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="nexops-two-column">
              <section className="nexops-quote-panel">
                <div className="nexops-quote-section-head">
                  <h3>Draft invoice editor</h3>
                  <button type="button" onClick={() => void saveInvoiceDraft()} disabled={Boolean(busy) || detail.invoice.status !== "draft"}>
                    {busy === "save-invoice" ? "Saving..." : "Save invoice"}
                  </button>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Title</span>
                    <input value={invoiceDraft.title} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, title: event.target.value } : current)} disabled={detail.invoice.status !== "draft"} />
                  </label>
                  <label className="nexops-field">
                    <span>Due date</span>
                    <input type="date" value={invoiceDraft.dueAt} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, dueAt: event.target.value } : current)} />
                  </label>
                </div>
                <div className="nexops-quote-line-list">
                  {invoiceDraft.lineItems.map((item) => (
                    <div className="nexops-quote-line-card" key={item.id}>
                      <div className="nexops-request-builder-grid">
                        <label className="nexops-field">
                          <span>Code</span>
                          <input value={item.code} onChange={(event) => setInvoiceDraft((current) => current ? {
                            ...current,
                            lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, code: event.target.value } : candidate)
                          } : current)} disabled={detail.invoice.status !== "draft"} />
                        </label>
                        <label className="nexops-field">
                          <span>Name</span>
                          <input value={item.name} onChange={(event) => setInvoiceDraft((current) => current ? {
                            ...current,
                            lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, name: event.target.value } : candidate)
                          } : current)} disabled={detail.invoice.status !== "draft"} />
                        </label>
                      </div>
                      <label className="nexops-field">
                        <span>Description</span>
                        <input value={item.description ?? ""} onChange={(event) => setInvoiceDraft((current) => current ? {
                          ...current,
                          lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, description: event.target.value } : candidate)
                        } : current)} disabled={detail.invoice.status !== "draft"} />
                      </label>
                      <div className="nexops-request-builder-grid nexops-quote-line-metrics">
                        <label className="nexops-field">
                          <span>Qty</span>
                          <input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => setInvoiceDraft((current) => current ? {
                            ...current,
                            lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, quantity: Math.max(0, Number(event.target.value || 0)) } : candidate)
                          } : current)} disabled={detail.invoice.status !== "draft"} />
                        </label>
                        <label className="nexops-field">
                          <span>Unit price</span>
                          <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setInvoiceDraft((current) => current ? {
                            ...current,
                            lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, unitPrice: Math.max(0, Number(event.target.value || 0)) } : candidate)
                          } : current)} disabled={detail.invoice.status !== "draft"} />
                        </label>
                        <div className="nexops-invoice-inline-total">
                          <span>Line total</span>
                          <strong>{money(lineItemTotal(item))}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Discount kind</span>
                    <select value={invoiceDraft.discountKind} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, discountKind: event.target.value as "amount" | "percent" } : current)} disabled={detail.invoice.status !== "draft"}>
                      <option value="amount">Flat amount</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Discount value</span>
                    <input type="number" min="0" step="0.01" value={invoiceDraft.discountValue} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, discountValue: Math.max(0, Number(event.target.value || 0)) } : current)} disabled={detail.invoice.status !== "draft"} />
                  </label>
                  <label className="nexops-field">
                    <span>Tax rate (%)</span>
                    <input type="number" min="0" step="0.01" value={invoiceDraft.taxRate} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, taxRate: Math.max(0, Number(event.target.value || 0)) } : current)} disabled={detail.invoice.status !== "draft"} />
                  </label>
                </div>
                <label className="nexops-field">
                  <span>Terms</span>
                  <textarea rows={5} value={invoiceDraft.terms} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, terms: event.target.value } : current)} />
                </label>
                <PaymentScheduleEditor
                  value={invoiceDraft.paymentSchedule}
                  onChange={(paymentSchedule) => setInvoiceDraft((current) => current ? { ...current, paymentSchedule } : current)}
                  hint="Milestones here carry the deposit and balance plan into the invoice itself."
                />
                <div className="nexops-quote-totals compact">
                  <article><span>Subtotal</span><strong>{money(totalsPreview?.subtotal)}</strong></article>
                  <article><span>Discount</span><strong>{money(totalsPreview?.discount)}</strong></article>
                  <article><span>Tax</span><strong>{money(totalsPreview?.tax)}</strong></article>
                  <article><span>Total</span><strong>{money(totalsPreview?.total)}</strong></article>
                </div>
              </section>

              <section className="nexops-quote-panel">
                <div className="nexops-quote-section-head">
                  <h3>Send invoice</h3>
                  <button type="button" onClick={() => void sendInvoice()} disabled={Boolean(busy)}>
                    {busy === "send-invoice" ? "Sending..." : "Send invoice"}
                  </button>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Mode</span>
                    <select value={sendDraft.mode} onChange={(event) => setSendDraft((current) => current ? { ...current, mode: event.target.value as InvoiceDeliveryMode, target: event.target.value === "sms" ? (selectedClient?.phones[0] ?? current.target) : (selectedClient?.emails[0] ?? current.target) } : current)}>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="mark_sent">Mark sent</option>
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Target</span>
                    <input value={sendDraft.target} onChange={(event) => setSendDraft((current) => current ? { ...current, target: event.target.value } : current)} />
                  </label>
                </div>
                <label className="nexops-field">
                  <span>Subject</span>
                  <input value={sendDraft.subject} onChange={(event) => setSendDraft((current) => current ? { ...current, subject: event.target.value } : current)} />
                </label>
                <label className="nexops-field">
                  <span>Note</span>
                  <textarea rows={3} value={sendDraft.note} onChange={(event) => setSendDraft((current) => current ? { ...current, note: event.target.value } : current)} />
                </label>
                <div className="nexops-quote-toggle-grid">
                  <label className="nexops-check-field inline"><input type="checkbox" checked={sendDraft.includePdf} onChange={(event) => setSendDraft((current) => current ? { ...current, includePdf: event.target.checked } : current)} /> PDF attachment</label>
                  <label className="nexops-check-field inline"><input type="checkbox" checked={sendDraft.includeSummary} onChange={(event) => setSendDraft((current) => current ? { ...current, includeSummary: event.target.checked } : current)} /> Summary text</label>
                  <label className="nexops-check-field inline"><input type="checkbox" checked={sendDraft.includePayLink} onChange={(event) => setSendDraft((current) => current ? { ...current, includePayLink: event.target.checked } : current)} /> Pay link</label>
                  <label className="nexops-check-field inline"><input type="checkbox" checked={sendDraft.includeHostedLink} onChange={(event) => setSendDraft((current) => current ? { ...current, includeHostedLink: event.target.checked } : current)} /> Hosted receipt link</label>
                </div>
                {lastHostedCheckoutUrl ? <small>{lastHostedCheckoutUrl}</small> : null}
              </section>
            </div>

            <div className="nexops-two-column">
              <section className="nexops-quote-panel">
                <div className="nexops-quote-section-head">
                  <h3>Collect payment</h3>
                  <button type="button" onClick={() => void collectPayment()} disabled={Boolean(busy)}>
                    {busy === "collect-payment" || busy === "checkout" ? "Processing..." : "Collect payment"}
                  </button>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Amount</span>
                    <input type="number" min="0.01" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => current ? { ...current, amount: Math.max(0.01, Number(event.target.value || 0.01)) } : current)} />
                  </label>
                  <label className="nexops-field">
                    <span>Provider</span>
                    <select value={paymentDraft.provider} onChange={(event) => setPaymentDraft((current) => current ? { ...current, provider: event.target.value as PaymentProvider } : current)}>
                      <option value="stripe">Stripe</option>
                      <option value="paypal">PayPal / Venmo</option>
                      <option value="manual">Manual / offline</option>
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Method</span>
                    <select value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => current ? { ...current, method: event.target.value as PaymentMethodKind } : current)}>
                      {paymentDraft.provider === "paypal" ? (
                        <>
                          <option value="paypal">PayPal</option>
                          <option value="venmo">Venmo</option>
                        </>
                      ) : paymentDraft.provider === "stripe" ? (
                        <>
                          <option value="card">Saved card</option>
                          <option value="ach">ACH</option>
                        </>
                      ) : (
                        <>
                          <option value="cash">Cash</option>
                          <option value="check">Check</option>
                          <option value="bank_transfer">Bank transfer</option>
                          <option value="other">Other</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
                {paymentDraft.provider === "stripe" && paymentDraft.method === "card" ? (
                  <label className="nexops-field">
                    <span>Saved card</span>
                    <select value={paymentDraft.savedCardId} onChange={(event) => setPaymentDraft((current) => current ? { ...current, savedCardId: event.target.value } : current)}>
                      <option value="">Use hosted checkout instead</option>
                      {sortedCards.map((card) => (
                        <option value={card.id} key={card.id}>{card.label}{card.last4 ? ` •••• ${card.last4}` : ""}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Payer name</span>
                    <input value={paymentDraft.payerName} onChange={(event) => setPaymentDraft((current) => current ? { ...current, payerName: event.target.value } : current)} />
                  </label>
                  {paymentDraft.method === "check" ? (
                    <label className="nexops-field">
                      <span>Check number</span>
                      <input value={paymentDraft.checkNumber} onChange={(event) => setPaymentDraft((current) => current ? { ...current, checkNumber: event.target.value } : current)} />
                    </label>
                  ) : paymentDraft.method === "bank_transfer" ? (
                    <label className="nexops-field">
                      <span>Reference number</span>
                      <input value={paymentDraft.bankTransferReference} onChange={(event) => setPaymentDraft((current) => current ? { ...current, bankTransferReference: event.target.value } : current)} />
                    </label>
                  ) : paymentDraft.method === "other" ? (
                    <label className="nexops-field">
                      <span>Reference</span>
                      <input value={paymentDraft.otherReference} onChange={(event) => setPaymentDraft((current) => current ? { ...current, otherReference: event.target.value } : current)} />
                    </label>
                  ) : <div className="nexops-payment-schedule-spacer" />}
                </div>
                <label className="nexops-field">
                  <span>Internal note</span>
                  <input value={paymentDraft.note} onChange={(event) => setPaymentDraft((current) => current ? { ...current, note: event.target.value } : current)} />
                </label>
                <div className="nexops-quote-toggle-grid">
                  <label className="nexops-check-field inline"><input type="radio" name="payment-status" checked={paymentDraft.status === "succeeded"} onChange={() => setPaymentDraft((current) => current ? { ...current, status: "succeeded" } : current)} /> Succeeded</label>
                  <label className="nexops-check-field inline"><input type="radio" name="payment-status" checked={paymentDraft.status === "failed"} onChange={() => setPaymentDraft((current) => current ? { ...current, status: "failed" } : current)} /> Failed charge</label>
                </div>
                {paymentDraft.status === "failed" ? (
                  <label className="nexops-field">
                    <span>Failure message</span>
                    <input value={paymentDraft.failureMessage} onChange={(event) => setPaymentDraft((current) => current ? { ...current, failureMessage: event.target.value } : current)} placeholder="Card declined, insufficient funds, etc." />
                  </label>
                ) : null}
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => void launchHostedCheckout("stripe", "card")} disabled={Boolean(busy)}>Open Stripe checkout</button>
                  <button type="button" onClick={() => void launchHostedCheckout("paypal", "paypal")} disabled={Boolean(busy)}>Open PayPal</button>
                  <button type="button" onClick={() => void launchHostedCheckout("paypal", "venmo")} disabled={Boolean(busy)}>Open Venmo</button>
                </div>
                {recoveryHint ? (
                  <div className="nexops-recovery-box">
                    <strong>Recovery path</strong>
                    <p>{recoveryHint}</p>
                    <div className="nexops-inline-actions">
                      <button type="button" onClick={() => setPaymentDraft((current) => current ? { ...current, status: "succeeded" } : current)}>Retry same card</button>
                      <button type="button" onClick={() => setPaymentDraft((current) => current ? { ...current, provider: "stripe", method: "card", savedCardId: sortedCards[1]?.id ?? current.savedCardId } : current)}>Switch saved card</button>
                      <button type="button" onClick={() => setPaymentDraft((current) => current ? { ...current, provider: "manual", method: "cash" } : current)}>Take manual payment</button>
                      <button type="button" onClick={() => setSendDraft((current) => current ? { ...current, mode: "email", target: selectedClient?.emails[0] ?? current.target } : current)}>Send pay link</button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="nexops-quote-panel">
                <div className="nexops-quote-section-head">
                  <h3>Payment history</h3>
                  <span>{detail.payments?.length ?? 0} payments / {detail.refunds?.length ?? 0} refunds</span>
                </div>
                <div className="nexops-jobs-sublist">
                  {(detail.payments ?? []).map((payment) => (
                    <label className="nexops-jobs-sublist-item" key={payment.id}>
                      <div>
                        <strong>{payment.provider} {payment.method}</strong>
                        <span>{formatTimestamp(payment.createdAt)}</span>
                      </div>
                      <div>
                        <span className={`nexops-job-status status-${payment.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{payment.status.replaceAll("_", " ")}</span>
                        <small>{money(payment.amount)}</small>
                        <input type="radio" name="refund-payment" checked={refundDraft.paymentId === payment.id} onChange={() => setRefundDraft({ paymentId: payment.id, amount: payment.appliedAmount || payment.amount, reason: "" })} />
                      </div>
                    </label>
                  ))}
                  {!(detail.payments ?? []).length ? <p className="nexops-empty-copy">No payments recorded yet.</p> : null}
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Refund amount</span>
                    <input type="number" min="0.01" step="0.01" value={refundDraft.amount} onChange={(event) => setRefundDraft((current) => ({ ...current, amount: Math.max(0.01, Number(event.target.value || 0.01)) }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Refund reason</span>
                    <input value={refundDraft.reason} onChange={(event) => setRefundDraft((current) => ({ ...current, reason: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => void refundPayment()} disabled={Boolean(busy) || !selectedPayment}>{busy === "refund" ? "Refunding..." : "Refund selected payment"}</button>
                  <button type="button" onClick={() => void runInvoiceLedgerAction("void")} disabled={Boolean(busy) || detail.invoice.status === "paid"}>{busy === "void" ? "Voiding..." : "Void invoice"}</button>
                  <button type="button" onClick={() => void runInvoiceLedgerAction("bad_debt")} disabled={Boolean(busy) || detail.invoice.status === "paid"}>{busy === "bad_debt" ? "Writing off..." : "Mark bad debt"}</button>
                </div>
              </section>
            </div>

            <section className="nexops-quote-panel">
              <div className="nexops-quote-section-head">
                <h3>Receipt review</h3>
                <span>Email carries attachments. SMS sends the secure hosted link only.</span>
              </div>
              {selectedReview && receiptReviewDraft ? (
                <>
                  {detail.receiptReviews && detail.receiptReviews.length > 1 ? (
                    <label className="nexops-field">
                      <span>Review record</span>
                      <select value={selectedReceiptReviewId} onChange={(event) => setSelectedReceiptReviewId(event.target.value)}>
                        {detail.receiptReviews.map((review) => <option value={review.id} key={review.id}>{review.id} - {review.status}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <div className="nexops-request-builder-grid">
                    <label className="nexops-field">
                      <span>Subject</span>
                      <input value={receiptReviewDraft.subject} onChange={(event) => setReceiptReviewDraft((current) => current ? { ...current, subject: event.target.value } : current)} />
                    </label>
                    <label className="nexops-field">
                      <span>Channels</span>
                      <div className="nexops-quote-toggle-grid">
                        <label className="nexops-check-field inline"><input type="checkbox" checked={receiptReviewDraft.sendChannels.includes("email")} onChange={(event) => setReceiptReviewDraft((current) => current ? {
                          ...current,
                          sendChannels: event.target.checked
                            ? Array.from(new Set([...current.sendChannels, "email"]))
                            : current.sendChannels.filter((channel) => channel !== "email")
                        } : current)} /> Email</label>
                        <label className="nexops-check-field inline"><input type="checkbox" checked={receiptReviewDraft.sendChannels.includes("sms")} onChange={(event) => setReceiptReviewDraft((current) => current ? {
                          ...current,
                          sendChannels: event.target.checked
                            ? Array.from(new Set([...current.sendChannels, "sms"]))
                            : current.sendChannels.filter((channel) => channel !== "sms")
                        } : current)} /> SMS</label>
                      </div>
                    </label>
                  </div>
                  <label className="nexops-field">
                    <span>Body</span>
                    <textarea rows={4} value={receiptReviewDraft.bodyText} onChange={(event) => setReceiptReviewDraft((current) => current ? { ...current, bodyText: event.target.value } : current)} />
                  </label>
                  <div className="nexops-request-builder-grid">
                    <label className="nexops-field">
                      <span>Email recipients</span>
                      <input value={receiptReviewDraft.emailRecipients} onChange={(event) => setReceiptReviewDraft((current) => current ? { ...current, emailRecipients: event.target.value } : current)} />
                    </label>
                    <label className="nexops-field">
                      <span>SMS recipients</span>
                      <input value={receiptReviewDraft.smsRecipients} onChange={(event) => setReceiptReviewDraft((current) => current ? { ...current, smsRecipients: event.target.value } : current)} />
                    </label>
                  </div>
                  <div className="nexops-quote-toggle-grid">
                    {selectedReview.attachments.map((attachment) => (
                      <label className="nexops-check-field inline" key={attachment.id}>
                        <input
                          type="checkbox"
                          checked={receiptReviewDraft.attachmentIds.includes(attachment.id)}
                          onChange={(event) => setReceiptReviewDraft((current) => current ? {
                            ...current,
                            attachmentIds: event.target.checked
                              ? [...current.attachmentIds, attachment.id]
                              : current.attachmentIds.filter((candidate) => candidate !== attachment.id)
                          } : current)}
                        />
                        {attachment.label}
                      </label>
                    ))}
                  </div>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void saveReceiptReview()} disabled={Boolean(busy)}>{busy === "save-receipt" ? "Saving..." : "Save receipt review"}</button>
                    <button type="button" onClick={() => void sendReceiptReview()} disabled={Boolean(busy)}>{busy === "send-receipt" ? "Sending..." : "Send receipt"}</button>
                    {selectedReview.hostedLink ? <small>{selectedReview.hostedLink}</small> : null}
                  </div>
                </>
              ) : (
                <p className="nexops-empty-copy">A receipt review appears after a payment or refund is recorded.</p>
              )}
            </section>
          </div>
        ) : (
          <div className="nexops-quote-empty">
            <h2>No invoice selected</h2>
            <p>Pick an invoice from the roster, or create one by combining jobs waiting for invoicing.</p>
          </div>
        )}
      </article>
    </section>
  );
}
