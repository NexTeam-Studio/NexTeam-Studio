import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { listCommunicationTemplatesInputSchema, listTeamMembersInputSchema, saveCommunicationTemplateInputSchema } from "./toolSchemas.js";
import { normalizeCommunicationTemplates } from "./communicationTemplates.js";

function slugifyToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

export function createTenantConfigNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    options,
    source
  } = context;
  return [
    ...[{
      name: "listCommunicationTemplates",
      description: "Read tenant email and text templates by category, label, or body text.",
      inputSchema: listCommunicationTemplatesInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native communication-template tools are not wired for this tenant yet.", { provider: "native", op: "listCommunicationTemplates", status: 501 });
        }
        const input = listCommunicationTemplatesInputSchema.parse(args);
        const needle = input.q.trim().toLowerCase();
        const settings = await options.requestRepository.getCrmSettings(tenant.id);
        const templates = settings.communicationTemplates
          .filter((template) => !input.category || template.category === input.category)
          .filter((template) => !needle || [
            template.category,
            template.label,
            template.description,
            template.emailSubject,
            template.emailBody,
            template.smsBody
          ].filter(Boolean).join(" ").toLowerCase().includes(needle))
          .sort((left, right) => left.label.localeCompare(right.label));
        return {
          result: { templates },
          sources: templates.length
            ? templates.map((template) => source(template.id, `Communication template ${template.label}`))
            : [source("communication-templates", "Tenant communication template list")]
        };
      }
    }],
    ...[{
      name: "listTeamMembers",
      description: "Read tenant team members so Nexi can assign salesperson or rep fields with real user ids.",
      inputSchema: listTeamMembersInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.platformRepository) {
          throw new RailError("Native tenant-user tools are not wired for this tenant yet.", { provider: "native", op: "listTeamMembers", status: 501 });
        }
        const input = listTeamMembersInputSchema.parse(args);
        const needle = input.q.trim().toLowerCase();
        const users = (await options.platformRepository.listTenantUsers(tenant.id))
          .filter((user) => !input.activeOnly || user.active)
          .filter((user) => !input.role || user.role === input.role)
          .filter((user) => !needle || [user.displayName, user.email, user.role].filter(Boolean).join(" ").toLowerCase().includes(needle));
        return {
          result: { users },
          sources: users.length
            ? users.map((user) => source(user.id, `Tenant user ${user.displayName}`))
            : [source("tenant-users", "Tenant user list")]
        };
      }
    }],
    ...(includeWrites ? [{
      name: "saveCommunicationTemplate",
      description: "Create or update a tenant email/text template in the shared Settings template manager.",
      inputSchema: saveCommunicationTemplateInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native communication-template tools are not wired for this tenant yet.", { provider: "native", op: "saveCommunicationTemplate", status: 501 });
        }
        const input = saveCommunicationTemplateInputSchema.parse(args);
        const settings = await options.requestRepository.getCrmSettings(tenant.id);
        const timestamp = new Date().toISOString();
        const category = input.category.trim();
        const existing = settings.communicationTemplates.find((template) =>
          (input.id?.trim() && template.id === input.id.trim())
          || template.category === category
        );
        const template = {
          id: existing?.id ?? input.id?.trim() ?? `template_${slugifyToken(category)}`,
          tenantId: tenant.id,
          category,
          label: input.label.trim(),
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          emailEnabled: input.emailEnabled,
          smsEnabled: input.smsEnabled,
          ...(input.emailSubject?.trim() ? { emailSubject: input.emailSubject.trim() } : {}),
          ...(input.emailBody?.trim() ? { emailBody: input.emailBody.trim() } : {}),
          ...(input.smsBody?.trim() ? { smsBody: input.smsBody.trim() } : {}),
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp
        };
        const nextTemplates = existing
          ? settings.communicationTemplates.map((entry) => entry.id === existing.id ? template : entry)
          : [...settings.communicationTemplates, template];
        const savedSettings = await options.requestRepository.saveCrmSettings({
          ...settings,
          communicationTemplates: normalizeCommunicationTemplates({ tenantId: tenant.id, communicationTemplates: nextTemplates }),
          updatedAt: timestamp
        });
        return {
          result: {
            template,
            templateCount: savedSettings.communicationTemplates.length,
            created: !existing
          },
          sources: [source(template.id, `Communication template ${template.label}`)]
        };
      }
    }] : [])
  ];
}
