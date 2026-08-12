import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { idSchema, splinterDeploymentStatusSchema, splinterExecutionModeSchema, splinterIntegrationStatusSchema, splinterReconciliationEvidenceSchema, splinterRepairProofInjectionSchema, splinterRequiredCheckSchema, splinterReviewSchema, splinterRfiSchema, splinterWorkerResultSchema } from "@nexteam/core";
import { z } from "zod";
import type { SplinterRepository } from "./repository.js";
import type { SplinterJobService } from "./service.js";
import type { WorkRegistry, SplinterWorkSelector } from "./workRegistry.js";

export interface SplinterRelayRouteDeps { repository: SplinterRepository; service: SplinterJobService; workRegistry?: WorkRegistry; workSelector?: SplinterWorkSelector; env?: NodeJS.ProcessEnv; }

function authorized(req: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env.SPLINTER_RELAY_SERVICE_TOKEN?.trim();
  const received = req.header("x-splinter-relay-token")?.trim();
  if (!expected || !received) return false;
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function ownerAuthorized(req: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env.SPLINTER_OWNER_SERVICE_TOKEN?.trim();
  const received = req.header("x-splinter-owner-token")?.trim();
  if (!expected || !received) return false;
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function reject(res: Response, status: number, message: string) { return res.status(status).json({ ok: false, error: message }); }

const splinterJobCreateRequestSchema = z.object({
  id: idSchema.optional(),
  goal: z.string().min(1).max(4_000),
  nextAction: z.string().min(1).max(1_000),
  executionMode: splinterExecutionModeSchema.default("READ_ONLY"),
  allowedPaths: z.array(z.string().min(1).max(256)).max(50).default([]),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).max(50).default([]),
  requiredChecks: z.array(splinterRequiredCheckSchema).max(10).default([]),
  repairProofInjection: splinterRepairProofInjectionSchema.optional()
}).strict().superRefine((input, context) => {
  if (input.executionMode === "CODE_CHANGE" && input.allowedPaths.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedPaths"], message: "CODE_CHANGE jobs require allowed paths." });
  if (input.executionMode === "CODE_CHANGE" && input.acceptanceCriteria.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptanceCriteria"], message: "CODE_CHANGE jobs require acceptance criteria." });
  if (input.executionMode === "CODE_CHANGE" && input.requiredChecks.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredChecks"], message: "CODE_CHANGE jobs require deterministic checks." });
});

function createJobId(): string {
  return `splinter-${crypto.randomUUID()}`;
}

function queuedProjection(job: { id: string; goal: string; executionMode: string; allowedPaths: string[]; pathDiscoveryPolicy: string; acceptanceCriteria: string[]; requiredChecks: string[]; attemptCount: number; maxAttempts: number; lastCheckFailures: string[]; repairProofInjection?: string | undefined; rfi?: unknown; integration: unknown; deployment: unknown; state: string; result: string; next: { owner: string; action: string }; createdAt: string; updatedAt: string }) {
  return { id: job.id, goal: job.goal, executionMode: job.executionMode, allowedPaths: job.allowedPaths, pathDiscoveryPolicy: job.pathDiscoveryPolicy, acceptanceCriteria: job.acceptanceCriteria, requiredChecks: job.requiredChecks, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts, lastCheckFailures: job.lastCheckFailures, repairProofInjection: job.repairProofInjection, rfi: job.rfi, integration: job.integration, deployment: job.deployment, state: job.state, result: job.result, next: job.next, createdAt: job.createdAt, updatedAt: job.updatedAt };
}

/** Backend-only relay boundary. It delegates all state changes to SplinterJobService. */
export function registerSplinterRelayRoutes(app: Express, deps: SplinterRelayRouteDeps): void {
  const env = deps.env ?? process.env;
  app.post("/api/internal/splinter/jobs/:id/rfi/resolve", async (req, res) => {
    if (!ownerAuthorized(req, env)) return reject(res, 401, "Splinter owner authorization is required.");
    const parsed = z.object({ rfiId: idSchema, resolution: z.string().min(1).max(64), resolutionScope: z.enum(["JOB_ONLY", "MODULE", "TENANT", "GLOBAL"]) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter owner resolution was rejected.");
    try { return res.json({ ok: true, job: await deps.service.resolveOwnerRfi(req.params.id, parsed.data) }); }
    catch { return reject(res, 409, "Splinter owner resolution was rejected."); }
  });
  app.post("/api/internal/splinter/work-items", async (req, res) => {
    if (!deps.workRegistry || !ownerAuthorized(req, env)) return reject(res, 401, "Splinter owner authorization is required.");
    const parsed = z.object({ workItemId: idSchema, title: z.string().min(1).max(200), goal: z.string().min(1).max(4000), module: z.string().min(1).max(100), tenantScope: z.string().min(1).max(100), priority: z.number().int().min(1).max(5), launchCritical: z.boolean().optional(), dependencies: z.array(idSchema).max(30).default([]), acceptanceCriteria: z.array(z.string().min(1).max(1000)).max(50), requiredChecks: z.array(splinterRequiredCheckSchema).max(10), allowedPaths: z.array(z.string().min(1).max(256)).max(50).default([]), pathDiscoveryPolicy: z.enum(["EXPLICIT_PATHS", "APPROVED_DISCOVERY"]).default("EXPLICIT_PATHS"), executionMode: splinterExecutionModeSchema.default("READ_ONLY"), reviewRequired: z.boolean().optional(), maxAttempts: z.number().int().min(1).max(3).optional(), ownerDecisionRequired: z.boolean().default(false), promotionPolicy: z.enum(["NONE", "STAGING_ONLY"]).default("NONE"), sourceRequirementRefs: z.array(z.string().min(1).max(500)).min(1).max(20), requirementRevision: z.string().min(1).max(128), nonPromotable: z.boolean().default(false), reconciliationMode: z.boolean().default(false) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter work item creation was rejected.");
    try { return res.status(201).json({ ok: true, item: await deps.workRegistry.create({ ...parsed.data, launchCritical: parsed.data.launchCritical ?? false, executionMode: parsed.data.executionMode ?? "READ_ONLY", reviewRequired: parsed.data.reviewRequired ?? false, maxAttempts: parsed.data.maxAttempts ?? (parsed.data.executionMode === "CODE_CHANGE" ? 3 : 1), ownerDecisionRequired: parsed.data.ownerDecisionRequired ?? false, promotionPolicy: parsed.data.promotionPolicy ?? "NONE", pathDiscoveryPolicy: parsed.data.pathDiscoveryPolicy ?? "EXPLICIT_PATHS", nonPromotable: parsed.data.nonPromotable ?? false, reconciliationMode: parsed.data.reconciliationMode ?? false, completedEvidenceRefs: [] }) }); } catch { return reject(res, 400, "Splinter work item creation was rejected."); }
  });
  app.post("/api/internal/splinter/work-items/:id/reconcile", async (req, res) => {
    if (!deps.workSelector || !ownerAuthorized(req, env)) return reject(res, 401, "Splinter owner authorization is required.");
    const parsed = splinterReconciliationEvidenceSchema.safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter reconciliation evidence was rejected.");
    try { return res.json({ ok: true, item: await deps.workSelector.reconcilePreRegistry(req.params.id, parsed.data) }); } catch { return reject(res, 409, "Splinter reconciliation evidence was rejected."); }
  });
  app.post("/api/internal/splinter/work-items/:id/approve", async (req, res) => {
    if (!deps.workSelector || !ownerAuthorized(req, env)) return reject(res, 401, "Splinter owner authorization is required.");
    try { return res.json({ ok: true, item: await deps.workSelector.approve(req.params.id) }); } catch { return reject(res, 409, "Splinter work item approval was rejected."); }
  });
  app.post("/api/internal/splinter/work-items/:id/block", async (req, res) => {
    if (!deps.workRegistry || !ownerAuthorized(req, env)) return reject(res, 401, "Splinter owner authorization is required.");
    const parsed = z.object({ classification: z.enum(["EXTERNAL_BLOCKER", "OWNER_REQUIRED", "SAFETY_STOP"]), detail: z.string().min(1).max(500) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter work blocker was rejected.");
    try { const item = await deps.workRegistry.update(req.params.id, { status: parsed.data.classification === "EXTERNAL_BLOCKER" ? "BLOCKED" : parsed.data.classification, blockedBy: parsed.data }); return item ? res.json({ ok: true, item }) : reject(res, 404, "Splinter work item was not found."); } catch { return reject(res, 400, "Splinter work blocker was rejected."); }
  });
  app.use("/api/internal/splinter", (req, res, next) => authorized(req, env) ? next() : reject(res, 401, "Splinter relay authorization is required."));
  app.post("/api/internal/splinter/work-items/select", async (req, res) => {
    if (!deps.workSelector) return reject(res, 503, "Splinter work selection is unavailable.");
    const parsed = z.object({ currentStagingSha: z.string().regex(/^[a-f0-9]{7,64}$/i) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter work selection was rejected.");
    try { const selected = await deps.workSelector.select(parsed.data.currentStagingSha); return res.json({ ok: true, selected }); } catch { return reject(res, 409, "Splinter work selection was rejected."); }
  });
  app.post("/api/internal/splinter/work-items/:id/complete", async (req, res) => {
    if (!deps.workSelector) return reject(res, 503, "Splinter work completion is unavailable.");
    const parsed = z.object({ evidenceRefs: z.array(z.string().min(1).max(256)).min(1).max(30) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter work completion was rejected.");
    try { return res.json({ ok: true, item: await deps.workSelector.reconcile(req.params.id, parsed.data.evidenceRefs) }); } catch { return reject(res, 409, "Splinter work completion was rejected."); }
  });
  app.get("/api/internal/splinter/work-items/:id", async (req, res) => {
    if (!deps.workRegistry) return reject(res, 503, "Splinter work registry is unavailable.");
    const item = await deps.workRegistry.get(req.params.id);
    return item ? res.json({ ok: true, item }) : reject(res, 404, "Splinter work item was not found.");
  });
  app.get("/api/internal/splinter/health", (_req, res) => {
    return res.json({ ok: true, controllerVersion: "splinter-v1" });
  });
  app.post("/api/internal/splinter/jobs", async (req, res) => {
    try {
      const input = splinterJobCreateRequestSchema.parse(req.body);
      const job = await deps.repository.create({
        id: input.id ?? createJobId(),
        goal: input.goal,
        executionMode: input.executionMode,
        allowedPaths: input.allowedPaths,
        pathDiscoveryPolicy: "EXPLICIT_PATHS",
        acceptanceCriteria: input.acceptanceCriteria,
        requiredChecks: input.requiredChecks,
        attemptCount: 0,
        maxAttempts: input.executionMode === "CODE_CHANGE" ? 3 : 1,
        lastCheckFailures: [],
        ...(input.repairProofInjection ? { repairProofInjection: input.repairProofInjection } : {}),
        nonPromotable: (input.id ?? "").startsWith("splinter-review-proof-") || (input.id ?? "").startsWith("splinter-rfi-proof-"),
        reviewRequired: input.executionMode === "CODE_CHANGE",
        reviewStatus: "NOT_REQUIRED",
        workerHistory: [],
        integration: { status: "NOT_REQUESTED", verification: [] },
        deployment: { status: "NOT_REQUESTED", verification: [] },
        reviewCycleCount: 0,
        maxReviewCycles: 3,
        reviewHistory: [],
        state: "QUEUED",
        next: { owner: "splinter", action: input.nextAction },
        result: "PENDING",
        lastError: null
      });
      return res.status(201).json({ ok: true, job });
    } catch {
      return reject(res, 400, "Splinter job creation was rejected.");
    }
  });
  app.get("/api/internal/splinter/jobs", async (req, res) => {
    if (req.query.state !== "QUEUED") return reject(res, 400, "Only queued Splinter job discovery is supported.");
    try {
      return res.json({ ok: true, jobs: (await deps.repository.listQueued(10)).map(queuedProjection) });
    } catch {
      return reject(res, 503, "Splinter queued job discovery is temporarily unavailable.");
    }
  });
  app.get("/api/internal/splinter/jobs/:id", async (req, res) => {
    const job = await deps.repository.get(req.params.id);
    return job ? res.json({ ok: true, job }) : reject(res, 404, "Splinter job was not found.");
  });
  app.post("/api/internal/splinter/jobs/:id/claim", async (req, res) => {
    try { return res.json({ ok: true, job: await deps.service.transition(req.params.id, "RUNNING") }); }
    catch (error) { return reject(res, error instanceof Error && error.name === "SplinterTransitionError" ? 409 : 400, "Splinter job claim was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/attempt", async (req, res) => {
    const parsed = z.object({ lastCheckFailures: z.array(z.string().min(1).max(500)).max(10).default([]) }).strict().safeParse(req.body ?? {});
    if (!parsed.success) return reject(res, 400, "Splinter attempt evidence was rejected.");
    try { return res.json({ ok: true, job: await deps.service.beginWorkerAttempt(req.params.id, parsed.data.lastCheckFailures) }); }
    catch { return reject(res, 409, "Splinter worker attempt was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/outcome", async (req, res) => {
    try { return res.json({ ok: true, job: await deps.service.submitWorkerOutcome(req.params.id, splinterWorkerResultSchema.parse(req.body)) }); }
    catch { return reject(res, 400, "Splinter worker outcome was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/review", async (req, res) => {
    try { return res.json({ ok: true, job: await deps.service.submitReview(req.params.id, splinterReviewSchema.parse(req.body)) }); }
    catch { return reject(res, 400, "Splinter review evidence was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/repair", async (req, res) => {
    try { return res.json({ ok: true, job: await deps.service.recordReviewRepair(req.params.id, splinterWorkerResultSchema.parse(req.body)) }); }
    catch { return reject(res, 400, "Splinter repaired commit evidence was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/escalation", async (req, res) => {
    const parsed = z.object({ classification: z.enum(["AUTONOMOUS", "EXTERNAL_BLOCKER", "OWNER_REQUIRED", "SAFETY_STOP"]), detail: z.string().min(1).max(500), rfi: splinterRfiSchema.optional() }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter issue classification was rejected.");
    try { return res.json({ ok: true, job: await deps.service.classifyIssue(req.params.id, parsed.data) }); }
    catch { return reject(res, 409, "Splinter issue classification was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/integration/start", async (req, res) => {
    const parsed = z.object({ stagingBaseSha: z.string().regex(/^[a-f0-9]{7,64}$/i), approvedCommitSha: z.string().regex(/^[a-f0-9]{7,64}$/i) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter integration request was rejected.");
    try { return res.json({ ok: true, job: await deps.service.beginIntegration(req.params.id, parsed.data.stagingBaseSha, parsed.data.approvedCommitSha) }); }
    catch { return reject(res, 400, "Splinter integration request was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/integration/result", async (req, res) => {
    const parsed = z.object({ stagingBaseSha: z.string().regex(/^[a-f0-9]{7,64}$/i), approvedCommitSha: z.string().regex(/^[a-f0-9]{7,64}$/i), integratedCandidateSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(), verification: z.array(z.string().min(1).max(256)).max(20).default([]), status: z.enum(["PASSED", "FAILED", "STALE"]), error: z.string().min(1).max(500).optional() }).strict().safeParse(req.body);
    if (!parsed.success || !splinterIntegrationStatusSchema.safeParse(parsed.data.status).success) return reject(res, 400, "Splinter integration result was rejected.");
    try {
      const { integratedCandidateSha, error, ...required } = parsed.data;
      return res.json({ ok: true, job: await deps.service.recordIntegration(req.params.id, { ...required, ...(integratedCandidateSha ? { integratedCandidateSha } : {}), ...(error ? { error } : {}) }) });
    }
    catch { return reject(res, 400, "Splinter integration result was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/deployment/start", async (req, res) => {
    const parsed = z.object({ previousKnownGoodStagingSha: z.string().regex(/^[a-f0-9]{7,64}$/i), requestedCandidateSha: z.string().regex(/^[a-f0-9]{7,64}$/i) }).strict().safeParse(req.body);
    if (!parsed.success) return reject(res, 400, "Splinter deployment request was rejected.");
    try { return res.json({ ok: true, job: await deps.service.beginDeployment(req.params.id, parsed.data.previousKnownGoodStagingSha, parsed.data.requestedCandidateSha) }); }
    catch { return reject(res, 400, "Splinter deployment request was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/deployment/result", async (req, res) => {
    const parsed = z.object({ previousKnownGoodStagingSha: z.string().regex(/^[a-f0-9]{7,64}$/i), requestedCandidateSha: z.string().regex(/^[a-f0-9]{7,64}$/i), actualLiveSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(), deploymentRunId: z.string().min(1).max(128).optional(), verification: z.array(z.string().min(1).max(256)).max(20).default([]), status: z.enum(["PASSED", "FAILED", "ROLLED_BACK", "ROLLBACK_FAILED", "STALE"]), error: z.string().min(1).max(500).optional() }).strict().safeParse(req.body);
    if (!parsed.success || !splinterDeploymentStatusSchema.safeParse(parsed.data.status).success) return reject(res, 400, "Splinter deployment result was rejected.");
    try {
      const { actualLiveSha, deploymentRunId, error, ...required } = parsed.data;
      return res.json({ ok: true, job: await deps.service.recordDeployment(req.params.id, { ...required, ...(actualLiveSha ? { actualLiveSha } : {}), ...(deploymentRunId ? { deploymentRunId } : {}), ...(error ? { error } : {}) }) });
    } catch { return reject(res, 400, "Splinter deployment result was rejected."); }
  });
}
