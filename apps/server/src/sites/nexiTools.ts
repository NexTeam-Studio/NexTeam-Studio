import { z } from "zod";
import { type NexiTool, type Source } from "@nexteam/core";
import type { AccessContext } from "../auth/accessContext.js";
import { actorIdForAccess } from "../auth/accessContext.js";
import { buildOperatorUiTheme } from "./appearance.js";
import { operatorUiThemeInputSchema } from "./schemas.js";
import type { SitesRepository } from "./repository.js";

const customizeOperatorUiInputSchema = operatorUiThemeInputSchema.extend({
  plainRequest: z.string().min(1).optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

export function createSitesNexiTools(input: {
  repository: SitesRepository;
  access: AccessContext;
}): NexiTool[] {
  return [
    {
      name: "customizeOperatorUi",
      description: "Change this tenant's Nexi Job Desk interface colors or density for the signed-in owner/admin. Does not change any other tenant and does not publish externally.",
      inputSchema: customizeOperatorUiInputSchema,
      handler: async (tenant, args) => {
        const parsed = customizeOperatorUiInputSchema.parse(args);
        const existing = await input.repository.getOperatorUiTheme(tenant.id);
        const theme = buildOperatorUiTheme({
          tenantId: tenant.id,
          patch: parsed,
          existing,
          actorId: actorIdForAccess(input.access)
        });
        const saved = await input.repository.saveOperatorUiTheme(theme);
        return {
          result: {
            theme: saved,
            appliedTo: "Nexi Job Desk",
            actorId: actorIdForAccess(input.access),
            tenantScoped: true
          },
          sources: [source(saved.id, `Job Desk appearance for ${tenant.name}`)]
        };
      }
    }
  ];
}

