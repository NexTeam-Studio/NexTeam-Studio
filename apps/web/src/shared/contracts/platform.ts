export interface PlatformPlan {
  id: "nexi" | "marketing" | "suite";
  name: string;
  monthlyUsd: number;
  modules: string[];
}

export interface PlatformTenantRow {
  tenant: {
    id: string;
    name: string;
    plan: "nexi" | "marketing" | "suite";
    lifecycleState?: "ACTIVE" | "DISABLED_ARCHIVED";
    lifecycleUpdatedAt?: string;
  };
  plan: PlatformPlan;
  modules: string[];
  subscription?: {
    status: string;
    stripeSubscriptionId?: string;
  } | null;
  adapterStatuses: Array<{
    adapter: string;
    provider: string;
    configured: boolean;
    ok: boolean;
    detail?: string;
  }>;
  cost: {
    estimatedCostUsd: number;
    usageLogCount: number;
  };
}

export interface PlatformTenantResponse {
  ok: boolean;
  tenants?: PlatformTenantRow[];
  error?: string;
}

export interface PlatformPlansResponse {
  ok: boolean;
  plans?: PlatformPlan[];
  error?: string;
}
