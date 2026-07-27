
import { RailError } from "@nexteam/core";
import * as contracts from "../../../../../../../crm/approvalContracts.js";
import { type CrmApprovalHandler } from "../../../../../../../crm/approvalHandler.js";

const {
  createQuoteApprovalArgsSchema
} = contracts;

export const quoteEngineApprovalHandler: CrmApprovalHandler = {
  operations: ["createQuote"],
  async execute(item, context) {
    switch (item.execute.op) {
      case "createQuote": {
        if (!context.provider.createQuote) {
                throw new RailError("The configured CRM provider cannot create native quotes.", { provider: "native", op: "createQuote", status: 501 });
              }
              const args = createQuoteApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId || args.quote.tenantId !== item.tenantId) {
                throw new RailError("Approved quote artifact targets a different tenant.", { provider: "native", op: "createQuote", status: 403 });
              }
              const quote = await context.provider.createQuote(args.quote);
              return { quote };
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
