import { DryRunApprovalExecutor, RailError, type ApprovalExecutor, type ApprovalItem, type OutboundEmail, type OutboundEmailAttachment } from "@nexteam/core";
import type { CommsRail } from "./gmailRegistry.js";

function outboundAttachments(value: unknown): OutboundEmailAttachment[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new RailError("Approved email artifact has invalid attachment metadata.", { provider: "approval", op: "sendEmail", status: 400 });
  }
  return value.map((entry) => {
    const record = entry && typeof entry === "object" ? entry as Partial<OutboundEmailAttachment> : {};
    if (!record.filename || !record.mime || !record.contentBase64) {
      throw new RailError("Approved email attachment is missing filename, mime, or content.", { provider: "approval", op: "sendEmail", status: 400 });
    }
    return {
      filename: String(record.filename),
      mime: String(record.mime),
      contentBase64: String(record.contentBase64)
    };
  });
}

function outboundEmail(value: unknown): OutboundEmail {
  const record = value && typeof value === "object" ? value as Partial<OutboundEmail> : {};
  if (!Array.isArray(record.to) || !record.subject || !record.bodyText || !record.tenantId) {
    throw new RailError("Approved email artifact is missing required outbound email fields.", { provider: "approval", op: "sendEmail", status: 400 });
  }
  return {
    tenantId: String(record.tenantId),
    mailbox: record.mailbox ? String(record.mailbox) : undefined,
    to: record.to.map(String),
    cc: Array.isArray(record.cc) ? record.cc.map(String) : undefined,
    bcc: Array.isArray(record.bcc) ? record.bcc.map(String) : undefined,
    subject: String(record.subject),
    bodyText: String(record.bodyText),
    bodyHtml: record.bodyHtml ? String(record.bodyHtml) : undefined,
    attachments: outboundAttachments(record.attachments),
    replyToMessageId: record.replyToMessageId ? String(record.replyToMessageId) : undefined
  };
}

export class CommsApprovalExecutor implements ApprovalExecutor {
  private readonly fallback = new DryRunApprovalExecutor();

  constructor(private readonly rail: CommsRail) {}

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "comms" || item.execute.op !== "sendEmail") {
      return this.fallback.execute(item);
    }
    if (!this.rail.sendAdapter) {
      throw new RailError("The dedicated Nexi send mailbox is not configured.", { provider: "gmail", op: "sendEmail", status: 503 });
    }
    const args = item.execute.args && typeof item.execute.args === "object" ? item.execute.args as { mailbox?: unknown; outbound?: unknown } : {};
    const mailbox = args.mailbox ? String(args.mailbox) : "";
    if (mailbox !== this.rail.sendAdapter.mailbox) {
      throw new RailError("Approved email artifact targets a mailbox that is not the dedicated send mailbox.", { provider: "gmail", op: "sendEmail", status: 403 });
    }
    const outbound = outboundEmail(args.outbound);
    if (item.tenantId !== this.rail.tenantId || outbound.tenantId !== this.rail.tenantId) {
      throw new RailError("Approved email artifact targets a tenant that is not bound to this email rail.", { provider: "gmail", op: "sendEmail", status: 403 });
    }
    return this.rail.sendAdapter.sendEmail(outbound);
  }
}
