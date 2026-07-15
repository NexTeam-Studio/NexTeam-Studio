export type NexopsHomeTarget = "requests" | "quotes" | "jobs" | "payments" | "schedule" | "clients" | "approvals";

export interface NexopsHomeClientSummary {
  statusLabel: "Active" | "Lead" | string;
  textReady: boolean;
}

export interface NexopsHomeRequestSummary {
  status: "new" | "archived" | "converted_to_quote" | "converted_to_job" | string;
  reviewedAt?: string;
}

export interface NexopsHomeQuoteSummary {
  status: string;
}

export interface NexopsHomeJobSummary {
  status: "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived" | string;
}

export interface NexopsHomeInvoiceSummary {
  status: string;
}

export interface NexopsHomePaymentSummary {
  status: "pending" | "failed" | "succeeded" | "refunded" | "partially_refunded" | string;
}

export interface NexopsHomeReceiptReviewSummary {
  status: "draft" | "ready_to_send" | "sent" | string;
}

interface NexopsHomeCardState {
  title: string;
  summary: string;
  dominantLabel: string;
  target: NexopsHomeTarget;
  tone?: "danger" | "secondary" | "success" | "warning";
}

interface NexopsHomeMetric {
  title: string;
  value: string;
  detail: string;
}

interface NexopsHomeQueueItem {
  label: string;
  count: number;
  detail: string;
  target: NexopsHomeTarget;
}

export interface NexopsHomeState {
  now: NexopsHomeCardState;
  needsAttention: NexopsHomeCardState;
  upcoming: NexopsHomeCardState;
  metrics: NexopsHomeMetric[];
  operations: NexopsHomeQueueItem[];
}

export function buildNexopsHomeState(input: {
  clients: NexopsHomeClientSummary[];
  requests: NexopsHomeRequestSummary[];
  quotes: NexopsHomeQuoteSummary[];
  jobs: NexopsHomeJobSummary[];
  invoices: NexopsHomeInvoiceSummary[];
  payments: NexopsHomePaymentSummary[];
  receiptReviews: NexopsHomeReceiptReviewSummary[];
}): NexopsHomeState {
  const activeClients = input.clients.filter((client) => client.statusLabel === "Active").length;
  const leadClients = input.clients.filter((client) => client.statusLabel === "Lead").length;
  const textReadyClients = input.clients.filter((client) => client.textReady).length;
  const unreviewedRequests = input.requests.filter((request) => request.status === "new" && !request.reviewedAt).length;
  const readyToConvertRequests = input.requests.filter((request) => request.status === "new" && request.reviewedAt).length;
  const quoteAttention = input.quotes.filter((quote) => quote.status === "draft" || quote.status === "change_requested").length;
  const officeActionJobs = input.jobs.filter((job) => job.status === "Action Required" || job.status === "Requires Invoicing").length;
  const unscheduledJobs = input.jobs.filter((job) => job.status === "Unscheduled").length;
  const openBilling = input.invoices.filter((invoice) => invoice.status === "awaiting_payment" || invoice.status === "partial_pay" || invoice.status === "sent").length;
  const failedPayments = input.payments.filter((payment) => payment.status === "failed").length;
  const receiptWaiting = input.receiptReviews.filter((review) => review.status !== "sent").length;

  const now = officeActionJobs > 0
    ? {
        title: "Office action waiting",
        summary: `${officeActionJobs} jobs are sitting on closeout or invoicing decisions right now.`,
        dominantLabel: "Open jobs",
        target: "jobs" as const
      }
    : receiptWaiting > 0
      ? {
          title: "Receipt review waiting",
          summary: `${receiptWaiting} paid or refunded records are paused until the customer package is reviewed and sent.`,
          dominantLabel: "Open payments",
          target: "payments" as const,
          tone: "warning" as const
        }
      : unreviewedRequests > 0
        ? {
            title: "Requests waiting",
            summary: `${unreviewedRequests} intake records still need an office review pass before they convert downstream.`,
            dominantLabel: "Open requests",
            target: "requests" as const
          }
        : openBilling > 0
          ? {
              title: "Money still open",
              summary: `${openBilling} invoices still need collection work or a follow-up send.`,
              dominantLabel: "Open payments",
              target: "payments" as const
            }
          : {
              title: "Boards are clear",
              summary: "Nothing urgent is stuck right now. This is a good time to look ahead at scheduling and follow-up work.",
              dominantLabel: "View schedule",
              target: "schedule" as const,
              tone: "success" as const
            };

  const needsAttention = failedPayments > 0
    ? {
        title: "Payment recovery",
        summary: `${failedPayments} failed payment attempts still need a recovery move before those invoices can finish.`,
        dominantLabel: "Recover payments",
        target: "payments" as const,
        tone: "danger" as const
      }
    : quoteAttention > 0
      ? {
          title: "Quotes need attention",
          summary: `${quoteAttention} quotes are still draft or sitting in a change-request loop.`,
          dominantLabel: "Open quotes",
          target: "quotes" as const,
          tone: "danger" as const
        }
      : readyToConvertRequests > 0
        ? {
            title: "Ready to convert",
            summary: `${readyToConvertRequests} reviewed requests are waiting for the office to choose quote or job.`,
            dominantLabel: "Review requests",
            target: "requests" as const
          }
        : {
            title: "Approval rail ready",
            summary: "Nothing is stalled in the active queues. Approval history and manual checks still live on their own rail.",
            dominantLabel: "Review approvals",
            target: "approvals" as const,
            tone: "secondary" as const
          };

  const upcoming = unscheduledJobs > 0
    ? {
        title: "Work waiting to be booked",
        summary: `${unscheduledJobs} authorized jobs are still off the calendar and need a schedule slot.`,
        dominantLabel: "Schedule jobs",
        target: "jobs" as const,
        tone: "secondary" as const
      }
    : readyToConvertRequests > 0
      ? {
          title: "Pipeline ready",
          summary: `${readyToConvertRequests} requests are fully reviewed and ready to move onto the live work rail.`,
          dominantLabel: "Open requests",
          target: "requests" as const,
          tone: "secondary" as const
        }
      : {
          title: "Scheduled work",
          summary: `${input.jobs.length} jobs are on the native rail, with schedule and reminder logic carrying the next move.`,
          dominantLabel: "View schedule",
          target: "schedule" as const,
          tone: "secondary" as const
        };

  return {
    now,
    needsAttention,
    upcoming,
    metrics: [
      {
        title: "Requests waiting",
        value: String(unreviewedRequests + readyToConvertRequests),
        detail: readyToConvertRequests ? `${readyToConvertRequests} already reviewed and ready to convert` : "No reviewed requests are stacked right now"
      },
      {
        title: "Receipt review",
        value: String(receiptWaiting),
        detail: receiptWaiting ? "Paid or refunded records paused before customer delivery" : "Nothing is waiting at receipt review"
      },
      {
        title: "Open billing",
        value: String(openBilling),
        detail: failedPayments ? `${failedPayments} failed attempts need recovery` : "No failed attempts are stacked right now"
      },
      {
        title: "Clients",
        value: String(activeClients),
        detail: `${textReadyClients} text-ready contacts, ${leadClients} lead records`
      }
    ],
    operations: [
      {
        label: "Unreviewed requests",
        count: unreviewedRequests,
        detail: unreviewedRequests ? "Needs the office review pass before any conversion." : "Nothing is waiting for first review.",
        target: "requests"
      },
      {
        label: "Ready to convert",
        count: readyToConvertRequests,
        detail: readyToConvertRequests ? "Reviewed intakes ready for quote or job creation." : "No reviewed requests are stalled.",
        target: "requests"
      },
      {
        label: "Receipt review queue",
        count: receiptWaiting,
        detail: receiptWaiting ? "Money is recorded, but customer delivery is still paused." : "No receipts are waiting for review.",
        target: "payments"
      },
      {
        label: "Open billing rail",
        count: openBilling,
        detail: openBilling ? "Invoices still need payment collection or follow-up." : "No open invoice balances right now.",
        target: "payments"
      }
    ]
  };
}
