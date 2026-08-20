import type { Express, Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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

interface ReviewedPreviewPayload {
  expiresAt: number;
  context: ReturnType<typeof evaporationRunInputSchema.parse>;
  preview: EvaporationPreview;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function createReviewToken(key: Buffer, payload: ReviewedPreviewPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
}

function verifyReviewToken(key: Buffer, token: string, context: ReviewedPreviewPayload["context"]): EvaporationPreview | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", key).update(encoded).digest("base64url");
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);
  if (expectedBytes.length !== signatureBytes.length || !timingSafeEqual(expectedBytes, signatureBytes)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ReviewedPreviewPayload;
    if (payload.expiresAt < Date.now() || stableJson(payload.context) !== stableJson(context)) return null;
    return payload.preview;
  } catch {
    return null;
  }
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
  const reviewTokenKey = randomBytes(32);

  app.post("/api/evaporation/preview", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "previewEvaporationReport" });
      const parsed = evaporationRunInputSchema.parse(req.body);
      const context = await resolveEvaporationFieldContext(parsed, deps, tenantId);
      const preview = await previewEvaporationReport({ tenantId, body: context, weatherProvider });
      const reviewToken = createReviewToken(reviewTokenKey, { expiresAt: Date.now() + 15 * 60_000, context, preview });
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
      const reviewedPreview = reviewToken ? verifyReviewToken(reviewTokenKey, reviewToken, context) : undefined;
      if (reviewToken && !reviewedPreview) {
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
