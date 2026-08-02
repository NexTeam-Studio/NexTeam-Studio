import { randomUUID } from "node:crypto";
import { RailError, type NewClient, type Property } from "@nexteam/core";
import * as contracts from "../../../../../shared/approval/contracts.js";
import { type CrmApprovalHandler } from "../../../../../shared/approval/handler.js";
import { isProtectedLegacyClient, legacyClientDeleteMessage } from "./clientDeletionPolicy.js";

const {
  createClientApprovalArgsSchema,
  deleteClientApprovalArgsSchema,
  updateClientAddressApprovalArgsSchema
} = contracts;

export const contactApprovalHandler: CrmApprovalHandler = {
  operations: ["createClient", "deleteClient", "updateClient"],
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
      case "deleteClient": {
        if (!context.crmRepository) {
          throw new RailError("Client deletion is not wired for this tenant yet.", { provider: "native", op: "deleteClient", status: 501 });
        }
        const args = deleteClientApprovalArgsSchema.parse(item.execute.args);
        if (args.tenantId !== item.tenantId) {
          throw new RailError("Approved client deletion targets a different tenant.", { provider: "native", op: "deleteClient", status: 403 });
        }
        const repository = context.crmRepository;
        const client = (await repository.listClients(item.tenantId)).find((candidate) => candidate.id === args.clientId);
        if (!client) {
          throw new RailError("The client was not found before deletion.", { provider: "native", op: "deleteClient", status: 404 });
        }
        if (isProtectedLegacyClient(client)) {
          throw new RailError(legacyClientDeleteMessage(), { provider: "native", op: "deleteClient", status: 409 });
        }
        const [requests, quotes, jobs, invoices, properties] = await Promise.all([
          repository.listRequests(item.tenantId),
          repository.listQuotes(item.tenantId),
          repository.listJobs(item.tenantId),
          repository.listInvoices(item.tenantId),
          repository.listProperties(item.tenantId)
        ]);
        const linkedWork =
          requests.some((request) => request.selectedClientId === client.id || request.match?.matchedClientId === client.id)
          || quotes.some((quote) => quote.clientId === client.id)
          || jobs.some((job) => job.clientId === client.id)
          || invoices.some((invoice) => invoice.clientId === client.id);
        if (linkedWork) {
          throw new RailError("Delete is blocked because this client already has linked work or billing history.", { provider: "native", op: "deleteClient", status: 409 });
        }
        const propertyIds = properties.filter((property) => property.clientId === client.id).map((property) => property.id);
        const deletedPropertyIds = await repository.deletePropertiesForClient(item.tenantId, client.id);
        await repository.deleteClient(item.tenantId, client.id);
        return { deletedClient: { id: client.id, name: client.name }, deletedPropertyIds, propertyIds };
      }
      default:
        throw new RailError("Component approval handler received an unsupported operation.", { provider: "native", op: "approvalExecute", status: 400 });
    }
  }
};
