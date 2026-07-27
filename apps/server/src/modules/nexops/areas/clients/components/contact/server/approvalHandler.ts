import { randomUUID } from "node:crypto";
import { RailError, type LineItem, type NewClient, type Property } from "@nexteam/core";
import * as contracts from "../../../../../../../crm/approvalContracts.js";
import { requireJobLifecycleService, requireLedgerService, type CrmApprovalHandler } from "../../../../../../../crm/approvalHandler.js";

const {
  createClientApprovalArgsSchema, createQuoteApprovalArgsSchema, createJobApprovalArgsSchema, performJobActionApprovalArgsSchema,
  scheduleJobVisitSeriesApprovalArgsSchema, moveJobVisitSeriesApprovalArgsSchema, performLedgerActionApprovalArgsSchema,
  composeInvoiceFromJobsApprovalArgsSchema, sendInvoiceApprovalArgsSchema, collectInvoicePaymentApprovalArgsSchema, sendReceiptReviewApprovalArgsSchema
} = contracts;

export const contactApprovalHandler: CrmApprovalHandler = {
  operations: ["createClient"],
  async execute(item, context) {
    switch (item.execute.op) {
      case "createClient": {
        if (!context.provider.createClient) {
                throw new RailError("The configured CRM provider cannot create native clients.", { provider: "native", op: "createClient", status: 501 });
              }
              const args = createClientApprovalArgsSchema.parse(item.execute.args);
              if (args.tenantId !== item.tenantId || args.client.tenantId !== item.tenantId) {
                throw new RailError("Approved client artifact targets a different tenant.", { provider: "native", op: "createClient", status: 403 });
              }
              const client = await context.provider.createClient(args.client as NewClient);
              let property: Property | undefined;
              if (args.primaryProperty) {
                if (!context.provider.upsertProperty) {
                  throw new RailError("The configured CRM provider cannot save native client properties yet.", { provider: "native", op: "upsertProperty", status: 501 });
                }
                if (args.primaryProperty.tenantId !== item.tenantId) {
                  throw new RailError("Approved client property targets a different tenant.", { provider: "native", op: "upsertProperty", status: 403 });
                }
                property = await context.provider.upsertProperty({
                  id: `property_${randomUUID()}`,
                  tenantId: args.primaryProperty.tenantId,
                  clientId: client.id,
                  ...(args.primaryProperty.siteName ? { siteName: args.primaryProperty.siteName } : {}),
                  ...(args.primaryProperty.label ? { label: args.primaryProperty.label } : {}),
                  address: args.primaryProperty.address,
                  ...(args.primaryProperty.billingAddressSameAsClient !== undefined
                    ? { billingAddressSameAsClient: args.primaryProperty.billingAddressSameAsClient }
                    : {}),
                  assets: []
                });
              }
              return { client, property, addressNote: args.addressNote };
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
