import {
  RailError,
  type Binary,
  type EmailAttachmentSummary,
  type EmailMessageDetail,
  type EmailMessageSummary,
  type EmailReadProvider,
  type EmailSearchQuery,
  type EmailSendProvider,
  type EmailThread,
  type OutboundEmail,
  type OutboundEmailAttachment,
  type SendReceipt
} from "@nexteam/core";
import { Readable } from "node:stream";
import { asArray, asRecord, railFetchJson, text } from "../railFetch.js";

export interface GmailMailboxConfig {
  mailbox: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenantId?: string | undefined;
}

interface GmailListResponse {
  messages: Array<{ id: string; threadId: string }>;
}

interface GmailMessagePayload {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: GmailMessagePart | undefined;
}

interface GmailMessagePart {
  partId?: string | undefined;
  mimeType?: string | undefined;
  filename?: string | undefined;
  headers?: Array<{ name: string; value: string }> | undefined;
  body?: {
    data?: string | undefined;
    attachmentId?: string | undefined;
    size?: number | undefined;
  } | undefined;
  parts?: GmailMessagePart[] | undefined;
}

interface GmailThreadPayload {
  id: string;
  messages: GmailMessagePayload[];
}

interface GmailAttachmentPayload {
  data: string;
  size?: number | undefined;
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

function parseToken(payload: unknown): { accessToken: string; expiresIn: number } {
  const record = asRecord(payload);
  const accessToken = text(record.access_token);
  const expiresIn = Number(record.expires_in ?? 3600);
  if (!accessToken) {
    throw new RailError("Gmail OAuth token refresh returned no access token.", { provider: "gmail", op: "oauth_token", status: 502 });
  }
  return { accessToken, expiresIn: Number.isFinite(expiresIn) ? expiresIn : 3600 };
}

function parseList(payload: unknown): GmailListResponse {
  return {
    messages: asArray(asRecord(payload).messages)
      .map((entry) => asRecord(entry))
      .map((entry) => ({ id: text(entry.id), threadId: text(entry.threadId) }))
      .filter((entry) => entry.id && entry.threadId)
  };
}

function parseMessage(payload: unknown): GmailMessagePayload {
  const record = asRecord(payload);
  return {
    id: text(record.id),
    threadId: text(record.threadId),
    labelIds: asArray(record.labelIds).map((label) => text(label)).filter(Boolean),
    snippet: text(record.snippet),
    payload: parseMessagePart(record.payload)
  };
}

function parseMessagePart(payload: unknown): GmailMessagePart {
  const record = asRecord(payload);
  const body = asRecord(record.body);
  return {
    partId: text(record.partId) || undefined,
    mimeType: text(record.mimeType) || undefined,
    filename: text(record.filename) || undefined,
    headers: asArray(record.headers).map((header) => {
      const headerRecord = asRecord(header);
      return { name: text(headerRecord.name), value: text(headerRecord.value) };
    }).filter((header) => header.name),
    body: {
      data: text(body.data) || undefined,
      attachmentId: text(body.attachmentId) || undefined,
      size: Number.isFinite(Number(body.size)) ? Number(body.size) : undefined
    },
    parts: asArray(record.parts).map(parseMessagePart)
  };
}

function parseThread(payload: unknown): GmailThreadPayload {
  const record = asRecord(payload);
  return {
    id: text(record.id),
    messages: asArray(record.messages).map(parseMessage).filter((message) => message.id)
  };
}

function header(message: GmailMessagePayload, name: string): string | undefined {
  const found = message.payload?.headers?.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  return found?.value || undefined;
}

function partHeader(part: GmailMessagePart, name: string): string | undefined {
  const found = part.headers?.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  return found?.value || undefined;
}

function allParts(part: GmailMessagePart | undefined): GmailMessagePart[] {
  if (!part) {
    return [];
  }
  return [part, ...(part.parts ?? []).flatMap(allParts)];
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return Buffer.from(value, "base64url").toString("utf8");
}

function buildGmailQuery(query: EmailSearchQuery): string {
  const parts: string[] = [];
  if (query.sender) {
    parts.push(`from:${query.sender}`);
  }
  if (query.subject) {
    parts.push(`subject:(${query.subject})`);
  }
  if (query.after) {
    parts.push(`after:${query.after.slice(0, 10).replace(/-/g, "/")}`);
  }
  if (query.before) {
    parts.push(`before:${query.before.slice(0, 10).replace(/-/g, "/")}`);
  }
  if (query.keywords) {
    parts.push(query.keywords);
  }
  return parts.join(" ").trim();
}

function messageSummary(config: GmailMailboxConfig, message: GmailMessagePayload): EmailMessageSummary {
  return {
    id: message.id,
    tenantId: config.tenantId ?? "aquatrace",
    mailbox: config.mailbox,
    threadId: message.threadId,
    from: header(message, "From"),
    to: header(message, "To"),
    subject: header(message, "Subject"),
    receivedAt: header(message, "Date"),
    snippet: message.snippet,
    labels: message.labelIds
  };
}

function attachmentSummaries(config: GmailMailboxConfig, message: GmailMessagePayload): EmailAttachmentSummary[] {
  return allParts(message.payload)
    .filter((part) => !!part.body?.attachmentId)
    .map((part) => {
      const contentDisposition = partHeader(part, "Content-Disposition")?.toLowerCase() ?? "";
      return {
        id: part.body?.attachmentId ?? "",
        tenantId: config.tenantId ?? "aquatrace",
        mailbox: config.mailbox,
        messageId: message.id,
        filename: part.filename || "attachment",
        mime: part.mimeType,
        byteSize: part.body?.size,
        inline: contentDisposition.includes("inline")
      };
    })
    .filter((attachment) => attachment.id);
}

function messageDetail(config: GmailMailboxConfig, message: GmailMessagePayload): EmailMessageDetail {
  const parts = allParts(message.payload);
  return {
    ...messageSummary(config, message),
    bodyText: parts.filter((part) => part.mimeType?.toLowerCase() === "text/plain").map((part) => decodeBase64Url(part.body?.data)).filter(Boolean).join("\n\n") || undefined,
    bodyHtml: parts.filter((part) => part.mimeType?.toLowerCase() === "text/html").map((part) => decodeBase64Url(part.body?.data)).filter(Boolean).join("\n\n") || undefined,
    attachments: attachmentSummaries(config, message)
  };
}

function parseAttachment(payload: unknown): GmailAttachmentPayload {
  const record = asRecord(payload);
  return {
    data: text(record.data),
    size: Number.isFinite(Number(record.size)) ? Number(record.size) : undefined
  };
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quotedParam(value: string): string {
  return sanitizeHeader(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function wrapBase64(value: string): string {
  const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return (padded.match(/.{1,76}/g) ?? []).join("\r\n");
}

function baseHeaders(message: OutboundEmail): string[] {
  return [
    `To: ${message.to.map(sanitizeHeader).join(", ")}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.map(sanitizeHeader).join(", ")}`] : []),
    ...(message.bcc?.length ? [`Bcc: ${message.bcc.map(sanitizeHeader).join(", ")}`] : []),
    `Subject: ${sanitizeHeader(message.subject)}`,
    "MIME-Version: 1.0"
  ];
}

function alternativePart(message: OutboundEmail, boundary: string): string[] {
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.bodyText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.bodyHtml ?? `<pre>${escapeHtml(message.bodyText)}</pre>`,
    `--${boundary}--`
  ];
}

function attachmentPart(attachment: OutboundEmailAttachment): string[] {
  const filename = quotedParam(attachment.filename);
  const mime = sanitizeHeader(attachment.mime || "application/octet-stream");
  return [
    `Content-Type: ${mime}; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(attachment.contentBase64)
  ];
}

function rawMime(message: OutboundEmail): string {
  const attachments = message.attachments ?? [];
  if (attachments.length > 0) {
    const mixedBoundary = `nexteam-mixed-${crypto.randomUUID()}`;
    const alternativeBoundary = `nexteam-alt-${crypto.randomUUID()}`;
    const lines = [
      ...baseHeaders(message),
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      "",
      `--${mixedBoundary}`,
      ...alternativePart(message, alternativeBoundary),
      ...attachments.flatMap((attachment) => [
        `--${mixedBoundary}`,
        ...attachmentPart(attachment)
      ]),
      `--${mixedBoundary}--`
    ];
    return lines.join("\r\n");
  }
  if (message.bodyHtml) {
    const boundary = `nexteam-alt-${crypto.randomUUID()}`;
    return [
      ...baseHeaders(message),
      ...alternativePart(message, boundary)
    ].join("\r\n");
  }
  return [
    ...baseHeaders(message),
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.bodyText
  ].join("\r\n");
}

function encodeMime(message: OutboundEmail): string {
  return Buffer.from(rawMime(message), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

abstract class GmailBaseAdapter {
  private token: TokenState | null = null;

  protected constructor(protected readonly config: GmailMailboxConfig) {}

  get mailbox(): string {
    return this.config.mailbox;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.accessToken;
    }
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: "refresh_token"
    });
    const token = await railFetchJson("https://oauth2.googleapis.com/token", {
      provider: "gmail",
      op: "oauth_token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }, parseToken);
    this.token = {
      accessToken: token.accessToken,
      expiresAt: Date.now() + token.expiresIn * 1000
    };
    return token.accessToken;
  }

  protected async gmailGet<T>(path: string, op: string, parse: (payload: unknown) => T): Promise<T> {
    const token = await this.accessToken();
    return railFetchJson(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      provider: "gmail",
      op,
      headers: { Authorization: `Bearer ${token}` },
      retry401: async () => {
        this.token = null;
        await this.accessToken();
      }
    }, parse);
  }

  protected async gmailPost<T>(path: string, op: string, payload: unknown, parse: (payload: unknown) => T): Promise<T> {
    const token = await this.accessToken();
    return railFetchJson(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      provider: "gmail",
      op,
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      retry401: async () => {
        this.token = null;
        await this.accessToken();
      }
    }, parse);
  }
}

export class GmailReadOnlyAdapter extends GmailBaseAdapter implements EmailReadProvider {
  constructor(config: GmailMailboxConfig) {
    super(config);
  }

  async searchEmail(query: EmailSearchQuery): Promise<EmailMessageSummary[]> {
    const params = new URLSearchParams({
      maxResults: String(Math.min(Math.max(query.maxResults ?? 10, 1), 25)),
      q: buildGmailQuery(query)
    });
    const listed = await this.gmailGet(`messages?${params.toString()}`, "messages_list", parseList);
    const messages = await Promise.all(listed.messages.map((message) => {
      const getParams = new URLSearchParams({ format: "metadata" });
      getParams.append("metadataHeaders", "From");
      getParams.append("metadataHeaders", "To");
      getParams.append("metadataHeaders", "Subject");
      getParams.append("metadataHeaders", "Date");
      return this.gmailGet(`messages/${encodeURIComponent(message.id)}?${getParams.toString()}`, "messages_get_metadata", parseMessage);
    }));
    return messages.map((message) => messageSummary(this.config, message));
  }

  async getEmailThread(threadId: string): Promise<EmailThread> {
    const params = new URLSearchParams({ format: "full" });
    const thread = await this.gmailGet(`threads/${encodeURIComponent(threadId)}?${params.toString()}`, "threads_get_metadata", parseThread);
    return {
      id: thread.id,
      tenantId: this.config.tenantId ?? "aquatrace",
      mailbox: this.config.mailbox,
      messages: thread.messages.map((message) => messageDetail(this.config, message))
    };
  }

  async getEmailMessage(messageId: string): Promise<EmailMessageDetail> {
    const params = new URLSearchParams({ format: "full" });
    const message = await this.gmailGet(`messages/${encodeURIComponent(messageId)}?${params.toString()}`, "messages_get_full", parseMessage);
    return messageDetail(this.config, message);
  }

  async getEmailAttachment(messageId: string, attachmentId: string): Promise<Binary> {
    const detail = await this.getEmailMessage(messageId);
    const attachment = detail.attachments.find((candidate) => candidate.id === attachmentId);
    const payload = await this.gmailGet(
      `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      "messages_attachments_get",
      parseAttachment
    );
    const buffer = Buffer.from(payload.data, "base64url");
    return {
      stream: Readable.from([buffer]),
      mime: attachment?.mime || "application/octet-stream",
      filename: attachment?.filename
    };
  }
}

export class GmailSendAdapter extends GmailBaseAdapter implements EmailSendProvider {
  constructor(config: GmailMailboxConfig) {
    super(config);
  }

  async sendEmail(message: OutboundEmail): Promise<SendReceipt> {
    const sent = await this.gmailPost("messages/send", "messages_send", { raw: encodeMime(message) }, (payload) => {
      const record = asRecord(payload);
      return { id: text(record.id), threadId: text(record.threadId) };
    });
    return {
      provider: "gmail",
      id: sent.id,
      mailbox: this.mailbox,
      threadId: sent.threadId,
      acceptedAt: new Date().toISOString()
    };
  }
}
