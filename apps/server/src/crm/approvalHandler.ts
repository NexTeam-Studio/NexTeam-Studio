import { RailError, type ApprovalItem, type CRMProvider } from "@nexteam/core";
import type { JobLifecycleService } from "./jobLifecycle.js";
import type { LedgerService } from "./ledgerFoundation.js";

export interface CrmApprovalContext {
  provider: CRMProvider;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: LedgerService | undefined;
}

export interface CrmApprovalHandler {
  operations: readonly string[];
  execute(item: ApprovalItem, context: CrmApprovalContext): Promise<unknown>;
}

export function requireJobLifecycleService(context: CrmApprovalContext): JobLifecycleService {
  if (!context.jobLifecycleService) {
    throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "jobLifecycle", status: 501 });
  }
  return context.jobLifecycleService;
}

export function requireLedgerService(context: CrmApprovalContext): LedgerService {
  if (!context.ledgerService) {
    throw new RailError("Ledger approval execution is not wired for this tenant yet.", { provider: "native", op: "performLedgerAction", status: 501 });
  }
  return context.ledgerService;
}
