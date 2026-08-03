import type { NexiTool, Property, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { clientLookupInputSchema, createClientInputSchema, deleteClientInputSchema, updateClientAddressInputSchema } from "./toolSchemas.js";
import { clientSaveClarification, clientSaveMissingFields, dedupeClients, queueClientAddressUpdateApproval, queueClientCreateApproval, queueClientDeleteApproval } from "./toolSupport.js";
import { isProtectedLegacyClient, legacyClientDeleteMessage } from "./clientDeletionPolicy.js";

// Claude correctly understands a question such as "What is Avery's address?",
// but may include part of that question in the lookup q argument.  The CRM
// search rail accepts a name, company, email, or phone—not prose—so remove
// only harmless conversational wrappers before searching.  We retain the
// original query first so an actual company name is never discarded.
function clientLookupQueries(query: string): string[] {
  const original = query.trim();
  if (!original) {
    // An empty q is the explicit client-list request in the tool contract.
    return [""];
  }
  const simplified = original
    .replace(/\b(?:what(?:'s| is)|where(?:'s| is)|find|look up|pull up|show me|do you have|can you find)\b/gi, " ")
    .replace(/(?:'s|’s)\s+(?:address|phone(?: number)?|telephone(?: number)?|email|contact|details?)\b/gi, " ")
    .replace(/\b(?:address|phone(?: number)?|telephone(?: number)?|email|contact|details?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([original, simplified].filter(Boolean))];
}

function normalizedLookup(value: string | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function propertyMatchesQuery(property: Property, query: string): boolean {
  const needle = normalizedLookup(query);
  if (!needle) return false;
  const values = [
    property.label,
    property.siteName,
    property.address?.street1,
    property.address?.city,
    property.address?.province,
    property.address?.postalCode,
    ...(property.contacts ?? []).flatMap((contact) => [contact.personName?.firstName, contact.personName?.lastName, ...(contact.emails ?? []).map((email) => email.value), ...(contact.phones ?? []).map((phone) => phone.value)])
  ];
  return values.some((value) => {
    const candidate = normalizedLookup(value);
    return Boolean(candidate) && (candidate.includes(needle) || needle.includes(candidate));
  });
}

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
        // A broad list is useful for a count, but never send an entire tenant
        // directory into a model context. It is slow, needlessly exposes
        // unrelated records, and can drown out the named client the user asked
        // for. The model can answer count questions from nativeCount, then must
        // retry with a name for a client-specific question.
        if (!query) {
          const nativeCount = (await provider.getClients("")).length;
          return {
            result: {
              clients: [],
              nativeCount,
              searchHint: "This is a tenant-wide count only. For a specific client detail, call clientLookup again with that client name, company, email, or phone."
            },
            sources: [source("clients", "Native CRM clients")]
          };
        }
        const relatedProperties = options.requestRepository
          ? await options.requestRepository.listProperties(tenant.id)
          : [];
        const directlyMatchedClients = await Promise.all(clientLookupQueries(query).map((candidate) => provider.getClients(candidate)));
        // Site labels and site contacts are valid ways people identify a
        // contractor account.  Resolve the owner locally, then return only
        // that account instead of a whole client directory.
        const matchingPropertyClientIds = new Set(relatedProperties.filter((property) => propertyMatchesQuery(property, query)).map((property) => property.clientId));
        const propertyOwners = matchingPropertyClientIds.size > 0
          ? (await provider.getClients("")).filter((client) => matchingPropertyClientIds.has(client.id))
          : [];
        const nativeClients = dedupeClients([...directlyMatchedClients.flat(), ...propertyOwners]);
        const clients = nativeClients.map((client) => {
          const propertiesForClient = relatedProperties
            .filter((property) => property.clientId === client.id)
            .map((property) => ({
              id: property.id,
              label: property.label,
              siteName: property.siteName,
              address: property.address,
              access: property.access,
              contacts: property.contacts
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
        const byId = matches.find((candidate) => candidate.id === input.clientQuery);
        const exactNameMatches = matches.filter((candidate) => candidate.name.toLowerCase() === input.clientQuery.toLowerCase());
        // A textual name is never enough to silently choose between duplicate
        // client records. An opaque client id remains unambiguous.
        const client = byId
          ?? (exactNameMatches.length === 1 ? exactNameMatches[0] : undefined)
          ?? (matches.length === 1 ? matches[0] : undefined);
        if (!client) {
          return {
            result: {
              needsClarification: matches.length > 1
                ? `I found more than one client matching "${input.clientQuery}". Please give the full client name before I prepare deletion.`
                : `I could not find a saved client matching "${input.clientQuery}". Please check the client name.`
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
        const byId = matches.find((candidate) => candidate.id === input.clientQuery);
        const exactNameMatches = matches.filter((candidate) => candidate.name.toLowerCase() === input.clientQuery.toLowerCase());
        const client = byId
          ?? (exactNameMatches.length === 1 ? exactNameMatches[0] : undefined)
          ?? (matches.length === 1 ? matches[0] : undefined);
        if (!client) {
          return {
            result: {
              needsClarification: matches.length > 1
                ? `I found more than one client matching "${input.clientQuery}". Please give the full client name before I prepare the address change.`
                : `I could not find a saved client matching "${input.clientQuery}". Please check the client name.`
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
