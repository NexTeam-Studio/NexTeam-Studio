import type { EmailReadProvider, EmailSendProvider, OutboundSms, SendReceipt } from "@nexteam/core";
import { GmailReadOnlyAdapter, GmailSendAdapter, type GmailMailboxConfig } from "@nexteam/providers";
import { configuredTenantId } from "../core/tenantConfig.js";

export interface CommsRail {
  tenantId: string;
  readAdapters: Map<string, EmailReadProvider>;
  sendAdapter: EmailSendProvider | null;
  sendSms?: ((message: OutboundSms) => Promise<SendReceipt>) | undefined;
  operatorEmail?: string | undefined;
}

/**
 * Authoritative non-secret deployment identity for the separately gated owner
 * invitation rail. This is platform infrastructure, never tenant data.
 */
export const STAGING_OWNER_INVITATION_GMAIL_PROVIDER = Object.freeze({
  provider: "gmail",
  senderIdentity: "nexteamstudioai@gmail.com",
  environment: "staging",
  purpose: "owner invitation",
  requiredScope: "gmail.send",
  secretDestinationName: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN"
});

export type StagingOwnerInvitationGmailProviderStatus = {
  provider: "gmail";
  senderIdentity: string;
  environment: "staging";
  purpose: "owner invitation";
  requiredScope: "gmail.send";
  secretDestinationName: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN";
  oauthClientStatus: "PRESENT_UNIDENTIFIED" | "MISSING";
  quarantineState: "QUARANTINED" | "NOT_QUARANTINED";
  secretHealth: "PRESENT" | "MISSING";
  safeToReauthorize: false;
  reauthorizationReason: string;
};

/**
 * Returns only non-secret preflight state. OAuth client/project identity stays
 * unreported until an authoritative non-secret label or identifier is recorded.
 */
export function stagingOwnerInvitationGmailProviderStatus(env: NodeJS.ProcessEnv): StagingOwnerInvitationGmailProviderStatus {
  const clientIdPresent = Boolean(value(env, "GMAIL_OAUTH_CLIENT_ID") || value(env, "GMAIL_SEND_MAILBOX_CLIENT_ID") || value(env, "GOOGLE_CLIENT_ID"));
  return {
    ...STAGING_OWNER_INVITATION_GMAIL_PROVIDER,
    oauthClientStatus: clientIdPresent ? "PRESENT_UNIDENTIFIED" : "MISSING",
    quarantineState: value(env, "NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED").toLowerCase() === "true" ? "QUARANTINED" : "NOT_QUARANTINED",
    secretHealth: value(env, STAGING_OWNER_INVITATION_GMAIL_PROVIDER.secretDestinationName) ? "PRESENT" : "MISSING",
    safeToReauthorize: false,
    reauthorizationReason: "SAFE_TO_REAUTHORIZE=false: the OAuth client/project is not proven by an authoritative non-secret record."
  };
}

function envKey(value: string): string {
  return value.replace(/[^A-Z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function configFromEnv(env: NodeJS.ProcessEnv, prefix: string, fallbackAlias: string, tenantId: string): GmailMailboxConfig | null {
  const email = value(env, `${prefix}_EMAIL`) || (prefix === "GMAIL_NEXI" ? value(env, "GMAIL_SEND_FROM") : "");
  const alias = value(env, `${prefix}_ALIAS`) || (email ? envKey(email) : fallbackAlias);
  const clientId = value(env, `${prefix}_CLIENT_ID`) || value(env, "GMAIL_OAUTH_CLIENT_ID") || value(env, "GOOGLE_CLIENT_ID");
  const clientSecret = value(env, `${prefix}_CLIENT_SECRET`) || value(env, "GMAIL_OAUTH_CLIENT_SECRET") || value(env, "GOOGLE_CLIENT_SECRET");
  const refreshToken = value(env, `${prefix}_REFRESH_TOKEN`) || value(env, "GOOGLE_REFRESH_TOKEN");
  if (!email || !clientId || !clientSecret || !refreshToken) {
    return null;
  }
  return {
    mailbox: alias,
    clientId,
    clientSecret,
    refreshToken,
    tenantId
  };
}

function configFromAnyEnv(env: NodeJS.ProcessEnv, prefixes: string[], fallbackAlias: string, tenantId: string): GmailMailboxConfig | null {
  for (const prefix of prefixes) {
    const config = configFromEnv(env, prefix, fallbackAlias, tenantId);
    if (config) {
      return config;
    }
  }
  return null;
}

async function sendSmsViaTwilio(env: NodeJS.ProcessEnv, message: OutboundSms): Promise<SendReceipt> {
  const accountSid = value(env, "TWILIO_ACCOUNT_SID");
  const authToken = value(env, "TWILIO_AUTH_TOKEN");
  const from = value(env, "TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !from) {
    throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required for SMS delivery.");
  }
  const body = new URLSearchParams({
    To: message.to,
    From: from,
    Body: message.body
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = await response.json() as { sid?: string; message?: string };
  if (!response.ok || !payload.sid) {
    throw new Error(payload.message || "Twilio SMS request failed.");
  }
  return {
    provider: "twilio",
    id: payload.sid,
    acceptedAt: new Date().toISOString()
  };
}

export function createCommsRailFromEnv(env: NodeJS.ProcessEnv): CommsRail {
  const tenantId = configuredTenantId(env, "createCommsRail");
  if (value(env, "NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED").toLowerCase() === "true") {
    return { tenantId, readAdapters: new Map(), sendAdapter: null };
  }
  const readAdapters = new Map<string, EmailReadProvider>();
  for (const [prefix, fallbackAlias] of [
    ["GMAIL_READONLY_MAILBOX_1", "READONLY_1"],
    ["GMAIL_READONLY_MAILBOX_2", "READONLY_2"]
  ] as const) {
    const config = configFromEnv(env, prefix, fallbackAlias, tenantId);
    if (config) {
      readAdapters.set(config.mailbox, new GmailReadOnlyAdapter(config));
    }
  }
  const sendConfig = configFromAnyEnv(env, ["GMAIL_SEND_MAILBOX", "GMAIL_NEXI"], "NEXI_SEND", tenantId);
  if (sendConfig && (
    value(env, "GMAIL_SEND_MAILBOX_READ_ENABLED").toLowerCase() === "true"
    || value(env, "GMAIL_NEXI_READ_ENABLED").toLowerCase() === "true"
  )) {
    readAdapters.set(sendConfig.mailbox, new GmailReadOnlyAdapter(sendConfig));
  }
  return {
    tenantId,
    readAdapters,
    sendAdapter: sendConfig ? new GmailSendAdapter(sendConfig) : null,
    sendSms: value(env, "TWILIO_ACCOUNT_SID") && value(env, "TWILIO_AUTH_TOKEN") && value(env, "TWILIO_FROM_NUMBER")
      ? (message) => sendSmsViaTwilio(env, message)
      : undefined,
    operatorEmail: value(env, "NEXI_OPERATOR_EMAIL") || value(env, "OPERATOR_EMAIL") || undefined
  };
}
