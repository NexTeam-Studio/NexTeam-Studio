import type { EmailReadProvider, EmailSendProvider } from "@nexteam/core";
import { GmailReadOnlyAdapter, GmailSendAdapter, type GmailMailboxConfig } from "@nexteam/providers";

export interface CommsRail {
  tenantId: string;
  readAdapters: Map<string, EmailReadProvider>;
  sendAdapter: EmailSendProvider | null;
}

function envKey(value: string): string {
  return value.replace(/[^A-Z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function configFromEnv(env: NodeJS.ProcessEnv, prefix: string, fallbackAlias: string, tenantId: string): GmailMailboxConfig | null {
  const email = value(env, `${prefix}_EMAIL`);
  const alias = value(env, `${prefix}_ALIAS`) || (email ? envKey(email) : fallbackAlias);
  const clientId = value(env, `${prefix}_CLIENT_ID`) || value(env, "GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = value(env, `${prefix}_CLIENT_SECRET`) || value(env, "GMAIL_OAUTH_CLIENT_SECRET");
  const refreshToken = value(env, `${prefix}_REFRESH_TOKEN`);
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

export function createCommsRailFromEnv(env: NodeJS.ProcessEnv): CommsRail {
  const tenantId = value(env, "TENANT_ID") || "aquatrace";
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
  const sendConfig = configFromEnv(env, "GMAIL_SEND_MAILBOX", "NEXI_SEND", tenantId);
  if (sendConfig && value(env, "GMAIL_SEND_MAILBOX_READ_ENABLED").toLowerCase() === "true") {
    readAdapters.set(sendConfig.mailbox, new GmailReadOnlyAdapter(sendConfig));
  }
  return {
    tenantId,
    readAdapters,
    sendAdapter: sendConfig ? new GmailSendAdapter(sendConfig) : null
  };
}
