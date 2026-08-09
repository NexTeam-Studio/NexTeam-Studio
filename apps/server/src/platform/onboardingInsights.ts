import type { ProspectIntake, TenantOnboardingBlueprint, TenantOnboardingBlueprintRevision } from "@nexteam/core";

export interface OnboardingPlanInsight {
  kind: "RECOMMENDATION_ONLY";
  blueprintId: string;
  prospectId: string;
  basedOnRevisionId: string;
  recommendations: string[];
  notice: string;
}

/**
 * Converts a saved onboarding plan into review guidance. This function is
 * deliberately pure: it cannot configure modules, alter a plan, or start any
 * external onboarding action.
 */
export function buildOnboardingPlanInsights(
  onboardingPlan: TenantOnboardingBlueprint,
  revision: TenantOnboardingBlueprintRevision,
  intake: ProspectIntake | null
): OnboardingPlanInsight {
  const recommendations: string[] = [];
  if (onboardingPlan.recommendedModules.length) {
    recommendations.push(`Review the proposed modules with the owner: ${onboardingPlan.recommendedModules.join(", ")}.`);
  } else {
    recommendations.push("Confirm which NexTeam modules should be included before subscription selection.");
  }
  if (onboardingPlan.recommendedForms.length === 0) {
    recommendations.push("Confirm whether any intake, inspection, or closeout forms are needed before activation.");
  }
  if (onboardingPlan.recommendedWorkflows.length === 0 && onboardingPlan.recommendedAutomations.length === 0) {
    recommendations.push("Keep the first launch manual unless a reviewed workflow or automation is explicitly accepted.");
  }
  if (intake?.currentSystems.length) {
    recommendations.push("Validate migration timing with the owner; existing systems remain unchanged by this recommendation.");
  }
  if (onboardingPlan.futureOpportunities.length) {
    recommendations.push("Treat future opportunities as post-launch review items, not activation requirements.");
  }
  return {
    kind: "RECOMMENDATION_ONLY",
    blueprintId: onboardingPlan.id,
    prospectId: onboardingPlan.prospectId,
    basedOnRevisionId: revision.id,
    recommendations,
    notice: "Insights are recommendations only. They do not modify the onboarding plan, activate a tenant, configure a module, or contact a provider."
  };
}
