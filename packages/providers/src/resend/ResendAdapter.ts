import { randomUUID } from "node:crypto";
import { RailError, type EmailSendProvider, type OutboundEmail, type SendReceipt } from "@nexteam/core";
import { asRecord, railFetchJson, text } from "../railFetch.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const MAX_ENCODED_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export interface ResendTransactionalConfig {
  tenantId: string;
  apiKey: string;
  from: string;
  mailbox: string;
}

type ResendEmailResponse = { id: string };

function requireText(value: string, message: string, op: string): string {
  const result = value.trim();
  if (!result) throw new RailError(message, { provider: "resend", op, status: 400 });
  return result;
}

function response(payload: unknown): ResendEmailResponse {
  const id = text(asRecord(payload).id);
  if (!id) throw new RailError("Transactional email provider did not return a message ID.", { provider: "resend", op: "sendEmail", status: 502, retryable: true });
  return { id };
}

function attachmentBytes(message: OutboundEmail): number {
  return (message.attachments ?? []).reduce((total, attachment) => total + Buffer.byteLength(attachment.contentBase64, "utf8"), 0);
}

/**
 * Transactional-only transport. It deliberately implements no mailbox read
 * methods; Gmail/Workspace read integrations remain separate providers.
 */
export class ResendTransactionalAdapter implements EmailSendProvider {
  readonly mailbox: string;

  constructor(private readonly config: ResendTransactionalConfig) {
    this.mailbox = requireText(config.mailbox, "Transactional sender mailbox is required.", "configure");
    requireText(config.tenantId, "Transactional sender tenantId is required.", "configure");
    requireText(config.apiKey, "Transactional email API key is required.", "configure");
    requireText(config.from, "Transactional sender identity is required.", "configure");
  }

  async sendEmail(message: OutboundEmail): Promise<SendReceipt> {
    if (message.tenantId !== this.config.tenantId) {
      throw new RailError("Transactional email tenant does not match the configured sender.", { provider: "resend", op: "sendEmail", status: 403 });
    }
    if (message.mailbox && message.mailbox !== this.mailbox) {
      throw new RailError("Transactional email targets a sender mailbox that is not configured.", { provider: "resend", op: "sendEmail", status: 403 });
    }
    if (!message.to.length || !message.to.some((recipient) => recipient.trim())) {
      throw new RailError("Transactional email requires at least one recipient.", { provider: "resend", op: "sendEmail", status: 400 });
    }
    const encodedAttachmentBytes = attachmentBytes(message);
    if (encodedAttachmentBytes > MAX_ENCODED_ATTACHMENT_BYTES) {
      throw new RailError("Transactional email attachments exceed the supported delivery limit.", { provider: "resend", op: "sendEmail", status: 413 });
    }
    const idempotencyKey = message.idempotencyKey?.trim() || `nexteam-${randomUUID()}`;
    const sent = await railFetchJson(RESEND_EMAILS_URL, {
      provider: "resend",
      op: "sendEmail",
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify({
        from: this.config.from,
        to: message.to,
        ...(message.cc?.length ? { cc: message.cc } : {}),
        ...(message.bcc?.length ? { bcc: message.bcc } : {}),
        subject: message.subject,
        text: message.bodyText,
        ...(message.bodyHtml ? { html: message.bodyHtml } : {}),
        ...(message.replyToMessageId ? { headers: { "In-Reply-To": message.replyToMessageId, References: message.replyToMessageId } } : {}),
        ...(message.attachments?.length ? {
          attachments: message.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.contentBase64
          }))
        } : {})
      }),
      timeoutMs: 15_000
    }, response);
    return {
      provider: "resend",
      id: sent.id,
      mailbox: this.mailbox,
      acceptedAt: new Date().toISOString()
    };
  }
}
