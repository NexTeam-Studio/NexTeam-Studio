import type { SplinterJob, SplinterJobState } from "@nexteam/core";
import {
  adjudicateSplinterLifecycle,
  hasStoredStagingAuthority,
  type SplinterAdjudication,
  type SplinterAdjudicationInput
} from "./controllerPolicy.js";

/**
 * The only runtime entry point for critical Splinter lifecycle policy.
 * Feature services may request a decision, but cannot implement or bypass one.
 */
export class SplinterLifecycleController {
  authorizeTransition(job: SplinterJob, targetState: SplinterJobState): SplinterAdjudication {
    return this.adjudicate(job, { decision: "STATE_TRANSITION", targetState });
  }

  authorizeStagingIntegration(job: SplinterJob): SplinterAdjudication {
    return this.adjudicate(job, { decision: "STAGING_INTEGRATION" });
  }

  authorizeStagingDeployment(job: SplinterJob): SplinterAdjudication {
    return this.adjudicate(job, { decision: "STAGING_DEPLOYMENT" });
  }

  authorizeWorkCompletion(job: SplinterJob, evidenceRefs: readonly string[]): SplinterAdjudication {
    return this.adjudicate(job, { decision: "WORK_COMPLETION", evidenceRefs });
  }

  authorizeIssueClassification(
    job: SplinterJob,
    classification: "AUTONOMOUS" | "EXTERNAL_BLOCKER" | "OWNER_REQUIRED" | "SAFETY_STOP",
    supportingDetail: string
  ): SplinterAdjudication {
    return this.adjudicate(job, { decision: "ISSUE_CLASSIFICATION", classification, supportingDetail });
  }

  authorizeProductionTransition(job: SplinterJob, explicitProductionAuthority: boolean): SplinterAdjudication {
    return this.adjudicate(job, { decision: "PRODUCTION_TRANSITION", explicitProductionAuthority });
  }

  authorizeControllerPolicyChange(job: SplinterJob, ownerAuthorizedControlPlaneWorkItem: boolean): SplinterAdjudication {
    return this.adjudicate(job, {
      decision: "CONTROLLER_POLICY_CHANGE",
      controllerOwnedPolicyPath: true,
      ownerAuthorizedControlPlaneWorkItem
    });
  }

  hasStagingAuthority(job: SplinterJob): boolean {
    return hasStoredStagingAuthority(job);
  }

  private adjudicate(job: SplinterJob, input: SplinterAdjudicationInput): SplinterAdjudication {
    return adjudicateSplinterLifecycle(job, input);
  }
}

export const splinterLifecycleController = new SplinterLifecycleController();
