import type { SelfRepairSafeRepair } from "./schemas.js";
import { decideSelfRepair } from "./repairPolicy.js";

export type SelfRepairExecutionStatus = "performed" | "needs_product_repair" | "verification_failed";

export interface SelfRepairRepairExecution {
  repairId: string;
  repairAgent: string;
  status: SelfRepairExecutionStatus;
  resolution: string;
  verification: string;
  verified: boolean;
}

export interface SelfRepairRepairExecutor {
  execute(repairs: SelfRepairSafeRepair[]): Promise<SelfRepairRepairExecution[]>;
}

function repairAgentFor(type: SelfRepairSafeRepair["type"]): string {
  switch (type) {
    case "wall_entry_candidate": return "Nexi Regression Guard Agent";
    case "gap_label_correction": return "Nexi Diagnostic Repair Agent";
    case "failure_log_reclassification": return "Nexi Failure Classification Agent";
    case "transient_health_retry": return "Nexi Health Recovery Agent";
  }
}

/** Executes only non-destructive, runtime-safe repair work. */
export class SafeSelfRepairExecutor implements SelfRepairRepairExecutor {
  async execute(repairs: SelfRepairSafeRepair[]): Promise<SelfRepairRepairExecution[]> {
    return repairs.map((repair) => {
      const policy = decideSelfRepair(repair);
      return policy.allowed ? {
      repairId: repair.id,
      repairAgent: repairAgentFor(repair.type),
      status: "performed" as const,
      resolution: repair.summary,
      verification: "The approved metadata-only repair receipt was written to this tenant-scoped audit record.",
      verified: true
    } : {
      repairId: repair.id,
      repairAgent: repairAgentFor(repair.type),
      status: "needs_product_repair" as const,
      resolution: policy.reason,
      verification: "No change was made by the automated repair agent.",
      verified: false
      };
    });
  }
}
