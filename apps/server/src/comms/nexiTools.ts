import { z } from "zod";
import {
  RailError,
  type ApprovalQueueService,
  type EmailMessageSummary,
  type EmailReadProvider,
  type NexiTool,
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

const summarizeInboxInputSchema = z.object({
  mailbox: z.string().optional(),
  date: z.string().optional(),
  keywords: z.string().optional(),
  maxResults: z.number().int().min(1).max(25).optional()
});

const draftEmailInputSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyText: z.string().min(1)
});

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

export function createCommsNexiTools(rail: CommsRail, approvalQueue: ApprovalQueueService): NexiTool[] {
  return [
    {
      name: "searchEmail",
      description: "Search read-only Aquatrace Gmail mailboxes by sender, subject, date, and keywords. Sources are email:<mailbox>:<messageId>.",
      inputSchema: searchEmailInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
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
      description: "Read email thread metadata from a read-only Aquatrace Gmail mailbox. Sources are email:<mailbox>:<messageId>.",
      inputSchema: getEmailThreadInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
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
      name: "summarizeInbox",
      description: "Summarize emails received on a date across read-only Aquatrace Gmail mailboxes. Sources are email:<mailbox>:<messageId>.",
      inputSchema: summarizeInboxInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
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
        const input = draftEmailInputSchema.parse(args);
        if (!rail.sendAdapter) {
          throw new RailError("The dedicated Nexi send mailbox is not configured.", { provider: "gmail", op: "draftEmail", status: 503 });
        }
        const approval = await approvalQueue.create({
          tenantId: tenant.id,
          kind: "email",
          preview: {
            title: input.subject,
            body: input.bodyText
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
                subject: input.subject,
                bodyText: input.bodyText
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
