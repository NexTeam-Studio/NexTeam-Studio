import { idSchema, splinterDeploymentSchema, splinterEscalationClassSchema, splinterIntegrationSchema, splinterJobStateSchema, splinterResolutionScopeSchema, splinterReviewSchema, splinterRfiSchema, splinterWorkerResultSchema, type SplinterJob, type SplinterJobState, type SplinterReview, type SplinterWorkerResult } from "@nexteam/core";
import type { SplinterRepository } from "./repository.js";

const ALLOWED_TRANSITIONS: Readonly<Record<SplinterJobState, readonly SplinterJobState[]>> = {
  QUEUED: ["RUNNING"],
  RUNNING: ["AWAITING_HUMAN", "SUCCEEDED", "FAILED"],
  AWAITING_HUMAN: ["RUNNING", "QUEUED", "FAILED"],
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

export interface SplinterIntegrationResult { stagingBaseSha: string; approvedCommitSha: string; integratedCandidateSha?: string; verification?: string[]; status: "PASSED" | "FAILED" | "STALE"; error?: string; }
export interface SplinterDeploymentResult { previousKnownGoodStagingSha: string; requestedCandidateSha: string; actualLiveSha?: string; deploymentRunId?: string; verification?: string[]; status: "PASSED" | "FAILED" | "ROLLED_BACK" | "ROLLBACK_FAILED" | "STALE"; error?: string; }

function requiresRaphaelReview(job: SplinterJob): boolean {
  return job.executionMode === "CODE_CHANGE" && job.reviewRequired;
}

function promotionEligible(job: SplinterJob): boolean {
  return job.executionMode === "CODE_CHANGE" && !job.nonPromotable && !job.id.startsWith("splinter-review-proof-") && job.state === "SUCCEEDED" && job.result === "PASS"
    && job.reviewStatus === "APPROVED" && job.review?.reviewResult === "PASS"
    && Boolean(job.workerResult?.commitSha) && job.workerResult?.commitSha === job.review?.reviewedCommitSha
    && (job.review?.blockingFindings.length ?? 1) === 0 && job.reviewCycleCount <= job.maxReviewCycles;
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
    case "QUEUED": return { state: "QUEUED" as const, next: { owner: "splinter" as const, action: input.action ?? "Resume authorized job work." }, result: "PENDING" as const, lastError: null };
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
    const recorded = await this.repository.compareAndSet(id, "RUNNING", {
      workerResult: safe,
      workerHistory: [...job.workerHistory, safe],
      ...(safe.status === "SUCCEEDED" && requiresRaphaelReview(job) ? {
        reviewStatus: "AWAITING_REVIEW" as const,
        next: { owner: "splinter" as const, action: "Await independent Raphael review." },
        result: "PENDING" as const,
        lastError: null
      } : {})
    });
    if (!recorded) throw new SplinterTransitionError("CONFLICT", "Splinter job changed before its worker outcome could be recorded.");
    if (safe.status === "SUCCEEDED" && requiresRaphaelReview(job)) return recorded;
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
    if (job.state !== "RUNNING" || job.reviewStatus !== "AWAITING_REVIEW" || !job.workerResult?.commitSha || job.workerResult.commitSha !== parsed.reviewedCommitSha) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "Review evidence does not match an autonomous commit awaiting review.");
    }
    const safe = { ...parsed, summary: redactWorkerText(parsed.summary), blockingFindings: parsed.blockingFindings.map(redactWorkerText), nonBlockingFindings: parsed.nonBlockingFindings.map(redactWorkerText) };
    if (job.reviewCycleCount >= job.maxReviewCycles) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "The bounded Raphael review limit has been exhausted.");
    }
    const updated = await this.repository.compareAndSet(id, "RUNNING", {
      review: safe,
      reviewCycleCount: job.reviewCycleCount + 1,
      reviewHistory: [...job.reviewHistory, safe],
      reviewStatus: safe.reviewResult === "PASS" ? "APPROVED" : safe.reviewResult === "REJECT" ? "REJECTED" : "INFRASTRUCTURE_FAILURE",
      next: { owner: "splinter", action: safe.reviewResult === "PASS" ? "Finalize independently approved code change." : "Review is not approved; continue through the controller-owned review path." }
    });
    if (!updated) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    return safe.reviewResult === "PASS" ? this.transition(id, "SUCCEEDED") : updated;
  }

  async recordReviewRepair(id: string, outcome: SplinterWorkerResult): Promise<SplinterJob> {
    const parsed = splinterWorkerResultSchema.parse(outcome);
    const job = await this.repository.get(id);
    if (!job || job.state !== "RUNNING" || job.reviewStatus !== "REJECTED" || job.review?.reviewResult !== "REJECT" || !parsed.commitSha) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "Only a Raphael-rejected job can record a repaired commit.");
    }
    const updated = await this.repository.compareAndSet(id, "RUNNING", {
      workerResult: { ...parsed, summary: redactWorkerText(parsed.summary) },
      workerHistory: [...job.workerHistory, { ...parsed, summary: redactWorkerText(parsed.summary) }],
      reviewStatus: "AWAITING_REVIEW",
      next: { owner: "splinter", action: "Await Raphael review of the repaired commit." }
    });
    if (!updated) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    return updated;
  }

  async beginIntegration(id: string, stagingBaseSha: string, approvedCommitSha: string): Promise<SplinterJob> {
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (!promotionEligible(job) || job.workerResult?.commitSha !== approvedCommitSha || !/^[a-f0-9]{7,64}$/i.test(stagingBaseSha)) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "Splinter job is not eligible for staging integration.");
    }
    const updated = await this.repository.compareAndSet(id, "SUCCEEDED", { integration: { status: "IN_PROGRESS", stagingBaseSha, approvedCommitSha, verification: [] } });
    if (!updated) throw new SplinterTransitionError("CONFLICT", "Splinter job changed before integration could begin.");
    return updated;
  }

  async recordIntegration(id: string, input: SplinterIntegrationResult): Promise<SplinterJob> {
    const parsed = splinterIntegrationSchema.parse({ status: input.status, stagingBaseSha: input.stagingBaseSha, approvedCommitSha: input.approvedCommitSha, ...(input.integratedCandidateSha ? { integratedCandidateSha: input.integratedCandidateSha } : {}), verification: input.verification ?? [], ...(input.error ? { error: redactWorkerText(input.error) } : {}) });
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (job.integration.status !== "IN_PROGRESS" || job.integration.stagingBaseSha !== parsed.stagingBaseSha || job.integration.approvedCommitSha !== parsed.approvedCommitSha) {
      throw new SplinterTransitionError("INVALID_TRANSITION", "Integration result does not match the active Splinter integration.");
    }
    const updated = await this.repository.compareAndSet(id, "SUCCEEDED", { integration: parsed });
    if (!updated) throw new SplinterTransitionError("CONFLICT", "Splinter job changed before integration result could be recorded.");
    return updated;
  }

  async beginDeployment(id: string, previousKnownGoodStagingSha: string, requestedCandidateSha: string): Promise<SplinterJob> {
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (!promotionEligible(job) || job.integration.status !== "PASSED" || job.integration.integratedCandidateSha !== requestedCandidateSha || job.integration.stagingBaseSha !== previousKnownGoodStagingSha) throw new SplinterTransitionError("INVALID_TRANSITION", "Splinter candidate is not eligible for staging deployment.");
    const updated = await this.repository.compareAndSet(id, "SUCCEEDED", { deployment: { status: "DEPLOYING", previousKnownGoodStagingSha, requestedCandidateSha, verification: [] } });
    if (!updated) throw new SplinterTransitionError("CONFLICT", "Splinter job changed before deployment could begin.");
    return updated;
  }

  async recordDeployment(id: string, input: SplinterDeploymentResult): Promise<SplinterJob> {
    const parsed = splinterDeploymentSchema.parse({ status: input.status, previousKnownGoodStagingSha: input.previousKnownGoodStagingSha, requestedCandidateSha: input.requestedCandidateSha, ...(input.actualLiveSha ? { actualLiveSha: input.actualLiveSha } : {}), ...(input.deploymentRunId ? { deploymentRunId: input.deploymentRunId } : {}), verification: input.verification ?? [], ...(input.error ? { error: redactWorkerText(input.error) } : {}) });
    const job = await this.repository.get(id);
    if (!job) throw new SplinterTransitionError("NOT_FOUND", `Splinter job ${id} was not found.`);
    if (job.deployment.status !== "DEPLOYING" || job.deployment.previousKnownGoodStagingSha !== parsed.previousKnownGoodStagingSha || job.deployment.requestedCandidateSha !== parsed.requestedCandidateSha) throw new SplinterTransitionError("INVALID_TRANSITION", "Deployment result does not match the active Splinter deployment.");
    const updated = await this.repository.compareAndSet(id, "SUCCEEDED", { deployment: parsed });
    if (!updated) throw new SplinterTransitionError("CONFLICT", "Splinter job changed before deployment result could be recorded.");
    return updated;
  }

  async classifyIssue(id: string, input: { classification: "AUTONOMOUS" | "EXTERNAL_BLOCKER" | "OWNER_REQUIRED" | "SAFETY_STOP"; detail: string; rfi?: unknown }): Promise<SplinterJob> {
    const classification = splinterEscalationClassSchema.parse(input.classification);
    const detail = redactWorkerText(input.detail);
    const job = await this.repository.get(id);
    if (!job || job.state !== "RUNNING") throw new SplinterTransitionError("INVALID_TRANSITION", "Only RUNNING jobs can be classified.");
    if (classification === "OWNER_REQUIRED") {
      const rfi = splinterRfiSchema.parse(input.rfi);
      if (rfi.jobId !== id || rfi.category !== "OWNER_REQUIRED" || rfi.resolvedAt) throw new SplinterTransitionError("INVALID_TRANSITION", "Owner RFI does not match the active job.");
      const updated = await this.repository.compareAndSet(id, "RUNNING", { state: "AWAITING_HUMAN", next: { owner: "human", action: rfi.decisionNeeded }, result: "PENDING", escalation: { classification, detail }, rfi });
      if (updated) return updated;
      throw new SplinterTransitionError("CONFLICT", "Job changed before RFI could be recorded.");
    }
    const patch = classification === "SAFETY_STOP"
      ? { state: "FAILED" as const, result: "FAIL" as const, next: { owner: "splinter" as const, action: "Safety stop: do not continue." }, lastError: { message: detail, at: this.now() }, escalation: { classification, detail } }
      : { escalation: { classification, detail }, next: { owner: "splinter" as const, action: classification === "EXTERNAL_BLOCKER" ? "External blocker: recheck safely." : "Continue through authorized autonomous rail." } };
    const updated = await this.repository.compareAndSet(id, "RUNNING", patch);
    if (updated) return updated;
    throw new SplinterTransitionError("CONFLICT", "Job changed before issue classification could be recorded.");
  }

  async resolveOwnerRfi(id: string, input: { rfiId: string; resolution: string; resolutionScope: "JOB_ONLY" | "MODULE" | "TENANT" | "GLOBAL" }): Promise<SplinterJob> {
    const scope = splinterResolutionScopeSchema.parse(input.resolutionScope);
    const job = await this.repository.get(id);
    if (!job || job.state !== "AWAITING_HUMAN" || !job.rfi || job.rfi.rfiId !== input.rfiId || job.rfi.resolvedAt) throw new SplinterTransitionError("INVALID_TRANSITION", "No unresolved owner RFI is available for this job.");
    if (!job.rfi.options.some((option) => option.id === input.resolution)) throw new SplinterTransitionError("INVALID_TRANSITION", "Owner resolution is not one of the recorded options.");
    const updated = await this.repository.compareAndSet(id, "AWAITING_HUMAN", { state: "QUEUED", next: { owner: "splinter", action: `Resume with owner decision: ${input.resolution}` }, result: "PENDING", escalation: { classification: "AUTONOMOUS", detail: "Owner decision recorded; resume authorized work." }, rfi: { ...job.rfi, resolution: input.resolution, resolutionScope: scope, resolvedAt: this.now() } });
    if (updated) return updated;
    throw new SplinterTransitionError("CONFLICT", "Job changed before owner resolution could be recorded.");
  }
}
