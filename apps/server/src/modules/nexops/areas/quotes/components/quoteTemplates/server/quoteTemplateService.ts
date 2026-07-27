import { quoteTemplateSchema, type CrmSettings, type QuoteTemplate } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";

export const quoteTemplateInputSchema = quoteTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  id: quoteTemplateSchema.shape.id.optional()
});

export async function ensureQuoteConfiguration(
  repository: Pick<NativeCrmRepository, "getCrmSettings" | "saveCrmSettings" | "listQuoteTemplates" | "upsertQuoteTemplate">,
  tenantId: string
): Promise<{ settings: CrmSettings; templates: QuoteTemplate[] }> {
  const settings = await repository.getCrmSettings(tenantId);
  await repository.saveCrmSettings(settings);
  const templates = await repository.listQuoteTemplates(tenantId);
  for (const template of templates) {
    await repository.upsertQuoteTemplate(template);
  }
  return { settings, templates };
}
