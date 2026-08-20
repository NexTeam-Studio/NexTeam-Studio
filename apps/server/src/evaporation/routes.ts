import type { Express, Request, Response } from "express";
import { RailError } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import { z } from "zod";
import { configuredTenantId } from "../core/tenantConfig.js";
import { requireTenantRole } from "../auth/accessContext.js";
import type { FieldDocsService } from "../fielddocs/fieldDocsService.js";
import type { SchedulingRepository } from "../scheduling/repository.js";
import { evaporationRunInputSchema } from "./calculator.js";
import { createEvaporationReport, evaporationAttachmentFor, renderEvaporationReportPdf } from "./report.js";
import { MemoryEvaporationRepository, type EvaporationRepository } from "./repository.js";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "./weather.js";

export interface EvaporationRouteDeps {
  repository?: EvaporationRepository | undefined;
  weatherProvider?: EvaporationWeatherProvider | undefined;
  crmRepository?: NativeCrmRepository | undefined;
  schedulingRepository?: SchedulingRepository | undefined;
  fieldDocsService?: Pick<FieldDocsService, "getChecklist" | "updateChecklist"> | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "evaporationRoute");
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown evaporation route error";
  res.status(status).json({ ok: false, error: message });
}

async function resolveFieldContext(input: z.infer<typeof evaporationRunInputSchema>, deps: EvaporationRouteDeps, tenantId: string) {
  if (!input.jobId) {
    if (input.propertyId || input.visitId || input.checklistId) {
      throw new RailError("A job is required when attaching an evaporation report to a property, visit, or checklist.", {
        provider: "native", op: "runEvaporationReport", status: 400
      });
    }
    return input;
  }
  if (!deps.crmRepository) {
    throw new RailError("Job context verification is not configured for evaporation reports.", {
      provider: "native", op: "runEvaporationReport", status: 503
    });
  }
  const job = (await deps.crmRepository.listJobs(tenantId)).find((candidate) => candidate.id === input.jobId);
  if (!job) {
    throw new RailError("The selected job was not found.", { provider: "native", op: "runEvaporationReport", status: 404 });
  }
  const propertyId = input.propertyId ?? job.propertyId;
  if (input.propertyId && input.propertyId !== job.propertyId) {
    throw new RailError("The selected property does not belong to this job.", { provider: "native", op: "runEvaporationReport", status: 400 });
  }
  if (input.visitId) {
    if (!deps.schedulingRepository) {
      throw new RailError("Visit context verification is not configured for evaporation reports.", {
        provider: "native", op: "runEvaporationReport", status: 503
      });
    }
    const visit = await deps.schedulingRepository.getVisit(tenantId, input.visitId);
    if (!visit || visit.jobId !== job.id) {
      throw new RailError("The selected visit does not belong to this job.", { provider: "native", op: "runEvaporationReport", status: 400 });
    }
  }
  if (input.checklistId) {
    if (!deps.fieldDocsService) {
      throw new RailError("Checklist context verification is not configured for evaporation reports.", {
        provider: "native", op: "runEvaporationReport", status: 503
      });
    }
    const checklist = await deps.fieldDocsService.getChecklist(tenantId, input.checklistId);
    if (!checklist || checklist.jobId !== job.id || (input.visitId && checklist.visitId !== input.visitId) || (propertyId && checklist.propertyId && checklist.propertyId !== propertyId)) {
      throw new RailError("The selected checklist does not belong to this job context.", { provider: "native", op: "runEvaporationReport", status: 400 });
    }
  }
  return { ...input, ...(propertyId ? { propertyId } : {}) };
}

async function applyEvaporationToChecklist(report: Awaited<ReturnType<typeof createEvaporationReport>>, deps: EvaporationRouteDeps): Promise<void> {
  if (!report.checklistId || !deps.fieldDocsService) return;
  const checklist = await deps.fieldDocsService.getChecklist(report.tenantId, report.checklistId);
  if (!checklist) return;
  const updates = checklist.fields.flatMap((field) => {
    if (field.label === "Daily evaporation index") {
      return [{ fieldId: field.fieldId, numberValue: report.result.evapInchesPerDay }];
    }
    if (field.label === "Reported daily water loss" && report.result.observedLossInchesPerDay !== null) {
      return [{ fieldId: field.fieldId, numberValue: report.result.observedLossInchesPerDay }];
    }
    return [];
  });
  if (updates.length) {
    await deps.fieldDocsService.updateChecklist({ tenantId: report.tenantId, checklistId: report.checklistId, updates });
  }
}

export function registerEvaporationRoutes(app: Express, deps: EvaporationRouteDeps = {}): EvaporationRepository {
  const env = deps.env ?? process.env;
  const repository = deps.repository ?? new MemoryEvaporationRepository();
  const weatherProvider = deps.weatherProvider ?? new OpenWeatherMapProvider(env);

  app.post("/api/evaporation/run", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "runEvaporationReport" });
      const parsed = evaporationRunInputSchema.parse(req.body);
      const context = await resolveFieldContext(parsed, deps, tenantId);
      const report = await createEvaporationReport({
        tenantId,
        body: context,
        repository,
        weatherProvider
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
