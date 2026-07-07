import type { Tenant } from "@nexteam/core";
import type { CampaignChannel, CampaignContact, SequenceStep } from "./schemas.js";

export interface CampaignComplianceConfig {
  spfConfirmed: boolean;
  dkimConfirmed: boolean;
  dmarcConfirmed: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
}

export function complianceConfigFromEnv(env: NodeJS.ProcessEnv): CampaignComplianceConfig {
  return {
    spfConfirmed: env.M6_SPF_CONFIRMED === "true",
    dkimConfirmed: env.M6_DKIM_CONFIRMED === "true",
    dmarcConfirmed: env.M6_DMARC_CONFIRMED === "true",
    quietHoursStart: Number(env.M6_SMS_QUIET_HOURS_START || "20"),
    quietHoursEnd: Number(env.M6_SMS_QUIET_HOURS_END || "8")
  };
}

export function dnsReady(config: CampaignComplianceConfig): boolean {
  return config.spfConfirmed && config.dkimConfirmed && config.dmarcConfirmed;
}

export function outboundBoundary(config: CampaignComplianceConfig, channel: CampaignChannel): {
  approvalQueueAllowed: boolean;
  executionBlocked: boolean;
  reason: string;
} {
  if (channel === "email" && !dnsReady(config)) {
    return {
      approvalQueueAllowed: true,
      executionBlocked: true,
      reason: "Bulk/list email execution is blocked until SPF, DKIM, and DMARC are confirmed."
    };
  }
  return {
    approvalQueueAllowed: true,
    executionBlocked: false,
    reason: "ApprovalQueue review is required before any outbound execution."
  };
}

export function unsubscribeUrl(input: {
  baseUrl: string;
  tenantId: string;
  campaignId: string;
  contactId: string;
  channel: CampaignChannel;
}): string {
  const params = new URLSearchParams({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    contactId: input.contactId,
    channel: input.channel
  });
  return `${input.baseUrl.replace(/\/$/, "")}/api/campaigns/unsubscribe?${params.toString()}`;
}

export function injectComplianceText(input: {
  body: string;
  unsubscribeLink: string;
  tenant: Tenant;
}): string {
  const body = input.body.includes("{{unsubscribeLink}}")
    ? input.body.replaceAll("{{unsubscribeLink}}", `Unsubscribe: ${input.unsubscribeLink}`)
    : `${input.body.trim()}\n\nUnsubscribe: ${input.unsubscribeLink}`;
  return body.replaceAll("{{businessName}}", input.tenant.name);
}

export function renderStepForContact(input: {
  tenant: Tenant;
  contact: CampaignContact;
  step: SequenceStep;
  campaignId: string;
  baseUrl: string;
}): { subject: string; bodyText: string; unsubscribeLink: string } {
  const companyOrName = input.contact.company || input.contact.name;
  const unsubscribeLink = unsubscribeUrl({
    baseUrl: input.baseUrl,
    tenantId: input.tenant.id,
    campaignId: input.campaignId,
    contactId: input.contact.id,
    channel: input.step.channel
  });
  const subject = (input.step.subject || `${input.tenant.name} follow-up`)
    .replaceAll("{{name}}", input.contact.name)
    .replaceAll("{{companyOrName}}", companyOrName)
    .replaceAll("{{businessName}}", input.tenant.name);
  const body = input.step.body
    .replaceAll("{{name}}", input.contact.name)
    .replaceAll("{{companyOrName}}", companyOrName);
  return {
    subject,
    bodyText: injectComplianceText({ body, unsubscribeLink, tenant: input.tenant }),
    unsubscribeLink
  };
}

export function quietHoursBlocked(input: {
  channel: CampaignChannel;
  sendAt: Date;
  config: CampaignComplianceConfig;
}): boolean {
  if (input.channel !== "sms") {
    return false;
  }
  const hour = input.sendAt.getHours();
  return input.config.quietHoursStart > input.config.quietHoursEnd
    ? hour >= input.config.quietHoursStart || hour < input.config.quietHoursEnd
    : hour >= input.config.quietHoursStart && hour < input.config.quietHoursEnd;
}
