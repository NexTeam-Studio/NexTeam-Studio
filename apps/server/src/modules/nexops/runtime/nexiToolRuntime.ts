import { RailError, type ApprovalQueueService, type CRMProvider, type Source } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../comms/gmailRegistry.js";
import type { PlatformRepository } from "../../../platform/repository.js";
import type { JobLifecycleService } from "../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { LedgerService } from "../areas/invoices/components/paymentRails/server/ledgerService.js";
import type { OperationsHubService } from "../areas/home/components/operationsHub/server/operationsHubService.js";
import type { PortalHubService } from "../../nexportal/components/portalCore/server/portalHubService.js";
import type { ReviewSequenceService } from "../../../reputation/reviewSequenceService.js";

export interface CrmReadToolOptions {
  requestRepository?: NativeCrmRepository | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
  commsRail?: CommsRail | undefined;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: Pick<LedgerService, "listInvoices"> | undefined;
  operationsHubService?: OperationsHubService | undefined;
  portalHubService?: PortalHubService | undefined;
  reviewSequenceService?: ReviewSequenceService | undefined;
}

function source(ref: string, label: string, rail: Source["rail"] = "native"): Source {
  return { rail, ref, label };
}

export function createCrmToolContext(
  provider: CRMProvider,
  approvalQueue: ApprovalQueueService | undefined,
  options: CrmReadToolOptions = {}
) {
  return {
    RailError,
    approvalQueue: approvalQueue as ApprovalQueueService,
    options,
    provider,
    source
  };
}

export type CrmToolContext = ReturnType<typeof createCrmToolContext>;
