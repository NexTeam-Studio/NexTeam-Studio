import type {
  ClientPortalActivityEntry,
  CrmInvoice,
  CrmJob,
  CrmPaymentSummary,
  CrmQuote,
  CrmRequestSummary,
  ReviewSequenceRecord
} from "../../../../nexopsShell/contracts/workspaceContracts";

export type ClientRelationshipHistoryKind =
  | "request"
  | "quote"
  | "job"
  | "invoice"
  | "payment"
  | "portal"
  | "review"
  | "communication";

export interface ClientRelationshipHistoryEntry {
  id: string;
  kind: ClientRelationshipHistoryKind;
  title: string;
  status: string;
  occurredAt?: string;
  objectId?: string;
  module?: "requests" | "quotes" | "jobs" | "invoices" | "payments" | "nexreach";
}

export interface ClientRelationshipHistoryInput {
  requests: CrmRequestSummary[];
  quotes: CrmQuote[];
  jobs: CrmJob[];
  invoices: CrmInvoice[];
  payments: CrmPaymentSummary[];
  portalActivity: ClientPortalActivityEntry[];
  reviewSequences: ReviewSequenceRecord[];
  communicationDeliveries?: Array<{ id: string; jobId: string; jobTitle: string; occurredAt: string; recipient: string; status: string; title: string }>;
  financialVisible: boolean;
}

export function communicationHistoryFromJobEvents(input: {
  jobId: string;
  jobTitle: string;
  events: Array<{ id: string; type: string; createdAt: string; payload?: { recipient?: unknown; target?: unknown; mode?: unknown } }>;
}): NonNullable<ClientRelationshipHistoryInput["communicationDeliveries"]> {
  return input.events
    .flatMap((event) => {
      if (event.type === "closeout.package_delivery_sent") {
        return [{
          id: event.id,
          jobId: input.jobId,
          jobTitle: input.jobTitle,
          occurredAt: event.createdAt,
          recipient: typeof event.payload?.recipient === "string" && event.payload.recipient.trim() ? event.payload.recipient.trim() : "reviewed recipient",
          status: "email sent",
          title: `Closeout package email · ${input.jobTitle}`
        }];
      }
      if (event.type === "visit.booking_confirmation_sent") {
        const mode = event.payload?.mode === "sms" ? "text message" : "email";
        return [{
          id: event.id,
          jobId: input.jobId,
          jobTitle: input.jobTitle,
          occurredAt: event.createdAt,
          recipient: typeof event.payload?.target === "string" && event.payload.target.trim() ? event.payload.target.trim() : "reviewed recipient",
          status: `${mode} sent`,
          title: `Booking confirmation · ${input.jobTitle}`
        }];
      }
      return [];
    });
}

function normalizedStatus(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  return text ? text.replaceAll("_", " ") : fallback;
}

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Builds the client-facing chronology from the existing, tenant-scoped client
 * relationships. It deliberately does not manufacture notes or communication
 * records when the authoritative source has none.
 */
export function buildClientRelationshipHistory(input: ClientRelationshipHistoryInput): ClientRelationshipHistoryEntry[] {
  const entries: ClientRelationshipHistoryEntry[] = [
    ...input.requests.map((request) => ({
      id: `request-${request.id}`,
      kind: "request" as const,
      title: request.subject?.trim() || "Request",
      status: normalizedStatus(request.status, "Request"),
      occurredAt: request.reviewedAt ?? request.createdAt,
      objectId: request.id,
      module: "requests"
    })),
    ...input.quotes.map((quote) => ({
      id: `quote-${quote.id}`,
      kind: "quote" as const,
      title: quote.number?.trim() || quote.title || "Quote",
      status: normalizedStatus(quote.status, "Quote"),
      occurredAt: quote.updatedAt ?? quote.createdAt,
      objectId: quote.id,
      module: "quotes"
    })),
    ...input.jobs.map((job) => ({
      id: `job-${job.id}`,
      kind: "job" as const,
      title: job.number?.trim() ? `${job.number} · ${job.title}` : job.title || "Job",
      status: normalizedStatus(job.status, "Job"),
      occurredAt: job.updatedAt ?? job.startAt ?? job.createdAt,
      objectId: job.id,
      module: "jobs"
    })),
    ...input.portalActivity.map((activity) => ({
      id: `portal-${activity.id}`,
      kind: "portal" as const,
      title: activity.title || "Portal activity",
      status: activity.detail || normalizedStatus(activity.objectType, "Portal"),
      occurredAt: activity.occurredAt,
      objectId: activity.objectId,
      module: activity.objectType === "quote" ? "quotes" : activity.objectType === "invoice" ? "invoices" : activity.objectType === "visit" ? "jobs" : activity.objectType === "payment" ? "payments" : undefined
    })),
    ...input.reviewSequences.map((sequence) => ({
      id: `review-${sequence.id}`,
      kind: "review" as const,
      title: "Review follow-up",
      status: sequence.status === "active" && sequence.nextSendAt
        ? `Next send ${new Date(sequence.nextSendAt).toLocaleDateString()}`
        : normalizedStatus(sequence.stopReason ?? sequence.status, "Review follow-up"),
      occurredAt: sequence.reviewedAt ?? sequence.stoppedAt ?? sequence.nextSendAt ?? sequence.createdAt,
      objectId: sequence.id,
      module: "nexreach"
    })),
    ...(input.communicationDeliveries ?? []).map((delivery) => ({
      id: `closeout-delivery-${delivery.id}`,
      kind: "communication" as const,
      title: delivery.title,
      status: `${normalizedStatus(delivery.status, "Email sent")} to ${delivery.recipient}`,
      occurredAt: delivery.occurredAt,
      objectId: delivery.jobId,
      module: "jobs" as const
    }))
  ];

  if (input.financialVisible) {
    entries.push(
      ...input.invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        kind: "invoice" as const,
        title: invoice.number?.trim() || invoice.title || "Invoice",
        status: normalizedStatus(invoice.status, "Invoice"),
        occurredAt: invoice.updatedAt ?? invoice.createdAt,
        objectId: invoice.id,
        module: "invoices"
      })),
      ...input.payments.map((payment) => ({
        id: `payment-${payment.id}`,
        kind: "payment" as const,
        title: payment.invoiceId ? `Payment for invoice ${payment.invoiceId}` : "Payment",
        status: normalizedStatus(payment.status, "Payment"),
        occurredAt: payment.createdAt,
        objectId: payment.invoiceId,
        module: "payments"
      }))
    );
  }

  return entries.sort((left, right) => {
    const rightTime = timestamp(right.occurredAt);
    const leftTime = timestamp(left.occurredAt);
    return rightTime - leftTime || left.id.localeCompare(right.id);
  });
}
