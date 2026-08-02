import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { clientLookupInputSchema, createClientInputSchema, updateClientAddressInputSchema } from "./toolSchemas.js";
import { clientSaveClarification, clientSaveMissingFields, dedupeClients, queueClientAddressUpdateApproval, queueClientCreateApproval } from "./toolSupport.js";

export function createContactNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    approvalQueue,
    options,
    provider,
    source
  } = context;
  return [
    ...[{
      name: "clientLookup",
      description: "Read native CRM clients by name, company, email, or phone. Pass an empty query for the tenant client list.",
      inputSchema: clientLookupInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = clientLookupInputSchema.parse(args);
        const query = input.q.trim();
        const nativeClients = await provider.getClients(query);
        const relatedProperties = options.requestRepository
          ? await options.requestRepository.listProperties(tenant.id)
          : [];
        const clients = dedupeClients(nativeClients).map((client) => {
          const propertiesForClient = relatedProperties
            .filter((property) => property.clientId === client.id)
            .map((property) => ({
              id: property.id,
              label: property.label,
              siteName: property.siteName,
              address: property.address,
              access: property.access
            }));
          return propertiesForClient.length > 0
            ? { ...client, relatedProperties: propertiesForClient }
            : client;
        });
        return {
          result: {
            clients,
            nativeCount: nativeClients.length
          },
          sources: [source("clients", "Native CRM clients")]
        };
      }
    }],
    ...(includeWrites ? [{
      name: "createClient",
      description: "Create a native CRM client. This writes only to the native client collection for the current tenant.",
      inputSchema: createClientInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!provider.createClient) {
          throw new RailError("The configured CRM provider cannot create native clients.", { provider: "native", op: "createClient", status: 501 });
        }
        const input = createClientInputSchema.parse(args);
        const missingFields = clientSaveMissingFields(input);
        if (missingFields.length > 0) {
          return {
            result: {
              needsClarification: clientSaveClarification(missingFields),
              missingFields,
              saveBlocked: true
            },
            sources: []
          };
        }
        const queued = await queueClientCreateApproval(tenant, input, approvalQueue);
        return {
          result: queued,
          sources: [source(queued.approval.id, `ApprovalQueue client create ${queued.approval.id}`)]
        };
      }
    }, {
      name: "updateClient",
      description: "Prepare a change to an existing native CRM client's billing and primary service address. The change is always queued for approval before it is saved.",
      inputSchema: updateClientAddressInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = updateClientAddressInputSchema.parse(args);
        if (!provider.updateClient) {
          throw new RailError("The configured CRM provider cannot update native clients.", { provider: "native", op: "updateClient", status: 501 });
        }
        const matches = dedupeClients(await provider.getClients(input.clientQuery));
        const exact = matches.find((client) => client.id === input.clientQuery || client.name.toLowerCase() === input.clientQuery.toLowerCase());
        const client = exact ?? (matches.length === 1 ? matches[0] : undefined);
        if (!client) {
          return {
            result: {
              needsClarification: matches.length > 1
                ? `I found more than one client matching “${input.clientQuery}”. Please give the full client name before I prepare the address change.`
                : `I could not find a saved client matching “${input.clientQuery}”. Please check the client name.`
            },
            sources: []
          };
        }
        const properties = options.requestRepository
          ? await options.requestRepository.listProperties(tenant.id)
          : [];
        const queued = await queueClientAddressUpdateApproval(
          tenant,
          input,
          client,
          properties.find((property) => property.clientId === client.id),
          approvalQueue
        );
        return {
          result: queued,
          sources: queued.approval ? [source(queued.approval.id, `ApprovalQueue client address update ${queued.approval.id}`)] : []
        };
      }
    }] : [])
  ];
}
