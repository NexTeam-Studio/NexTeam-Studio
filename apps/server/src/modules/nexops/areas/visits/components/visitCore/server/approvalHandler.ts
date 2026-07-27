
import { RailError } from "@nexteam/core";
import * as contracts from "../../../../../../../crm/approvalContracts.js";
import { requireJobLifecycleService, type CrmApprovalHandler } from "../../../../../../../crm/approvalHandler.js";

const {
  scheduleJobVisitSeriesApprovalArgsSchema,
  moveJobVisitSeriesApprovalArgsSchema
} = contracts;

export const visitCoreApprovalHandler: CrmApprovalHandler = {
  operations: ["scheduleJobVisitSeries","moveJobVisitSeries"],
  async execute(item, context) {
    switch (item.execute.op) {
      case "scheduleJobVisitSeries": {
        const jobLifecycleService = requireJobLifecycleService(context);
        if (!jobLifecycleService) {
                throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "scheduleJobVisitSeries", status: 501 });
              }
              const args = scheduleJobVisitSeriesApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId) {
                throw new RailError("Approved visit-series draft targets a different tenant.", { provider: "native", op: "scheduleJobVisitSeries", status: 403 });
              }
              const visits = await jobLifecycleService.scheduleVisitSeries(args);
              return { visits };
      }
      case "moveJobVisitSeries": {
        const jobLifecycleService = requireJobLifecycleService(context);
        if (!jobLifecycleService) {
                throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "moveJobVisitSeries", status: 501 });
              }
              const args = moveJobVisitSeriesApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId) {
                throw new RailError("Approved visit-shift draft targets a different tenant.", { provider: "native", op: "moveJobVisitSeries", status: 403 });
              }
              const result = await jobLifecycleService.moveVisitSeries(args);
              return result;
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
