import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { RailError } from "@nexteam/core";
import { configuredTenantId } from "../core/tenantConfig.js";
import { requireTenantRole } from "../auth/accessContext.js";
import { evaporationRunInputSchema } from "./calculator.js";
import { applyEvaporationToChecklist, resolveEvaporationFieldContext, type EvaporationFieldContextDeps } from "./fieldContext.js";
import { createEvaporationReport, evaporationAttachmentFor, previewEvaporationReport, renderEvaporationReportPdf, type EvaporationPreview } from "./report.js";
import { MemoryEvaporationRepository, type EvaporationRepository } from "./repository.js";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "./weather.js";

export interface EvaporationRouteDeps extends EvaporationFieldContextDeps {
  repository?: EvaporationRepository | undefined;
  weatherProvider?: EvaporationWeatherProvider | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "evaporationRoute");
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

  app.post("/api/evaporation/preview", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "previewEvaporationReport" });
      const parsed = evaporationRunInputSchema.parse(req.body);
      const context = await resolveEvaporationFieldContext(parsed, deps, tenantId);
      const preview = await previewEvaporationReport({ tenantId, body: context, weatherProvider });
      const reviewToken = `evap_review_${randomUUID()}`;
      await repository.saveReview({ id: reviewToken, tenantId, context, preview, expiresAt: Date.now() + 15 * 60_000, status: "pending", createdAt: new Date().toISOString() });
      res.json({ ok: true, preview: { currentWeather: preview.currentWeather, forecast: preview.forecast, result: preview.result }, reviewToken });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/evaporation/run", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "runEvaporationReport" });
      const parsed = evaporationRunInputSchema.parse(req.body);
      const context = await resolveEvaporationFieldContext(parsed, deps, tenantId);
      const reviewToken = typeof req.body?.reviewToken === "string" ? req.body.reviewToken : "";
      const review = reviewToken ? await repository.consumeReview(tenantId, reviewToken) : null;
      const reviewedPreview = review?.preview as EvaporationPreview | undefined;
      if (!review || review.expiresAt < Date.now() || stableJson(review.context) !== stableJson(context)) {
        throw new RailError("The reviewed calculation expired or no longer matches the current inputs. Calculate again before generating the report.", {
          provider: "native", op: "runEvaporationReport", status: 409
        });
      }
      const report = await createEvaporationReport({
        tenantId,
        body: context,
        repository,
        weatherProvider,
        ...(reviewedPreview ? { preview: reviewedPreview } : {})
      });
      await applyEvaporationToChecklist(report, deps);
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

  app.get("/api/evaporation/reports/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "readEvaporationInputs" });
      const reportId = req.params.id;
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : "";
      const visitId = typeof req.query.visitId === "string" ? req.query.visitId : "";
      if (!reportId || !jobId || !visitId) {
        throw new RailError("An evaporation report, job, and Visit are required.", { provider: "native", op: "readEvaporationInputs", status: 400 });
      }
      const report = await repository.getReport(tenantId, reportId);
      if (!report || report.jobId !== jobId || report.visitId !== visitId) {
        throw new RailError("The evaporation report was not found for this Visit.", { provider: "native", op: "readEvaporationInputs", status: 404 });
      }
      res.json({
        ok: true,
        report: {
          id: report.id,
          surfaceAreaFt2: report.surfaceAreaFt2,
          waterTempF: report.waterTempF,
          observedLossInches: report.result.observedLossInchesPerDay,
          ...(report.zip ? { zip: report.zip } : {}),
          ...(report.windMphOverride !== undefined ? { windMphOverride: report.windMphOverride } : {})
        }
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/evaporation/reports/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "renderEvaporationPdf" });
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
