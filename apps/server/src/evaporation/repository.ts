import type { ID } from "@nexteam/core";
import { z } from "zod";
import type { EvaporationCalculationResult, ForecastSlot, WeatherSnapshot } from "./calculator.js";

export const evaporationReportRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().optional(),
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

export interface EvaporationRepository {
  saveReport(report: EvaporationReportRecord): Promise<EvaporationReportRecord>;
  getReport(tenantId: ID, reportId: ID): Promise<EvaporationReportRecord | null>;
}

export class MemoryEvaporationRepository implements EvaporationRepository {
  private readonly reports = new Map<ID, EvaporationReportRecord>();

  async saveReport(report: EvaporationReportRecord): Promise<EvaporationReportRecord> {
    const parsed = evaporationReportRecordSchema.parse(report) as EvaporationReportRecord;
    this.reports.set(parsed.id, parsed);
    return parsed;
  }

  async getReport(tenantId: ID, reportId: ID): Promise<EvaporationReportRecord | null> {
    const report = this.reports.get(reportId);
    return report?.tenantId === tenantId ? report : null;
  }
}
