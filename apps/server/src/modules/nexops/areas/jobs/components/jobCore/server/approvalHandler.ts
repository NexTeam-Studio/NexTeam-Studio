
import { RailError, type LineItem } from "@nexteam/core";
import * as contracts from "../../../../../shared/approval/contracts.js";
import { requireJobLifecycleService, type CrmApprovalHandler } from "../../../../../shared/approval/handler.js";

const {
  createJobApprovalArgsSchema,
  performJobActionApprovalArgsSchema
} = contracts;

export const jobCoreApprovalHandler: CrmApprovalHandler = {
  operations: ["createJob","performJobAction"],
  async execute(item, context) {
    switch (item.execute.op) {
      case "createJob": {
        const jobLifecycleService = requireJobLifecycleService(context);
        if (!jobLifecycleService) {
                throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "createJob", status: 501 });
              }
              const args = createJobApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId || args.input.tenantId !== item.tenantId) {
                throw new RailError("Approved job artifact targets a different tenant.", { provider: "native", op: "createJob", status: 403 });
              }
              const job = await jobLifecycleService.createJob({
                tenantId: args.input.tenantId,
                clientId: args.input.clientId,
                ...(args.input.propertyId ? { propertyId: args.input.propertyId } : {}),
                ...(args.input.requestId ? { requestId: args.input.requestId } : {}),
                ...(args.input.quoteId ? { quoteId: args.input.quoteId } : {}),
                title: args.input.title,
                ...(args.input.lineItems ? { lineItems: args.input.lineItems as LineItem[] } : {}),
                ...(args.input.intake ? { intake: args.input.intake } : {}),
                createdBy: args.input.createdBy ?? item.createdBy
              });
              return { job };
      }
      case "performJobAction": {
        const jobLifecycleService = requireJobLifecycleService(context);
        if (!jobLifecycleService) {
                throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "performJobAction", status: 501 });
              }
              const actionArgs = performJobActionApprovalArgsSchema.parse(item.execute.args);
              if (actionArgs.tenantId !== item.tenantId) {
                throw new RailError("Approved job action targets a different tenant.", { provider: "native", op: "performJobAction", status: 403 });
              }
              return jobLifecycleService.performJobAction({
                tenantId: actionArgs.tenantId,
                jobId: actionArgs.jobId,
                action: actionArgs.action,
                actorId: actionArgs.actorId ?? item.decidedBy ?? item.createdBy
              });
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
