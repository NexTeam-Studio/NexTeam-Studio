import { z } from "zod";
import {
  RailError,
  type ApprovalQueueService,
  type EmailMessageSummary,
  type EmailReadProvider,
  type NexiTool,
  type OutboundEmailAttachment,
  type Source,
  type Tenant
} from "@nexteam/core";
import type { CommsRail } from "./gmailRegistry.js";

const searchEmailInputSchema = z.object({
  mailbox: z.string().optional(),
  sender: z.string().optional(),
  subject: z.string().optional(),
  keywords: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  maxResults: z.number().int().min(1).max(25).optional()
});

const getEmailThreadInputSchema = z.object({
  mailbox: z.string(),
  threadId: z.string()
});

const getEmailMessageInputSchema = z.object({
  mailbox: z.string(),
  messageId: z.string()
});

const getEmailAttachmentInputSchema = z.object({
  mailbox: z.string(),
  messageId: z.string(),
  attachmentId: z.string()
});

const summarizeInboxInputSchema = z.object({
  mailbox: z.string().optional(),
  date: z.string().optional(),
  keywords: z.string().optional(),
  maxResults: z.number().int().min(1).max(25).optional()
});

const triageInboxInputSchema = z.object({
  mailbox: z.string().optional(),
  date: z.string().optional(),
  keywords: z.string().optional(),
  maxResults: z.number().int().min(1).max(25).optional()
});

const draftEmailAttachmentSchema = z.object({
  filename: z.string().min(1).max(240),
  mime: z.string().min(1).max(160),
  contentBase64: z.string().min(1).max(20_000_000)
});

const draftEmailInputSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  attachments: z.array(draftEmailAttachmentSchema).max(10).optional()
});

const AQUATRACE_SIGNATURE = "Nexi\nAquatrace Swimming Pool Leak Detection";

function emailSource(message: EmailMessageSummary): Source {
  return {
    rail: "email",
    ref: `email:${message.mailbox}:${message.id}`,
    label: `Email ${message.mailbox} ${message.id}`
  };
}

function summarySource(kind: string, date: string): Source {
  return {
    rail: "native",
    ref: `email-${kind}:${date}`,
    label: `Email ${kind} ${date}`
  };
}

type TriageCategory = "client_inquiry" | "form_submission" | "service_notice" | "account_noise" | "other";

interface EmailDisplayItem {
  mailbox: string;
  messageId: string;
  threadId: string;
  receivedAt?: string | undefined;
  sender: string;
  subject: string;
  askSummary: string;
  sourceRef: string;
  category: TriageCategory;
}

interface TriageItem extends EmailDisplayItem {
  rank: number;
  priority: "high" | "normal" | "low";
  reason: string;
}

function readAdapters(input: CommsRail, mailbox?: string | undefined): EmailReadProvider[] {
  if (mailbox) {
    const adapter = input.readAdapters.get(mailbox);
    return adapter ? [adapter] : [];
  }
  return [...input.readAdapters.values()];
}

function validDateOrFallback(value: string | undefined, fallback = new Date()): Date {
  const raw = value?.trim();
  if (!raw) {
    return fallback;
  }
  const lower = raw.toLowerCase();
  if (lower === "today") {
    return fallback;
  }
  if (lower === "yesterday") {
    return new Date(fallback.getTime() - 24 * 60 * 60 * 1000);
  }
  if (lower === "tomorrow") {
    return new Date(fallback.getTime() + 24 * 60 * 60 * 1000);
  }
  const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dayOnly) {
    const parsed = new Date(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) ? parsed : fallback;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function inboxWindow(date = new Date().toISOString()): { after: string; before: string } {
  const parsed = validDateOrFallback(date);
  const day = parsed.toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { after: start.toISOString(), before: end.toISOString() };
}

function mailboxList(rail: CommsRail): string[] {
  return [...rail.readAdapters.keys()];
}

async function streamByteCount(stream: NodeJS.ReadableStream | ReadableStream<Uint8Array>): Promise<number> {
  let total = 0;
  if (Symbol.asyncIterator in Object(stream)) {
    for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
      total += Buffer.byteLength(chunk as string | Uint8Array);
    }
    return total;
  }
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        return total;
      }
      total += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

function assertCommsTenant(rail: CommsRail, tenant: Tenant, op: string): void {
  if (tenant.id !== rail.tenantId) {
    throw new RailError(`Email rail is not configured for tenant ${tenant.id}.`, { provider: "gmail", op, status: 403 });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanBodyParagraphs(bodyText: string): string[] {
  return bodyText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean);
}

function hasAquatraceSignature(bodyText: string): boolean {
  return /Aquatrace Swimming Pool Leak Detection/i.test(bodyText);
}

function brandedEmailBody(bodyText: string): { bodyText: string; bodyHtml: string } {
  const paragraphs = cleanBodyParagraphs(bodyText);
  const baseBody = paragraphs.join("\n\n");
  const text = hasAquatraceSignature(baseBody) ? baseBody : `${baseBody}\n\n${AQUATRACE_SIGNATURE}`;
  const htmlParagraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    bodyText: text,
    bodyHtml: `<div>${htmlParagraphs}</div>`
  };
}

function attachmentMediaRefs(attachments: OutboundEmailAttachment[] | undefined): string[] | undefined {
  if (!attachments?.length) {
    return undefined;
  }
  return attachments.map((attachment) => `attachment:${attachment.filename}`);
}

function messageText(message: EmailMessageSummary): string {
  return [
    message.from,
    message.to,
    message.subject,
    message.snippet,
    ...message.labels
  ].filter(Boolean).join(" ").toLowerCase();
}

function senderLabel(message: EmailMessageSummary): string {
  const from = message.from?.trim();
  if (!from) {
    return "Unknown sender";
  }
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  const emailMatch = from.match(/<([^>]+)>/)?.[1] ?? from.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
  return (nameMatch?.[1] ?? emailMatch ?? from).trim();
}

function subjectLabel(message: EmailMessageSummary): string {
  return cleanSubject(message.subject || "(no subject)") || "(no subject)";
}

function oneLineAsk(message: EmailMessageSummary, category: TriageCategory): string {
  const text = (message.snippet || message.subject || "").replace(/\s+/g, " ").trim();
  if (/confirm/i.test(text)) {
    return "asking to confirm details";
  }
  if (/\b(?:schedule|appointment|book|available|thursday|friday|monday|tuesday|wednesday|saturday|sunday)\b/i.test(text)) {
    return "asking about scheduling";
  }
  if (/\b(?:quote|estimate|price|cost)\b/i.test(text)) {
    return "asking for pricing or an estimate";
  }
  if (/\b(?:leak|water loss|losing water)\b/i.test(text)) {
    return "asking about a possible leak";
  }
  if (/\b(?:invoice|payment|paid|charge|billing)\b/i.test(text)) {
    return "asking about billing or payment";
  }
  if (category === "form_submission") {
    return "new form submission to review";
  }
  if (category === "service_notice") {
    return text ? text.slice(0, 140) : "service or audit notice to review";
  }
  if (category === "account_noise") {
    return "account sign-in or welcome notice; no client action";
  }
  return text ? text.slice(0, 140) : "no clear ask in metadata";
}

function displayItem(message: EmailMessageSummary, category: TriageCategory): EmailDisplayItem {
  return {
    mailbox: message.mailbox,
    messageId: message.id,
    threadId: message.threadId,
    receivedAt: message.receivedAt,
    sender: senderLabel(message),
    subject: subjectLabel(message),
    askSummary: oneLineAsk(message, category),
    sourceRef: `email:${message.mailbox}:${message.id}`,
    category
  };
}

function groupByPriority(items: TriageItem[]): Record<TriageItem["priority"], TriageItem[]> {
  return {
    high: items.filter((item) => item.priority === "high"),
    normal: items.filter((item) => item.priority === "normal"),
    low: items.filter((item) => item.priority === "low")
  };
}

function summaryItems(messages: EmailMessageSummary[]): EmailDisplayItem[] {
  return messages.map((message) => displayItem(message, triageCategory(message).category));
}

function isNoise(message: EmailMessageSummary): boolean {
  const text = messageText(message);
  return message.labels.some((label) => /^(?:SPAM|TRASH|CATEGORY_PROMOTIONS|CATEGORY_SOCIAL)$/i.test(label))
    || /\b(?:unsubscribe|newsletter|promo|promotion|sale|coupon|limited time|deal|webinar)\b/i.test(text)
    || /\b(?:sign-?in|sign in test|login test|verification code|security code|welcome to your new account|welcome to .* account|new account|account created)\b/i.test(text);
}

function triageCategory(message: EmailMessageSummary): { category: TriageCategory; rank: number; reason: string } {
  const text = messageText(message);
  if (/\b(?:sign-?in|sign in test|login test|verification code|security code|welcome to your new account|welcome to .* account|new account|account created)\b/i.test(text)) {
    return { category: "account_noise", rank: 95, reason: "Account sign-in, test, or welcome notice; not a client inquiry." };
  }
  if (/\b(?:new lead|contact form|form submission|website form|wpforms|gravity forms|quote request|estimate request)\b/i.test(text)) {
    return { category: "form_submission", rank: 20, reason: "Form submission or lead-intake language." };
  }
  if (/\b(?:leak|pool|spa|schedule|appointment|estimate|quote|repair|service|technician|call me|called|reply|responded|water loss|invoice question|question)\b/i.test(text)
    && !/\b(?:no-?reply|donotreply|do-not-reply)\b/i.test(text)) {
    return { category: "client_inquiry", rank: 10, reason: "Likely client inquiry or active service conversation." };
  }
  if (/\b(?:jobber|companycam|stripe|railway|firebase|google cloud|wordpress|domain|billing|subscription|receipt|security|alert|audit|failed|action required|verification)\b/i.test(text)) {
    return { category: "service_notice", rank: 30, reason: "Legitimate service, billing, security, or audit notice." };
  }
  return { category: "other", rank: 90, reason: "Not classified as urgent Aquatrace work." };
}

function triagePriority(rank: number): TriageItem["priority"] {
  if (rank <= 10) {
    return "high";
  }
  if (rank <= 30) {
    return "normal";
  }
  return "low";
}

function triageItems(messages: EmailMessageSummary[]): { items: TriageItem[]; excludedNoiseCount: number } {
  let excludedNoiseCount = 0;
  const items = messages.flatMap((message) => {
    if (isNoise(message)) {
      excludedNoiseCount += 1;
      return [];
    }
    const category = triageCategory(message);
    const rank = category.rank;
    const display = displayItem(message, category.category);
    return [{
      ...display,
      rank,
      reason: category.reason,
      priority: triagePriority(rank)
    }];
  });
  return {
    excludedNoiseCount,
    items: items.sort((a, b) => a.rank - b.rank || (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))
  };
}

export function createCommsNexiTools(rail: CommsRail, approvalQueue: ApprovalQueueService): NexiTool[] {
  return [
    {
      name: "searchEmail",
      description: "Search read-only Aquatrace Gmail mailboxes by sender, subject, date, and keywords. Sources are email:<mailbox>:<messageId>.",
      inputSchema: searchEmailInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "searchEmail");
        const input = searchEmailInputSchema.parse(args);
        const adapters = readAdapters(rail, input.mailbox);
        if (adapters.length === 0) {
          throw new RailError(`No read-only email mailbox is configured for ${input.mailbox ?? "any mailbox"}.`, { provider: "gmail", op: "searchEmail", status: 503 });
        }
        const grouped = await Promise.all(adapters.map(async (adapter) => ({
          mailbox: adapter.mailbox,
          messages: await adapter.searchEmail(input)
        })));
        const messages = grouped.flatMap((group) => group.messages);
        return {
          result: { count: messages.length, mailboxes: grouped.map((group) => ({ mailbox: group.mailbox, count: group.messages.length })), messages },
          sources: messages.map(emailSource)
        };
      }
    },
    {
      name: "getEmailThread",
      description: "Read an email thread, including full message bodies and attachment listings. Bodies must not be written to logs or receipts. Sources are email:<mailbox>:<messageId>.",
      inputSchema: getEmailThreadInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "getEmailThread");
        const input = getEmailThreadInputSchema.parse(args);
        const adapter = rail.readAdapters.get(input.mailbox);
        if (!adapter) {
          throw new RailError(`Read-only email mailbox ${input.mailbox} is not configured.`, { provider: "gmail", op: "getEmailThread", status: 503 });
        }
        const thread = await adapter.getEmailThread(input.threadId);
        return {
          result: { thread },
          sources: thread.messages.map(emailSource)
        };
      }
    },
    {
      name: "getEmailMessage",
      description: "Read one full Gmail message body plus attachment listing from a configured mailbox. Bodies must not be written to logs or receipts. Sources are email:<mailbox>:<messageId>.",
      inputSchema: getEmailMessageInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "getEmailMessage");
        const input = getEmailMessageInputSchema.parse(args);
        const adapter = rail.readAdapters.get(input.mailbox);
        if (!adapter) {
          throw new RailError(`Read-only email mailbox ${input.mailbox} is not configured.`, { provider: "gmail", op: "getEmailMessage", status: 503 });
        }
        const message = await adapter.getEmailMessage(input.messageId);
        return {
          result: { message },
          sources: [emailSource(message)]
        };
      }
    },
    {
      name: "getEmailAttachment",
      description: "Retrieve an email attachment binary from Gmail and return only safe metadata plus byte count. Attachment bytes are not returned to Nexi text logs. Source is email:<mailbox>:<messageId>:<attachmentId>.",
      inputSchema: getEmailAttachmentInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "getEmailAttachment");
        const input = getEmailAttachmentInputSchema.parse(args);
        const adapter = rail.readAdapters.get(input.mailbox);
        if (!adapter) {
          throw new RailError(`Read-only email mailbox ${input.mailbox} is not configured.`, { provider: "gmail", op: "getEmailAttachment", status: 503 });
        }
        const attachment = await adapter.getEmailAttachment(input.messageId, input.attachmentId);
        const byteSize = await streamByteCount(attachment.stream);
        return {
          result: {
            attachment: {
              mailbox: input.mailbox,
              messageId: input.messageId,
              attachmentId: input.attachmentId,
              filename: attachment.filename,
              mime: attachment.mime,
              byteSize,
              content: "[binary-not-returned]"
            }
          },
          sources: [{ rail: "email", ref: `email:${input.mailbox}:${input.messageId}:${input.attachmentId}`, label: `Email attachment ${input.mailbox} ${input.attachmentId}` }]
        };
      }
    },
    {
      name: "summarizeInbox",
      description: "Summarize emails received on a date across read-only Aquatrace Gmail mailboxes. Sources are email:<mailbox>:<messageId>.",
      inputSchema: summarizeInboxInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "summarizeInbox");
        const input = summarizeInboxInputSchema.parse(args);
        const dateWindow = inboxWindow(input.date);
        const adapters = readAdapters(rail, input.mailbox);
        if (adapters.length === 0) {
          throw new RailError(`No read-only email mailbox is configured. Available mailboxes: ${mailboxList(rail).join(", ") || "none"}.`, { provider: "gmail", op: "summarizeInbox", status: 503 });
        }
        const grouped = await Promise.all(adapters.map(async (adapter) => ({
          mailbox: adapter.mailbox,
          messages: await adapter.searchEmail({
            after: dateWindow.after,
            before: dateWindow.before,
            keywords: input.keywords,
            maxResults: input.maxResults ?? 10
          })
        })));
        const messages = grouped.flatMap((group) => group.messages);
        const items = summaryItems(messages);
        return {
          result: {
            date: dateWindow.after.slice(0, 10),
            count: messages.length,
            mailboxes: grouped.map((group) => ({ mailbox: group.mailbox, count: group.messages.length })),
            formatRule: "Lead with sender, subject, and one-line ask. Use minimal IDs and cite sources only as email:<mailbox>:<messageId>.",
            items,
            messages
          },
          sources: messages.length > 0 ? messages.map(emailSource) : [summarySource("summary", dateWindow.after.slice(0, 10))]
        };
      }
    },
    {
      name: "triageInbox",
      description: "Rank what needs attention in Aquatrace email. Excludes spam/promos and prioritizes client inquiries, form submissions, and legitimate service/audit notices. Sources are email:<mailbox>:<messageId>.",
      inputSchema: triageInboxInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "triageInbox");
        const input = triageInboxInputSchema.parse(args);
        const dateWindow = inboxWindow(input.date);
        const adapters = readAdapters(rail, input.mailbox);
        if (adapters.length === 0) {
          throw new RailError(`No read-only email mailbox is configured. Available mailboxes: ${mailboxList(rail).join(", ") || "none"}.`, { provider: "gmail", op: "triageInbox", status: 503 });
        }
        const grouped = await Promise.all(adapters.map(async (adapter) => ({
          mailbox: adapter.mailbox,
          messages: await adapter.searchEmail({
            after: dateWindow.after,
            before: dateWindow.before,
            keywords: input.keywords ?? "-in:spam -in:trash -category:promotions -category:social",
            maxResults: input.maxResults ?? 25
          })
        })));
        const messages = grouped.flatMap((group) => group.messages);
        const triage = triageItems(messages);
        const sourceMessages = triage.items.map((item) => messages.find((message) => message.id === item.messageId && message.mailbox === item.mailbox)).filter((message): message is EmailMessageSummary => !!message);
        return {
          result: {
            date: dateWindow.after.slice(0, 10),
            scannedCount: messages.length,
            excludedNoiseCount: triage.excludedNoiseCount,
            mailboxes: grouped.map((group) => ({ mailbox: group.mailbox, count: group.messages.length })),
            formatRule: "Group by priority. Each item must be sender — subject — one-line ask. Use minimal IDs.",
            groupedByPriority: groupByPriority(triage.items),
            items: triage.items
          },
          sources: sourceMessages.length > 0 ? sourceMessages.map(emailSource) : [summarySource("triage", dateWindow.after.slice(0, 10))]
        };
      }
    },
    {
      name: "draftEmail",
      description: "Draft an outbound email from the dedicated Nexi mailbox by creating an ApprovalQueue item. This never sends directly.",
      inputSchema: draftEmailInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        assertCommsTenant(rail, tenant, "draftEmail");
        const input = draftEmailInputSchema.parse(args);
        if (!rail.sendAdapter) {
          throw new RailError("The dedicated Nexi send mailbox is not configured.", { provider: "gmail", op: "draftEmail", status: 503 });
        }
        const subject = cleanSubject(input.subject);
        const body = brandedEmailBody(input.bodyText);
        const attachments = input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          mime: attachment.mime,
          contentBase64: attachment.contentBase64
        }));
        const approval = await approvalQueue.create({
          tenantId: tenant.id,
          kind: "email",
          preview: {
            title: subject,
            body: body.bodyText,
            mediaRefs: attachmentMediaRefs(attachments)
          },
          execute: {
            service: "comms",
            op: "sendEmail",
            args: {
              mailbox: rail.sendAdapter.mailbox,
              outbound: {
                tenantId: tenant.id,
                mailbox: rail.sendAdapter.mailbox,
                to: input.to,
                ...(input.cc ? { cc: input.cc } : {}),
                ...(input.bcc ? { bcc: input.bcc } : {}),
                subject,
                bodyText: body.bodyText,
                bodyHtml: body.bodyHtml,
                ...(attachments?.length ? { attachments } : {})
              }
            }
          },
          createdBy: "nexi"
        });
        return {
          result: { approval },
          sources: [{ rail: "native", ref: approval.id, label: `ApprovalQueue email draft ${approval.id}` }]
        };
      }
    }
  ];
}
