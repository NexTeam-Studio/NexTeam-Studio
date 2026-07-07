import type { Express, Request, Response } from "express";
import { RailError } from "@nexteam/core";
import { createEvaporationReport, evaporationAttachmentFor, renderEvaporationReportPdf } from "./report.js";
import { MemoryEvaporationRepository, type EvaporationRepository } from "./repository.js";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "./weather.js";

export interface EvaporationRouteDeps {
  repository?: EvaporationRepository | undefined;
  weatherProvider?: EvaporationWeatherProvider | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown evaporation route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerEvaporationRoutes(app: Express, deps: EvaporationRouteDeps = {}): EvaporationRepository {
  const env = deps.env ?? process.env;
  const repository = deps.repository ?? new MemoryEvaporationRepository();
  const weatherProvider = deps.weatherProvider ?? new OpenWeatherMapProvider(env);

  app.post("/api/evaporation/run", async (req: Request, res: Response) => {
    try {
      const report = await createEvaporationReport({
        tenantId: defaultTenantId(env),
        body: req.body,
        repository,
        weatherProvider
      });
      res.status(201).json({
        ok: true,
        report,
        pdfUrl: `/api/evaporation/reports/${encodeURIComponent(report.id)}/pdf?tenantId=${encodeURIComponent(report.tenantId)}`,
        attachment: evaporationAttachmentFor(report)
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/evaporation/reports/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const reportId = req.params.id;
      if (!reportId) {
        throw new RailError("Evaporation report id is required.", { provider: "native", op: "renderEvaporationPdf", status: 400 });
      }
      const report = await repository.getReport(tenantId, reportId);
      if (!report) {
        throw new RailError(`Evaporation report ${reportId} was not found.`, { provider: "native", op: "renderEvaporationPdf", status: 404 });
      }
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `inline; filename="${evaporationAttachmentFor(report).filename}"`);
      res.send(renderEvaporationReportPdf(report));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return repository;
}
