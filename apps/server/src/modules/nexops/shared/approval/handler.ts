import { RailError, type ApprovalItem, type CRMProvider } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { JobLifecycleService } from "../../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { LedgerService } from "../../areas/invoices/components/paymentRails/server/ledgerService.js";

export interface CrmApprovalContext {
  provider: CRMProvider;
  crmRepository?: NativeCrmRepository | undefined;
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
