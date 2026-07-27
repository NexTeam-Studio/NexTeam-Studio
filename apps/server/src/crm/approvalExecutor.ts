import { RailError, type ApprovalExecutor, type ApprovalItem, type CRMProvider } from "@nexteam/core";
import type { JobLifecycleService } from "./jobLifecycle.js";
import type { LedgerService } from "./ledgerFoundation.js";
import type { CrmApprovalContext, CrmApprovalHandler } from "./approvalHandler.js";
import { contactApprovalHandler } from "../modules/nexops/areas/clients/components/contact/server/approvalHandler.js";
import { quoteEngineApprovalHandler } from "../modules/nexops/areas/quotes/components/quoteEngine/server/approvalHandler.js";
import { jobCoreApprovalHandler } from "../modules/nexops/areas/jobs/components/jobCore/server/approvalHandler.js";
import { visitCoreApprovalHandler } from "../modules/nexops/areas/visits/components/visitCore/server/approvalHandler.js";
import { invoiceStructureApprovalHandler } from "../modules/nexops/areas/invoices/components/invoiceStructure/server/approvalHandler.js";
import { paymentRailsApprovalHandler } from "../modules/nexops/areas/invoices/components/paymentRails/server/approvalHandler.js";

const handlers: readonly CrmApprovalHandler[] = [
  contactApprovalHandler,
  quoteEngineApprovalHandler,
  jobCoreApprovalHandler,
  visitCoreApprovalHandler,
  invoiceStructureApprovalHandler,
  paymentRailsApprovalHandler,
];

export class CrmApprovalExecutor implements ApprovalExecutor {
  private readonly context: CrmApprovalContext;

  constructor(provider: CRMProvider, jobLifecycleService?: JobLifecycleService, ledgerService?: LedgerService) {
    this.context = { provider, jobLifecycleService, ledgerService };
  }

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "crm") {
      throw new RailError("CRM approval executor received an unsupported approval item.", { provider: "native", op: "approvalExecute", status: 400 });
    }
    const handler = handlers.find((candidate) => candidate.operations.includes(item.execute.op));
    if (!handler) {
      throw new RailError("CRM approval executor received an unsupported approval item.", { provider: "native", op: "approvalExecute", status: 400 });
    }
    return handler.execute(item, this.context);
  }
}
