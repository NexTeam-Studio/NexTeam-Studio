
import { RailError } from "@nexteam/core";
import * as contracts from "../../../../../../../crm/approvalContracts.js";
import { requireLedgerService, type CrmApprovalHandler } from "../../../../../../../crm/approvalHandler.js";

const {
  composeInvoiceFromJobsApprovalArgsSchema,
  sendInvoiceApprovalArgsSchema,
  sendReceiptReviewApprovalArgsSchema
} = contracts;

export const invoiceStructureApprovalHandler: CrmApprovalHandler = {
  operations: ["composeInvoiceFromJobs","sendInvoice","sendReceiptReview"],
  async execute(item, context) {
    switch (item.execute.op) {
      case "composeInvoiceFromJobs": {
        const ledgerService = requireLedgerService(context);
        const args = composeInvoiceFromJobsApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId) {
                throw new RailError("Approved invoice compose action targets a different tenant.", { provider: "native", op: "composeInvoiceFromJobs", status: 403 });
              }
              const result = await ledgerService.composeInvoiceFromJobs({
                tenantId: args.tenantId,
                jobIds: args.jobIds,
                actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
                ...(args.title?.trim() ? { title: args.title.trim() } : {}),
                ...(args.discount ? { discount: args.discount } : {}),
                ...(args.taxRate !== undefined ? { taxRate: args.taxRate } : {}),
                ...(args.terms !== undefined ? { terms: args.terms } : {}),
                ...(args.paymentSchedule ? { paymentSchedule: args.paymentSchedule } : {})
              });
              if (context.jobLifecycleService) {
                for (const job of result.jobs) {
                  await context.jobLifecycleService.markInvoiceCreated({
                    tenantId: args.tenantId,
                    jobId: job.id,
                    invoiceId: result.invoice.id,
                    actorId: args.actorId ?? item.decidedBy ?? item.createdBy
                  });
                }
              }
              return result;
      }
      case "sendInvoice": {
        const ledgerService = requireLedgerService(context);
        const args = sendInvoiceApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId) {
                throw new RailError("Approved invoice send action targets a different tenant.", { provider: "native", op: "sendInvoice", status: 403 });
              }
              return ledgerService.sendInvoice({
                tenantId: args.tenantId,
                invoiceId: args.invoiceId,
                actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
                mode: args.mode,
                ...(args.target?.trim() ? { target: args.target.trim() } : {}),
                ...(args.note?.trim() ? { note: args.note.trim() } : {}),
                ...(args.subject?.trim() ? { subject: args.subject.trim() } : {}),
                ...(args.includePdf !== undefined ? { includePdf: args.includePdf } : {}),
                ...(args.includeSummary !== undefined ? { includeSummary: args.includeSummary } : {}),
                ...(args.includePayLink !== undefined ? { includePayLink: args.includePayLink } : {}),
                ...(args.includeHostedLink !== undefined ? { includeHostedLink: args.includeHostedLink } : {}),
                publicBaseUrl: args.publicBaseUrl
              });
      }
      case "sendReceiptReview": {
        const ledgerService = requireLedgerService(context);
        const args = sendReceiptReviewApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId) {
                throw new RailError("Approved receipt review send targets a different tenant.", { provider: "native", op: "sendReceiptReview", status: 403 });
              }
              return ledgerService.sendReceiptReview({
                tenantId: args.tenantId,
                receiptReviewId: args.receiptReviewId,
                actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
                publicBaseUrl: args.publicBaseUrl,
                ...(args.subject !== undefined ? { subject: args.subject } : {}),
                ...(args.bodyText !== undefined ? { bodyText: args.bodyText } : {}),
                ...(args.emailRecipients !== undefined ? { emailRecipients: args.emailRecipients } : {}),
                ...(args.smsRecipients !== undefined ? { smsRecipients: args.smsRecipients } : {}),
                ...(args.sendChannels !== undefined ? { sendChannels: args.sendChannels } : {}),
                ...(args.attachmentIds !== undefined ? { attachmentIds: args.attachmentIds } : {})
              });
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
