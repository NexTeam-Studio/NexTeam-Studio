import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { splinterWorkerResultSchema } from "@nexteam/core";
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

/** Backend-only relay boundary. It delegates all state changes to SplinterJobService. */
export function registerSplinterRelayRoutes(app: Express, deps: SplinterRelayRouteDeps): void {
  const env = deps.env ?? process.env;
  app.use("/api/internal/splinter", (req, res, next) => authorized(req, env) ? next() : reject(res, 401, "Splinter relay authorization is required."));
  app.get("/api/internal/splinter/jobs/:id", async (req, res) => {
    const job = await deps.repository.get(req.params.id);
    return job ? res.json({ ok: true, job }) : reject(res, 404, "Splinter job was not found.");
  });
  app.post("/api/internal/splinter/jobs/:id/claim", async (req, res) => {
    try { return res.json({ ok: true, job: await deps.service.transition(req.params.id, "RUNNING") }); }
    catch (error) { return reject(res, error instanceof Error && error.name === "SplinterTransitionError" ? 409 : 400, "Splinter job claim was rejected."); }
  });
  app.post("/api/internal/splinter/jobs/:id/outcome", async (req, res) => {
    try { return res.json({ ok: true, job: await deps.service.submitWorkerOutcome(req.params.id, splinterWorkerResultSchema.parse(req.body)) }); }
    catch { return reject(res, 400, "Splinter worker outcome was rejected."); }
  });
}
