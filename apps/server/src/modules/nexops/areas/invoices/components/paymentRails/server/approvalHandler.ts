
import { RailError } from "@nexteam/core";
import * as contracts from "../../../../../../../crm/approvalContracts.js";
import { requireLedgerService, type CrmApprovalHandler } from "../../../../../../../crm/approvalHandler.js";

const {
  performLedgerActionApprovalArgsSchema,
  collectInvoicePaymentApprovalArgsSchema
} = contracts;

export const paymentRailsApprovalHandler: CrmApprovalHandler = {
  operations: ["recordInvoicePayment","performLedgerAction"],
  async execute(item, context) {
    switch (item.execute.op) {
      case "recordInvoicePayment": {
        const ledgerService = requireLedgerService(context);
        const args = collectInvoicePaymentApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId) {
                throw new RailError("Approved payment collection targets a different tenant.", { provider: "native", op: "recordInvoicePayment", status: 403 });
              }
              return ledgerService.recordInvoicePayment({
                tenantId: args.tenantId,
                invoiceId: args.invoiceId,
                amount: args.amount,
                provider: args.provider,
                method: args.method,
                actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
                ...(args.note?.trim() ? { note: args.note.trim() } : {}),
                ...(args.savedCardId ? { savedCardId: args.savedCardId } : {}),
                ...(args.methodDetails ? { methodDetails: args.methodDetails } : {}),
                ...(args.status ? { status: args.status } : {})
              });
      }
      case "performLedgerAction": {
        const ledgerService = requireLedgerService(context);
        const ledgerArgs = performLedgerActionApprovalArgsSchema.parse(item.execute.args);
        if (ledgerArgs.tenantId !== item.tenantId) {
          throw new RailError("Approved ledger action targets a different tenant.", { provider: "native", op: "performLedgerAction", status: 403 });
        }
        return ledgerService.performLedgerAction({
              tenantId: ledgerArgs.tenantId,
              action: ledgerArgs.action,
              ...(ledgerArgs.paymentId ? { paymentId: ledgerArgs.paymentId } : {}),
              ...(ledgerArgs.invoiceId ? { invoiceId: ledgerArgs.invoiceId } : {}),
              ...(ledgerArgs.amount !== undefined ? { amount: ledgerArgs.amount } : {}),
              ...(ledgerArgs.reason ? { reason: ledgerArgs.reason } : {}),
              actorId: ledgerArgs.actorId ?? item.decidedBy ?? item.createdBy
            });
}
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
