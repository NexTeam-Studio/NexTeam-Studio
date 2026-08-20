import { RailError, type EmailSendProvider, type OutboundEmail, type OutboundSms, type SendReceipt } from "@nexteam/core";

export type ShadowModeRecipientPolicy = {
  enabled: boolean;
  emailRecipients: ReadonlySet<string>;
  smsRecipients: ReadonlySet<string>;
};

function envValue(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function enabled(env: NodeJS.ProcessEnv): boolean {
  return envValue(env, "NEXTEAM_SHADOW_MODE").toLowerCase() === "true";
}

function listed(value: string, normalize: (value: string) => string): ReadonlySet<string> {
  return new Set(value.split(",").map(normalize).filter(Boolean));
}

function emailRecipient(value: string): string {
  const trimmed = value.trim();
  const bracketed = /^.*<([^<>]+)>$/.exec(trimmed)?.[1] ?? trimmed;
  return bracketed.trim().toLowerCase();
}

function smsRecipient(value: string): string {
  return value.trim().replace(/[^0-9+]/g, "");
}

function reject(channel: "email" | "sms"): never {
  throw new RailError(
    `Shadow Mode blocks ${channel} delivery to a recipient outside the approved staging allowlist.`,
    { provider: "native", op: channel === "email" ? "sendEmail" : "sendSms", status: 403 }
  );
}

export function shadowModeRecipientPolicyFromEnv(env: NodeJS.ProcessEnv): ShadowModeRecipientPolicy {
  return {
    enabled: enabled(env),
    emailRecipients: listed(envValue(env, "NEXTEAM_SHADOW_EMAIL_RECIPIENTS"), emailRecipient),
    smsRecipients: listed(envValue(env, "NEXTEAM_SHADOW_SMS_RECIPIENTS"), smsRecipient)
  };
}

export function assertShadowModeEmailRecipients(policy: ShadowModeRecipientPolicy, message: OutboundEmail): void {
  if (!policy.enabled) return;
  const recipients = [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])].map(emailRecipient);
  if (!recipients.length || recipients.some((recipient) => !policy.emailRecipients.has(recipient))) reject("email");
}

export function assertShadowModeSmsRecipient(policy: ShadowModeRecipientPolicy, message: OutboundSms): void {
  if (!policy.enabled) return;
  if (!policy.smsRecipients.has(smsRecipient(message.to))) reject("sms");
}

export class ShadowModeEmailSendAdapter implements EmailSendProvider {
  constructor(private readonly delegate: EmailSendProvider, private readonly policy: ShadowModeRecipientPolicy) {}

  get mailbox(): string {
    return this.delegate.mailbox;
  }

  async sendEmail(message: OutboundEmail): Promise<SendReceipt> {
    assertShadowModeEmailRecipients(this.policy, message);
    return this.delegate.sendEmail(message);
  }
}

export function shadowModeSmsSender(
  sender: ((message: OutboundSms) => Promise<SendReceipt>) | undefined,
  policy: ShadowModeRecipientPolicy
): ((message: OutboundSms) => Promise<SendReceipt>) | undefined {
  if (!sender) return undefined;
  return async (message) => {
    assertShadowModeSmsRecipient(policy, message);
    return sender(message);
  };
}
