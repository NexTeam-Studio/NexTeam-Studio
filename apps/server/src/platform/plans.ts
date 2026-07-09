import type { PlatformModule, PlatformPlan, TenantPlan } from "@nexteam/core";

export const PLATFORM_PLANS: Record<TenantPlan, PlatformPlan> = {
  nexi: {
    id: "nexi",
    name: "Nexi",
    monthlyUsd: 149,
    modules: ["nexi", "crm", "fielddocs", "comms"]
  },
  marketing: {
    id: "marketing",
    name: "Marketing",
    monthlyUsd: 399,
    modules: ["nexi", "crm", "fielddocs", "comms", "content", "campaigns", "reputation", "sites"]
  },
  suite: {
    id: "suite",
    name: "Suite",
    monthlyUsd: 799,
    modules: ["nexi", "crm", "fielddocs", "scheduling", "content", "campaigns", "reputation", "comms", "voice", "platform", "evaporation", "sites"]
  }
};

export function modulesForPlan(plan: TenantPlan): Set<PlatformModule> {
  return new Set(PLATFORM_PLANS[plan].modules);
}
