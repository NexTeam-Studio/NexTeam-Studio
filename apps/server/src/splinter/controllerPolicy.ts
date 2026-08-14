import type { SplinterJob, SplinterJobState } from "@nexteam/core";

/**
 * Controller-owned, deterministic policy for critical Splinter lifecycle choices.
 * It deliberately consumes persisted job state and caller-supplied evidence only;
 * it never grants repository, deployment, owner, or production authority.
 */
export type SplinterLifecycleDecision =
  | "STATE_TRANSITION"
  | "STAGING_INTEGRATION"
  | "STAGING_DEPLOYMENT"
  | "WORK_COMPLETION"
  | "ISSUE_CLASSIFICATION"
  | "PRODUCTION_TRANSITION"
  | "CONTROLLER_POLICY_CHANGE"
  | "TERMINAL_RETURN";

/**
 * The only statuses that may be shown as a terminal controller hand-off.  This
 * deliberately has no generic "in progress" value: active work remains owned
 * by the controller until one of these durable outcomes is true.
 */
export type SplinterTerminalReturnStatus =
  | "COMPLETE"
  | "OWNER_REQUIRED"
  | "EXTERNAL_BLOCKER"
  | "SAFETY_STOP"
  | "FAIL";

export interface SplinterAdjudicationInput {
  decision: SplinterLifecycleDecision;
  targetState?: SplinterJobState;
  evidenceRefs?: readonly string[];
  classification?: "AUTONOMOUS" | "EXTERNAL_BLOCKER" | "OWNER_REQUIRED" | "SAFETY_STOP";
  supportingDetail?: string;
  explicitProductionAuthority?: boolean;
  ownerAuthorizedControlPlaneWorkItem?: boolean;
  controllerOwnedPolicyPath?: boolean;
  returnStatus?: SplinterTerminalReturnStatus;
  /** Evidence from the executor that a safe, authorized next action exists. */
  authorizedNextAction?: string;
}

export interface SplinterAdjudication {
  allowed: boolean;
  reason: string;
  requiredAction?: string;
}

const allow = (reason: string): SplinterAdjudication => ({ allowed: true, reason });
const deny = (reason: string, requiredAction: string): SplinterAdjudication => ({ allowed: false, reason, requiredAction });

function hasAuthorizedRepairCapacity(job: SplinterJob): boolean {
  return job.executionMode === "CODE_CHANGE"
    && job.reviewStatus === "REJECTED"
    && job.review?.reviewResult === "REJECT"
    && job.attemptCount < job.maxAttempts;
}

export function hasStoredStagingAuthority(job: SplinterJob): boolean {
  return job.workItemContext?.promotionPolicy === "STAGING_ONLY";
}

function completeAcceptanceEvidence(job: SplinterJob, evidenceRefs: readonly string[] = []): boolean {
  const requiredEvidenceCount = Math.max(1, job.acceptanceCriteria.length);
  return evidenceRefs.filter((reference) => reference.trim().length > 0).length >= requiredEvidenceCount;
}

function inherentContinuation(job: SplinterJob): string | undefined {
  if (job.executionMode === "CODE_CHANGE" && job.reviewStatus === "AWAITING_REVIEW") return "Raphael review";
  if (hasAuthorizedRepairCapacity(job)) return "authorized repair cycle";
  if (job.state === "SUCCEEDED" && job.result === "PASS" && hasStoredStagingAuthority(job) && job.deployment.status !== "PASSED") return "staging deployment";
  if ((job.state === "QUEUED" || job.state === "RUNNING" || job.state === "SUCCEEDED") && job.next.action !== "No further action required.") return job.next.action;
  return undefined;
}

/**
 * The sole policy authority for terminal, escalation, promotion, completion, and
 * production decisions. Callers must persist the resulting state separately.
 */
export function adjudicateSplinterLifecycle(job: SplinterJob, input: SplinterAdjudicationInput): SplinterAdjudication {
  switch (input.decision) {
    case "STATE_TRANSITION":
      if (input.targetState === "FAILED" && job.executionMode === "CODE_CHANGE" && job.reviewStatus === "AWAITING_REVIEW") {
        return deny("An independent Raphael review is still authorized and pending.", "Preserve the review path until Raphael records PASS, REJECT, or an infrastructure failure.");
      }
      if (input.targetState === "FAILED" && hasAuthorizedRepairCapacity(job)) {
        return deny("Raphael rejected the current change and an authorized repair attempt remains.", "Record a bounded repair attempt and submit the repaired commit for Raphael review.");
      }
      if (input.targetState === "SUCCEEDED" && job.executionMode === "CODE_CHANGE" && job.reviewStatus !== "APPROVED") {
        return deny("A code change cannot complete without Raphael PASS evidence.", "Obtain matching independent Raphael approval.");
      }
      return allow("The requested state transition has no outstanding controller-policy blocker.");

    case "STAGING_INTEGRATION":
    case "STAGING_DEPLOYMENT":
      if (!hasStoredStagingAuthority(job)) {
        return deny("Staging progression requires STAGING_ONLY authority from the stored approved work item.", "Use an owner-authorized work item with STAGING_ONLY promotion policy.");
      }
      return allow("Stored work-item staging authority permits controller-validated staging progression.");

    case "WORK_COMPLETION":
      if (job.state !== "SUCCEEDED" || job.result !== "PASS") {
        return deny("The linked job is not successfully complete.", "Complete the linked job through its authorized lifecycle.");
      }
      if (!completeAcceptanceEvidence(job, input.evidenceRefs)) {
        return deny("Acceptance evidence is incomplete for the stored acceptance criteria.", "Record evidence for every acceptance criterion before completing the work item.");
      }
      return allow("Stored successful job state and complete acceptance evidence permit work completion.");

    case "ISSUE_CLASSIFICATION":
      if (input.classification !== "SAFETY_STOP" && job.executionMode === "CODE_CHANGE" && job.reviewStatus === "AWAITING_REVIEW") {
        return deny("An independent Raphael review remains before a non-safety escalation can be claimed.", "Preserve the review path until Raphael records its deterministic result.");
      }
      if (input.classification === "OWNER_REQUIRED") {
        const rfi = job.rfi;
        if (!rfi || rfi.jobId !== job.id || rfi.category !== "OWNER_REQUIRED" || rfi.resolvedAt || !rfi.blocking) {
          return deny("OWNER_REQUIRED requires an unresolved blocking RFI tied to this job.", "Record a valid owner RFI before claiming an owner-required transition.");
        }
      }
      if (input.classification === "EXTERNAL_BLOCKER" && !(input.supportingDetail ?? "").trim()) {
        return deny("EXTERNAL_BLOCKER requires deterministic supporting detail.", "Record the external dependency evidence before claiming a blocker.");
      }
      return allow("The escalation classification has the required deterministic supporting state or evidence.");

    case "PRODUCTION_TRANSITION":
      if (!input.explicitProductionAuthority) {
        return deny("Production transition is denied without explicit production authority.", "Obtain explicit production authority through the control plane.");
      }
      return allow("Explicit production authority is present; apply the separate production controls.");

    case "CONTROLLER_POLICY_CHANGE":
      if (!input.controllerOwnedPolicyPath || !input.ownerAuthorizedControlPlaneWorkItem) {
        return deny("Critical policy changes require a controller-owned path and owner-authorized control-plane work item.", "Use an owner-authorized control-plane work item in the controller policy path.");
      }
      return allow("The critical policy change is controller-owned and owner-authorized.");

    case "TERMINAL_RETURN": {
      const requested = input.returnStatus;
      if (!requested) return deny("A terminal return must name a durable terminal status.", "Use COMPLETE, OWNER_REQUIRED, EXTERNAL_BLOCKER, SAFETY_STOP, or FAIL.");
      if (requested === "OWNER_REQUIRED") {
        const rfi = job.rfi;
        if (job.state !== "AWAITING_HUMAN" || !rfi || rfi.category !== "OWNER_REQUIRED" || rfi.resolvedAt || !rfi.blocking) {
          return deny("OWNER_REQUIRED requires an active unresolved owner RFI.", "Record the blocking owner RFI before returning OWNER_REQUIRED.");
        }
        return allow("A durable unresolved owner RFI permits OWNER_REQUIRED.");
      }
      if (requested === "EXTERNAL_BLOCKER") {
        if (job.escalation?.classification !== "EXTERNAL_BLOCKER") return deny("EXTERNAL_BLOCKER requires persisted external dependency evidence.", "Classify and record the external blocker before returning it.");
        return allow("A persisted external blocker permits the terminal return.");
      }
      if (requested === "SAFETY_STOP") {
        if (job.escalation?.classification !== "SAFETY_STOP") return deny("SAFETY_STOP requires a persisted safety classification.", "Record the safety boundary before returning it.");
        return allow("A persisted safety boundary permits the terminal return.");
      }
      const continuation = input.authorizedNextAction?.trim() || inherentContinuation(job);
      if (continuation) {
        return deny(`Terminal return is denied while an authorized executable next action remains: ${continuation}.`, "Continue the authorized action instead of returning a nonterminal status.");
      }
      if (requested === "COMPLETE") {
        if (job.state !== "SUCCEEDED" || job.result !== "PASS") return deny("COMPLETE requires a persisted PASS job result.", "Finish the job and record PASS before returning COMPLETE.");
        return allow("The job has a durable PASS result and no authorized continuation.");
      }
      if (job.state !== "FAILED" || job.result !== "FAIL") return deny("FAIL requires a durable failed job result.", "Exhaust authorized repair paths and persist FAIL before returning it.");
      return allow("The job has a durable failed result and no authorized continuation.");
    }
  }
}
