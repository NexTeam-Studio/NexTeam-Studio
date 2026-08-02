import { RailError, type ApprovalExecutor, type ApprovalItem, type CRMProvider } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { JobLifecycleService } from "../../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { LedgerService } from "../../areas/invoices/components/paymentRails/server/ledgerService.js";
import type { CrmApprovalContext, CrmApprovalHandler } from "./handler.js";
import { contactApprovalHandler } from "../../areas/clients/components/contact/server/approvalHandler.js";
import { quoteEngineApprovalHandler } from "../../areas/quotes/components/quoteEngine/server/approvalHandler.js";
import { jobCoreApprovalHandler } from "../../areas/jobs/components/jobCore/server/approvalHandler.js";
import { visitCoreApprovalHandler } from "../../areas/visits/components/visitCore/server/approvalHandler.js";
import { invoiceStructureApprovalHandler } from "../../areas/invoices/components/invoiceStructure/server/approvalHandler.js";
import { paymentRailsApprovalHandler } from "../../areas/invoices/components/paymentRails/server/approvalHandler.js";

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

  constructor(provider: CRMProvider, jobLifecycleService?: JobLifecycleService, ledgerService?: LedgerService, crmRepository?: NativeCrmRepository) {
    this.context = { provider, jobLifecycleService, ledgerService, crmRepository };
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
