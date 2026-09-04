import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { createRequestToolInputSchema, getRequestDetailInputSchema, listRequestsInputSchema } from "./toolSchemas.js";
import { normalizedPhone, parseRequestAddress } from "../../../../../../../shared/addressLocation/requestAddressTools.js";
import { availableRequestFields, buildServiceRequest, createRequestWithClientMaterialization, defaultRequestForms, ensureRequestForms, notifyRequestCreated } from "./requestFoundation.js";
import { findRequestFieldLabel, mergedCreateRequestInput, requestFieldText, requestMatchesQuery, requestQueryValue, requestSource } from "./toolSupport.js";

export function createRequestCoreNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    approvalQueue,
    options
  } = context;
  return [
    ...[{
      name: "listRequests",
      description: "Read native NexOps requests by client name, address, email, phone, or request text.",
      inputSchema: listRequestsInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native request tools are not wired for this tenant yet.", { provider: "native", op: "listRequests", status: 501 });
        }
        await ensureRequestForms(options.requestRepository, tenant.id);
        const input = listRequestsInputSchema.parse(args);
        const requests = (await options.requestRepository.listRequests(tenant.id))
          .filter((request) => !input.status || request.status === input.status)
          .filter((request) => requestMatchesQuery(request, input.q));
        return {
          result: {
            requests: requests.map((request) => ({
              id: request.id,
              clientName: request.clientName,
              subject: request.subject,
              status: request.status,
              createdAt: request.createdAt,
              poolConfiguration: requestFieldText(request, "pool_configuration"),
              waterLossRate: requestFieldText(request, "water_loss_rate")
            }))
          },
          sources: requests.length
            ? requests.map((request) => requestSource(request.id, `Native request ${request.clientName}`))
            : [requestSource("requests", "Native request list")]
        };
      }
    }],
    ...[{
      name: "getRequestDetail",
      description: "Read one native request in detail, or read a single saved field from that request with sources.",
      inputSchema: getRequestDetailInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native request tools are not wired for this tenant yet.", { provider: "native", op: "getRequestDetail", status: 501 });
        }
        await ensureRequestForms(options.requestRepository, tenant.id);
        const input = getRequestDetailInputSchema.parse(args);
        const requests = await options.requestRepository.listRequests(tenant.id);
        const request = input.requestId
          ? await options.requestRepository.getRequest(tenant.id, input.requestId)
          : requests.find((candidate) => requestMatchesQuery(candidate, input.query ?? ""));
        if (!request) {
          return {
            result: {
              request: null,
              fieldKey: input.fieldKey,
              fieldLabel: input.fieldKey ? findRequestFieldLabel(input.fieldKey) : null,
              value: null,
              missing: true
            },
            sources: [requestSource("requests", "Native request list")]
          };
        }
        const value = input.fieldKey ? requestQueryValue(request, input.fieldKey) ?? null : null;
        return {
          result: {
            request,
            fieldKey: input.fieldKey,
            fieldLabel: input.fieldKey ? findRequestFieldLabel(input.fieldKey) : null,
            value,
            missing: input.fieldKey ? value === null : false
          },
          sources: [requestSource(request.id, `Native request ${request.clientName}`)]
        };
      }
    }],
    ...(includeWrites ? [{
      name: "createRequest",
      description: "Create a native NexOps request immediately from conversational intake details. Ask for clarification instead of guessing if required details are missing.",
      inputSchema: createRequestToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native request tools are not wired for this tenant yet.", { provider: "native", op: "createRequest", status: 501 });
        }
        const input = mergedCreateRequestInput(createRequestToolInputSchema.parse(args));
        await ensureRequestForms(options.requestRepository, tenant.id);
        const fallbackForm = defaultRequestForms(tenant.id)[0]!;
        const defaultForm = (await options.requestRepository.listRequestForms(tenant.id))[0] ?? fallbackForm;
        const parsedAddress = input.address ? parseRequestAddress(input.address) : null;
        const fieldValues = [
          ...(input.clientName ? [{ key: "client_name", value: input.clientName }] : []),
          ...(input.email ? [{ key: "email", value: input.email }] : []),
          ...(input.phone ? [{ key: "phone", value: normalizedPhone(input.phone) }] : []),
          ...(parsedAddress ? [
            { key: "property_street1", value: parsedAddress.street1 },
            { key: "property_city", value: parsedAddress.city },
            { key: "property_province", value: parsedAddress.province },
            { key: "property_postal_code", value: parsedAddress.postalCode }
          ] : []),
          ...(input.poolConfiguration ? [{ key: "pool_configuration", value: input.poolConfiguration }] : []),
          ...(input.poolType ? [{ key: "pool_type", value: input.poolType }] : []),
          ...(input.gateCode ? [{ key: "gate_code", value: input.gateCode }] : []),
          ...(input.petPresent !== undefined ? [{ key: "pet_present", value: input.petPresent }] : []),
          ...(input.petName ? [{ key: "pet_name", value: input.petName }] : []),
          ...(input.waterLossRate ? [{ key: "water_loss_rate", value: input.waterLossRate }] : []),
          ...(input.issueSummary ? [{ key: "issue_summary", value: input.issueSummary }] : [])
        ];
        try {
          const built = await buildServiceRequest(options.requestRepository, {
            tenantId: tenant.id,
            source: "office_new_client",
            formId: defaultForm.id,
            formSlug: defaultForm.slug,
            fieldValues
          });
          const linkedRequest = await createRequestWithClientMaterialization(options.requestRepository, built);
          const notified = await notifyRequestCreated(linkedRequest, {
            approvalQueue,
            commsRail: options.commsRail,
            platformRepository: options.platformRepository
          });
          const request = notified.notifications
            ? await options.requestRepository.updateRequest(linkedRequest.id, {
              tenantId: linkedRequest.tenantId,
              notifications: notified.notifications,
              updatedAt: notified.updatedAt
            })
            : linkedRequest;
          return {
            result: { request, needsClarification: null },
            sources: [requestSource(request.id, `Native request ${request.clientName}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                request: null,
                needsClarification: error.message,
                availableFields: availableRequestFields().map((field) => field.key)
              },
              sources: []
            };
          }
          throw error;
        }
      }
    }] : [])
  ];
}
