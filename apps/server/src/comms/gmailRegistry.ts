import type { EmailReadProvider, EmailSendProvider, OutboundSms, SendReceipt } from "@nexteam/core";
import { GmailReadOnlyAdapter, GmailSendAdapter, ResendTransactionalAdapter, type GmailMailboxConfig, type ResendTransactionalConfig } from "@nexteam/providers";
import { configuredTenantId } from "../core/tenantConfig.js";

export interface CommsRail {
  tenantId: string;
  readAdapters: Map<string, EmailReadProvider>;
  sendAdapter: EmailSendProvider | null;
  sendSms?: ((message: OutboundSms) => Promise<SendReceipt>) | undefined;
  operatorEmail?: string | undefined;
  /** Verified sending address, exposed only so workflow code can choose a display name safely. */
  senderEmail?: string | undefined;
}

export type TransactionalProviderStatus = {
  provider: "resend" | "gmail" | null;
  configured: boolean;
};

/**
 * Authoritative non-secret deployment identity for the separately gated owner
 * invitation rail. This is platform infrastructure, never tenant data.
 */
export const STAGING_OWNER_INVITATION_GMAIL_PROVIDER = Object.freeze({
  provider: "gmail",
  senderIdentity: "nexteamstudioai@gmail.com",
  environment: "staging",
  purpose: "owner invitation",
  oauthProjectIdentity: "NexTeam Gmail Sender",
  oauthClientIdentity: "NexTeam Gmail Sender Local",
  requiredScope: "gmail.send",
  secretDestinationName: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN"
});

export type StagingOwnerInvitationGmailProviderStatus = {
  provider: "gmail";
  senderIdentity: string;
  environment: "staging";
  purpose: "owner invitation";
  oauthProjectIdentity: "NexTeam Gmail Sender";
  oauthClientIdentity: "NexTeam Gmail Sender Local";
  requiredScope: "gmail.send";
  secretDestinationName: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN";
  oauthClientStatus: "PRESENT_VERIFIED" | "MISSING";
  quarantineState: "QUARANTINED" | "NOT_QUARANTINED";
  secretHealth: "PRESENT" | "MISSING";
  connectionHealth: "HEALTHY" | "DEGRADED" | "UNVERIFIED";
  lastVerifiedAt: string | null;
  safeToReauthorize: false;
  reauthorizationReason: "STAGING_SENDER_LOCKED: explicit sender-migration authorization is required.";
};

/**
 * Returns only non-secret preflight state. Connection health and last-verified
 * metadata are written by the staging preflight/owner-invite rail, never by a
 * browser status request.
 */
export function stagingOwnerInvitationGmailProviderStatus(env: NodeJS.ProcessEnv): StagingOwnerInvitationGmailProviderStatus {
  const clientIdPresent = Boolean(value(env, "GMAIL_OAUTH_CLIENT_ID") || value(env, "GMAIL_SEND_MAILBOX_CLIENT_ID") || value(env, "GOOGLE_CLIENT_ID"));
  return {
    ...STAGING_OWNER_INVITATION_GMAIL_PROVIDER,
    oauthClientStatus: clientIdPresent ? "PRESENT_VERIFIED" : "MISSING",
    quarantineState: value(env, "NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED").toLowerCase() === "true" ? "QUARANTINED" : "NOT_QUARANTINED",
    secretHealth: value(env, STAGING_OWNER_INVITATION_GMAIL_PROVIDER.secretDestinationName) ? "PRESENT" : "MISSING",
    connectionHealth: value(env, "NEXTEAM_STAGING_GMAIL_CONNECTION_HEALTH") === "HEALTHY"
      ? "HEALTHY"
      : value(env, "NEXTEAM_STAGING_GMAIL_CONNECTION_HEALTH") === "DEGRADED" ? "DEGRADED" : "UNVERIFIED",
    lastVerifiedAt: value(env, "NEXTEAM_STAGING_GMAIL_LAST_VERIFIED_AT") || null,
    safeToReauthorize: false,
    reauthorizationReason: "STAGING_SENDER_LOCKED: explicit sender-migration authorization is required."
  };
}

function envKey(value: string): string {
  return value.replace(/[^A-Z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function tenantValue(env: NodeJS.ProcessEnv, prefix: string, tenantId: string): string {
  const tenantKey = envKey(tenantId);
  return value(env, `${prefix}_${tenantKey}`) || value(env, prefix);
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

/**
 * Railway receives this value from the authorized deployment secret reference.
 * This registry is the only NexTeam server boundary that reads it; business
 * modules receive the provider-neutral EmailSendProvider instead.
 */
function resendTransactionalConfigFromEnv(env: NodeJS.ProcessEnv, tenantId: string): ResendTransactionalConfig | null {
  const apiKey = tenantValue(env, "RESEND_API_KEY", tenantId);
  const fromEmail = tenantValue(env, "RESEND_FROM_EMAIL", tenantId);
  if (!apiKey || !fromEmail) return null;
  const fromName = tenantValue(env, "RESEND_FROM_NAME", tenantId);
  return {
    tenantId,
    apiKey,
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    mailbox: tenantValue(env, "RESEND_TRANSACTIONAL_MAILBOX", tenantId) || "TRANSACTIONAL"
  };
}

function gmailSendConfigFromEnv(env: NodeJS.ProcessEnv, tenantId: string): GmailMailboxConfig | null {
  return configFromAnyEnv(env, ["GMAIL_SEND_MAILBOX", "GMAIL_NEXI"], "NEXI_SEND", tenantId);
}

/** Uses the same precedence as the runtime rail without revealing credentials. */
export function transactionalProviderStatus(env: NodeJS.ProcessEnv, tenantId: string): TransactionalProviderStatus {
  if (value(env, "NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED").toLowerCase() === "true") {
    return { provider: null, configured: false };
  }
  if (resendTransactionalConfigFromEnv(env, tenantId)) return { provider: "resend", configured: true };
  if (gmailSendConfigFromEnv(env, tenantId)) return { provider: "gmail", configured: true };
  return { provider: null, configured: false };
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
  const sendConfig = gmailSendConfigFromEnv(env, tenantId);
  const resendConfig = resendTransactionalConfigFromEnv(env, tenantId);
  if (sendConfig && (
    value(env, "GMAIL_SEND_MAILBOX_READ_ENABLED").toLowerCase() === "true"
    || value(env, "GMAIL_NEXI_READ_ENABLED").toLowerCase() === "true"
  )) {
    readAdapters.set(sendConfig.mailbox, new GmailReadOnlyAdapter(sendConfig));
  }
  return {
    tenantId,
    readAdapters,
    // Transactional sends prefer the modern provider when its deployment
    // secret reference and tenant-generic sender identity are configured.
    // Gmail read/search adapters remain independently registered above.
    sendAdapter: resendConfig ? new ResendTransactionalAdapter(resendConfig) : sendConfig ? new GmailSendAdapter(sendConfig) : null,
    sendSms: value(env, "TWILIO_ACCOUNT_SID") && value(env, "TWILIO_AUTH_TOKEN") && value(env, "TWILIO_FROM_NUMBER")
      ? (message) => sendSmsViaTwilio(env, message)
      : undefined,
    operatorEmail: value(env, "NEXI_OPERATOR_EMAIL") || value(env, "OPERATOR_EMAIL") || undefined,
    senderEmail: resendConfig?.from.match(/<([^>]+)>/)?.[1] ?? resendConfig?.from
  };
}
