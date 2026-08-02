import { formatNavigationAddress, type Address, type ConversationRecord, type NexiTool, type Source, type Tenant, type UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import {
  extractCreateClientInput,
  runNexiToolLoop,
  type PendingApprovalContext,
  type ToolLoopRequest,
  type ToolLoopResponse,
  type UsageLogWriter
} from "@nexteam/nexi";
import type { NexiRepository } from "./nexiRepository.js";

export interface NexiMessageInput {
  tenant: Tenant;
  message: string;
  conversationId?: string | undefined;
  actorDisplayName?: string | undefined;
  requestorContext?: NexiRequestorContext | undefined;
  pendingApproval?: PendingApprovalContext | null | undefined;
  tools: NexiTool[];
  repository: NexiRepository;
  usageLog?: UsageLogWriter | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  gateway?: ((request: ToolLoopRequest) => Promise<ToolLoopResponse>) | undefined;
}

export interface NexiRequestorContext {
  tenantUserId?: string | undefined;
  displayName?: string | undefined;
  email?: string | undefined;
  phones?: string[] | undefined;
  address?: Address | undefined;
  origin?: string | undefined;
}

export interface NexiMessageResult {
  answer: string;
  sources: Source[];
  conversationId: string;
  failureId?: string | undefined;
  usage: UsageLogRecord["usage"];
  toolRuns: ToolLoopResponse["toolRuns"];
  pendingApproval?: PendingApprovalContext | null;
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
    "For schedule answers, use schedule.localSummary when present and do not describe tenant-local all-day windows as UTC appointments.",
    "Answer only what was asked in a scannable format: short lead sentence, compact bullets only when useful, no extra menu of options unless the user asks.",
    "For email summaries and triage, group by priority when available and format each item as sender - subject - one-line ask. Leave internal IDs out unless the owner asks. Sign-in tests and account welcomes are not client inquiries.",
    "Talk like a sharp, reliable employee for trade owners and field workers. Avoid user-facing jargon such as API, endpoint, tool call, source, query, rail, and schema.",
    "For action requests like drafting or sending email, use the approval-gated draft tool and do not require factual sources before acknowledging the queued draft.",
    "For tenant onboarding requests, run the intake interview, capture current app-stack choices, and queue provisioning for owner approval only. Never claim external accounts, publishing, emails, or domains are set up.",
    "Keep phone answers short, direct, and operational. Ask at most one clarifying question."
  ].join("\n");
}

function requestorPhone(context: NexiRequestorContext | undefined): string | undefined {
  return context?.phones?.map((value) => value.replace(/[^\d+]/g, "").trim()).find(Boolean);
}

function requestorAddressString(address: Address | undefined): string | undefined {
  return formatNavigationAddress(address);
}

function requestorOrigin(context: NexiRequestorContext | undefined): string | undefined {
  return context?.origin?.trim() || requestorAddressString(context?.address);
}

function messageTargetsRequestor(text: string): boolean {
  return /\b(?:to|for|send|share|email|mail|text|sms|call|draft|compose|write)\s+me\b/i.test(text)
    || /\bto\s+my\s+(?:email|mail|phone|cell|mobile|text|sms)\b/i.test(text)
    || /\b(?:my\s+(?:house|home)|from\s+here|from\s+me)\b/i.test(text);
}

function requestorTargetForChannel(
  context: NexiRequestorContext | undefined,
  message: string,
  preferredChannel?: "email" | "sms" | undefined
): string | undefined {
  if (!messageTargetsRequestor(message)) {
    return undefined;
  }
  const email = context?.email?.trim();
  const phone = requestorPhone(context);
  if (preferredChannel === "sms") {
    return phone;
  }
  if (preferredChannel === "email") {
    return email;
  }
  return email || phone;
}

function requestorOriginForMessage(context: NexiRequestorContext | undefined, message: string): string | undefined {
  return /\b(?:from\s+here|from\s+my\s+(?:house|home)|from\s+me)\b/i.test(message)
    ? requestorOrigin(context)
    : undefined;
}

function approvalIdFromText(text: string): string | undefined {
  return text.match(/\b(appr_[a-z0-9_-]+)\b/i)?.[1];
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

function hasContentDraftChangeDetails(text: string): boolean {
  return /\b(?:change|fix|update|rewrite|revise|title|body|caption|short caption|long caption)\b/i.test(text);
}

function emptyPendingApprovalContext(
  approvalId: string,
  overrides: Partial<PendingApprovalContext> = {}
): PendingApprovalContext {
  return {
    approvalId,
    awaitingChanges: false,
    revisableClientCreate: false,
    revisableQuoteCreate: false,
    revisableJobCreate: false,
    revisableJobAction: false,
    revisableJobVisitSeries: false,
    revisableVisitShift: false,
    revisableLedgerAction: false,
    revisableInvoiceCompose: false,
    revisableInvoiceSend: false,
    revisableCollectPayment: false,
    revisableReceiptReview: false,
    revisableContentDraft: false,
    ...overrides
  };
}

function pendingApprovalFlagsForToolName(toolName: string): Partial<PendingApprovalContext> {
  switch (toolName) {
    case "createClient":
    case "revisePendingClientCreateApproval":
      return { revisableClientCreate: true };
    case "createQuote":
    case "revisePendingQuoteCreateApproval":
      return { revisableQuoteCreate: true };
    case "createJob":
    case "revisePendingJobCreateApproval":
      return { revisableJobCreate: true };
    case "queueJobAction":
    case "revisePendingJobActionApproval":
      return { revisableJobAction: true };
    case "scheduleJobVisits":
    case "revisePendingJobVisitSeriesApproval":
      return { revisableJobVisitSeries: true };
    case "shiftJobVisitSeries":
    case "revisePendingVisitShiftApproval":
      return { revisableVisitShift: true };
    case "queueLedgerAction":
    case "revisePendingLedgerActionApproval":
      return { revisableLedgerAction: true };
    case "queueInvoiceCompose":
    case "revisePendingInvoiceComposeApproval":
      return { revisableInvoiceCompose: true };
    case "queueInvoiceSend":
    case "revisePendingInvoiceSendApproval":
      return { revisableInvoiceSend: true };
    case "queueCollectPayment":
    case "revisePendingCollectPaymentApproval":
      return { revisableCollectPayment: true };
    case "queueReceiptReviewSend":
    case "revisePendingReceiptReviewApproval":
      return { revisableReceiptReview: true };
    case "generateJobContent":
    case "revisePendingDraftApproval":
      return { revisableContentDraft: true };
    default:
      return {};
  }
}

function approvalContextFromMessages(messages: ToolLoopRequest["messages"]): PendingApprovalContext | null {
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
      return emptyPendingApprovalContext(approvalId, {
        awaitingChanges: true,
        revisableClientCreate: /create client:|you requested create client for/i.test(content),
        revisableQuoteCreate: /create quote:|you requested create quote for/i.test(content),
        revisableJobCreate: /create job:|you requested create job for/i.test(content),
        revisableJobAction: /close job:|invoice job:|close and invoice job:|dismiss invoice reminder:|you requested (?:close|invoice|close and invoice|dismiss invoice reminder) job for/i.test(content),
        revisableJobVisitSeries: /schedule job visits:|you requested schedule job visits for/i.test(content),
        revisableVisitShift: /shift job visit series:|you requested shift job visit series for/i.test(content),
        revisableLedgerAction: /refund payment:|void invoice:|mark bad debt:|you requested (?:refund payment|void invoice|mark bad debt) for/i.test(content),
        revisableInvoiceCompose: /combine invoice:|you requested combine invoice for/i.test(content),
        revisableInvoiceSend: /send invoice:|you requested send invoice for/i.test(content),
        revisableCollectPayment: /collect payment:|you requested collect payment for/i.test(content),
        revisableReceiptReview: /send receipt review:|you requested send receipt review for/i.test(content),
        revisableContentDraft: /marketing draft ready|updated marketing draft ready/i.test(content)
      });
    }
    if (/(?:approve this|is this correct)\?\s*(?:reply\s+)?yes\s*\/\s*no(?:\s*\/\s*make changes)?/i.test(content)) {
      return emptyPendingApprovalContext(approvalId, {
        awaitingChanges: false,
        revisableClientCreate: /create client:|you requested create client for/i.test(content),
        revisableQuoteCreate: /create quote:|you requested create quote for/i.test(content),
        revisableJobCreate: /create job:|you requested create job for/i.test(content),
        revisableJobAction: /close job:|invoice job:|close and invoice job:|dismiss invoice reminder:|you requested (?:close|invoice|close and invoice|dismiss invoice reminder) job for/i.test(content),
        revisableJobVisitSeries: /schedule job visits:|you requested schedule job visits for/i.test(content),
        revisableVisitShift: /shift job visit series:|you requested shift job visit series for/i.test(content),
        revisableLedgerAction: /refund payment:|void invoice:|mark bad debt:|you requested (?:refund payment|void invoice|mark bad debt) for/i.test(content),
        revisableInvoiceCompose: /combine invoice:|you requested combine invoice for/i.test(content),
        revisableInvoiceSend: /send invoice:|you requested send invoice for/i.test(content),
        revisableCollectPayment: /collect payment:|you requested collect payment for/i.test(content),
        revisableReceiptReview: /send receipt review:|you requested send receipt review for/i.test(content),
        revisableContentDraft: /marketing draft ready|updated marketing draft ready/i.test(content)
      });
    }
  }
  return null;
}

function approvalRequestSummary(title: string): string {
  const [action, subject] = title.split(":");
  if (!action || !subject) {
    return title.trim();
  }
  return `${action.trim().toLowerCase()} for ${subject.trim()}`;
}

function labeledEmailAddress(text: string): string | undefined {
  const candidate = text.match(/\b(?:email|e-mail)(?:\s+address)?\s*(?:is|=|:)?\s+([A-Za-z0-9@._%+\- ]+)/i)?.[1];
  if (!candidate) {
    return undefined;
  }
  const trimmed = candidate
    .split(/[?!,]/)[0]
    ?.replace(/\b(?:to|at|for)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return undefined;
  }
  const tokens = trimmed.split(" ");
  const atIndex = tokens.findIndex((token) => token.includes("@"));
  if (atIndex === -1) {
    return undefined;
  }
  const firstStart = Math.max(0, atIndex - 2);
  for (let start = firstStart; start <= atIndex; start += 1) {
    const combined = tokens.slice(start, atIndex + 1).join("");
    const matched = combined.match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
    if (matched) {
      return matched;
    }
  }
  return tokens[atIndex]?.match(/[\w.+-]+@[\w.-]+\.\w+/i)?.[0];
}

function adjacentTokenEmailAddress(text: string): string | undefined {
  const tokens = text
    .replace(/[<>"'`()[\],!?;:]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w.+-]+|[^\w.+-@]+$/g, ""))
    .filter(Boolean);
  let best: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (!token.includes("@")) {
      continue;
    }
    for (let start = Math.max(0, index - 2); start <= index; start += 1) {
      const prefix = tokens.slice(start, index);
      if (prefix.some((part) => /^(?:to|at|for|is|my|me|email|e-mail)$/i.test(part))) {
        continue;
      }
      const combined = tokens.slice(start, index + 1).join("");
      const matched = combined.match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
      if (matched && (!best || matched.length > best.length)) {
        best = matched;
      }
    }
    const direct = token.match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
    if (direct && (!best || direct.length > best.length)) {
      best = direct;
    }
  }
  return best;
}

function firstEmailAddress(text: string): string | undefined {
  return labeledEmailAddress(text)
    ?? adjacentTokenEmailAddress(text)
    ?? text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
}

function firstPhoneNumber(text: string): string | undefined {
  return text.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0];
}

function looksLikeCreateClientAction(lower: string): boolean {
  return /\b(?:add|create|set\s+up|make)\b.{0,40}\b(?:new\s+)?client\b/.test(lower)
    || /\b(?:new\s+client|client\s+create)\b/.test(lower);
}

function looksLikeClientAddressUpdateAction(lower: string): boolean {
  return /\b(?:add|edit|update|change|fix|correct|replace)\b.{0,80}\b(?:client|address|location|zip|postal(?:\s+code)?)\b/.test(lower)
    && /\b(?:address|location|zip|postal(?:\s+code)?)\b/.test(lower);
}

function clientQueryForAddressUpdate(message: string): string | undefined {
  const query = message.match(/\b([a-z][a-z' -]+?)'s\s+(?:address|location|zip|postal(?:\s+code)?)\b/i)?.[1]?.trim()
    ?? message.match(/\b(?:edit|update|change|fix|correct)\s+([a-z][a-z' -]+?)\s+(?:client(?:'s)?\s+)?(?:address|location|zip|postal)\b/i)?.[1]?.trim()
    ?? entityQueryFromText(message)
    ?? message.match(/\b(?:client|for)\s+([a-z][a-z' -]+?)(?=\s+(?:address|location|zip|postal|to|from)\b|[?.!]|$)/i)?.[1]?.trim()
    ;
  return query?.replace(/^(?:edit|update|change|fix|correct)\s+/i, "").trim() || undefined;
}

function previewFieldValue(body: string, label: string): string | undefined {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
}

function formatConfirmationPhone(phone: string | undefined): string | undefined {
  if (!phone) {
    return undefined;
  }
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

function cleanClientPreviewName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const cleaned = trimmed.replace(/^[.\s,:;-]+|[.\s,:;-]+$/g, "").replace(/\s+/g, " ").trim();
  return /[a-z0-9]/i.test(cleaned) ? cleaned : undefined;
}

function missingClientNamePrompt(): string {
  return "I still need the client's full name before I can queue this. What should I save as the client name?";
}

function normalizedApprovalTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  if (!trimmed) {
    return undefined;
  }
  const [action, ...subjectParts] = trimmed.split(":");
  const cleanedAction = action?.trim();
  const cleanedSubject = cleanClientPreviewName(subjectParts.join(":"));
  if (cleanedAction && cleanedSubject) {
    return `${cleanedAction}: ${cleanedSubject}`;
  }
  if (cleanedAction && subjectParts.length > 0) {
    return cleanedAction;
  }
  return cleanClientPreviewName(trimmed);
}

function clientApprovalPromptFromPreview(title: string, body: string): string {
  const fallbackName = cleanClientPreviewName(title.split(":").slice(1).join(":"));
  const name = cleanClientPreviewName(previewFieldValue(body, "Name")) ?? fallbackName;
  if (!name) {
    return missingClientNamePrompt();
  }
  const street = previewFieldValue(body, "Address");
  const city = previewFieldValue(body, "City");
  const state = previewFieldValue(body, "State");
  const zip = previewFieldValue(body, "ZIP");
  const addressLine = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const phone = formatConfirmationPhone(previewFieldValue(body, "Phone"));
  const email = previewFieldValue(body, "Email");
  return [
    name,
    addressLine,
    phone,
    email && !/not provided/i.test(email) ? email : "Email not provided",
    "",
    "Do the Client Details look correct?"
  ].filter((line, index, lines) => line || index >= lines.length - 2).join("\n");
}

function approvalPromptFromResult(
  result: unknown,
  actorDisplayName: string | undefined,
  options: { allowChanges?: boolean } = {}
): string | undefined {
  const record = result && typeof result === "object" ? result as { approval?: { id?: unknown; preview?: { title?: unknown; body?: unknown } } } : {};
  const title = typeof record.approval?.preview?.title === "string" ? record.approval.preview.title : "";
  const body = typeof record.approval?.preview?.body === "string" ? record.approval.preview.body : "";
  if (!title || !body) {
    return undefined;
  }
  if (/^(?:create|revise) client:/i.test(title)) {
    return clientApprovalPromptFromPreview(title, body);
  }
  const approvalLine = options.allowChanges === false
    ? "Is this correct?\nReply yes / no."
    : "Is this correct?\nReply yes / no / make changes.";
  const displayName = actorDisplayName?.trim() || "Operator";
  return `Here is your request, ${displayName}.\n\nYou requested ${approvalRequestSummary(title)} with the following details:\n${body}\n\n${approvalLine}`;
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
  const approvalContext = request.pendingApproval ?? approvalContextFromMessages(request.messages);
  const requestorContext = request.requestorEmail || request.requestorPhones?.length || request.requestorOrigin
    ? {
        email: request.requestorEmail,
        phones: request.requestorPhones,
        origin: request.requestorOrigin
      }
    : undefined;
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const propertyId = message.match(/\bproperty_[a-z0-9_-]+\b/i)?.[0];
  const jobId = message.match(/\bjob_[a-z0-9_-]+\b/i)?.[0];
  const visitId = message.match(/\bvisit_[a-z0-9_-]+\b/i)?.[0];
  const checklistId = message.match(/\bchecklist_[a-z0-9_-]+\b/i)?.[0];
  const clientId = message.match(/\bclient_[a-z0-9_-]+\b/i)?.[0];
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
  if (approvalContext?.revisableClientCreate && (approvalContext.awaitingChanges || firstEmailAddress(message) || firstPhoneNumber(message) || /\b(?:name|client|address|street|road|drive|lane|court|avenue|boulevard|suite|unit|apt)\b/i.test(lower))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingClientCreateApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableQuoteCreate && (approvalContext.awaitingChanges || /\b(?:change|fix|update|rename|title|discount|deposit|signature|card on file|terms|price|amount)\b/i.test(lower))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingQuoteCreateApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableJobCreate && (approvalContext.awaitingChanges || /\b(?:change|fix|update|rename|title)\b/i.test(lower))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingJobCreateApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableJobAction && (approvalContext.awaitingChanges || hasJobActionChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingJobActionApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableJobVisitSeries && (approvalContext.awaitingChanges || /\b(?:back|later|forward|earlier|sooner|visit)\b/i.test(lower))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingJobVisitSeriesApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (approvalContext?.revisableVisitShift && (approvalContext.awaitingChanges || /\b(?:back|later|forward|earlier|sooner|remaining|just this one|only this visit)\b/i.test(lower))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingVisitShiftApproval");
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
  if (approvalContext?.revisableContentDraft && (approvalContext.awaitingChanges || hasContentDraftChangeDetails(message))) {
    const tool = tools.find((candidate) => candidate.name === "revisePendingDraftApproval");
    return tool ? { tool, args: { approvalId: approvalContext.approvalId, changeRequest: message } } : null;
  }
  if (/\b(?:generate|draft|create|make|write)\b.*\b(?:marketing content|content draft|content|article|social post|social draft|post)\b/i.test(lower) && jobId) {
    const tool = tools.find((candidate) => candidate.name === "generateJobContent");
    return tool ? { tool, args: { jobId } } : null;
  }
  if (/\b(?:show|list|open|check)\b.*\b(?:pending drafts|draft queue|content queue|marketing queue|pending content)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listPendingDrafts");
    return tool ? { tool, args: {} } : null;
  }
  const marketingDraftId = message.match(/\bcontent_(?:article|social_post|gbp_post)_[a-z0-9-]+\b/i)?.[0];
  if (/\b(?:approve|ready)\b.*\bdraft\b/i.test(lower) && marketingDraftId) {
    const tool = tools.find((candidate) => candidate.name === "approveDraft");
    return tool ? { tool, args: { draftId: marketingDraftId } } : null;
  }
  if (/\b(?:discard|reject|delete)\b.*\bdraft\b/i.test(lower) && marketingDraftId) {
    const tool = tools.find((candidate) => candidate.name === "discardDraft");
    return tool ? { tool, args: { draftId: marketingDraftId } } : null;
  }
  if (/\b(?:show|list|open|export|check)\b.*\b(?:consented clients|marketing audience|audience pool|campaign audience)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listConsentedClients");
    const serviceType = message.match(/\bservice\s*(?:type)?\s*(?:is|=|:)?\s*([a-z][a-z0-9 /&-]+)/i)?.[1]?.trim();
    const locality = message.match(/\blocality\s*(?:is|=|:)?\s*([a-z][a-z0-9 ,.-]+)/i)?.[1]?.trim();
    const closedSince = message.match(/\b(?:since|closed since)\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
    return tool ? {
      tool,
      args: {
        ...(serviceType ? { serviceType } : {}),
        ...(locality ? { locality } : {}),
        ...(closedSince ? { closedSince } : {})
      }
    } : null;
  }
  if ((/\b(?:send|draft|compose|write)\s+(?:me\s+)?(?:an?\s+)?email\b/i.test(lower) || /\b(?:email|mail)\s+me\b/i.test(lower)) && !/\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftEmail");
    const recipient = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0]
      ?? requestorTargetForChannel(requestorContext, message, "email");
    const bodyText = message.match(/\b(?:saying|that says|to say|with message|message)\b\s*:?\s*([\s\S]+)$/i)?.[1]?.trim() || "Please see the note from the service team.";
    const subject = bodyText.split(/[.!?]\s/)[0]?.trim().replace(/[.!?]+$/g, "").slice(0, 72) || "Service follow-up";
    return tool && recipient ? { tool, args: { to: [recipient], subject, bodyText } } : null;
  }
  if (/\b(?:send|share|email|text|sms)\b.*\b(?:portal|hub)\b.*\blink\b/i.test(lower) || /\bportal\s+link\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "sendPortalLink");
    const clientQuery = entityQueryFromText(message)
      || message.match(/\b(?:send|share|email|text|sms)\s+([a-z][a-z' -]+?)\s+(?:an?\s+|the\s+)?(?:portal|hub)\s+link\b/i)?.[1]?.trim()
      || message.match(/\bportal\s+link\s+(?:for|to)\s+([a-z][a-z' -]+?)(?=\s+(?:by|via|through|at|using)\b|[?.!]|$)/i)?.[1]?.trim();
    const preferredChannel = /\b(?:text|sms)\b/i.test(lower) ? "sms" : /\b(?:email|mail)\b/i.test(lower) ? "email" : undefined;
    const target = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0]
      ?? message.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0]?.replace(/[^\d+]/g, "")
      ?? requestorTargetForChannel(requestorContext, message, preferredChannel);
    const propertyId = message.match(/\bproperty_[a-z0-9-]+\b/i)?.[0];
    return tool && clientQuery
      ? {
          tool,
          args: {
            clientQuery,
            ...(target ? { target } : {}),
            ...(preferredChannel ? { preferredChannel } : {}),
            ...(propertyId ? { propertyId } : {})
          }
        }
      : null;
  }
  if (/\b(?:portal|hub)\s+activity\b/i.test(lower) || /\bwhat\s+did\b.*\bportal\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getClientPortalActivity");
    const clientQuery = entityQueryFromText(message)
      || message.match(/\b(?:show|list|read|open)\s+([a-z][a-z' -]+?)\s+(?:portal|hub)\s+activity\b/i)?.[1]?.trim()
      || message.match(/\bwhat\s+did\s+([a-z][a-z' -]+?)\s+do\s+in\s+the\s+portal\b/i)?.[1]?.trim();
    const propertyId = message.match(/\bproperty_[a-z0-9-]+\b/i)?.[0];
    return tool && clientQuery ? { tool, args: { clientQuery, ...(propertyId ? { propertyId } : {}) } } : null;
  }
  if (/\bsend\b.*\bstatement\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "sendStatement");
    const clientQuery = entityQueryFromText(message)
      || message.match(/\bsend\s+([a-z][a-z' -]+?)\s+(?:an?\s+)?statement\b/i)?.[1]?.trim()
      || message.match(/\bstatement\s+(?:for|to)\s+([a-z][a-z' -]+?)(?=\s+(?:to|at|from)\b|[?.!]|$)/i)?.[1]?.trim();
    const target = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0]
      ?? message.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0]?.replace(/[^\d+]/g, "")
      ?? requestorTargetForChannel(requestorContext, message, /\b(?:text|sms)\b/i.test(lower) ? "sms" : "email");
    return tool && clientQuery ? { tool, args: { clientQuery, ...(target ? { target } : {}) } } : null;
  }
  if (/\b(?:generate|preview|show|download|build)\b.*\bstatement\b/i.test(lower) || /\bclient\s+statement\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "generateStatement");
    const clientQuery = entityQueryFromText(message)
      || message.match(/\b(?:generate|preview|show|download|build)\s+(?:an?\s+)?statement\s+(?:for\s+)?([a-z][a-z' -]+?)(?=\s+(?:from|to)\b|[?.!]|$)/i)?.[1]?.trim()
      || message.match(/\bclient\s+statement\s+(?:for\s+)?([a-z][a-z' -]+?)(?=\s+(?:from|to)\b|[?.!]|$)/i)?.[1]?.trim();
    const from = message.match(/\bfrom\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
    const to = message.match(/\bto\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
    return tool && clientQuery ? { tool, args: { clientQuery, ...(from ? { from } : {}), ...(to ? { to } : {}) } } : null;
  }
  if (looksLikeCreateClientAction(lower)) {
    const tool = tools.find((candidate) => candidate.name === "createClient");
    return tool ? { tool, args: {} } : null;
  }
  if (looksLikeClientAddressUpdateAction(lower)) {
    const tool = tools.find((candidate) => candidate.name === "updateClient");
    const clientQuery = clientQueryForAddressUpdate(message);
    return tool && clientQuery ? { tool, args: { clientQuery, changeRequest: message } } : null;
  }
  if (/\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getDistance");
    const destination = distanceDestinationFromText(message);
    const origin = requestorOriginForMessage(requestorContext, message);
    return tool && destination ? { tool, args: { destination, ...(origin ? { origin } : {}) } } : null;
  }
  if (
    /\b(?:create|add|new)\b.*\brequest\b/i.test(lower)
    || (/\bi still need\b/i.test(lastAssistantMessage) && /\brequest\b/i.test(allUserText))
  ) {
    const tool = tools.find((candidate) => candidate.name === "createRequest");
    return tool ? { tool, args: { rawText: allUserText || message } } : null;
  }
  if (/\b(?:push|move|shift|reschedule)\b/i.test(lower) && /\bremaining\s+visits?\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "shiftJobVisitSeries");
    const parsed = buildVisitShiftArgsFromText(message);
    return tool && parsed ? { tool, args: parsed } : null;
  }
  if (/\b(?:schedule|book|add)\b/i.test(lower) && /\bvisits?\b/i.test(lower)) {
    const parsed = buildVisitSeriesArgsFromText(message);
    const tool = tools.find((candidate) => candidate.name === "scheduleJobVisits");
    return tool && parsed ? { tool, args: parsed } : null;
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
  if (/\b(?:mark|set)\b.*\breview(?:\s+(?:sequence|follow[\s-]?up))?\b.*\b(?:complete|completed|reviewed)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "markReviewed");
    const reviewSequenceId = message.match(/\breview_sequence_[a-z0-9-]+\b/i)?.[0];
    const jobId = message.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    const clientQuery = entityQueryFromText(message);
    return tool
      ? {
          tool,
          args: {
            ...(reviewSequenceId ? { reviewSequenceId } : {}),
            ...(jobId ? { jobId } : {}),
            ...(!reviewSequenceId && !jobId && clientQuery ? { clientQuery } : {})
          }
        }
      : null;
  }
  if (/\b(?:stop|pause|cancel|end)\b.*\breview(?:\s+(?:sequence|follow[\s-]?up))\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "stopReviewSequence");
    const reviewSequenceId = message.match(/\breview_sequence_[a-z0-9-]+\b/i)?.[0];
    const jobId = message.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    const clientQuery = entityQueryFromText(message);
    return tool
      ? {
          tool,
          args: {
            ...(reviewSequenceId ? { reviewSequenceId } : {}),
            ...(jobId ? { jobId } : {}),
            ...(!reviewSequenceId && !jobId && clientQuery ? { clientQuery } : {})
          }
        }
      : null;
  }
  if (/\b(?:start|restart|resume|kick\s+off)\b.*\breview(?:\s+(?:sequence|follow[\s-]?up))\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "startReviewSequence");
    const jobId = message.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    const clientQuery = entityQueryFromText(message);
    return tool ? { tool, args: jobId ? { jobId } : clientQuery ? { clientQuery } : {} } : null;
  }
  if (/\breview(?:\s+(?:sequence|follow[\s-]?up))\b.*\b(?:status|state)\b/i.test(lower) || /\bwhat\s+is\s+the\s+review\s+sequence\s+status\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getReviewSequenceStatus");
    const reviewSequenceId = message.match(/\breview_sequence_[a-z0-9-]+\b/i)?.[0];
    const jobId = message.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    const clientQuery = entityQueryFromText(message);
    return tool
      ? {
          tool,
          args: {
            ...(reviewSequenceId ? { reviewSequenceId } : {}),
            ...(jobId ? { jobId } : {}),
            ...(!reviewSequenceId && !jobId && clientQuery ? { clientQuery } : {})
          }
        }
      : null;
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
    const requestorTarget = requestorTargetForChannel(requestorContext, message, mode === "sms" ? "sms" : "email");
    return tool ? {
      tool,
      args: {
        ...(invoiceId ? { invoiceId } : { query: entityQueryFromText(message) || message }),
        mode,
        ...(mode === "email" && (email || requestorTarget) ? { target: email ?? requestorTarget } : {}),
        ...(mode === "sms" && (phone || requestorTarget) ? { target: (phone ?? requestorTarget)?.replace(/[^\d+]/g, "") } : {}),
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
    const email = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0]
      ?? requestorTargetForChannel(requestorContext, message, "email");
    const phone = message.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0]
      ?? requestorTargetForChannel(requestorContext, message, "sms");
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
  if (/\bbefore\s*(?:\/|-|and)?\s*after\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "beforeAfterPairs");
    return tool ? { tool, args: { ...(jobId ? { jobId } : {}) } } : null;
  }
  if (/\b(?:generate|build|create|make)\b.*\b(?:visit\s+)?report\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "generateVisitReport");
    const title = message.match(/\btitle\s*(?:is|to|=|:)\s*([^.!?\n]+)/i)?.[1]?.trim();
    return tool && jobId
      ? {
          tool,
          args: {
            jobId,
            ...(propertyId ? { propertyId } : {}),
            ...(visitId ? { visitId } : {}),
            ...(checklistId ? { checklistId } : {}),
            ...(title ? { title } : {})
          }
        }
      : null;
  }
  if ((/\b(?:show|open|get|fetch|latest)\b.*\breport\b/i.test(lower) || /\bvisit\s+report\b/i.test(lower)) && !/\b(?:generate|build|create|make)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getVisitReport");
    return tool && (jobId || visitId)
      ? {
          tool,
          args: {
            ...(jobId ? { jobId } : {}),
            ...(visitId ? { visitId } : {})
          }
        }
      : null;
  }
  if (
    (/\b(?:history|last\s+time|previous|carry(?:\s|-)?forward)\b/i.test(lower) && /\b(?:property|gallon|gallons|field|pool)\b/i.test(lower))
    || (/\bgallon/i.test(lower) && Boolean(tools.find((candidate) => candidate.name === "getPropertyHistory")))
  ) {
    const tool = tools.find((candidate) => candidate.name === "getPropertyHistory");
    const fieldId = /\bgallon/i.test(lower)
      ? "item_17"
      : /\bgate\s+code|\bsite\s+note|\bconvention/i.test(lower)
        ? "item_7"
        : undefined;
    return tool && propertyId
      ? {
          tool,
          args: {
            propertyId,
            ...(fieldId ? { fieldId } : {})
          }
        }
      : null;
  }
  if (/\b(?:recent|latest|last)\b.*\b(?:photos?|pictures?|images?|media)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listRecentPhotos");
    return tool
      ? {
          tool,
          args: {
            ...(clientId ? { clientId } : {}),
            ...(propertyId ? { propertyId } : {}),
            ...(jobId ? { jobId } : {}),
            ...(visitId ? { visitId } : {}),
            limit: 12
          }
        }
      : null;
  }
  if (/\b(?:unassigned|decide later|capture inbox)\b/i.test(lower) && /\b(?:photos?|pictures?|images?|media|batches?)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "listUnassignedPhotoBatches");
    return tool ? { tool, args: { limit: 12 } } : null;
  }
  if (/\b(?:assign|attach|route|move)\b.*\b(?:capture\s+batch|photo\s+batch|batch)\b/i.test(lower) && /\bclient\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "assignPhotoBatch");
    const batchId = message.match(/\bcapture_batch_[a-z0-9_-]+\b/i)?.[0];
    const clientName = message.match(/\bto\s+(?:existing\s+)?client\s+([a-z][\w .'-]+)$/i)?.[1]?.trim()
      ?? message.match(/\bto\s+([a-z][\w .'-]+)$/i)?.[1]?.trim();
    return tool && batchId
      ? {
          tool,
          args: {
            batchId,
            ...(clientName ? { clientName } : {})
          }
        }
      : null;
  }
  if (/\b(?:documents?|docs?|folders?|files?|permits?|plans?|certificates?|receipts?|statements?|pdfs?)\b/i.test(lower)) {
    if (/\b(?:create|add|new)\b.*\bfolder\b/i.test(lower)) {
      const tool = tools.find((candidate) => candidate.name === "createFolder");
      const label = message.match(/\bfolder\s+(?:called|named)?\s*["â€œ]?([^"â€\n]+?)["â€]?(?=\s+(?:for|to|on)\b|[?.!]|$)/i)?.[1]?.trim();
      const clientQuery = entityQueryFromText(message);
      return tool && label ? { tool, args: { label, ...(clientQuery ? { clientQuery } : {}) } } : null;
    }
    if (/\b(?:list|show|open|read)\b.*\bfolders?\b/i.test(lower)) {
      const tool = tools.find((candidate) => candidate.name === "listClientFolders");
      const clientQuery = entityQueryFromText(message);
      return tool ? { tool, args: clientQuery ? { clientQuery } : {} } : null;
    }
    if (/\b(?:upload|attach|add)\b.*\b(?:document|doc|file|permit|plan|certificate|receipt|statement|pdf|txt|docx?|xlsx?|csv)\b/i.test(lower)) {
      const tool = tools.find((candidate) => candidate.name === "uploadDocumentToFolder");
      const clientQuery = entityQueryFromText(message);
      const fileName = message.match(/\b([a-z0-9][\w.-]+\.(?:pdf|txt|docx?|xlsx?|csv|png|jpe?g|mp4))\b/i)?.[1]
        ?? (/\bpermit\b/i.test(lower) ? "pool-permit.txt" : undefined);
      const folderLabel = message.match(/\binto\s+(?:the\s+)?["â€œ]?([^"â€\n]+?)["â€]?\s+folder\b/i)?.[1]?.trim()
        ?? message.match(/\bfolder\s+(?:called|named)?\s*["â€œ]?([^"â€\n]+?)["â€]?(?=\s+(?:for|to|with|and)\b|[?.!]|$)/i)?.[1]?.trim();
      const textContent = message.match(/\b(?:text|content|contents|saying|body)\s*(?:is|=|:)?\s*["â€œ]?([\s\S]+?)["â€]?(?=$)/i)?.[1]?.trim();
      const label = message.match(/\blabel\s*(?:is|=|:)?\s*["â€œ]?([^"â€\n]+?)["â€]?(?=\s+(?:for|to|with|and)\b|[?.!]|$)/i)?.[1]?.trim();
      const cleanedLabel = label?.replace(/\s+(?:text|content|contents|saying|body)\b[\s\S]*$/i, "").trim() || label;
      return tool && fileName
        ? {
            tool,
            args: {
              fileName,
              ...(cleanedLabel ? { label: cleanedLabel } : {}),
              ...(folderLabel ? { folderLabel } : {}),
              ...(clientQuery ? { clientQuery } : {}),
              ...(textContent ? { textContent } : { textContent: `Uploaded from chat: ${message}` })
            }
          }
        : null;
    }
    if (/\b(?:find|search|look\s+up|show|open|pull)\b.*\b(?:document|doc|file|permit|plan|certificate|receipt|statement|pdf)\b/i.test(lower) || /\bfind\s+the\s+pool\s+permit\b/i.test(lower)) {
      const tool = tools.find((candidate) => candidate.name === "searchDocuments");
      const clientQuery = entityQueryFromText(message);
      const query = message
        .replace(/\b(?:find|search|look\s+up|show|open|pull)\b/gi, " ")
        .replace(/\b(?:the|a|an|for|from|in|document|documents|doc|docs|file|files)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      return tool && query ? { tool, args: { query, ...(clientQuery ? { clientQuery } : {}) } } : null;
    }
  }
  if (/\b(?:photos?|pictures?|images?|media)\b/i.test(lower)) {
    const query = message
      .replace(/\b(?:show|find|search|look\s+up|pull|open)\b/gi, " ")
      .replace(/\b(?:me|the|a|an|for|from|of|at|on)\b/gi, " ")
      .replace(/\b(?:photos?|pictures?|images?|media)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const photoSearchTool = tools.find((candidate) => candidate.name === "photoSearch");
    if (photoSearchTool && query) {
      return { tool: photoSearchTool, args: { query, limit: 8 } };
    }
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
    return tool ? { tool, args: { locationId: "primary" } } : null;
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
          : "site";
    return tool ? { tool, args: { preset, plainRequest: message } } : null;
  }
  if (/\b(?:needs? my attention|what needs attention|what needs my attention|home queues|home dashboard)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getHomeQueues");
    if (tool) {
      return { tool, args: {} };
    }
  }
  if (/\b(?:what happened|recent activity|activity feed|latest activity|did .+ approve|did .+ pay)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getActivityFeed");
    const objectType = /\brequest\b/i.test(lower)
      ? "requests"
      : /\bquote\b/i.test(lower)
        ? "quotes"
        : /\bpayment\b|\brefund\b/i.test(lower)
          ? "payments"
          : /\binvoice\b/i.test(lower)
            ? "invoices"
            : /\bjob\b|\bvisit\b/i.test(lower)
              ? "jobs"
              : undefined;
    return tool ? { tool, args: { ...(objectType ? { objectType } : {}), limit: 10 } } : null;
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
    const day = lower.includes("today") ? today.toISOString().slice(0, 10) : calendarDayFromText(message);
    const teamMemberQuery = message.match(/\bwhat(?:'| i)?s\s+([a-z][a-z' -]+?)'s\s+day\b/i)?.[1]?.trim()
      ?? message.match(/\bfor\s+([a-z][a-z' -]+?)\s+(?:today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/i)?.[1]?.trim();
    return tool ? { tool, args: day ? { day, ...(teamMemberQuery ? { teamMemberQuery } : {}) } : { from, to } } : null;
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
    /\b(?:how\s+far(?:\s+is)?|distance\s+(?:to|for)|drive\s+time\s+(?:to|for)|travel\s+time\s+(?:to|for)|miles?\s+(?:to|from))\s+(.+?)(?=\s+from\s+(?:my\s+house|the\s+shop|here)|[?.!]|$)/i
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

function countFromText(text: string): number | undefined {
  const explicit = text.match(/\b(\d+)\s+visits?\b/i)?.[1];
  if (explicit) {
    return Number(explicit);
  }
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+visits?\b/i)?.[1]?.toLowerCase();
  return word ? words[word] : undefined;
}

function nextWeekdayDate(weekdayName: string): string | undefined {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = weekdays.indexOf(weekdayName.toLowerCase());
  if (target < 0) {
    return undefined;
  }
  const current = new Date("2026-07-16T12:00:00.000-04:00");
  const result = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
  const today = current.getUTCDay();
  let delta = target - today;
  if (delta <= 0) {
    delta += 7;
  }
  result.setUTCDate(result.getUTCDate() + delta);
  return result.toISOString().slice(0, 10);
}

function scheduleStartDateFromText(text: string): string | undefined {
  const explicit = text.match(/\b(?:starting|on)\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicit) {
    return explicit;
  }
  const weekday = text.match(/\bstarting\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
  return weekday ? nextWeekdayDate(weekday) : undefined;
}

function calendarDayFromText(text: string): string | undefined {
  const explicit = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicit) {
    return explicit;
  }
  const weekday = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
  return weekday ? nextWeekdayDate(weekday) : undefined;
}

function scheduleStartTimeFromText(text: string): { hour: number; minute: number } {
  const match = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) {
    return { hour: 9, minute: 0 };
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = (match[3] ?? "").toLowerCase();
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

function durationHoursFromText(text: string): number {
  const hours = Number(text.match(/\bfor\s+(\d+(?:\.\d+)?)\s+hours?\b/i)?.[1] ?? "2");
  return Number.isFinite(hours) && hours > 0 ? hours : 2;
}

function intervalDaysFromText(text: string): number {
  const explicit = Number(text.match(/\bevery\s+(\d+)\s+days?\b/i)?.[1] ?? "");
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  if (/\b(?:weekly|one per week|every week)\b/i.test(text)) {
    return 7;
  }
  return 1;
}

function isoWithLocalParts(date: string, hour: number, minute: number): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
}

function buildVisitSeriesArgsFromText(message: string): { query: string; visits: Array<{ start: string; end: string; assignedTeamQuery?: string }> } | null {
  if (!/\b(?:schedule|book|add)\b/i.test(message) || !/\bvisit\b/i.test(message)) {
    return null;
  }
  const count = countFromText(message) ?? 1;
  const startDate = scheduleStartDateFromText(message);
  if (!startDate) {
    return null;
  }
  const { hour, minute } = scheduleStartTimeFromText(message);
  const durationHours = durationHoursFromText(message);
  const intervalDays = intervalDaysFromText(message);
  const assignedTeamQuery = message.match(/\b(?:with|assign(?:ed)? to)\s+([a-z][a-z' -]+?)(?=\s+(?:starting|on|at|for|every)\b|[?.!]|$)/i)?.[1]?.trim();
  const query = entityQueryFromText(message) || message;
  const visits = Array.from({ length: count }, (_, index) => {
    const currentDate = new Date(`${startDate}T00:00:00.000Z`);
    currentDate.setUTCDate(currentDate.getUTCDate() + (intervalDays * index));
    const visitDate = currentDate.toISOString().slice(0, 10);
    const start = isoWithLocalParts(visitDate, hour, minute);
    const end = new Date(new Date(start).getTime() + (durationHours * 60 * 60 * 1000)).toISOString();
    return {
      start,
      end,
      ...(assignedTeamQuery ? { assignedTeamQuery } : {})
    };
  });
  return { query, visits };
}

function buildVisitShiftArgsFromText(message: string): { query: string; shiftDays?: number; shiftHours?: number; shiftRemaining: boolean } | null {
  if (!/\b(?:push|move|shift|reschedule)\b/i.test(message) || !/\bvisit\b/i.test(message)) {
    return null;
  }
  const query = entityQueryFromText(message) || message;
  const backDays = Number(message.match(/\b(?:back|later|forward)\s+(\d+)\s+days?\b/i)?.[1] ?? "");
  const earlierDays = Number(message.match(/\b(?:earlier|sooner)\s+(\d+)\s+days?\b/i)?.[1] ?? "");
  const backHours = Number(message.match(/\b(?:back|later|forward)\s+(\d+)\s+hours?\b/i)?.[1] ?? "");
  const earlierHours = Number(message.match(/\b(?:earlier|sooner)\s+(\d+)\s+hours?\b/i)?.[1] ?? "");
  const shiftDays = Number.isFinite(backDays) && backDays > 0
    ? backDays
    : Number.isFinite(earlierDays) && earlierDays > 0
      ? -earlierDays
      : undefined;
  const shiftHours = Number.isFinite(backHours) && backHours > 0
    ? backHours
    : Number.isFinite(earlierHours) && earlierHours > 0
      ? -earlierHours
      : undefined;
  if (shiftDays === undefined && shiftHours === undefined) {
    return null;
  }
  return {
    query,
    ...(shiftDays !== undefined ? { shiftDays } : {}),
    ...(shiftHours !== undefined ? { shiftHours } : {}),
    shiftRemaining: !/\b(?:just this one|only this visit|do not shift remaining|don't shift remaining)\b/i.test(message)
  };
}

function summarizeResult(toolName: string, result: unknown, actorDisplayName?: string): string {
  if (toolName === "createRequest" && result && typeof result === "object") {
    const record = result as { request?: { clientName?: unknown; id?: unknown; subject?: unknown }; needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return `I created the request${record.request?.clientName ? ` for ${String(record.request.clientName)}` : ""}${record.request?.id ? ` as ${String(record.request.id)}` : ""}.`;
  }
  if (toolName === "createClient" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Client draft ready for approval.";
  }
  if (toolName === "updateClient" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Client address change ready for approval.";
  }
  if (toolName === "createQuote" && result && typeof result === "object") {
    const record = result as { approval?: { id?: unknown; preview?: { title?: unknown } }; needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Quote draft ready for approval.";
  }
  if (toolName === "createJob" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Job draft ready for approval.";
  }
  if (toolName === "generateJobContent" && result && typeof result === "object") {
    const record = result as { draftCount?: unknown; drafts?: unknown[] };
    const count = typeof record.draftCount === "number"
      ? record.draftCount
      : Array.isArray(record.drafts)
        ? record.drafts.length
        : 0;
    return `I drafted ${count} marketing item${count === 1 ? "" : "s"} for owner approval. Nothing is public yet.`;
  }
  if (toolName === "listPendingDrafts" && result && typeof result === "object") {
    const drafts = Array.isArray((result as { drafts?: unknown[] }).drafts) ? (result as { drafts: unknown[] }).drafts : [];
    return `I found ${drafts.length} NexReach draft${drafts.length === 1 ? "" : "s"} waiting for approval.`;
  }
  if (toolName === "approveDraft" && result && typeof result === "object") {
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Marketing draft ready for approval.";
  }
  if (toolName === "discardDraft" && result && typeof result === "object") {
    const draft = (result as { draft?: { title?: unknown } }).draft;
    return `I discarded ${String(draft?.title ?? "that marketing draft")}. Nothing will be used from it.`;
  }
  if (toolName === "listConsentedClients" && result && typeof result === "object") {
    const audience = Array.isArray((result as { audience?: unknown[] }).audience) ? (result as { audience: unknown[] }).audience : [];
    return `I found ${audience.length} consented client${audience.length === 1 ? "" : "s"} in the NexReach audience pool.`;
  }
  if ((toolName === "scheduleJobVisits" || toolName === "scheduleUnscheduledJob") && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Visit schedule ready for approval.";
  }
  if (toolName === "shiftJobVisitSeries" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Visit move ready for approval.";
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
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Job action ready for approval.";
  }
  if (toolName === "queueLedgerAction" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Billing action ready for approval.";
  }
  if (toolName === "approvePendingApproval" && result && typeof result === "object") {
    const execution = (result as {
      execution?: {
        client?: { name?: unknown } | undefined;
        changeSummary?: unknown;
        job?: { title?: unknown } | undefined;
        visit?: { id?: unknown } | undefined;
        visits?: Array<{ id?: unknown }> | undefined;
        shiftedVisits?: Array<{ id?: unknown }> | undefined;
        folder?: { label?: unknown } | undefined;
        document?: { label?: unknown } | undefined;
        invoice?: { number?: unknown; id?: unknown; status?: unknown; ledger?: { balanceDue?: unknown } } | undefined;
        payment?: { id?: unknown; status?: unknown; amount?: unknown } | undefined;
        refund?: { id?: unknown } | undefined;
        receiptReview?: { id?: unknown; status?: unknown } | undefined;
        jobs?: Array<{ number?: unknown; id?: unknown }> | undefined;
      }
    }).execution;
    if (execution?.client && typeof execution.client.name === "string" && typeof execution.changeSummary === "string") {
      return `Approved and updated ${execution.client.name}. ${execution.changeSummary}`;
    }
    if (execution?.job && typeof execution.job.title === "string") {
      return `Approved and executed ${execution.job.title}.`;
    }
    if (execution?.folder && typeof execution.folder.label === "string") {
      return `Approved and created the ${String(execution.folder.label)} folder.`;
    }
    if (execution?.document && typeof execution.document.label === "string") {
      return `Approved and uploaded ${String(execution.document.label)} into NexDocs.`;
    }
    if (execution && typeof execution === "object" && "draft" in execution) {
      const draft = (execution as { draft?: { title?: unknown; status?: unknown } }).draft;
      return `Approved and marked ${String(draft?.title ?? "that marketing draft")} ${String(draft?.status ?? "ready for use")}.`;
    }
    if (Array.isArray(execution?.visits)) {
      return `Approved and booked ${execution.visits.length} visit${execution.visits.length === 1 ? "" : "s"}.`;
    }
    if (execution?.visit && Array.isArray(execution.shiftedVisits)) {
      return `Approved and moved the anchor visit${execution.shiftedVisits.length ? `, shifting ${execution.shiftedVisits.length} remaining visit${execution.shiftedVisits.length === 1 ? "" : "s"}` : ""}.`;
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
    const approval = (result as { approval?: { preview?: { title?: unknown } } }).approval;
    const title = normalizedApprovalTitle(typeof approval?.preview?.title === "string" ? approval.preview.title : undefined);
    return title
      ? `Rejected ${title}. Nothing was created.`
      : "Rejected the pending item. Nothing was created.";
  }
  if ((toolName === "revisePendingClientCreateApproval" || toolName === "revisePendingQuoteCreateApproval" || toolName === "revisePendingJobCreateApproval" || toolName === "revisePendingJobActionApproval") && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Updated draft ready for approval.";
  }
  if (toolName === "revisePendingDraftApproval" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Updated marketing draft ready for approval.";
  }
  if ((toolName === "revisePendingJobVisitSeriesApproval" || toolName === "revisePendingVisitShiftApproval") && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Updated schedule draft ready for approval.";
  }
  if (toolName === "revisePendingLedgerActionApproval" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
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
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Combined invoice draft ready for approval.";
  }
  if (toolName === "queueInvoiceSend" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Invoice delivery is ready for approval.";
  }
  if (toolName === "queueCollectPayment" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
      ?? "Payment collection is ready for approval.";
  }
  if (toolName === "queueReceiptReviewSend" && result && typeof result === "object") {
    const record = result as { needsClarification?: unknown };
    if (typeof record.needsClarification === "string" && record.needsClarification.trim()) {
      return record.needsClarification;
    }
    return approvalPromptFromResult(result, actorDisplayName)
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
    return approvalPromptFromResult(result, actorDisplayName)
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
  if (toolName === "sendPortalLink" && result && typeof result === "object") {
    const record = result as { url?: unknown; delivery?: unknown; target?: unknown };
    return `I sent the NexPortal link${record.target ? ` to ${String(record.target)}` : ""}${record.delivery ? ` by ${String(record.delivery)}` : ""}${record.url ? `.\n${String(record.url)}` : "."}`;
  }
  if (toolName === "getClientPortalActivity" && result && typeof result === "object") {
    const activity = Array.isArray((result as { activity?: unknown[] }).activity) ? (result as { activity: Array<{ title?: unknown }> }).activity : [];
    const latest = activity[0];
    return `I found ${activity.length} client portal activit${activity.length === 1 ? "y" : "ies"}${latest?.title ? `. Latest: ${String(latest.title)}.` : "."}`;
  }
  if (toolName === "generateStatement" && result && typeof result === "object") {
    const statement = (result as { statement?: { clientName?: unknown; lines?: unknown[]; runningBalance?: unknown } }).statement;
    const lineCount = Array.isArray(statement?.lines) ? statement.lines.length : 0;
    return `${String(statement?.clientName ?? "That client")} statement is ready with ${lineCount} ledger line${lineCount === 1 ? "" : "s"} and a running balance of $${String(statement?.runningBalance ?? "0")}.`;
  }
  if (toolName === "sendStatement" && result && typeof result === "object") {
    const record = result as { target?: unknown; url?: unknown };
    return `I sent the client statement${record.target ? ` to ${String(record.target)}` : ""}${record.url ? `.\n${String(record.url)}` : "."}`;
  }
  if (toolName === "getReviewSequenceStatus" && result && typeof result === "object") {
    const status = result as { activeCount?: unknown; sequences?: Array<{ status?: unknown; stopReason?: unknown; nextSendAt?: unknown }> };
    const first = Array.isArray(status.sequences) ? status.sequences[0] : undefined;
    return `I found ${String(status.activeCount ?? 0)} active review follow-up sequence${status.activeCount === 1 ? "" : "s"}${first ? `. First sequence is ${String(first.status ?? "unknown")}${first.stopReason ? ` (${String(first.stopReason)})` : first.nextSendAt ? ` with the next send at ${String(first.nextSendAt)}` : ""}.` : "."}`;
  }
  if (toolName === "startReviewSequence" && result && typeof result === "object") {
    const record = result as { started?: unknown; note?: unknown; sequence?: { nextSendAt?: unknown } | null };
    if (record.started !== true) {
      return typeof record.note === "string" && record.note.trim() ? record.note : "I couldn't start that review follow-up yet.";
    }
    return `I started the review follow-up sequence${record.sequence?.nextSendAt ? `.\nNext send: ${String(record.sequence.nextSendAt)}` : "."}`;
  }
  if (toolName === "stopReviewSequence" && result && typeof result === "object") {
    const sequence = (result as { sequence?: { stopReason?: unknown; status?: unknown } }).sequence;
    return `I stopped the review follow-up sequence${sequence?.stopReason ? ` as ${String(sequence.stopReason)}` : ""}. Current status: ${String(sequence?.status ?? "unknown")}.`;
  }
  if (toolName === "markReviewed" && result && typeof result === "object") {
    const sequence = (result as { sequence?: { stopReason?: unknown; status?: unknown } }).sequence;
    return `I marked that review follow-up complete${sequence?.stopReason ? ` as ${String(sequence.stopReason)}` : ""}. Current status: ${String(sequence?.status ?? "unknown")}.`;
  }
  if (toolName === "getSchedule" && result && typeof result === "object") {
    const visits = Array.isArray((result as { visits?: unknown[] }).visits) ? (result as { visits: unknown[] }).visits : [];
    const unscheduledJobs = Array.isArray((result as { unscheduledJobs?: unknown[] }).unscheduledJobs) ? (result as { unscheduledJobs: unknown[] }).unscheduledJobs : [];
    return `I found ${visits.length} scheduled visit${visits.length === 1 ? "" : "s"}${unscheduledJobs.length ? ` and ${unscheduledJobs.length} unscheduled job${unscheduledJobs.length === 1 ? "" : "s"}` : ""} in that window.`;
  }
  if (toolName === "getHomeQueues" && result && typeof result === "object") {
    const queues = Array.isArray((result as { queues?: unknown[] }).queues) ? (result as { queues: unknown[] }).queues : [];
    return `Home is showing ${queues.length} live queue${queues.length === 1 ? "" : "s"} right now.`;
  }
  if ((toolName === "getActivityFeed" || toolName === "listRecentActivity") && result && typeof result === "object") {
    const activity = Array.isArray((result as { activity?: unknown[] }).activity) ? (result as { activity: unknown[] }).activity : [];
    return `I found ${activity.length} recent activity entr${activity.length === 1 ? "y" : "ies"}.`;
  }
  if (toolName === "completeVisit" && result && typeof result === "object") {
    const visit = (result as { visit?: { title?: unknown } }).visit;
    const job = (result as { job?: { title?: unknown; status?: unknown } }).job;
    return `I marked ${String(visit?.title ?? "that visit")} complete. ${String(job?.title ?? "The job")} is now ${String(job?.status ?? "updated")}.`;
  }
  if (toolName === "getPhotos" && result && typeof result === "object") {
    const media = Array.isArray((result as { media?: unknown[] }).media) ? (result as { media: unknown[] }).media : [];
    return `I found ${media.length} media item${media.length === 1 ? "" : "s"}; thumbnails must be served through /api/media/:id.`;
  }
  if (toolName === "photoSearch" && result && typeof result === "object") {
    const hits = Array.isArray((result as { hits?: unknown[] }).hits) ? (result as { hits: Array<{ media?: { aiCaption?: unknown; id?: unknown } }> }).hits : [];
    const first = hits[0]?.media;
    return `I found ${hits.length} NexCam photo hit${hits.length === 1 ? "" : "s"}${first ? `. First match: ${String(first.aiCaption ?? first.id ?? "photo")}.` : "."}`;
  }
  if (toolName === "searchDocuments" && result && typeof result === "object") {
    const hits = Array.isArray((result as { hits?: unknown[] }).hits) ? (result as { hits: Array<{ entry?: { label?: unknown; propertyLabel?: unknown } }> }).hits : [];
    const first = hits[0]?.entry;
    return `I found ${hits.length} document hit${hits.length === 1 ? "" : "s"}${first ? `. First match: ${String(first.label ?? "document")} on ${String(first.propertyLabel ?? "the client rail")}.` : "."}`;
  }
  if (toolName === "listClientFolders" && result && typeof result === "object") {
    const folders = Array.isArray((result as { folders?: unknown[] }).folders) ? (result as { folders: Array<{ label?: unknown; documentCount?: unknown }> }).folders : [];
    const unfiledCount = typeof (result as { unfiledCount?: unknown }).unfiledCount === "number" ? (result as { unfiledCount: number }).unfiledCount : 0;
    return `I found ${folders.length} NexDocs folder${folders.length === 1 ? "" : "s"}${folders[0]?.label ? `. First folder: ${String(folders[0].label)}.` : "."}${unfiledCount ? ` ${unfiledCount} file${unfiledCount === 1 ? "" : "s"} are still unfiled.` : ""}`;
  }
  if (toolName === "createFolder" && result && typeof result === "object") {
    return approvalPromptFromResult(result, actorDisplayName, { allowChanges: false })
      ?? "Folder draft ready for approval.";
  }
  if (toolName === "uploadDocumentToFolder" && result && typeof result === "object") {
    return approvalPromptFromResult(result, actorDisplayName, { allowChanges: false })
      ?? "Document upload draft ready for approval.";
  }
  if (toolName === "beforeAfterPairs" && result && typeof result === "object") {
    const pairs = Array.isArray((result as { pairs?: unknown[] }).pairs) ? (result as { pairs: unknown[] }).pairs : [];
    return `I found ${pairs.length} before/after pair${pairs.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "listRecentPhotos" && result && typeof result === "object") {
    const media = Array.isArray((result as { media?: unknown[] }).media) ? (result as { media: Array<{ aiCaption?: unknown; id?: unknown }> }).media : [];
    const first = media[0];
    return `I found ${media.length} recent NexCam photo${media.length === 1 ? "" : "s"}${first ? `. Latest: ${String(first.aiCaption ?? first.id ?? "photo")}.` : "."}`;
  }
  if (toolName === "listUnassignedPhotoBatches" && result && typeof result === "object") {
    const batches = Array.isArray((result as { batches?: unknown[] }).batches)
      ? (result as { batches: Array<{ id?: unknown; assignedClientId?: unknown; media?: unknown[]; latestGps?: { lat?: unknown; lng?: unknown } | null }> }).batches
      : [];
    const first = batches[0];
    const gps = first?.latestGps && typeof first.latestGps.lat === "number" && typeof first.latestGps.lng === "number"
      ? ` Latest GPS: ${first.latestGps.lat.toFixed(4)}, ${first.latestGps.lng.toFixed(4)}.`
      : "";
    return `I found ${batches.length} unassigned NexCam capture batch${batches.length === 1 ? "" : "es"}${first?.id ? `; first batch is ${String(first.id)}` : ""}.${gps}`;
  }
  if (toolName === "assignPhotoBatch" && result && typeof result === "object") {
    const batch = (result as { batch?: { id?: unknown; assignedClientId?: unknown; assignedRequestId?: unknown; media?: unknown[] } }).batch;
    const mediaCount = Array.isArray(batch?.media) ? batch.media.length : 0;
    if (batch?.assignedRequestId) {
      return `I attached capture batch ${String(batch.id ?? "unknown")} to request ${String(batch.assignedRequestId)} and its client context. ${mediaCount} photo${mediaCount === 1 ? "" : "s"} now ride that client rail.`;
    }
    return `I attached capture batch ${String(batch?.id ?? "unknown")} to client ${String(batch?.assignedClientId ?? "unknown")}. ${mediaCount} photo${mediaCount === 1 ? "" : "s"} now sit on that client rail.`;
  }
  if (toolName === "getPropertyHistory" && result && typeof result === "object") {
    const history = Array.isArray((result as { history?: unknown[] }).history) ? (result as { history: Array<{ id?: unknown; fields?: Array<{ numberValue?: unknown; note?: unknown; multiValue?: unknown[] }> }> }).history : [];
    const firstField = history[0]?.fields?.find((field) => field.numberValue !== undefined || field.note !== undefined || (Array.isArray(field.multiValue) && field.multiValue.length > 0));
    const value = firstField?.numberValue ?? firstField?.note ?? (Array.isArray(firstField?.multiValue) ? firstField?.multiValue?.join(", ") : undefined);
    return `I found ${history.length} completed checklist histor${history.length === 1 ? "y entry" : "y entries"}${value !== undefined ? `. Latest saved value: ${String(value)}.` : "."}`;
  }
  if (toolName === "getVisitReport" && result && typeof result === "object") {
    const report = (result as { report?: { title?: unknown; id?: unknown } | null }).report;
    return report ? `I found the NexCam report ${String(report.title ?? report.id ?? "report")}.` : "I don't have a NexCam visit report for that search yet.";
  }
  if (toolName === "generateVisitReport" && result && typeof result === "object") {
    const report = (result as { report?: { title?: unknown; id?: unknown } }).report;
    const pdfUrl = (result as { pdfUrl?: unknown }).pdfUrl;
    return `I generated the NexCam visit report${report?.title ? ` ${String(report.title)}` : report?.id ? ` ${String(report.id)}` : ""}${pdfUrl ? `.\n${String(pdfUrl)}` : "."}`;
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
    return `I ran the evaporation report. Estimated evaporation is ${String(calculation?.evapInchesPerDay ?? "unknown")} inches/day; leak loss after evaporation is ${String(calculation?.leakInchesPerDay ?? "unknown")} inches/day.`;
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

function approvalIdFromToolResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const approval = (result as { approval?: { id?: unknown } }).approval;
  return typeof approval?.id === "string" && approval.id.trim() ? approval.id.trim() : undefined;
}

function pendingApprovalFromToolRun(
  toolRun: NonNullable<ToolLoopResponse["toolRuns"]>[number],
  awaitingChanges = false
): PendingApprovalContext | null {
  const approvalId = approvalIdFromToolResult(toolRun.result);
  if (!approvalId) {
    return null;
  }
  return emptyPendingApprovalContext(approvalId, {
    awaitingChanges,
    ...pendingApprovalFlagsForToolName(toolRun.name)
  });
}

function approvalResolvedByToolRuns(toolRuns: NonNullable<ToolLoopResponse["toolRuns"]>): boolean {
  return toolRuns.some((run) => run.name === "approvePendingApproval" || run.name === "rejectPendingApproval");
}

export function pendingApprovalFromConversationRecords(
  records: ConversationRecord[],
  fallback: PendingApprovalContext | null = null
): PendingApprovalContext | null {
  const toolRuns = records.flatMap((record) => record.toolRuns ?? []);
  if (toolRuns.length === 0) {
    return fallback;
  }
  if (approvalResolvedByToolRuns(toolRuns)) {
    return null;
  }
  for (const toolRun of [...toolRuns].reverse()) {
    const pending = pendingApprovalFromToolRun(toolRun);
    if (pending) {
      return pending;
    }
  }
  return fallback;
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
      toolRuns: [],
      pendingApproval: request.pendingApproval ?? null
    };
  }
  const chosenArgs = chosen.tool.name === "createClient"
    ? await extractCreateClientInput({
        text: messageText(request.messages.at(-1)?.content),
        env: request.env,
        fetchFn: request.fetchFn
      })
    : chosen.args;
  const parsedArgs = chosen.tool.inputSchema.parse(chosenArgs);
  const toolResult = await chosen.tool.handler(request.tenant, parsedArgs);
  const toolRuns = [{ name: chosen.tool.name, result: toolResult.result, sources: toolResult.sources }];
  return {
    answer: summarizeResult(chosen.tool.name, toolResult.result, request.actorDisplayName),
    sources: toolResult.sources,
    usage,
    raw: { local: true },
    toolRuns,
    pendingApproval: pendingApprovalFromConversationRecords([{
      id: "local",
      tenantId: request.tenant.id,
      conversationId: "local",
      userText: messageText(request.messages.at(-1)?.content),
      assistantText: "",
      sources: toolResult.sources,
      toolRuns,
      createdAt: new Date().toISOString()
    }], request.pendingApproval ?? null)
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

const NEXI_USER_SAFE_FAILURE_MESSAGE = "I couldn't pull that up just now - the check failed on my end and I've logged it to fix. Give me a moment and try again.";

function sanitizeNexiAnswer(answer: string): { answer: string; sanitized: boolean } {
  return /tool names must be unique|duplicate nexi tool registration|unknown tool:|anthropic_api_key|typeerror:|referenceerror:|syntaxerror:|cannot read properties of/i.test(answer)
    ? { answer: NEXI_USER_SAFE_FAILURE_MESSAGE, sanitized: true }
    : { answer, sanitized: false };
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
    toolRuns: [],
    pendingApproval: null
  };
}

export async function answerNexiMessage(input: NexiMessageInput): Promise<NexiMessageResult> {
  if (isUserFlaggedIncorrect(input.message)) {
    return answerUserFlaggedIncorrect(input);
  }
  const conversationId = stableConversationId(input);
  const recent = await input.repository.loadRecentConversations(input.tenant.id, conversationId, 8);
  const pendingApproval = input.pendingApproval ?? pendingApprovalFromConversationRecords(recent, null);
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
      actorDisplayName: input.actorDisplayName,
      requestorEmail: input.requestorContext?.email,
      requestorPhones: input.requestorContext?.phones,
      requestorOrigin: requestorOrigin(input.requestorContext),
      pendingApproval,
      tools: input.tools,
      cachedToolRuns,
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      usageLog: input.usageLog,
      env: input.env
    });
    const sanitized = sanitizeNexiAnswer(result.answer);
    const saved = await input.repository.saveConversation({
      tenantId: input.tenant.id,
      conversationId,
      userText: input.message,
      assistantText: sanitized.answer,
      sources: result.sources,
      toolRuns: persistableToolRuns(result.toolRuns)
    });
    let failureId: string | undefined;
    if (result.failureReason || sanitized.sanitized) {
      const failureReason = sanitized.sanitized
        ? "nexi_user_safe_error_wrapped"
        : result.failureReason ?? "nexi_message_failed";
      const failure = await input.repository.saveFailure({
        tenantId: input.tenant.id,
        op: "message",
        question: input.message,
        reason: failureReason,
        sources: result.sources
      });
      failureId = failure.id;
    }
    return {
      answer: sanitized.answer,
      sources: result.sources,
      conversationId: saved.conversationId ?? saved.id,
      failureId,
      usage: result.usage,
      toolRuns: result.toolRuns,
      pendingApproval: result.pendingApproval ?? pendingApprovalFromConversationRecords([...recent, saved], pendingApproval)
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
