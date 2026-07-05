import {
  RailError,
  type EmailMessageSummary,
  type EmailReadProvider,
  type EmailSearchQuery,
  type EmailSendProvider,
  type EmailThread,
  type OutboundEmail,
  type SendReceipt
} from "@nexteam/core";
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
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  } | undefined;
}

interface GmailThreadPayload {
  id: string;
  messages: GmailMessagePayload[];
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
  const payloadRecord = asRecord(record.payload);
  return {
    id: text(record.id),
    threadId: text(record.threadId),
    labelIds: asArray(record.labelIds).map((label) => text(label)).filter(Boolean),
    snippet: text(record.snippet),
    payload: {
      headers: asArray(payloadRecord.headers).map((header) => {
        const headerRecord = asRecord(header);
        return { name: text(headerRecord.name), value: text(headerRecord.value) };
      }).filter((header) => header.name)
    }
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

function encodeMime(message: OutboundEmail): string {
  const headers = [
    `To: ${message.to.join(", ")}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.join(", ")}`] : []),
    ...(message.bcc?.length ? [`Bcc: ${message.bcc.join(", ")}`] : []),
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message.bodyText
  ];
  return Buffer.from(headers.join("\r\n"), "utf8")
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
    const params = new URLSearchParams({
      format: "metadata",
      metadataHeaders: "From"
    });
    params.append("metadataHeaders", "To");
    params.append("metadataHeaders", "Subject");
    params.append("metadataHeaders", "Date");
    const thread = await this.gmailGet(`threads/${encodeURIComponent(threadId)}?${params.toString()}`, "threads_get_metadata", parseThread);
    return {
      id: thread.id,
      tenantId: this.config.tenantId ?? "aquatrace",
      mailbox: this.config.mailbox,
      messages: thread.messages.map((message) => messageSummary(this.config, message))
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
