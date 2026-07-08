import type { Tenant } from "@nexteam/core";
import type { CampaignChannel, CampaignContact, SequenceStep } from "./schemas.js";

export interface CampaignComplianceConfig {
  spfConfirmed: boolean;
  dkimConfirmed: boolean;
  dmarcConfirmed: boolean;
  physicalAddress: string;
  quietHoursStart: number;
  quietHoursEnd: number;
}

export function complianceConfigFromEnv(env: NodeJS.ProcessEnv): CampaignComplianceConfig {
  return {
    spfConfirmed: env.M6_SPF_CONFIRMED === "true",
    dkimConfirmed: env.M6_DKIM_CONFIRMED === "true",
    dmarcConfirmed: env.M6_DMARC_CONFIRMED === "true",
    physicalAddress: (env.M6_PHYSICAL_ADDRESS || env.TENANT_PHYSICAL_ADDRESS || "").trim(),
    quietHoursStart: Number(env.M6_SMS_QUIET_HOURS_START || "20"),
    quietHoursEnd: Number(env.M6_SMS_QUIET_HOURS_END || "8")
  };
}

export function dnsReady(config: CampaignComplianceConfig): boolean {
  return config.spfConfirmed && config.dkimConfirmed && config.dmarcConfirmed;
}

export function physicalAddressReady(config: CampaignComplianceConfig): boolean {
  return config.physicalAddress.trim().length > 0;
}

export function outboundBoundary(config: CampaignComplianceConfig, channel: CampaignChannel): {
  approvalQueueAllowed: boolean;
  executionBlocked: boolean;
  reason: string;
} {
  if (channel === "email" && (!dnsReady(config) || !physicalAddressReady(config))) {
    const blockers = [
      !dnsReady(config) ? "SPF, DKIM, and DMARC are not confirmed" : null,
      !physicalAddressReady(config) ? "a tenant physical mailing address is not configured" : null
    ].filter(Boolean).join("; ");
    return {
      approvalQueueAllowed: true,
      executionBlocked: true,
      reason: `Bulk/list email execution is blocked: ${blockers}.`
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
  physicalAddress: string;
}): string {
  const physicalAddress = input.physicalAddress.trim() || "[Physical mailing address required before list sends]";
  const body = input.body.includes("{{unsubscribeLink}}")
    ? input.body.replaceAll("{{unsubscribeLink}}", `Unsubscribe: ${input.unsubscribeLink}`)
    : `${input.body.trim()}\n\nUnsubscribe: ${input.unsubscribeLink}`;
  const withBusinessName = body
    .replaceAll("{{businessName}}", input.tenant.name)
    .replaceAll("{{physicalAddress}}", physicalAddress);
  return /(?:Mailing address|Physical address):/i.test(withBusinessName)
    ? withBusinessName
    : `${withBusinessName.trim()}\n\nMailing address: ${physicalAddress}`;
}

function renderTemplateString(input: string, variables: Record<string, string>): string {
  return input.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (match, key: string) => variables[key] ?? match);
}

export function renderStepForContact(input: {
  tenant: Tenant;
  contact: CampaignContact;
  step: SequenceStep;
  campaignId: string;
  baseUrl: string;
  variables?: Record<string, string> | undefined;
  physicalAddress?: string | undefined;
}): { subject: string; bodyText: string; unsubscribeLink: string } {
  const companyOrName = input.contact.company || input.contact.name;
  const unsubscribeLink = unsubscribeUrl({
    baseUrl: input.baseUrl,
    tenantId: input.tenant.id,
    campaignId: input.campaignId,
    contactId: input.contact.id,
    channel: input.step.channel
  });
  const variables = {
    name: input.contact.name,
    company: input.contact.company ?? "",
    companyOrName,
    businessName: input.tenant.name,
    tenantId: input.tenant.id,
    unsubscribeLink,
    physicalAddress: input.physicalAddress?.trim() ?? "",
    ...(input.step.variables ?? {}),
    ...(input.variables ?? {})
  };
  const subject = renderTemplateString(input.step.subject || `${input.tenant.name} follow-up`, variables);
  const body = renderTemplateString(input.step.body, variables);
  return {
    subject,
    bodyText: injectComplianceText({
      body,
      unsubscribeLink,
      tenant: input.tenant,
      physicalAddress: input.physicalAddress ?? ""
    }),
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
