import type { NexiTool, Source, Tenant, UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import {
  runNexiToolLoop,
  type ToolLoopRequest,
  type ToolLoopResponse,
  type UsageLogWriter
} from "@nexteam/nexi";
import type { NexiRepository } from "./nexiRepository.js";

export interface NexiMessageInput {
  tenant: Tenant;
  message: string;
  conversationId?: string | undefined;
  tools: NexiTool[];
  repository: NexiRepository;
  usageLog?: UsageLogWriter | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  gateway?: ((request: ToolLoopRequest) => Promise<ToolLoopResponse>) | undefined;
}

export interface NexiMessageResult {
  answer: string;
  sources: Source[];
  conversationId: string;
  failureId?: string | undefined;
  usage: UsageLogRecord["usage"];
  toolRuns: ToolLoopResponse["toolRuns"];
}

type JsonRecord = Record<string, unknown>;

type GatewayMessageContent = ToolLoopRequest["messages"][number]["content"] | undefined;

function messageText(content: GatewayMessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }
        const record = entry as JsonRecord;
        const text = typeof record.text === "string" ? record.text : "";
        const input = typeof record.input === "string" ? record.input : "";
        return text || input;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function redactEmailContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactEmailContent);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as JsonRecord;
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
    if (/^(?:body|bodyText|bodyHtml|snippet|text|html|subject|from|to|cc|bcc|data|content|raw)$/i.test(key)) {
      return [key, "[redacted-email-content]"];
    }
    return [key, redactEmailContent(entry)];
  }));
}

function persistableToolRuns(toolRuns: ToolLoopResponse["toolRuns"]): ToolLoopResponse["toolRuns"] {
  return toolRuns.map((run) => run.sources.some((source) => source.rail === "email")
    ? { ...run, result: redactEmailContent(run.result) }
    : run);
}

function buildNexiSystemPrompt(tenant: Tenant): string {
  return [
    `You are ${tenant.branding.assistantName}, the NexTeam Job Desk assistant for ${tenant.name}.`,
    "Check the connected work records before answering job, schedule, photo, report, and saved site-note questions.",
    "Never invent job data. If you cannot find it in the connected records, say plainly that you do not have it written down.",
    "For schedule answers, use schedule.localSummary when present and do not describe tenant-local Jobber all-day windows as UTC appointments.",
    "Answer only what was asked in a scannable format: short lead sentence, compact bullets only when useful, no extra menu of options unless the user asks.",
    "For email summaries and triage, group by priority when available and format each item as sender - subject - one-line ask. Leave internal IDs out unless the owner asks. Sign-in tests and account welcomes are not client inquiries.",
    "Talk like a sharp, reliable employee for trade owners and field workers. Avoid user-facing jargon such as API, endpoint, tool call, source, query, rail, and schema.",
    "For action requests like drafting or sending email, use the approval-gated draft tool and do not require factual sources before acknowledging the queued draft.",
    "For tenant onboarding requests, run the intake interview, capture current app-stack choices, and queue provisioning for owner approval only. Never claim external accounts, publishing, emails, or domains are set up.",
    "Keep phone answers short, direct, and operational. Ask at most one clarifying question."
  ].join("\n");
}

function approvalIdFromText(text: string): string | undefined {
  return text.match(/\b(appr_[a-z0-9-]+)\b/i)?.[1];
}

function looksLikeApprovalYes(text: string): boolean {
  return /^\s*(?:yes|approve|approved|do it|run it|send it|create it|go ahead)\b/i.test(text.trim());
}

function looksLikeApprovalNo(text: string): boolean {
  return /^\s*(?:no|reject|decline|stop|cancel|don't do it|do not do it)\b/i.test(text.trim());
}

function hasJobActionChangeDetails(text: string): boolean {
  return /\b(?:close\s+and\s+invoice|invoice only|invoice it|close only|just close|dismiss(?: the)? reminder|archive without invoice)\b/i.test(text);
}

function hasLedgerActionChangeDetails(text: string): boolean {
  return /\b(?:refund|void|bad debt|write\s+off|reason|because|amount)\b/i.test(text);
}

function hasInvoiceComposeChangeDetails(text: string): boolean {
  return /\b(?:title|rename|discount|tax|terms)\b/i.test(text);
}

function hasInvoiceSendChangeDetails(text: string): boolean {
  return /\b(?:email|text|sms|mark sent|subject|note|pdf|summary|pay link|hosted link)\b/i.test(text);
}

function hasCollectPaymentChangeDetails(text: string): boolean {
  return /\b(?:amount|card|last 4|saved card|cash|check|bank transfer|manual|failed|declined|retry|payer|reference|note)\b/i.test(text);
}

function hasReceiptReviewChangeDetails(text: string): boolean {
  return /\b(?:subject|body|email|text|sms|recipient|send to|attachment|invoice pdf|field report|photos|job files)\b/i.test(text);
}

function approvalContextFromMessages(messages: ToolLoopRequest["messages"]): {
  approvalId: string;
  awaitingChanges: boolean;
  revisableJobCreate: boolean;
  revisableJobAction: boolean;
  revisableLedgerAction: boolean;
  revisableInvoiceCompose: boolean;
  revisableInvoiceSend: boolean;
  revisableCollectPayment: boolean;
  revisableReceiptReview: boolean;
} | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") {
      continue;
    }
    const content = messageText(message.content);
    const approvalId = approvalIdFromText(content);
    if (!approvalId) {
      continue;
    }
    if (/tell me what to change/i.test(content)) {
      return {
        approvalId,
        awaitingChanges: true,
        revisableJobCreate: /create job:/i.test(content),
        revisableJobAction: /close job:|invoice job:|close and invoice job:|dismiss invoice reminder:/i.test(content),
        revisableLedgerAction: /refund payment:|void invoice:|mark bad debt:/i.test(content),
        revisableInvoiceCompose: /combine invoice:/i.test(content),
        revisableInvoiceSend: /send invoice:/i.test(content),
        revisableCollectPayment: /collect payment:/i.test(content),
        revisableReceiptReview: /send receipt review:/i.test(content)
      };
    }
    if (/approve this\?\s*yes\s*\/\s*no\s*\/\s*make changes/i.test(content)) {
      return {
        approvalId,
        awaitingChanges: false,
        revisableJobCreate: /create job:/i.test(content),
        revisableJobAction: /close job:|invoice job:|close and invoice job:|dismiss invoice reminder:/i.test(content),
        revisableLedgerAction: /refund payment:|void invoice:|mark bad debt:/i.test(content),
        revisableInvoiceCompose: /combine invoice:/i.test(content),
        revisableInvoiceSend: /send invoice:/i.test(content),
        revisableCollectPayment: /collect payment:/i.test(content),
        revisableReceiptReview: /send receipt review:/i.test(content)
      };
    }
  }
  return null;
}

function approvalPromptFromResult(result: unknown, intro: string): string | undefined {
  const record = result && typeof result === "object" ? result as { approval?: { id?: unknown; preview?: { title?: unknown; body?: unknown } } } : {};
  const approvalId = typeof record.approval?.id === "string" ? record.approval.id : "";
  const title = typeof record.approval?.preview?.title === "string" ? record.approval.preview.title : "";
  const body = typeof record.approval?.preview?.body === "string" ? record.approval.preview.body : "";
  if (!approvalId || !title || !body) {
    return undefined;
  }
  return `${intro}\n\n${title}\n${body}\n\nApprove this? yes / no / make changes.\nApproval id: ${approvalId}`;
}

function chooseTool(request: ToolLoopRequest): { tool: NexiTool; args: unknown } | null {
  const latest = request.messages[request.messages.length - 1];
  const message = messageText(latest?.content);
  const tools = request.tools;
  const lower = message.toLowerCase();
  const allUserText = request.messages
    .filter((entry) => entry.role === "user")
    .map((entry) => messageText(entry.content))
    .filter(Boolean)
    .join("\n");
  const lastAssistantText = [...request.messages]
    .reverse()
    .find((entry) => entry.role === "assistant");
  const lastAssistantMessage = messageText(lastAssistantText?.content);
  const approvalContext = approvalContextFromMessages(request.messages);
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const emailAttachmentRef = message.match(/\bemail:([^:\s]+):([^:\s]+):([^:\s]+)/i);
  if (emailAttachmentRef) {
    const tool = tools.find((candidate) => candidate.name === "getEmailAttachment");
    return tool ? { tool, args: { mailbox: emailAttachmentRef[1], messageId: emailAttachmentRef[2], attachmentId: emailAttachmentRef[3] } } : null;
  }
  const emailMessageRef = message.match(/\bemail:([^:\s]+):([^:\s]+)/i);
  if (emailMessageRef) {
    const tool = tools.find((candidate) => candidate.name === "getEmailMessage");
    return tool ? { tool, args: { mailbox: emailMessageRef[1], messageId: emailMessageRef[2] } } : null;
  }
  if (approvalContext && looksLikeApprovalYes(message)) {
    const tool = tools.find((candidate) => candidate.name === "approvePendingApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId } } : null;
  }
  if (approvalContext && looksLikeApprovalNo(message)) {
    const tool = tools.find((candidate) => candidate.name === "rejectPendingApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId } } : null;
  }
  if (approvalContext?.revisableJobCreate && (approvalContext.awaitingChanges || /\b(?:change|fix|update|rename|title)\b/i.test(lower))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingJobCreateApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableJobAction && (approvalContext.awaitingChanges || hasJobActionChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingJobActionApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableLedgerAction && (approvalContext.awaitingChanges || hasLedgerActionChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingLedgerActionApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableInvoiceCompose && (approvalContext.awaitingChanges || hasInvoiceComposeChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingInvoiceComposeApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableInvoiceSend && (approvalContext.awaitingChanges || hasInvoiceSendChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingInvoiceSendApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableCollectPayment && (approvalContext.awaitingChanges || hasCollectPaymentChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingCollectPaymentApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableReceiptReview && (approvalContext.awaitingChanges || hasReceiptReviewChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingReceiptReviewApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (/\b(?:send|draft|compose|write)\s+(?:an?\s+)?email\b/i.test(lower) && !/\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftEmail");
    const recipient = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
    const bodyText = message.match(/\b(?:saying|that says|to say|with message|message)\b\s*:?\s*([\s\S]+)$/i)?.[1]?.trim() || "Please see the note from Aquatrace.";
    const subject = bodyText.split(/[.!?]\s/)[0]?.trim().replace(/[.!?]+$/g, "").slice(0, 72) || "Aquatrace follow-up";
    return tool && recipient ? { tool, args: { to: [recipient], subject, bodyText } } : null;
  }
  if (/\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getDistance");
    const destination = distanceDestinationFromText(message);
    return tool && destination ? { tool, args: { destination } } : null;
  }
  if (
    /\b(?:create|add|new)\b.*\brequest\b/i.test(lower)
    || (/\bi still need\b/i.test(lastAssistantMessage) && /\brequest\b/i.test(allUserText))
  ) {
    const tool = tools.find((candidate) => candidate.name === "createRequest");
    return tool ? { tool, args: { rawText: allUserText || message } } : null;
  }
  if (/\b(?:create|add|draft|new)\b.*\bquote\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "createQuote");
    const clientQuery = entityQueryFromText(message) || message.match(/\bfor\s+([a-z][a-z' -]+?)(?=\s+(?:for|with|using|at|total|amount|price)\b|[?.!]|$)/i)?.[1]?.trim();
    const amount = Number(message.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1] ?? "0");
    const lineName = message.match(/\bfor\s+(.+?)(?=\s+\$\d|\s+at\s+\$|\s+for\s+[A-Z]|[?.!]|$)/i)?.[1]?.trim()
      || "Quoted work";
    return tool ? {
      tool,
      args: {
        ...(clientQuery ? { clientQuery } : {}),
        title: clientQuery ? `${clientQuery} quote` : "Quote draft",
        items: [{ kind: "custom", name: lineName, quantity: 1, unitPrice: Number.isFinite(amount) ? amount : 0 }],
        approvalRules: {
          requireSignature: !/\bno signature\b/i.test(lower),
          requireDeposit: /\bdeposit\b/i.test(lower),
          requireCardOnFile: /\bcard on file\b/i.test(lower)
        }
      }
    } : null;
  }
  if (/\b(?:create|add|draft|new)\b.*\bjob\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "createJob");
    const clientQuery = entityQueryFromText(message) || message.match(/\bfor\s+([a-z][a-z' -]+?)(?=\s+(?:at|with|using|from|on|called|titled|named)\b|[?.!]|$)/i)?.[1]?.trim();
    const explicitTitle = message.match(/\b(?:called|titled|named)\s+([^.!?\n]+)$/i)?.[1]?.trim();
    return tool ? {
      tool,
      args: {
        ...(clientQuery ? { clientQuery } : {}),
        title: explicitTitle || (clientQuery ? `${clientQuery} job` : "Job draft")
      }
    } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\bjobs?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listJobs");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (
    /\b(?:close|invoice|archive)\b.*(?:\bjob\b|\bjob_[a-z0-9-]+\b)/i.test(lower)
    && !/\b(?:combine|merge)\b.*\bjobs?\b.*\binvoice\b/i.test(lower)
  ) {
    const tool = tools.find((candidate) => candidate.name === "queueJobAction");
    const jobId = message.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    const action = /\bclose\s+and\s+invoice\b/i.test(lower)
      ? "close_and_invoice"
      : /\bdismiss\b.*\breminder\b/i.test(lower) || /\barchive\b.*\bwithout\s+invoice\b/i.test(lower)
        ? "dismiss_invoice_reminder"
        : /\binvoice\b/i.test(lower) && !/\bclose\b/i.test(lower)
          ? "invoice"
          : "close";
    return tool ? { tool, args: { ...(jobId ? { jobId } : { query: entityQueryFromText(message) || message }), action } } : null;
  }
  if (/\bcomplete\b.*\bvisit\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "completeVisit");
    const visitId = message.match(/\bvisit_[a-z0-9-]+\b/i)?.[0];
    return tool && visitId ? { tool, args: { visitId } } : null;
  }
  if ((/\bjob\b/i.test(lower) || /\bjob_[a-z0-9-]+\b/i.test(lower)) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getJobDetail");
    const jobId = message.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    return tool ? { tool, args: jobId ? { jobId } : { query: entityQueryFromText(message) || message } } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\bquotes?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listQuotes");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (/\bquote\b/i.test(lower) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getQuoteDetail");
    const quoteId = message.match(/\b(?:quote_[a-z0-9-]+|[A-Z]+-\d{2,})\b/i)?.[0];
    return tool ? { tool, args: quoteId ? { quoteId } : { query: entityQueryFromText(message) || message } } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\binvoices?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listInvoices");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (/\binvoice\b/i.test(lower) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getInvoiceDetail");
    const invoiceId = message.match(/\b(?:invoice_[a-z0-9_-]+|INV-\d{2,}|[A-Z]+-\d{2,})\b/i)?.[0];
    return tool ? { tool, args: invoiceId ? { invoiceId } : { query: entityQueryFromText(message) || message } } : null;
  }
  if (/\b(?:combine|merge)\b.*\bjobs?\b.*\binvoice\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "queueInvoiceCompose");
    const jobIds = [...message.matchAll(/\bjob_[a-z0-9-]+\b/ig)].map((match) => match[0]);
    const discountPercent = Number(message.match(/\bdiscount\b.*?\b(\d+(?:\.\d+)?)\s*%\b/i)?.[1] ?? "");
    const discountAmount = Number(message.match(/\bdiscount\b.*?\$\s*(\d+(?:\.\d{1,2})?)\b/i)?.[1] ?? "");
    const taxRate = Number(message.match(/\btax(?:\s+rate)?\s*(?:is|to|=|:)?\s*(\d+(?:\.\d+)?)\s*%?\b/i)?.[1] ?? "");
    const title = message.match(/\b(?:title|invoice\s+title)\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
    const terms = message.match(/\bterms?\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
    return tool ? {
      tool,
      args: {
        ...(jobIds.length ? { jobIds } : { query: entityQueryFromText(message) || message }),
        ...(title ? { title } : {}),
        ...(Number.isFinite(discountPercent) && discountPercent > 0 ? { discountKind: "percent", discountValue: discountPercent } : {}),
        ...(Number.isFinite(discountAmount) && discountAmount > 0 ? { discountKind: "amount", discountValue: discountAmount } : {}),
        ...(Number.isFinite(taxRate) && taxRate >= 0 ? { taxRate } : {}),
        ...(terms ? { terms } : {})
      }
    } : null;
  }
  if (/\b(?:send|email|text|sms|mark)\b.*\binvoice\b/i.test(lower) && !/\b(?:collect|take|charge|payment)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "queueInvoiceSend");
    const invoiceId = message.match(/\b(?:invoice_[a-z0-9_-]+|INV-\d{2,}|[A-Z]+-\d{2,})\b/i)?.[0];
    const email = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
    const phone = message.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0];
    const subject = message.match(/\bsubject\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
    const note = message.match(/\bnote\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
    const mode = /\bmark\s+sent\b/i.test(lower) ? "mark_sent" : /\b(?:text|sms)\b/i.test(lower) ? "sms" : "email";
    return tool ? {
      tool,
      args: {
        ...(invoiceId ? { invoiceId } : { query: entityQueryFromText(message) || message }),
        mode,
        ...(mode === "email" && email ? { target: email } : {}),
        ...(mode === "sms" && phone ? { target: phone } : {}),
        ...(subject ? { subject } : {}),
        ...(note ? { note } : {}),
        ...(/\b(?:no|without|skip)\b.*\bpdf\b/i.test(lower) ? { includePdf: false } : /\binclude\b.*\bpdf\b/i.test(lower) ? { includePdf: true } : {}),
        ...(/\b(?:no|without|skip)\b.*\bsummary\b/i.test(lower) ? { includeSummary: false } : /\binclude\b.*\bsummary\b/i.test(lower) ? { includeSummary: true } : {}),
        ...(/\b(?:no|without|skip)\b.*\bpay\s+link\b/i.test(lower) ? { includePayLink: false } : /\binclude\b.*\bpay\s+link\b/i.test(lower) ? { includePayLink: true } : {})
      }
    } : null;
  }
  if (/\b(?:collect|take|charge|run)\b.*\bpayment\b/i.test(lower) || /\b(?:charge|run)\b.*\bcard\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "queueCollectPayment");
    const invoiceId = message.match(/\b(?:invoice_[a-z0-9_-]+|INV-\d{2,}|[A-Z]+-\d{2,})\b/i)?.[0];
    const amount = Number(
      message.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1]
      ?? message.match(/\bamount\s*(?:is|to|=|:)?\s*(\d+(?:\.\d{1,2})?)\b/i)?.[1]
      ?? ""
    );
    const savedCardLast4 = message.match(/\b(?:card|saved\s+card|last\s*4)\D*(\d{4})\b/i)?.[1];
    const note = message.match(/\bnote\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
    const failureMessage = /\b(?:failed|declined)\b/i.test(lower)
      ? message.match(/\b(?:failed|declined|reason)\s*(?:is|to|=|:)?\s*([\s\S]+)$/i)?.[1]?.trim()
      : undefined;
    const method = /\bcash\b/i.test(lower)
      ? "cash"
      : /\bcheck\b/i.test(lower)
        ? "check"
        : /\bbank\s+transfer\b/i.test(lower)
          ? "bank_transfer"
          : /\bcard\b/i.test(lower)
            ? "card"
            : undefined;
    const provider = method && method !== "card" ? "manual" : undefined;
    return tool ? {
      tool,
      args: {
        ...(invoiceId ? { invoiceId } : { query: entityQueryFromText(message) || message }),
        ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}),
        ...(provider ? { provider } : {}),
        ...(method ? { method } : {}),
        ...(savedCardLast4 ? { savedCardLast4 } : {}),
        ...(note ? { note } : {}),
        ...(/\b(?:failed|declined)\b/i.test(lower) ? { status: "failed" } : {}),
        ...(failureMessage ? { failureMessage } : {})
      }
    } : null;
  }
  if (/\b(?:send|email|text|sms)\b.*\b(?:receipt|receipt review)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "queueReceiptReviewSend");
    const receiptReviewId = message.match(/\breceipt_[a-z0-9_-]+\b/i)?.[0];
    const invoiceId = message.match(/\b(?:invoice_[a-z0-9_-]+|INV-\d{2,}|[A-Z]+-\d{2,})\b/i)?.[0];
    const email = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
    const phone = message.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0];
    const subject = message.match(/\bsubject\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
    const bodyText = message.match(/\bbody\s*(?:is|to|=|:)\s*([\s\S]+)$/i)?.[1]?.trim();
    const sendChannels = /\bemail\b/i.test(lower) && /\b(?:text|sms)\b/i.test(lower)
      ? ["email", "sms"]
      : /\b(?:text|sms)\b/i.test(lower)
        ? ["sms"]
        : /\bemail\b/i.test(lower)
          ? ["email"]
          : undefined;
    return tool ? {
      tool,
      args: {
        ...(receiptReviewId ? { receiptReviewId } : invoiceId ? { invoiceId } : { query: entityQueryFromText(message) || message }),
        ...(subject ? { subject } : {}),
        ...(bodyText ? { bodyText } : {}),
        ...(email ? { emailRecipients: [email] } : {}),
        ...(phone ? { smsRecipients: [phone.replace(/[^\d+]/g, "")] } : {}),
        ...(sendChannels ? { sendChannels } : {})
      }
    } : null;
  }
  if (/\bpayment\b/i.test(lower) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getPaymentDetail");
    const paymentId = message.match(/\bpayment_[a-z0-9_-]+\b/i)?.[0];
    return tool ? { tool, args: paymentId ? { paymentId } : { query: entityQueryFromText(message) || message } } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\bpayments?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listPayments");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\bdeposits?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listDeposits");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\brefunds?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listRefunds");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\bcredits?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listCredits");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (/\b(?:refund|void|bad debt|write\s+off)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "queueLedgerAction");
    const paymentId = message.match(/\bpayment_[a-z0-9_-]+\b/i)?.[0];
    const invoiceId = message.match(/\binvoice_[a-z0-9_-]+\b/i)?.[0];
    const amount = Number(
      message.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1]
      ?? message.match(/\brefund\b.*?\bfor\b\s*(\d+(?:\.\d{1,2})?)/i)?.[1]
      ?? "0"
    );
    const reason = message.match(/\b(?:because|reason:)\s*([\s\S]+)$/i)?.[1]?.trim();
    const action = /\brefund\b/i.test(lower)
      ? "refund_payment"
      : /\b(?:bad debt|write\s+off)\b/i.test(lower)
        ? "mark_bad_debt"
        : "void_invoice";
    return tool ? {
      tool,
      args: {
        action,
        ...(paymentId ? { paymentId } : {}),
        ...(invoiceId ? { invoiceId } : {}),
        ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}),
        ...(reason ? { reason } : {}),
        ...(!paymentId && !invoiceId ? { query: entityQueryFromText(message) || message } : {})
      }
    } : null;
  }
  if (/\b(?:show|list|find|open)\b.*\brequests?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listRequests");
    return tool ? { tool, args: { q: entityQueryFromText(message) || "" } } : null;
  }
  if (
    (
      /\brequest\b/i.test(lower)
      && (
        /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|is)\b/i.test(lower)
        || /\b(?:pool(?:\s*only|\s*\+\s*spa|\s+and\s+spa)|losing|water\s+loss|gate\s+code|pet)\b/i.test(lower)
      )
    )
    || /\b(?:pool(?:\s*only|\s*\+\s*spa|\s+and\s+spa)|water\s+loss|losing\s+daily|gate\s+code|pet\s+name)\b/i.test(lower)
  ) {
    const tool = tools.find((candidate) => candidate.name === "getRequestDetail");
    const requestId = message.match(/\brequest_[a-z0-9-]+\b/i)?.[0];
    const fieldKey = /\bpool(?:\s*only|\s*\+\s*spa|\s+and\s+spa)\b/i.test(lower)
      ? "pool_configuration"
      : /\b(?:losing|water\s+loss)\b/i.test(lower)
        ? "water_loss_rate"
        : /\bgate\s+code\b/i.test(lower)
          ? "gate_code"
          : /\bpet\s+name\b/i.test(lower)
            ? "pet_name"
            : /\bpet\b/i.test(lower)
              ? "pet_present"
              : undefined;
    const possessiveQuery = message
      .match(/([a-z][a-z' -]*?)'(?:s)?\s+(?:request|pool|spa|gate|pet)\b/i)?.[1]
      ?.trim()
      .replace(/^(?:is|what(?:'s| is)?|tell me|show me|open)\s+/i, "")
      .trim();
    return tool ? { tool, args: { ...(requestId ? { requestId } : {}), query: possessiveQuery || entityQueryFromText(message) || message, ...(fieldKey ? { fieldKey } : {}) } } : null;
  }
  const intakeSessionId = message.match(/\bintake_[a-z0-9-]+\b/i)?.[0];
  if (/\b(?:finalize|finish|park|queue)\b.*\b(?:intake|tenant\s+plan|onboarding)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "finalizeIntake");
    return tool && intakeSessionId ? { tool, args: { sessionId: intakeSessionId } } : null;
  }
  if (/\b(?:intake|tenant\s+onboarding|onboarding)\b.*\b(?:status|sessions?|where|show|list)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "intakeStatus");
    return tool ? { tool, args: intakeSessionId ? { sessionId: intakeSessionId } : {} } : null;
  }
  if (/\b(?:onboard|start\s+(?:an?\s+)?intake|tenant\s+intake|set\s+up\s+(?:a\s+)?(?:new\s+)?tenant|create\s+(?:a\s+)?(?:new\s+)?tenant)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "startIntake");
    const businessName = intakeBusinessNameFromText(message);
    return tool ? { tool, args: businessName ? { businessName } : {} } : null;
  }
  if (/\b(?:send|draft|queue|create|schedule|ask)\b.*\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftReviewRequest");
    const recipient = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
    const clientName = entityQueryFromText(message) || "client";
    return tool && recipient ? { tool, args: { to: recipient, invoiceId: "manual-review-request", clientName } } : null;
  }
  if (/\b(?:reply|respond|answer|draft)\b.*\b(?:review|google\s+review|gbp|google\s+business)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftReviewReply");
    const reviewId = message.match(/\bgbp_review_[a-z0-9_-]+\b/i)?.[0];
    return tool ? { tool, args: reviewId ? { reviewId } : {} } : null;
  }
  if (/\b(?:draft|queue|sync|update|change)\b.*\b(?:gbp|google\s+business|business\s+profile)\b.*\b(?:profile|hours|services?|q\s*&\s*a|q&a|questions?)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftGbpProfileSync");
    return tool ? { tool, args: { locationId: "aquatrace-primary" } } : null;
  }
  if (/\b(?:reviews?|reputation|google\s+reviews?|gbp\s+reviews?)\b/i.test(lower)) {
    const pollTool = tools.find((candidate) => candidate.name === "pollGbpReviews");
    const queueTool = tools.find((candidate) => candidate.name === "reputationQueue");
    if (/\b(?:check|pull|fetch|import|sync|new|latest|recent)\b/i.test(lower) && pollTool) {
      return { tool: pollTool, args: {} };
    }
    return queueTool ? { tool: queueTool, args: {} } : null;
  }
  if (/\b(?:run|calculate|check|make|create)\b.*\b(?:evap|evaporation|bucket\s+test|water\s+loss)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "runEvaporation");
    const address = message.match(/\b(?:for|at)\s+(.+?)(?=\s+(?:with|using|surface\s+area|pool\s+area|water\s+temp|water\s+temperature|observed\s+loss|daily\s+loss|loss)\b|[?.!]|$)/i)?.[1]?.trim();
    const zip = message.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
    const surfaceAreaFt2 = Number(message.match(/\b(?:surface\s+area|pool\s+area|area)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:square\s*feet|sq\.?\s*ft|ft2)\b/i)?.[1]?.replace(/,/g, ""));
    const waterTempF = Number(message.match(/\b(?:water\s+temp(?:erature)?|water\s+temperature)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:degrees?|deg|f|fahrenheit)?\b/i)?.[1]?.replace(/,/g, ""));
    const observedLoss = Number(message.match(/\b(?:observed\s+daily\s+loss|daily\s+loss|observed\s+loss|water\s+loss|loss)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:inches?|in\.?|")\b/i)?.[1]?.replace(/,/g, ""));
    const args: Record<string, unknown> = {};
    if (address) args.address = address;
    if (zip) args.zip = zip;
    if (Number.isFinite(surfaceAreaFt2)) args.surfaceAreaFt2 = surfaceAreaFt2;
    if (Number.isFinite(waterTempF)) args.waterTempF = waterTempF;
    if (Number.isFinite(observedLoss)) args.observedLoss = { inches: observedLoss, observationDays: 1 };
    return tool ? { tool, args } : null;
  }
  if (/\b(?:change|update|make|set)\b.*\b(?:chat|job\s*desk|interface|screen|ui|colors?|colours?|theme)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "customizeOperatorUi");
    const preset = /\b(?:blue|water|teal|ocean)\b/i.test(lower)
      ? "deep_water"
      : /\b(?:contrast|bold|easy to read)\b/i.test(lower)
        ? "high_contrast"
        : /\b(?:sand|warm|tan|gold)\b/i.test(lower)
          ? "sandbar"
          : "aquatrace";
    return tool ? { tool, args: { preset, plainRequest: message } } : null;
  }
  if (/\b(?:needs? my attention|what needs attention|triage|urgent|important)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "triageInbox");
    return tool ? { tool, args: { date: today.toISOString(), maxResults: 25 } } : null;
  }
  if (/\b(?:email|emails|mail|inbox|reply|replied|came in)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "summarizeInbox");
    return tool ? { tool, args: { date: today.toISOString(), maxResults: 10 } } : null;
  }
  if (lower.includes("schedule") || lower.includes("today")) {
    const tool = tools.find((candidate) => candidate.name === "getSchedule");
    return tool ? { tool, args: { from, to } } : null;
  }
  if (lower.includes("photo") || lower.includes("picture") || lower.includes("image")) {
    const tool = tools.find((candidate) => candidate.name === "getPhotos");
    return tool ? { tool, args: { projectQuery: message } } : null;
  }
  if (lower.includes("gallon")) {
    const tool = tools.find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
    return tool ? { tool, args: { field: "poolGallons", requestedEntity: entityQueryFromText(message) } } : null;
  }
  const detailTool = tools.find((candidate) => candidate.name === "getJobDetail");
  return detailTool ? { tool: detailTool, args: { query: message } } : null;
}

function distanceDestinationFromText(text: string): string | undefined {
  const match = text.match(
    /\b(?:how\s+far(?:\s+is)?|distance\s+(?:to|for)|drive\s+time\s+(?:to|for)|travel\s+time\s+(?:to|for)|miles?\s+(?:to|from))\s+(.+?)(?=\s+from\s+(?:my\s+house|the\s+shop|here|102\s+kate|aquatrace)|[?.!]|$)/i
  )?.[1]?.trim();
  return match?.replace(/^is\s+/i, "").trim();
}

function intakeBusinessNameFromText(text: string): string | undefined {
  const direct = text.match(
    /\b(?:onboard|start\s+(?:an?\s+)?intake\s+for|tenant\s+intake\s+for|set\s+up\s+(?:a\s+)?(?:new\s+)?tenant\s+for|create\s+(?:a\s+)?(?:new\s+)?tenant\s+for)\s+(.+?)(?=\s+(?:as|with|that|and|then)\b|[?.!]|$)/i
  )?.[1]?.trim();
  const fallback = text.match(/\b(?:business|company)\s+(?:called|named)\s+(.+?)(?=\s+(?:as|with|that|and|then)\b|[?.!]|$)/i)?.[1]?.trim();
  return (direct || fallback)?.replace(/^["']|["']$/g, "");
}

function entityQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  const matches = [...normalized.matchAll(
    /\b(?:for|of|at)\s+(.+?)(?=\s+(?:in|from|on|with|report|pool|job|photos?|pictures?|images?|results?|gallons?|total)\b|[?.!]|$)/gi
  )];
  return (matches.at(-1)?.[1] ?? "")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeResult(toolName: string, result: unknown): string {
  if (toolName === "createRequest" && result && typeof result === "object") {
    const record = result as { request?: { clientName?: unknown; id?: unknown; subject?: unknown }; needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return `I created the request${record.request?.clientName ? ` for ${String(record.request.clientName)}` : ""}${record.request?.id ? ` as ${String(record.request.id)}` : ""}.`;
  }
  if (toolName === "createQuote" && result && typeof result === "object") {
    const record = result as { approval?: { id?: unknown; preview?: { title?: unknown } }; needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return `Quote draft ready for approval${record.approval?.id ? ` as ${String(record.approval.id)}` : ""}.`;
  }
  if (toolName === "createJob" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Job draft ready. I read it back below before anything gets created.")
      ?? "Job draft ready for approval.";
  }
  if (toolName === "listQuotes" && result && typeof result === "object") {
    const quotes = Array.isArray((result as { quotes?: unknown[] }).quotes) ? (result as { quotes: unknown[] }).quotes : [];
    return `I found ${quotes.length} quote${quotes.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listInvoices" && result && typeof result === "object") {
    const invoices = Array.isArray((result as { invoices?: unknown[] }).invoices) ? (result as { invoices: unknown[] }).invoices : [];
    return `I found ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listJobs" && result && typeof result === "object") {
    const jobs = Array.isArray((result as { jobs?: unknown[] }).jobs) ? (result as { jobs: unknown[] }).jobs : [];
    return `I found ${jobs.length} job${jobs.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "getJobDetail" && result && typeof result === "object") {
    const detail = result as { job?: { title?: unknown; status?: unknown; number?: unknown; visits?: unknown[]; reminders?: { invoice?: unknown } } | null };
    if (!detail.job) {
      return "I do not have a saved job for that search yet.";
    }
    const visitCount = Array.isArray(detail.job.visits) ? detail.job.visits.length : 0;
    return `${String(detail.job.title ?? "Job")} is ${String(detail.job.status ?? "unknown")}${detail.job.number ? ` as ${String(detail.job.number)}` : ""} with ${visitCount} visit${visitCount === 1 ? "" : "s"}.`;
  }
  if (toolName === "queueJobAction" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Job action ready. I read the action back below before anything executes.")
      ?? "Job action ready for approval.";
  }
  if (toolName === "queueLedgerAction" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Billing action ready. I read the action back below before anything executes.")
      ?? "Billing action ready for approval.";
  }
  if (toolName === "approvePendingApproval" && result && typeof result === "object") {
    const execution = (result as {
      execution?: {
        job?: { title?: unknown } | undefined;
        invoice?: { number?: unknown; id?: unknown; status?: unknown; ledger?: { balanceDue?: unknown } } | undefined;
        payment?: { id?: unknown; status?: unknown; amount?: unknown } | undefined;
        refund?: { id?: unknown } | undefined;
        receiptReview?: { id?: unknown; status?: unknown } | undefined;
        jobs?: Array<{ number?: unknown; id?: unknown }> | undefined;
      }
    }).execution;
    if (execution?.job && typeof execution.job.title === "string") {
      return `Approved and executed ${execution.job.title}.`;
    }
    if (execution?.invoice?.id && Array.isArray(execution.jobs) && execution.jobs.length > 0) {
      return `Approved and built invoice ${String(execution.invoice.number ?? execution.invoice.id)} from ${execution.jobs.length} selected job${execution.jobs.length === 1 ? "" : "s"}.`;
    }
    if (execution?.refund?.id) {
      return `Approved and recorded refund ${String(execution.refund.id)}${execution.receiptReview?.id ? ` with receipt review ${String(execution.receiptReview.id)} paused.` : "."}`;
    }
    if (execution?.payment?.id) {
      if (execution.payment.status === "failed") {
        return `Approved and logged failed payment ${String(execution.payment.id)}${execution.invoice?.id ? ` on ${String(execution.invoice.number ?? execution.invoice.id)}` : ""}. Recovery is still open: retry the same card, switch saved cards, take a manual payment, or send the pay link.`;
      }
      const balanceDue = typeof execution.invoice?.ledger?.balanceDue === "number"
        ? execution.invoice.ledger.balanceDue
        : undefined;
      if (execution.invoice?.status === "partial_pay" && balanceDue !== undefined && balanceDue > 0) {
        return `Approved and recorded partial payment ${String(execution.payment.id)} on ${String(execution.invoice.number ?? execution.invoice.id)}. $${balanceDue.toFixed(2)} remains, so the next step is to send the remaining balance or collect another payment now.`;
      }
      return `Approved and recorded payment ${String(execution.payment.id)}${execution.invoice?.id ? ` on ${String(execution.invoice.number ?? execution.invoice.id)}` : ""}${execution.receiptReview?.id ? ` with receipt review ${String(execution.receiptReview.id)} paused.` : "."}`;
    }
    if (execution?.receiptReview?.id) {
      return `Approved and sent receipt review ${String(execution.receiptReview.id)}${execution.invoice?.id ? ` for ${String(execution.invoice.number ?? execution.invoice.id)}` : ""}.`;
    }
    if (execution?.invoice?.id) {
      return `Approved and updated invoice ${String(execution.invoice.number ?? execution.invoice.id)}${execution.payment?.id ? ` with payment ${String(execution.payment.id)}` : ""}.`;
    }
    return "Approved and executed the pending item.";
  }
  if (toolName === "rejectPendingApproval" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `Rejected ${approval?.id ? String(approval.id) : "the pending item"}. Nothing was created.`;
  }
  if ((toolName === "revisePendingJobCreateApproval" || toolName === "revisePendingJobActionApproval") && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Updated draft ready. Please check the revised record below before I run it.")
      ?? "Updated draft ready for approval.";
  }
  if (toolName === "revisePendingLedgerActionApproval" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Updated billing action ready. Please check the revised action below before I run it.")
      ?? "Updated billing action ready for approval.";
  }
  if (toolName === "getQuoteDetail" && result && typeof result === "object") {
    const detail = result as { quote?: { title?: unknown; status?: unknown; number?: unknown; totals?: { total?: unknown } } | null };
    if (!detail.quote) {
      return "I do not have a saved quote for that search yet.";
    }
    return `${String(detail.quote.title ?? "Quote")} is ${String(detail.quote.status ?? "unknown")}${detail.quote.number ? ` as ${String(detail.quote.number)}` : ""}${detail.quote.totals?.total !== undefined ? ` for $${String(detail.quote.totals.total)}` : ""}.`;
  }
  if (toolName === "getInvoiceDetail" && result && typeof result === "object") {
    const detail = result as { invoice?: { title?: unknown; status?: unknown; number?: unknown; ledger?: { balanceDue?: unknown; total?: unknown } } | null; needsClarification?: unknown };
    if (typeof detail.needsClarification === "string" && detail.needsClarification.trim()) {
      return detail.needsClarification;
    }
    if (!detail.invoice) {
      return "I do not have a saved invoice for that search yet.";
    }
    return `${String(detail.invoice.title ?? "Invoice")} is ${String(detail.invoice.status ?? "unknown")}${detail.invoice.number ? ` as ${String(detail.invoice.number)}` : ""}${detail.invoice.ledger?.balanceDue !== undefined ? ` with $${String(detail.invoice.ledger.balanceDue)} still due` : detail.invoice.ledger?.total !== undefined ? ` for $${String(detail.invoice.ledger.total)}` : ""}.`;
  }
  if (toolName === "queueInvoiceCompose" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Combined invoice draft ready. I read the selected jobs and totals back below before I build it.")
      ?? "Combined invoice draft ready for approval.";
  }
  if (toolName === "queueInvoiceSend" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Invoice delivery is ready. I read the channel, target, and payload back below before I send it.")
      ?? "Invoice delivery is ready for approval.";
  }
  if (toolName === "queueCollectPayment" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Payment collection is ready. I read the amount, method, and card back below before I run it.")
      ?? "Payment collection is ready for approval.";
  }
  if (toolName === "queueReceiptReviewSend" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Receipt review is ready. I read the recipients, channels, and attachments back below before I send it.")
      ?? "Receipt review is ready for approval.";
  }
  if (
    (
      toolName === "revisePendingInvoiceComposeApproval"
      || toolName === "revisePendingInvoiceSendApproval"
      || toolName === "revisePendingCollectPaymentApproval"
      || toolName === "revisePendingReceiptReviewApproval"
    )
    && result && typeof result === "object"
  ) {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, "Updated draft ready. Please check the revised details below before I run it.")
      ?? "Updated draft ready for approval.";
  }
  if (toolName === "listRequests" && result && typeof result === "object") {
    const requests = Array.isArray((result as { requests?: unknown[] }).requests) ? (result as { requests: unknown[] }).requests : [];
    return `I found ${requests.length} request${requests.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listPayments" && result && typeof result === "object") {
    const payments = Array.isArray((result as { payments?: unknown[] }).payments) ? (result as { payments: unknown[] }).payments : [];
    return `I found ${payments.length} payment${payments.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listDeposits" && result && typeof result === "object") {
    const deposits = Array.isArray((result as { deposits?: unknown[] }).deposits) ? (result as { deposits: unknown[] }).deposits : [];
    return `I found ${deposits.length} deposit${deposits.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listRefunds" && result && typeof result === "object") {
    const refunds = Array.isArray((result as { refunds?: unknown[] }).refunds) ? (result as { refunds: unknown[] }).refunds : [];
    return `I found ${refunds.length} refund${refunds.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listCredits" && result && typeof result === "object") {
    const credits = Array.isArray((result as { credits?: unknown[] }).credits) ? (result as { credits: unknown[] }).credits : [];
    return `I found ${credits.length} credit${credits.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "getPaymentDetail" && result && typeof result === "object") {
    const detail = result as { payment?: { id?: unknown; status?: unknown; amount?: unknown; provider?: unknown } | null; needsClarification?: unknown };
    if (typeof detail.needsClarification === "string" && detail.needsClarification.trim()) {
      return detail.needsClarification;
    }
    if (!detail.payment) {
      return "I do not have a saved payment for that search yet.";
    }
    return `Payment ${String(detail.payment.id ?? "unknown")} is ${String(detail.payment.status ?? "unknown")} for $${String(detail.payment.amount ?? "0")} via ${String(detail.payment.provider ?? "unknown")}.`;
  }
  if (toolName === "getRequestDetail" && result && typeof result === "object") {
    const detail = result as { request?: { clientName?: unknown; subject?: unknown; narrative?: unknown }; fieldKey?: unknown; fieldLabel?: unknown; value?: unknown; missing?: unknown };
    const fieldLabel = typeof detail.fieldLabel === "string" && detail.fieldLabel.trim()
      ? detail.fieldLabel
      : typeof detail.fieldKey === "string"
        ? detail.fieldKey
        : "that field";
    if (detail.missing === true && typeof detail.fieldKey === "string") {
      return `I don't have ${fieldLabel} written down yet.`;
    }
    if (typeof detail.fieldKey === "string" && detail.value !== undefined && detail.value !== null) {
      const displayValue = typeof detail.value === "boolean"
        ? (detail.value ? "yes" : "no")
        : String(detail.value).replaceAll("_", " ");
      return `${fieldLabel}: ${displayValue}.`;
    }
    if (detail.request) {
      return `${String(detail.request.clientName ?? "That client")} request: ${String(detail.request.subject ?? "")}${detail.request.narrative ? ` - ${String(detail.request.narrative)}` : ""}`.trim();
    }
    return "I do not have a saved request for that search yet.";
  }
  if (toolName === "getSchedule" && result && typeof result === "object") {
    const jobs = Array.isArray((result as { jobs?: unknown[] }).jobs) ? (result as { jobs: unknown[] }).jobs : [];
    return `I found ${jobs.length} Jobber job${jobs.length === 1 ? "" : "s"} for that schedule window.`;
  }
  if (toolName === "completeVisit" && result && typeof result === "object") {
    const visit = (result as { visit?: { title?: unknown } }).visit;
    const job = (result as { job?: { title?: unknown; status?: unknown } }).job;
    return `I marked ${String(visit?.title ?? "that visit")} complete. ${String(job?.title ?? "The job")} is now ${String(job?.status ?? "updated")}.`;
  }
  if (toolName === "getPhotos" && result && typeof result === "object") {
    const media = Array.isArray((result as { media?: unknown[] }).media) ? (result as { media: unknown[] }).media : [];
    return `I found ${media.length} CompanyCam media item${media.length === 1 ? "" : "s"}; thumbnails must be served through /api/media/:id.`;
  }
  if (toolName === "triageInbox" && result && typeof result === "object") {
    const items = Array.isArray((result as { items?: unknown[] }).items) ? (result as { items: unknown[] }).items : [];
    return `I found ${items.length} email item${items.length === 1 ? "" : "s"} needing attention after excluding spam and promos.`;
  }
  if (toolName === "lookupSiteJobBlueprintField" && result && typeof result === "object") {
    const value = (result as { value?: unknown }).value;
    return value === null || value === undefined ? "I do not have that SiteJobBlueprint field yet." : `The SiteJobBlueprint field value is ${String(value)}.`;
  }
  if (toolName === "runEvaporation" && result && typeof result === "object") {
    const report = (result as { report?: { calculation?: { evapInchesPerDay?: unknown; leakInchesPerDay?: unknown } } }).report;
    const calculation = report?.calculation;
    return `I ran the Aquatrace evaporation report. Estimated evaporation is ${String(calculation?.evapInchesPerDay ?? "unknown")} inches/day; leak loss after evaporation is ${String(calculation?.leakInchesPerDay ?? "unknown")} inches/day.`;
  }
  if (toolName === "customizeOperatorUi" && result && typeof result === "object") {
    const theme = (result as { theme?: { name?: unknown; density?: unknown } }).theme;
    return `I updated the Job Desk look${theme?.name ? ` to ${String(theme.name)}` : ""}. Refresh the screen if you do not see it right away.`;
  }
  if (toolName === "getDistance" && result && typeof result === "object") {
    const distance = result as { destination?: unknown; driveMinutes?: unknown; distanceMiles?: unknown; distanceText?: unknown };
    const milesText = typeof distance.distanceMiles === "number"
      ? `${distance.distanceMiles} miles`
      : typeof distance.distanceText === "string"
        ? distance.distanceText
        : "";
    return `Drive time to ${String(distance.destination ?? "that place")} is about ${String(distance.driveMinutes ?? "unknown")} minutes${milesText ? ` (${milesText})` : ""}.`;
  }
  if (toolName === "pollGbpReviews" && result && typeof result === "object") {
    const imported = Array.isArray((result as { imported?: unknown[] }).imported) ? (result as { imported: unknown[] }).imported : [];
    const blocker = (result as { blocker?: unknown }).blocker;
    return imported.length
      ? `I found ${imported.length} Google review${imported.length === 1 ? "" : "s"} and saved them to the review queue.`
      : `I could not pull live Google reviews yet${typeof blocker === "string" ? `: ${blocker}` : "."}`;
  }
  if (toolName === "reputationQueue" && result && typeof result === "object") {
    const reviews = Array.isArray((result as { reviews?: unknown[] }).reviews) ? (result as { reviews: unknown[] }).reviews : [];
    const pendingReplies = Array.isArray((result as { pendingReplies?: unknown[] }).pendingReplies) ? (result as { pendingReplies: unknown[] }).pendingReplies : [];
    return `The reputation queue has ${reviews.length} review${reviews.length === 1 ? "" : "s"} and ${pendingReplies.length} drafted repl${pendingReplies.length === 1 ? "y" : "ies"} waiting.`;
  }
  if (toolName === "draftReviewReply" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `I drafted the review reply and parked it for approval${approval?.id ? ` (${String(approval.id)})` : ""}. Nothing posted live.`;
  }
  if (toolName === "draftReviewRequest" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `I queued the review request for approval${approval?.id ? ` (${String(approval.id)})` : ""}. Nothing sends until it is approved.`;
  }
  if (toolName === "draftGbpProfileSync" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `I drafted the Google Business Profile update and parked it for approval${approval?.id ? ` (${String(approval.id)})` : ""}.`;
  }
  if (toolName === "startIntake" && result && typeof result === "object") {
    const session = (result as { session?: { targetTenantId?: unknown; nextQuestion?: unknown } }).session;
    return `I started the onboarding interview${session?.targetTenantId ? ` for ${String(session.targetTenantId)}` : ""}. Next: ${String(session?.nextQuestion ?? "tell me about the business.")}`;
  }
  if (toolName === "answerIntake" && result && typeof result === "object") {
    const nextQuestion = (result as { nextQuestion?: unknown }).nextQuestion;
    return `I saved that onboarding answer. Next: ${String(nextQuestion ?? "keep going when you are ready.")}`;
  }
  if (toolName === "intakeStatus" && result && typeof result === "object") {
    const sessions = Array.isArray((result as { sessions?: unknown[] }).sessions) ? (result as { sessions: unknown[] }).sessions : [];
    return `I found ${sessions.length} onboarding session${sessions.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "finalizeIntake" && result && typeof result === "object") {
    const approvalId = (result as { approvalId?: unknown }).approvalId;
    return `I parked the tenant plan in the approval queue${approvalId ? ` as ${String(approvalId)}` : ""}. Nothing external was created.`;
  }
  return "I found a sourced record for that question.";
}

export async function runExplicitLocalToolLoop(request: ToolLoopRequest): Promise<ToolLoopResponse> {
  const chosen = chooseTool(request);
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0
  };
  if (!chosen) {
    return {
      answer: "I don't have that tool wired yet.",
      sources: [],
      usage,
      raw: { local: true },
      failureReason: "no_tool_selected",
      toolRuns: []
    };
  }
  const toolResult = await chosen.tool.handler(request.tenant, chosen.args);
  return {
    answer: summarizeResult(chosen.tool.name, toolResult.result),
    sources: toolResult.sources,
    usage,
    raw: { local: true },
    toolRuns: [{ name: chosen.tool.name, result: toolResult.result, sources: toolResult.sources }]
  };
}

function gatewayForEnv(input: NexiMessageInput): (request: ToolLoopRequest) => Promise<ToolLoopResponse> {
  if (input.gateway) {
    return input.gateway;
  }
  if (input.env?.NEXI_LOCAL_FAKE_GATEWAY === "true") {
    return runExplicitLocalToolLoop;
  }
  return runNexiToolLoop;
}

function isUserFlaggedIncorrect(message: string): boolean {
  return /\b(?:wrong answer|wrong|incorrect|not correct|somewhat correct|you'?re incorrect|you are incorrect)\b/i.test(message);
}

function emptyUsage(): UsageLogRecord["usage"] {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0
  };
}

function stableConversationId(input: NexiMessageInput): string {
  return input.conversationId ?? `thread_${crypto.randomUUID()}`;
}

async function answerUserFlaggedIncorrect(input: NexiMessageInput): Promise<NexiMessageResult> {
  const conversationId = stableConversationId(input);
  const recent = await input.repository.loadRecentConversations(input.tenant.id, conversationId, 8);
  const flagged = recent.at(-1);
  const failure = await input.repository.saveFailure({
    tenantId: input.tenant.id,
    op: "message",
    question: input.message,
    reason: "user_flagged_incorrect",
    sources: flagged?.sources ?? [],
    correctionText: input.message,
    flaggedConversationId: flagged?.id,
    flaggedQuestion: flagged?.userText,
    flaggedAnswer: flagged?.assistantText,
    flaggedAnswerSources: flagged?.sources
  });
  const answer = "You're right to flag that. I logged this as user_flagged_incorrect and tied it to my prior answer so we can correct the source path.";
  const saved = await input.repository.saveConversation({
    tenantId: input.tenant.id,
    conversationId,
    userText: input.message,
    assistantText: answer,
    sources: []
  });
  return {
    answer,
    sources: [],
    conversationId: saved.conversationId ?? saved.id,
    failureId: failure.id,
    usage: emptyUsage(),
    toolRuns: []
  };
}

export async function answerNexiMessage(input: NexiMessageInput): Promise<NexiMessageResult> {
  if (isUserFlaggedIncorrect(input.message)) {
    return answerUserFlaggedIncorrect(input);
  }
  const conversationId = stableConversationId(input);
  const recent = await input.repository.loadRecentConversations(input.tenant.id, conversationId, 8);
  const history = recent.flatMap((record) => [
    { role: "user" as const, content: record.userText },
    { role: "assistant" as const, content: record.assistantText }
  ]);
  const cachedToolRuns = recent.flatMap((record) => record.toolRuns ?? []);
  const gateway = gatewayForEnv(input);
  try {
    const result = await gateway({
      tenant: input.tenant,
      system: buildNexiSystemPrompt(input.tenant),
      messages: [...history, { role: "user", content: input.message }],
      tools: input.tools,
      cachedToolRuns,
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      usageLog: input.usageLog,
      env: input.env
    });
    const saved = await input.repository.saveConversation({
      tenantId: input.tenant.id,
      conversationId,
      userText: input.message,
      assistantText: result.answer,
      sources: result.sources,
      toolRuns: persistableToolRuns(result.toolRuns)
    });
    let failureId: string | undefined;
    if (result.failureReason) {
      const failure = await input.repository.saveFailure({
        tenantId: input.tenant.id,
        op: "message",
        question: input.message,
        reason: result.failureReason,
        sources: result.sources
      });
      failureId = failure.id;
    }
    return {
      answer: result.answer,
      sources: result.sources,
      conversationId: saved.conversationId ?? saved.id,
      failureId,
      usage: result.usage,
      toolRuns: result.toolRuns
    };
  } catch (error) {
    const failure = await input.repository.saveFailure({
      tenantId: input.tenant.id,
      op: "message",
      question: input.message,
      reason: error instanceof Error ? error.message : "nexi_message_failed",
      sources: []
    });
    if (error instanceof RailError) {
      throw error;
    }
    throw new RailError(error instanceof Error ? error.message : "Nexi message failed.", {
      provider: "anthropic",
      op: "messages",
      status: 500,
      retryable: false,
      cause: failure.id
    });
  }
}
