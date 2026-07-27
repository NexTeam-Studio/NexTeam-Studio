import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../../../crm/nexiToolRuntime.js";

export function createContactNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    approvalQueue,
    clientLookupInputSchema,
    clientSaveClarification,
    clientSaveMissingFields,
    createClientInputSchema,
    dedupeClients,
    options,
    provider,
    queueClientCreateApproval,
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
    }] : [])
  ];
}
