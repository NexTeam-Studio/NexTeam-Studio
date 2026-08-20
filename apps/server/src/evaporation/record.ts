import { z } from "zod";
import type { EvaporationCalculationResult, ForecastSlot, WeatherSnapshot } from "./calculator.js";

/**
 * The calculation artifact is kept as structured data so the same report can
 * be rendered by the evaporation endpoint and represented by NexDocs without
 * copying a PDF or losing its Visit/Job provenance.
 */
export const evaporationReportRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  checklistId: z.string().min(1).optional(),
  clientName: z.string().optional(),
  address: z.string().min(1),
  zip: z.string().optional(),
  surfaceAreaFt2: z.number().positive(),
  waterTempF: z.number(),
  createdAt: z.string(),
  currentWeather: z.custom<WeatherSnapshot>(),
  forecast: z.custom<ForecastSlot[]>(),
  windMphOverride: z.number().optional(),
  result: z.custom<EvaporationCalculationResult>(),
  pdfRef: z.string().min(1),
  status: z.enum(["draft", "posted"])
});

export type EvaporationReportRecord = z.infer<typeof evaporationReportRecordSchema>;
