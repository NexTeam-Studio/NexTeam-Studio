import { RailError, catalogSelectionSnapshot, type ApprovalQueueService, type Client, type CrmSettings, type CRMProvider, type Job, type Tenant } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { z } from "zod";
import { resolveExactClientId } from "../../../../../shared/tools/clientResolution.js";
import type { JobLifecycleService } from "./jobLifecycleService.js";
import type { createJobToolInputSchema, getJobDetailInputSchema, jobActionToolInputSchema } from "./toolSchemas.js";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function jobMatchesQuery(job: {
  id: string;
  number?: string | undefined;
  title: string;
  status: string;
  client?: Client | undefined;
  property?: { label?: string | undefined; siteName?: string | undefined; address?: { street1?: string | undefined; city?: string | undefined } } | undefined;
}, query: string): boolean {
  const needle = normalized(query);
  if (!needle) {
    return true;
  }
  const values = [
    job.id,
    job.number ?? "",
    job.title,
    job.status,
    job.client?.name ?? "",
    job.client?.company ?? "",
    job.property?.label ?? "",
    job.property?.siteName ?? "",
    job.property?.address?.street1 ?? "",
    job.property?.address?.city ?? ""
  ].map(normalized).filter(Boolean);
  return values.some((value) => value === needle || value.includes(needle));
}

async function materializeJobLineItems(
  settings: CrmSettings,
  items: z.infer<typeof createJobToolInputSchema>["lineItems"]
): Promise<NonNullable<Job["lineItems"]>> {
  return (items ?? []).map((item, index) => {
    const catalogItem = item.kind === "catalog"
      ? settings.catalogItems.find((entry) => entry.id === item.catalogItemId && entry.tenantId === settings.tenantId)
      : undefined;
    if (item.kind === "catalog" && !catalogItem) {
      throw new RailError("Catalog job lines require a catalogItemId from this tenant's Products & Services catalog.", {
        provider: "native",
        op: "createJob",
        status: 400
      });
    }
    const quantity = item.quantity ?? 1;
    if (catalogItem) return catalogSelectionSnapshot({
      id: `job_line_${index + 1}`, code: catalogItem.code, name: catalogItem.name,
      description: catalogItem.description, price: catalogItem.price, quantity,
      clientSelectable: false, defaultSelected: true
    });
    const unitPrice = item.unitPrice ?? 0;
    return { id: `job_line_${index + 1}`, source: "custom", code: item.code?.trim() || `LINE-${index + 1}`, name: item.name.trim(), ...(item.description?.trim() ? { description: item.description.trim() } : {}), quantity, unitPrice, total: Number((quantity * unitPrice).toFixed(2)), ...(item.taxable !== undefined ? { taxable: item.taxable } : {}), clientSelectable: false, defaultSelected: true };
  });
}

export async function resolveJobForAction(
  tenantId: string,
  input: z.infer<typeof jobActionToolInputSchema> | z.infer<typeof getJobDetailInputSchema>,
  jobLifecycleService: JobLifecycleService
) {
  if (input.jobId) {
    const detail = await jobLifecycleService.getJobDetail(tenantId, input.jobId);
    if (!detail) {
      throw new RailError(`Native job ${input.jobId} was not found.`, { provider: "native", op: "getJobDetail", status: 404 });
    }
    return detail;
  }
  const matches = (await jobLifecycleService.listJobs(tenantId)).filter((job) => jobMatchesQuery(job, input.query ?? ""));
  if (matches.length !== 1) {
    throw new RailError("I need one exact native job match before I can continue. Give me the job title, number, or job id.", {
      provider: "native",
      op: "getJobDetail",
      status: 400
    });
  }
  return (await jobLifecycleService.getJobDetail(tenantId, matches[0]!.id))!;
}

export async function queueJobCreateApproval(
  tenant: Tenant,
  input: z.infer<typeof createJobToolInputSchema>,
  provider: CRMProvider,
  repository: NativeCrmRepository,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  pendingJob: {
    tenantId: string;
    clientId: string;
    propertyId?: string | undefined;
    requestId?: string | undefined;
    quoteId?: string | undefined;
    title: string;
    lineItems: NonNullable<Job["lineItems"]>;
    status: "pending_approval";
  };
  writesAreApprovalQueuedOnly: true;
}> {
  const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "createJob");
  const clientProperties = (await repository.listProperties(tenant.id)).filter((property) => property.clientId === clientId);
  const propertyId = input.propertyId ?? (clientProperties.length === 1 ? clientProperties[0]!.id : undefined);
  const lineItems = await materializeJobLineItems(await repository.getCrmSettings(tenant.id), input.lineItems);
  const previewBody = [
    `Title: ${input.title}`,
    `Client id: ${clientId}`,
    propertyId ? `Property id: ${propertyId}` : "Property: not attached yet",
    input.requestId ? `Request link: ${input.requestId}` : "",
    input.quoteId ? `Quote link: ${input.quoteId}` : "",
    lineItems.length ? `Line items: ${lineItems.map((item) => `${item.name} x${item.quantity}`).join("; ")}` : "Line items: none yet",
    "Lifecycle starts at Unscheduled until a visit is booked."
  ].filter(Boolean).join("\n");
  const executeInput = {
    tenantId: tenant.id,
    clientId,
    ...(propertyId ? { propertyId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    title: input.title.trim(),
    lineItems,
    createdBy: "nexi"
  };
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: { title: `Create job: ${executeInput.title}`, body: previewBody },
    execute: { service: "crm", op: "createJob", args: { tenantId: tenant.id, input: executeInput } },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingJob: { ...executeInput, status: "pending_approval" },
    writesAreApprovalQueuedOnly: true
  };
}

export async function queueJobActionApproval(
  tenant: Tenant,
  input: z.infer<typeof jobActionToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  preview: Awaited<ReturnType<JobLifecycleService["prepareJobActionPreview"]>>;
  writesAreApprovalQueuedOnly: true;
}> {
  const job = await resolveJobForAction(tenant.id, input, jobLifecycleService);
  const preview = await jobLifecycleService.prepareJobActionPreview(tenant.id, job.id, input.action);
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: { title: preview.title, body: preview.body },
    execute: { service: "crm", op: "performJobAction", args: { tenantId: tenant.id, jobId: job.id, action: input.action } },
    createdBy: "nexi"
  });
  return { approval, preview, writesAreApprovalQueuedOnly: true };
}
