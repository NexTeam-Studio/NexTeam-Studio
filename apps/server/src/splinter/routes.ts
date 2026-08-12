import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { idSchema, splinterExecutionModeSchema, splinterRepairProofInjectionSchema, splinterRequiredCheckSchema, splinterReviewSchema, splinterWorkerResultSchema } from "@nexteam/core";
import { z } from "zod";
import type { SplinterRepository } from "./repository.js";
import type { SplinterJobService } from "./service.js";

export interface SplinterRelayRouteDeps { repository: SplinterRepository; service: SplinterJobService; env?: NodeJS.ProcessEnv; }

function authorized(req: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env.SPLINTER_RELAY_SERVICE_TOKEN?.trim();
  const received = req.header("x-splinter-relay-token")?.trim();
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

function queuedProjection(job: { id: string; goal: string; executionMode: string; allowedPaths: string[]; acceptanceCriteria: string[]; requiredChecks: string[]; attemptCount: number; maxAttempts: number; lastCheckFailures: string[]; repairProofInjection?: string | undefined; state: string; result: string; next: { owner: string; action: string }; createdAt: string; updatedAt: string }) {
  return { id: job.id, goal: job.goal, executionMode: job.executionMode, allowedPaths: job.allowedPaths, acceptanceCriteria: job.acceptanceCriteria, requiredChecks: job.requiredChecks, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts, lastCheckFailures: job.lastCheckFailures, repairProofInjection: job.repairProofInjection, state: job.state, result: job.result, next: job.next, createdAt: job.createdAt, updatedAt: job.updatedAt };
}

/** Backend-only relay boundary. It delegates all state changes to SplinterJobService. */
export function registerSplinterRelayRoutes(app: Express, deps: SplinterRelayRouteDeps): void {
  const env = deps.env ?? process.env;
  app.use("/api/internal/splinter", (req, res, next) => authorized(req, env) ? next() : reject(res, 401, "Splinter relay authorization is required."));
  app.post("/api/internal/splinter/jobs", async (req, res) => {
    try {
      const input = splinterJobCreateRequestSchema.parse(req.body);
      const job = await deps.repository.create({
        id: input.id ?? createJobId(),
        goal: input.goal,
        executionMode: input.executionMode,
        allowedPaths: input.allowedPaths,
        acceptanceCriteria: input.acceptanceCriteria,
        requiredChecks: input.requiredChecks,
        attemptCount: 0,
        maxAttempts: input.executionMode === "CODE_CHANGE" ? 3 : 1,
        lastCheckFailures: [],
        ...(input.repairProofInjection ? { repairProofInjection: input.repairProofInjection } : {}),
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
}
