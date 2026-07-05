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

function readAdapters(input: CommsRail, mailbox?: string | undefined): EmailReadProvider[] {
  if (mailbox) {
    const adapter = input.readAdapters.get(mailbox);
    return adapter ? [adapter] : [];
  }
  return [...input.readAdapters.values()];
}

function inboxWindow(date = new Date().toISOString()): { after: string; before: string } {
  const day = date.slice(0, 10);
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
        const window = inboxWindow(input.date);
        const adapters = readAdapters(rail, input.mailbox);
        if (adapters.length === 0) {
          throw new RailError(`No read-only email mailbox is configured. Available mailboxes: ${mailboxList(rail).join(", ") || "none"}.`, { provider: "gmail", op: "summarizeInbox", status: 503 });
        }
        const grouped = await Promise.all(adapters.map(async (adapter) => ({
          mailbox: adapter.mailbox,
          messages: await adapter.searchEmail({
            after: window.after,
            before: window.before,
            keywords: input.keywords,
            maxResults: input.maxResults ?? 10
          })
        })));
        const messages = grouped.flatMap((group) => group.messages);
        return {
          result: { date: window.after.slice(0, 10), count: messages.length, mailboxes: grouped.map((group) => ({ mailbox: group.mailbox, count: group.messages.length })), messages },
          sources: messages.map(emailSource)
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
