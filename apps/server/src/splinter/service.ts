import { idSchema, splinterJobStateSchema, splinterReviewSchema, splinterWorkerResultSchema, type SplinterJob, type SplinterJobState, type SplinterReview, type SplinterWorkerResult } from "@nexteam/core";
import type { SplinterRepository } from "./repository.js";

const ALLOWED_TRANSITIONS: Readonly<Record<SplinterJobState, readonly SplinterJobState[]>> = {
  QUEUED: ["RUNNING"],
  RUNNING: ["AWAITING_HUMAN", "SUCCEEDED", "FAILED"],
  AWAITING_HUMAN: ["RUNNING", "FAILED"],
  SUCCEEDED: [],
  FAILED: ["RUNNING"]
};

export type SplinterRunningOwner = "splinter" | "worker";

export interface SplinterTransitionInput {
  action?: string;
  runningOwner?: SplinterRunningOwner;
  errorMessage?: string;
}

export interface SplinterServiceOptions {
  now?: () => string;
}

export class SplinterTransitionError extends Error {
  constructor(
    readonly code: "INVALID_JOB_ID" | "NOT_FOUND" | "INVALID_TRANSITION" | "CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "SplinterTransitionError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function redactWorkerText(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\b(Bearer\s+)[^\s]+/gi, "$1[REDACTED]").replace(/\b(api[_-]?key|token|password|secret|credential|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 500);
}

function transitionPatch(targetState: SplinterJobState, input: SplinterTransitionInput, timestamp: string) {
  switch (targetState) {
    case "RUNNING": {
      const owner = input.runningOwner ?? "worker";
      return {
        state: "RUNNING" as const,
        next: { owner, action: input.action ?? "Continue authorized job work." },
        result: "PENDING" as const,
        lastError: null
      };
    }
    case "AWAITING_HUMAN":
      return {
        state: "AWAITING_HUMAN" as const,
        next: { owner: "human" as const, action: input.action ?? "Human action is required." },
        result: "PENDING" as const
      };
    case "SUCCEEDED":
      return {
        state: "SUCCEEDED" as const,
        next: { owner: "splinter" as const, action: "No further action required." },
        result: "PASS" as const,
        lastError: null
      };
    case "FAILED":
      return {
        state: "FAILED" as const,
        next: { owner: "splinter" as const, action: input.action ?? "Review the sanitized failure before continuing." },
        result: "FAIL" as const,
        lastError: input.errorMessage ? { message: input.errorMessage, at: timestamp } : null
      };
    case "QUEUED":
      throw new SplinterTransitionError("INVALID_TRANSITION", "Jobs cannot transition back to QUEUED.");
  }
}

/** Server-side authority for all Splinter v0 state changes. */
export class SplinterJobService {
  private readonly now: () => string;

  constructor(
    private readonly repository: SplinterRepository,
    options: SplinterServiceOptions = {}
  ) {
    this.now = options.now ?? nowIso;
  }

  async transition(id: string, targetState: SplinterJobState, input: SplinterTransitionInput = {}): Promise<SplinterJob> {
    if (!idSchema.safeParse(id).success) {
      throw new SplinterTransitionError("INVALID_JOB_ID", "A valid Splinter job ID is required.");
    }
    const parsedTargetState = splinterJobStateSchema.parse(targetState);
    const existing = await this.repository.get(id);
    if (!existing) {
      throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    }
    if (!ALLOWED_TRANSITIONS[existing.state].includes(parsedTargetState)) {
      throw new SplinterTransitionError(
        "INVALID_TRANSITION",
        `Splinter job ${id} cannot transition from ${existing.state} to ${parsedTargetState}.`
      );
    }

    const updated = await this.repository.compareAndSet(
      id,
      existing.state,
      transitionPatch(parsedTargetState, input, this.now())
    );
    if (updated) return updated;

    if (!await this.repository.get(id)) {
      throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    }
    throw new SplinterTransitionError("CONFLICT", `Splinter job ${id} changed before its transition could be applied.`);
  }

  async submitWorkerOutcome(id: string, outcome: SplinterWorkerResult): Promise<SplinterJob> {
    const parsed = splinterWorkerResultSchema.parse(outcome);
    const safe = { ...parsed, summary: redactWorkerText(parsed.summary), ...(parsed.error ? { error: redactWorkerText(parsed.error) } : {}) };
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (job.state !== "RUNNING") throw new SplinterTransitionError("INVALID_TRANSITION", "Worker outcomes require a RUNNING Splinter job.");
    const recorded = await this.repository.compareAndSet(id, "RUNNING", { workerResult: safe });
    if (!recorded) throw new SplinterTransitionError("CONFLICT", "Splinter job changed before its worker outcome could be recorded.");
    const target = safe.status;
    return this.transition(id, target, {
      ...(target === "AWAITING_HUMAN" ? { action: "Review the worker's stated human decision." } : {}),
      ...(target === "FAILED" ? { errorMessage: safe.error ?? safe.summary } : {})
    });
  }

  /** Records controller-owned bounded repair evidence without changing job state. */
  async beginWorkerAttempt(id: string, lastCheckFailures: string[] = []): Promise<SplinterJob> {
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (job.state !== "RUNNING" || job.executionMode !== "CODE_CHANGE") {
      throw new SplinterTransitionError("INVALID_TRANSITION", "Only RUNNING code-change jobs can begin an attempt.");
    }
    if (job.attemptCount >= job.maxAttempts) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "The bounded repair attempt limit has been exhausted.");
    }
    const safeFailures = lastCheckFailures.map(redactWorkerText).filter(Boolean).slice(0, 10);
    const updated = await this.repository.compareAndSet(id, "RUNNING", {
      attemptCount: job.attemptCount + 1,
      lastCheckFailures: safeFailures
    });
    if (updated) return updated;
    throw new SplinterTransitionError("CONFLICT", "Splinter job changed before its attempt could begin.");
  }

  async submitReview(id: string, review: SplinterReview): Promise<SplinterJob> {
    const parsed = splinterReviewSchema.parse(review);
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (job.state !== "SUCCEEDED" || !job.workerResult?.commitSha || job.workerResult.commitSha !== parsed.reviewedCommitSha) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "Review evidence does not match a completed autonomous commit.");
    }
    const safe = { ...parsed, summary: redactWorkerText(parsed.summary), blockingFindings: parsed.blockingFindings.map(redactWorkerText), nonBlockingFindings: parsed.nonBlockingFindings.map(redactWorkerText) };
    const updated = await this.repository.update(id, { review: safe });
    if (!updated) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    return updated;
  }
}
