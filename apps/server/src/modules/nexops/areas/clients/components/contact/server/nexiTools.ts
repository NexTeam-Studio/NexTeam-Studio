import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { clientLookupInputSchema, createClientInputSchema, deleteClientInputSchema, updateClientAddressInputSchema } from "./toolSchemas.js";
import { clientSaveClarification, clientSaveMissingFields, dedupeClients, queueClientAddressUpdateApproval, queueClientCreateApproval, queueClientDeleteApproval } from "./toolSupport.js";
import { isProtectedLegacyClient, legacyClientDeleteMessage } from "./clientDeletionPolicy.js";

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
      name: "deleteClient",
      description: "Prepare deletion of one NexTeam-created client. Imported history and any client with linked work or billing are always protected. The deletion is queued for explicit approval before anything is removed.",
      inputSchema: deleteClientInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Client deletion is not wired for this tenant yet.", { provider: "native", op: "deleteClient", status: 501 });
        }
        const input = deleteClientInputSchema.parse(args);
        const matches = dedupeClients(await provider.getClients(input.clientQuery));
        const client = matches.find((candidate) => candidate.id === input.clientQuery || candidate.name.toLowerCase() === input.clientQuery.toLowerCase())
          ?? (matches.length === 1 ? matches[0] : undefined);
        if (!client) {
          return {
            result: {
              needsClarification: matches.length > 1
                ? `I found more than one client matching “${input.clientQuery}”. Please give the full client name before I prepare deletion.`
                : `I could not find a saved client matching “${input.clientQuery}”. Please check the client name.`
            },
            sources: []
          };
        }
        if (isProtectedLegacyClient(client)) {
          return { result: { needsClarification: legacyClientDeleteMessage() }, sources: [] };
        }
        const repository = options.requestRepository;
        const [requests, quotes, jobs, invoices] = await Promise.all([
          repository.listRequests(tenant.id),
          repository.listQuotes(tenant.id),
          repository.listJobs(tenant.id),
          repository.listInvoices(tenant.id)
        ]);
        const hasLinkedWork =
          requests.some((request) => request.selectedClientId === client.id || request.match?.matchedClientId === client.id)
          || quotes.some((quote) => quote.clientId === client.id)
          || jobs.some((job) => job.clientId === client.id)
          || invoices.some((invoice) => invoice.clientId === client.id);
        if (hasLinkedWork) {
          return { result: { needsClarification: "I cannot delete this client because it has linked work or billing history. The record remains available for use." }, sources: [] };
        }
        const queued = await queueClientDeleteApproval(tenant, client, approvalQueue);
        return {
          result: queued,
          sources: [source(queued.approval.id, `ApprovalQueue client deletion ${queued.approval.id}`)]
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
