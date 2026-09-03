import { RailError, type EventBus, type RequestForm, type ServiceRequest } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { z } from "zod";
import type { CrmRouteDeps } from "../../../../../shared/runtime/routeComposition.js";
import { buildServiceRequest, materializeRequestClient, notifyRequestCreated, requestFormEmbedCode, requestFormSharePath, type RequestBuildInput } from "./requestFoundation.js";
import type { createRequestBodySchema } from "./routeSchemas.js";

export function sanitizeFieldVisibility(visibility?: {
  request?: boolean | undefined;
  quote?: boolean | undefined;
  job?: boolean | undefined;
  visit?: boolean | undefined;
  invoice?: boolean | undefined;
}) {
  if (!visibility) return undefined;
  const next = {
    ...(visibility.request !== undefined ? { request: visibility.request } : {}),
    ...(visibility.quote !== undefined ? { quote: visibility.quote } : {}),
    ...(visibility.job !== undefined ? { job: visibility.job } : {}),
    ...(visibility.visit !== undefined ? { visit: visibility.visit } : {}),
    ...(visibility.invoice !== undefined ? { invoice: visibility.invoice } : {})
  };
  return Object.keys(next).length ? next : undefined;
}

export function createRequestRouteSupport(input: {
  env: NodeJS.ProcessEnv;
  deps: CrmRouteDeps;
  eventBus: EventBus;
  repositoryForTenant: () => NativeCrmRepository;
  defaultTenantId: (env: NodeJS.ProcessEnv) => string;
}) {
  async function getRequestOrThrow(tenantId: string, requestId: string): Promise<ServiceRequest> {
    const request = await input.repositoryForTenant().getRequest(tenantId, requestId);
    if (!request) throw new RailError(`Native request ${requestId} was not found.`, { provider: "native", op: "getRequest", status: 404 });
    return request;
  }

  async function createAndNotifyRequest(request: z.infer<typeof createRequestBodySchema> & Pick<RequestBuildInput, "fieldDefinitions">): Promise<ServiceRequest> {
    const tenantId = request.tenantId ?? input.defaultTenantId(input.env);
    const repository = input.repositoryForTenant();
    const configuredForm = request.formId
      ? await repository.getRequestForm(tenantId, request.formId)
      : request.formSlug
        ? await repository.getRequestFormBySlug(tenantId, request.formSlug)
        : null;
    const built = await buildServiceRequest(repository, {
      tenantId,
      source: request.source,
      formId: request.formId,
      formSlug: request.formSlug,
      subject: request.subject,
      narrative: request.narrative,
      selectedClientId: request.selectedClientId,
      selectedPropertyId: request.selectedPropertyId,
      consent: request.consent,
      allowIncomplete: request.allowIncomplete,
      customFields: request.customFields,
      fieldDefinitions: request.fieldDefinitions ?? configuredForm?.fieldDefinitions,
      fieldValues: request.fieldValues.map((field) => ({
        key: field.key,
        value: field.value,
        ...(sanitizeFieldVisibility(field.visibility) ? { visibility: sanitizeFieldVisibility(field.visibility) } : {})
      }))
    });
    const created = await repository.createRequest(built);
    const materialized = await materializeRequestClient(repository, created);
    const linkedRequest = await repository.updateRequest(created.id, {
      tenantId: created.tenantId,
      selectedClientId: materialized.client.id,
      ...(materialized.property ? { selectedPropertyId: materialized.property.id } : {}),
      updatedAt: new Date().toISOString()
    });
    await input.eventBus.emit({
      tenantId: linkedRequest.tenantId,
      type: "request.created",
      payload: {
        requestId: linkedRequest.id,
        clientName: linkedRequest.clientName,
        source: linkedRequest.source,
        ...(linkedRequest.email ? { email: linkedRequest.email } : {}),
        ...(linkedRequest.phone ? { phone: linkedRequest.phone } : {})
      }
    });
    const notified = await notifyRequestCreated(linkedRequest, {
      approvalQueue: input.deps.approvalQueue,
      commsRail: input.deps.commsRail,
      platformRepository: input.deps.platformRepository,
      crmRepository: repository,
      publicBaseUrl: input.env.NEXOPS_PUBLIC_BASE_URL?.trim() || undefined
    });
    if (notified.notifications && (
      notified.notifications.adminNotifiedAt !== created.notifications?.adminNotifiedAt
      || notified.notifications.clientConfirmationAt !== linkedRequest.notifications?.clientConfirmationAt
    )) {
      return repository.updateRequest(linkedRequest.id, {
        tenantId: linkedRequest.tenantId,
        notifications: notified.notifications,
        updatedAt: notified.updatedAt
      });
    }
    return linkedRequest;
  }

  function formPresentation(form: RequestForm): { sharePath: string; embedCode: string } {
    const origin = input.env.NEXOPS_PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175";
    return { sharePath: requestFormSharePath(form), embedCode: requestFormEmbedCode(form, origin) };
  }

  return { createAndNotifyRequest, formPresentation, getRequestOrThrow };
}
