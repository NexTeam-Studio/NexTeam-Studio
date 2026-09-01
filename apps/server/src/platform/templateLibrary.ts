import { z } from "zod";
import { defaultCommunicationTemplates } from "@nexteam/providers";

export const nexCommandCommunicationTemplateSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  smsBody: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type NexCommandCommunicationTemplate = z.infer<typeof nexCommandCommunicationTemplateSchema>;

export const onboardingTemplateFlowSchema = z.enum(["tenant_onboarding", "team_member_onboarding"]);
export type OnboardingTemplateFlow = z.infer<typeof onboardingTemplateFlowSchema>;
export const nexCommandOnboardingTemplateSchema = z.object({
  id: z.string().min(1),
  flow: onboardingTemplateFlowSchema,
  label: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type NexCommandOnboardingTemplate = z.infer<typeof nexCommandOnboardingTemplateSchema>;

/** Platform-owned defaults. Tenant records receive copies and never reference these records. */
export function defaultNexCommandCommunicationTemplates(): NexCommandCommunicationTemplate[] {
  return (defaultCommunicationTemplates("nexcommand") as NexCommandCommunicationTemplate[]).map((template) => ({
    ...template,
    id: `nexcommand_comms_${template.category}`,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z"
  }));
}

export function defaultNexCommandOnboardingTemplates(): NexCommandOnboardingTemplate[] {
  const createdAt = "2026-08-31T00:00:00.000Z";
  return [
    {
      id: "nexcommand_onboarding_tenant",
      flow: "tenant_onboarding",
      label: "New tenant onboarding",
      subject: "Welcome to NexTeam — set up {{TENANT_NAME}}",
      body: "Hello {{OWNER_NAME}},\n\n{{TENANT_NAME}} is ready for setup. Create your password here: {{SETUP_LINK}}\n\nThis link opens your NexTeam workspace.",
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "nexcommand_onboarding_team_member",
      flow: "team_member_onboarding",
      label: "Tenant team-member onboarding",
      subject: "Set up your {{TENANT_NAME}} NexTeam account",
      body: "Hello {{MEMBER_NAME}},\n\nYou have been added to {{TENANT_NAME}} as {{ROLE}}. Set your password here: {{SETUP_LINK}}\n\nThis secure link opens your NexOps workspace.",
      createdAt,
      updatedAt: createdAt
    }
  ];
}

export function tenantTemplateSnapshot(tenantId: string, template: NexCommandCommunicationTemplate, now = new Date().toISOString()): NexCommandCommunicationTemplate & { tenantId: string } {
  return { ...template, id: `comms_${template.category}_${tenantId}`, tenantId, createdAt: now, updatedAt: now };
}

export function renderOnboardingTemplate(template: NexCommandOnboardingTemplate, variables: Record<string, string>): { subject: string; body: string } {
  const render = (value: string) => value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? "");
  return { subject: render(template.subject), body: render(template.body) };
}
