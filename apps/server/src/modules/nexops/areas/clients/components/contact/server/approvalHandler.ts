import { randomUUID } from "node:crypto";
import { RailError, type NewClient, type Property } from "@nexteam/core";
import * as contracts from "../../../../../shared/approval/contracts.js";
import { type CrmApprovalHandler } from "../../../../../shared/approval/handler.js";

const {
  createClientApprovalArgsSchema,
  updateClientAddressApprovalArgsSchema
} = contracts;

export const contactApprovalHandler: CrmApprovalHandler = {
  operations: ["createClient", "updateClient"],
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
      case "updateClient": {
        if (!context.provider.updateClient) {
          throw new RailError("The configured CRM provider cannot update native clients.", { provider: "native", op: "updateClient", status: 501 });
        }
        const args = updateClientAddressApprovalArgsSchema.parse(item.execute.args);
        if (args.tenantId !== item.tenantId || args.primaryProperty?.tenantId !== item.tenantId || args.primaryProperty?.clientId !== args.clientId) {
          throw new RailError("Approved client update targets a different tenant.", { provider: "native", op: "updateClient", status: 403 });
        }
        const client = await context.provider.updateClient(args.clientId, {
          ...(args.billingAddress ? { billingAddress: args.billingAddress } : {})
        });
        const property = args.primaryProperty
          ? await context.provider.upsertProperty?.(args.primaryProperty)
          : undefined;
        if (args.primaryProperty && !property) {
          throw new RailError("The configured CRM provider cannot update native client properties.", { provider: "native", op: "upsertProperty", status: 501 });
        }
        return { client, property, changeSummary: args.changeSummary };
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
