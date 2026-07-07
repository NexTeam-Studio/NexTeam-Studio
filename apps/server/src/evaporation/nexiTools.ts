import { type NexiTool, type Source, type Tenant } from "@nexteam/core";
import { evaporationRunInputSchema } from "./calculator.js";
import { createEvaporationReport, evaporationAttachmentFor } from "./report.js";
import type { EvaporationRepository } from "./repository.js";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "./weather.js";

function source(reportId: string): Source {
  return { rail: "native", ref: reportId, label: `Aquatrace evaporation report ${reportId}` };
}

export function createEvaporationNexiTools(input: {
  repository: EvaporationRepository;
  weatherProvider?: EvaporationWeatherProvider | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}): NexiTool[] {
  return [
    {
      name: "runEvaporation",
      description: "Run the Aquatrace v20 evaporation calculator from address and pool specs, using OpenWeather weather and forecast data, then generate a branded PDF report.",
      inputSchema: evaporationRunInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const report = await createEvaporationReport({
          tenantId: tenant.id,
          body: args,
          repository: input.repository,
          weatherProvider: input.weatherProvider ?? new OpenWeatherMapProvider(input.env ?? process.env)
        });
        return {
          result: {
            report,
            pdfUrl: `/api/evaporation/reports/${encodeURIComponent(report.id)}/pdf?tenantId=${encodeURIComponent(report.tenantId)}`,
            attachment: evaporationAttachmentFor(report),
            formula: "Aquatrace v20 evaporation calculator"
          },
          sources: [source(report.id)]
        };
      }
    }
  ];
}
