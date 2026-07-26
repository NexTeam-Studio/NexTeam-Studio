import { z } from "zod";
import { RailError, type ApprovalQueueService, type CaptureBatch, type Client, type NexiTool, type Source, type Tenant, type TenantUserRole } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import { materializeRequestCaptureContext } from "../crm/requestFoundation.js";
import { createFieldReportRecord } from "./reportService.js";
import type { FieldDocsService } from "./fieldDocsService.js";
import type { MediaRepository } from "./mediaRepository.js";
import type { NexDocsService } from "./nexDocsService.js";
import { formatChecklistFieldValue } from "./checklists.js";
import { pairBeforeAfter, searchMediaWithVisionFallback } from "./photoSearch.js";

const photoSearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(25).optional()
});

const beforeAfterInputSchema = z.object({
  jobId: z.string().optional()
});

const propertyHistoryInputSchema = z.object({
  propertyId: z.string().min(1),
  templateId: z.string().optional(),
  fieldId: z.string().optional()
});

const listRecentPhotosInputSchema = z.object({
  clientId: z.string().optional(),
  propertyId: z.string().optional(),
  jobId: z.string().optional(),
  visitId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional()
});

const getVisitReportInputSchema = z.object({
  reportId: z.string().optional(),
  visitId: z.string().optional(),
  jobId: z.string().optional()
});

const generateVisitReportInputSchema = z.object({
  jobId: z.string().min(1),
  propertyId: z.string().optional(),
  visitId: z.string().optional(),
  checklistId: z.string().optional(),
  title: z.string().optional(),
  findings: z.array(z.string()).optional()
});

const listUnassignedPhotoBatchesInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional()
});

const assignPhotoBatchInputSchema = z.object({
  batchId: z.string().min(1),
  mode: z.enum(["existing_client", "request"]).default("existing_client"),
  clientId: z.string().min(1).optional(),
  clientName: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (value.mode === "existing_client" && !value.clientId && !value.clientName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientName is required for existing-client assignment.", path: ["clientName"] });
  }
  if (value.mode === "request" && !value.requestId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "requestId is required for request assignment.", path: ["requestId"] });
  }
});

const searchDocumentsInputSchema = z.object({
  query: z.string().min(1),
  clientId: z.string().optional(),
  clientQuery: z.string().optional(),
  propertyId: z.string().optional(),
  limit: z.number().int().min(1).max(25).optional()
});

const listClientFoldersInputSchema = z.object({
  clientId: z.string().optional(),
  clientQuery: z.string().optional()
});

const createFolderInputSchema = listClientFoldersInputSchema.extend({
  label: z.string().min(1)
});

const uploadDocumentToFolderInputSchema = listClientFoldersInputSchema.extend({
  folderId: z.string().optional(),
  folderLabel: z.string().optional(),
  fileName: z.string().min(1),
  label: z.string().optional(),
  mimeType: z.string().optional(),
  textContent: z.string().optional(),
  fileBase64: z.string().optional(),
  propertyId: z.string().optional(),
  jobId: z.string().optional(),
  visitId: z.string().optional()
}).superRefine((value, ctx) => {
  if (!value.textContent?.trim() && !value.fileBase64?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "textContent or fileBase64 is required for a NexDocs upload.", path: ["textContent"] });
  }
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function mediaTimestamp(storageRef: { exif?: { ts?: string | undefined } | undefined }): string {
  return storageRef.exif?.ts ?? "";
}

function normalizeDeps(
  repositoryOrDeps: MediaRepository | {
    mediaRepository: MediaRepository;
    crmRepository?: NativeCrmRepository | undefined;
    fieldDocsService?: FieldDocsService | undefined;
    nexDocsService?: NexDocsService | undefined;
    approvalQueue?: ApprovalQueueService | undefined;
    viewerRole?: TenantUserRole | undefined;
    viewerUserId?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }
): {
  mediaRepository: MediaRepository;
  crmRepository?: NativeCrmRepository | undefined;
  fieldDocsService?: FieldDocsService | undefined;
  nexDocsService?: NexDocsService | undefined;
  approvalQueue?: ApprovalQueueService | undefined;
  viewerRole?: TenantUserRole | undefined;
  viewerUserId?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
} {
  if ("listMedia" in repositoryOrDeps) {
    return { mediaRepository: repositoryOrDeps };
  }
  return repositoryOrDeps;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function matchesClient(record: Client, query: string): boolean {
  const needle = normalized(query);
  return [
    record.id,
    record.name,
    ...(record.emails ?? []),
    ...(record.phones ?? [])
  ].some((value) => normalized(String(value)).includes(needle));
}

async function resolveDocumentClient(
  repository: NativeCrmRepository | undefined,
  tenantId: string,
  input: { clientId?: string | undefined; clientQuery?: string | undefined },
  op: string
): Promise<Client> {
  if (!repository) {
    throw new RailError("NexDocs client lookup is not wired for this tenant yet.", { provider: "native", op, status: 501 });
  }
  const clients = await repository.listClients(tenantId);
  if (input.clientId?.trim()) {
    const exact = clients.find((record) => record.id === input.clientId?.trim());
    if (!exact) {
      throw new RailError(`Client ${input.clientId} was not found.`, { provider: "native", op, status: 404 });
    }
    return exact;
  }
  if (input.clientQuery?.trim()) {
    const exactName = clients.filter((record) => normalized(record.name) === normalized(input.clientQuery ?? ""));
    if (exactName.length === 1 && exactName[0]) {
      return exactName[0];
    }
    const matches = clients.filter((record) => matchesClient(record, input.clientQuery ?? ""));
    if (matches.length === 1 && matches[0]) {
      return matches[0];
    }
    throw new RailError("I need one exact client match before I can open that NexDocs library.", {
      provider: "native",
      op,
      status: 400
    });
  }
  if (clients.length === 1 && clients[0]) {
    return clients[0];
  }
  throw new RailError("Tell me the saved client name or client id so I can open the right NexDocs library.", {
    provider: "native",
    op,
    status: 400
  });
}

function inferMimeType(fileName: string, mimeType: string | undefined): string {
  if (mimeType?.trim()) {
    return mimeType.trim();
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".doc")) {
    return "application/msword";
  }
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".csv")) {
    return "text/csv";
  }
  if (lower.endsWith(".txt")) {
    return "text/plain";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }
  return "application/octet-stream";
}

async function resolveFolderForUpload(
  deps: ReturnType<typeof normalizeDeps>,
  tenantId: string,
  clientId: string,
  input: { folderId?: string | undefined; folderLabel?: string | undefined }
): Promise<{ folderId?: string | undefined; folderLabel?: string | undefined }> {
  if (input.folderId?.trim()) {
    const folder = await deps.nexDocsService?.listFolders(tenantId, clientId).then((folders) => folders.find((entry) => entry.id === input.folderId?.trim()));
    if (!folder) {
      throw new RailError(`Folder ${input.folderId} was not found for this client.`, { provider: "native", op: "uploadDocumentToFolder", status: 404 });
    }
    return { folderId: folder.id, folderLabel: folder.label };
  }
  if (input.folderLabel?.trim()) {
    const folders = await deps.nexDocsService?.listFolders(tenantId, clientId) ?? [];
    const folder = folders.find((entry) => normalized(entry.label) === normalized(input.folderLabel ?? ""));
    if (!folder) {
      throw new RailError(`I couldn't find a folder named "${input.folderLabel?.trim()}".`, { provider: "native", op: "uploadDocumentToFolder", status: 404 });
    }
    return { folderId: folder.id, folderLabel: folder.label };
  }
  return {};
}

function folderApprovalBody(client: Client, label: string): string {
  return [
    `Client: ${client.name}`,
    `Folder: ${label}`,
    "Structure: Flat per-client folder",
    "Portal impact: No change until files are added"
  ].join("\n");
}

function uploadApprovalBody(input: {
  client: Client;
  fileName: string;
  label: string;
  folderLabel?: string | undefined;
  mimeType: string;
}): string {
  return [
    `Client: ${input.client.name}`,
    `Label: ${input.label}`,
    `File: ${input.fileName}`,
    `Type: ${input.mimeType}`,
    `Folder: ${input.folderLabel ?? "Unfiled"}`,
    "Portal visibility: Visible by default",
    "Source: Staff upload via Nexi"
  ].join("\n");
}

async function clientScopedIds(repository: NativeCrmRepository | undefined, tenantId: string, clientId: string): Promise<{ propertyIds: Set<string>; jobIds: Set<string> }> {
  if (!repository) {
    return { propertyIds: new Set(), jobIds: new Set() };
  }
  const [properties, jobs] = await Promise.all([
    repository.listProperties(tenantId),
    repository.listJobs(tenantId)
  ]);
  const propertyIds = new Set(properties.filter((property) => property.clientId === clientId).map((property) => property.id));
  const jobIds = new Set(
    jobs
      .filter((job) => job.clientId === clientId || (job.propertyId ? propertyIds.has(job.propertyId) : false))
      .map((job) => job.id)
  );
  return { propertyIds, jobIds };
}

function batchVisibleForViewer(batch: CaptureBatch, viewerRole?: TenantUserRole | undefined, viewerUserId?: string | undefined): boolean {
  if (viewerRole === "TECHNICIAN") {
    return batch.createdBy === viewerUserId;
  }
  return true;
}

async function expandBatch(repository: MediaRepository, batch: CaptureBatch) {
  const media = (await Promise.all(batch.mediaIds.map((id) => repository.getMedia(batch.tenantId, id))))
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .sort((left, right) => mediaTimestamp(right).localeCompare(mediaTimestamp(left)));
  return { ...batch, media };
}

async function resolveExactClientId(repository: NativeCrmRepository | undefined, tenantId: string, clientId?: string | undefined, clientName?: string | undefined): Promise<string> {
  if (clientId) {
    return clientId;
  }
  if (!repository || !clientName?.trim()) {
    throw new RailError("A client id or exact client name is required.", { provider: "native", op: "assignPhotoBatch", status: 400 });
  }
  const normalized = clientName.trim().toLowerCase();
  const matches = (await repository.listClients(tenantId)).filter((record) => record.name.trim().toLowerCase() === normalized);
  const [match] = matches;
  if (matches.length === 1 && match) {
    return match.id;
  }
  if (matches.length > 1) {
    throw new RailError(`Multiple clients match "${clientName}". Use a client id instead.`, { provider: "native", op: "assignPhotoBatch", status: 409 });
  }
  throw new RailError(`Client "${clientName}" was not found.`, { provider: "native", op: "assignPhotoBatch", status: 404 });
}

function mediaMatchesClientScope(
  record: { clientId?: string | undefined; propertyId?: string | undefined; jobId?: string | undefined },
  clientId: string | undefined,
  scoped: { propertyIds: Set<string>; jobIds: Set<string> } | null
): boolean {
  if (!clientId) {
    return true;
  }
  return record.clientId === clientId
    || Boolean(record.propertyId && scoped?.propertyIds.has(record.propertyId))
    || Boolean(record.jobId && scoped?.jobIds.has(record.jobId));
}

function checklistFindingLines(checklist: Awaited<ReturnType<MediaRepository["getChecklist"]>> | undefined): string[] {
  if (!checklist) {
    return [];
  }
  return checklist.fields
    .map((field) => {
      const value = formatChecklistFieldValue(field);
      return value && value !== "No note recorded" && value !== "No value recorded" && value !== "No selection" && value !== "No photos attached"
        ? `${field.label}: ${value}`
        : null;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
}

export function createFieldDocsTools(
  repositoryOrDeps: MediaRepository | {
    mediaRepository: MediaRepository;
    crmRepository?: NativeCrmRepository | undefined;
    fieldDocsService?: FieldDocsService | undefined;
    nexDocsService?: NexDocsService | undefined;
    approvalQueue?: ApprovalQueueService | undefined;
    viewerRole?: TenantUserRole | undefined;
    viewerUserId?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }
): NexiTool[] {
  const deps = normalizeDeps(repositoryOrDeps);
  return [
    {
      name: "photoSearch",
      description: "Search native NexCam media metadata by natural language.",
      inputSchema: photoSearchInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = photoSearchInputSchema.parse(args);
        const media = await deps.mediaRepository.listMedia(tenant.id);
        const hits = await searchMediaWithVisionFallback(media, input.query, input.limit ?? 10);
        return {
          result: { hits },
          sources: hits.map((hit) => source(hit.media.id, `Native media ${hit.media.id}`))
        };
      }
    },
    {
      name: "beforeAfterPairs",
      description: "Find native before/after photo pairs by job.",
      inputSchema: beforeAfterInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = beforeAfterInputSchema.parse(args);
        const media = await deps.mediaRepository.listMedia(tenant.id);
        const pairs = pairBeforeAfter(media).filter((pair) => input.jobId ? pair.jobId === input.jobId : true);
        return {
          result: { pairs },
          sources: pairs.flatMap((pair) => [
            source(pair.before.id, `Before media ${pair.before.id}`),
            source(pair.after.id, `After media ${pair.after.id}`)
          ])
        };
      }
    },
    {
      name: "getPropertyHistory",
      description: "Review completed NexCam checklist history for one property, including persistent field values across visits.",
      inputSchema: propertyHistoryInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = propertyHistoryInputSchema.parse(args);
        if (!deps.fieldDocsService) {
          throw new Error("Property history is not configured in this NexCam environment yet.");
        }
        const history = await deps.fieldDocsService.getPropertyHistory({
          tenantId: tenant.id,
          propertyId: input.propertyId,
          templateId: input.templateId,
          fieldId: input.fieldId
        });
        return {
          result: { history },
          sources: history.map((checklist) => source(checklist.id, `Completed checklist ${checklist.id}`))
        };
      }
    },
    {
      name: "listRecentPhotos",
      description: "List recent NexCam media for a client, property, job, or visit without requiring a search phrase.",
      inputSchema: listRecentPhotosInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = listRecentPhotosInputSchema.parse(args);
        const scoped = input.clientId ? await clientScopedIds(deps.crmRepository, tenant.id, input.clientId) : null;
        const media = (await deps.mediaRepository.listMedia(tenant.id))
          .filter((record) => !input.propertyId || record.propertyId === input.propertyId)
          .filter((record) => !input.jobId || record.jobId === input.jobId)
          .filter((record) => !input.visitId || record.visitId === input.visitId)
          .filter((record) => mediaMatchesClientScope(record, input.clientId, scoped))
          .sort((left, right) => mediaTimestamp(right).localeCompare(mediaTimestamp(left)))
          .slice(0, input.limit ?? 12);
        return {
          result: { media },
          sources: media.map((item) => source(item.id, `Recent media ${item.id}`))
        };
      }
    },
    {
      name: "getVisitReport",
      description: "Fetch the latest NexCam field report for a visit or job.",
      inputSchema: getVisitReportInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = getVisitReportInputSchema.parse(args);
        const reports = await deps.mediaRepository.listReports(tenant.id);
        const report = input.reportId
          ? reports.find((candidate) => candidate.id === input.reportId)
          : reports
              .filter((candidate) => !input.visitId || candidate.visitId === input.visitId)
              .filter((candidate) => !input.jobId || candidate.jobId === input.jobId)
              .sort((left, right) => (right.postedAt ?? right.createdAt).localeCompare(left.postedAt ?? left.createdAt))[0];
        return {
          result: { report: report ?? null },
          sources: report ? [source(report.id, `Field report ${report.id}`)] : []
        };
      }
    },
    {
      name: "generateVisitReport",
      description: "Generate and save a NexCam visit report from the current checklist and media context.",
      inputSchema: generateVisitReportInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = generateVisitReportInputSchema.parse(args);
        const media = (await deps.mediaRepository.listMedia(tenant.id))
          .filter((record) => record.jobId === input.jobId)
          .filter((record) => !input.visitId || record.visitId === input.visitId)
          .filter((record) => !input.propertyId || record.propertyId === input.propertyId);
        const checklist = input.checklistId
          ? await deps.mediaRepository.getChecklist(tenant.id, input.checklistId)
          : (await deps.mediaRepository.listChecklists(tenant.id))
              .filter((record) => record.jobId === input.jobId)
              .filter((record) => !input.visitId || record.visitId === input.visitId)
              .sort((left, right) => (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt))[0];
        const findings = input.findings?.length ? input.findings : checklistFindingLines(checklist);
        const report = createFieldReportRecord({
          tenantId: tenant.id,
          jobId: input.jobId,
          propertyId: input.propertyId ?? checklist?.propertyId,
          visitId: input.visitId ?? checklist?.visitId,
          title: input.title?.trim() || `Visit report ${input.visitId ?? input.jobId}`,
          findings: findings.length ? findings : ["Checklist-driven NexCam report generated for review."],
          mediaIds: media.map((item) => item.id),
          checklistId: checklist?.id,
          status: "posted"
        });
        const saved = await deps.mediaRepository.saveReport(report);
        return {
          result: {
            report: saved,
            pdfUrl: `/api/fielddocs/reports/${encodeURIComponent(saved.id)}/pdf?tenantId=${encodeURIComponent(saved.tenantId)}`
          },
          sources: [
            source(saved.id, `Generated report ${saved.id}`),
            ...(checklist ? [source(checklist.id, `Checklist ${checklist.id}`)] : []),
            ...media.slice(0, 6).map((item) => source(item.id, `Media ${item.id}`))
          ]
        };
      }
    },
    {
      name: "listUnassignedPhotoBatches",
      description: "List unassigned NexCam capture batches waiting to be routed to a client.",
      inputSchema: listUnassignedPhotoBatchesInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = listUnassignedPhotoBatchesInputSchema.parse(args);
        const batches = (await deps.mediaRepository.listCaptureBatches(tenant.id))
          .filter((batch) => batch.status === "unassigned")
          .filter((batch) => batchVisibleForViewer(batch, deps.viewerRole, deps.viewerUserId))
          .slice(0, input.limit ?? 12);
        const expanded = await Promise.all(batches.map((batch) => expandBatch(deps.mediaRepository, batch)));
        return {
          result: { batches: expanded },
          sources: expanded.map((batch) => source(batch.id, `Capture batch ${batch.id}`))
        };
      }
    },
    {
      name: "assignPhotoBatch",
      description: "Assign an unassigned NexCam capture batch to an existing client or a newly created request/client context.",
      inputSchema: assignPhotoBatchInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = assignPhotoBatchInputSchema.parse(args);
        const batch = await deps.mediaRepository.getCaptureBatch(tenant.id, input.batchId);
        if (!batch) {
          throw new RailError(`Capture batch ${input.batchId} was not found.`, { provider: "native", op: "assignPhotoBatch", status: 404 });
        }
        if (!batchVisibleForViewer(batch, deps.viewerRole, deps.viewerUserId)) {
          throw new RailError("That capture batch is outside your role scope.", { provider: "native", op: "assignPhotoBatch", status: 403 });
        }
        const media = (await Promise.all(batch.mediaIds.map((id) => deps.mediaRepository.getMedia(tenant.id, id))))
          .filter((record): record is NonNullable<typeof record> => Boolean(record));
        const timestamp = new Date().toISOString();

        if (input.mode === "existing_client") {
          const clientId = await resolveExactClientId(deps.crmRepository, tenant.id, input.clientId, input.clientName);
          const jobs = await deps.crmRepository?.listJobs(tenant.id) ?? [];
          const targetJob = input.jobId ? jobs.find((record) => record.id === input.jobId) : undefined;
          if (input.jobId && !targetJob) {
            throw new RailError(`Job ${input.jobId} was not found.`, { provider: "native", op: "assignPhotoBatch", status: 404 });
          }
          if (targetJob && targetJob.clientId !== clientId) {
            throw new RailError("Selected job does not belong to that client.", { provider: "native", op: "assignPhotoBatch", status: 409 });
          }
          for (const record of media) {
            await deps.mediaRepository.updateMedia(record.id, {
              clientId,
              ...(targetJob ? { jobId: targetJob.id, propertyId: targetJob.propertyId } : { jobId: undefined, propertyId: undefined }),
              ...(input.visitId ? { visitId: input.visitId } : { visitId: undefined })
            });
          }
          const saved = await deps.mediaRepository.updateCaptureBatch(batch.id, {
            status: "assigned",
            assignmentMode: "existing_client",
            assignedClientId: clientId,
            assignedJobId: targetJob?.id,
            assignedVisitId: input.visitId,
            assignedAt: timestamp,
            updatedAt: timestamp
          });
          return {
            result: { batch: await expandBatch(deps.mediaRepository, saved), clientId },
            sources: [source(saved.id, `Capture batch ${saved.id}`), source(clientId, `Client ${clientId}`)]
          };
        }

        if (!deps.crmRepository || !input.requestId) {
          throw new RailError("Request assignment is not configured in this NexCam environment.", { provider: "native", op: "assignPhotoBatch", status: 503 });
        }
        const request = await deps.crmRepository.getRequest(tenant.id, input.requestId);
        if (!request) {
          throw new RailError(`Request ${input.requestId} was not found.`, { provider: "native", op: "assignPhotoBatch", status: 404 });
        }
        const materialized = await materializeRequestCaptureContext(deps.crmRepository, request, batch.mediaIds);
        for (const record of media) {
          await deps.mediaRepository.updateMedia(record.id, {
            clientId: materialized.client.id,
            jobId: undefined,
            visitId: undefined,
            propertyId: undefined
          });
        }
        const saved = await deps.mediaRepository.updateCaptureBatch(batch.id, {
          status: "assigned",
          assignmentMode: "request",
          assignedClientId: materialized.client.id,
          assignedRequestId: request.id,
          assignedAt: timestamp,
          updatedAt: timestamp
        });
        return {
          result: {
            batch: await expandBatch(deps.mediaRepository, saved),
            requestId: request.id,
            clientId: materialized.client.id
          },
          sources: [source(saved.id, `Capture batch ${saved.id}`), source(request.id, `Request ${request.id}`), source(materialized.client.id, `Client ${materialized.client.id}`)]
        };
      }
    },
    {
      name: "searchDocuments",
      description: "Search one client's unified NexDocs library across custom folders, office records, and NexCam content.",
      inputSchema: searchDocumentsInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = searchDocumentsInputSchema.parse(args);
        if (!deps.nexDocsService) {
          throw new RailError("NexDocs search is not wired for this tenant yet.", { provider: "native", op: "searchDocuments", status: 501 });
        }
        const client = await resolveDocumentClient(deps.crmRepository, tenant.id, {
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.clientQuery ? { clientQuery: input.clientQuery } : {})
        }, "searchDocuments");
        const library = await deps.nexDocsService.listClientLibrary({
          tenantId: tenant.id,
          clientId: client.id,
          ...(input.propertyId ? { propertyId: input.propertyId } : {}),
          viewer: "staff",
          q: input.query
        });
        const hits = library.searchResults.slice(0, input.limit ?? 8);
        return {
          result: {
            client: { id: client.id, name: client.name },
            hits,
            counts: library.counts
          },
          sources: hits.map((hit) => source(hit.entry.id, `NexDocs hit ${hit.entry.label}`))
        };
      }
    },
    {
      name: "listClientFolders",
      description: "List the freeform NexDocs folders for one client, including document counts and the unfiled stack.",
      inputSchema: listClientFoldersInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = listClientFoldersInputSchema.parse(args);
        if (!deps.nexDocsService) {
          throw new RailError("NexDocs folder listing is not wired for this tenant yet.", { provider: "native", op: "listClientFolders", status: 501 });
        }
        const client = await resolveDocumentClient(deps.crmRepository, tenant.id, {
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.clientQuery ? { clientQuery: input.clientQuery } : {})
        }, "listClientFolders");
        const library = await deps.nexDocsService.listClientLibrary({
          tenantId: tenant.id,
          clientId: client.id,
          viewer: "staff"
        });
        return {
          result: {
            client: { id: client.id, name: client.name },
            folders: library.folders.map(({ folder, documents }) => ({
              id: folder.id,
              label: folder.label,
              documentCount: documents.length
            })),
            unfiledCount: library.unfiled.length,
            counts: library.counts
          },
          sources: [
            source(client.id, `Client ${client.name}`),
            ...library.folders.map(({ folder }) => source(folder.id, `Folder ${folder.label}`))
          ]
        };
      }
    },
    {
      name: "createFolder",
      description: "Queue a NexDocs folder create for approval from chat, then read the folder plan back before anything is written.",
      inputSchema: createFolderInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = createFolderInputSchema.parse(args);
        if (!deps.nexDocsService || !deps.approvalQueue) {
          throw new RailError("NexDocs folder creation is not wired for approval in this tenant yet.", { provider: "native", op: "createFolder", status: 501 });
        }
        const client = await resolveDocumentClient(deps.crmRepository, tenant.id, {
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.clientQuery ? { clientQuery: input.clientQuery } : {})
        }, "createFolder");
        const label = input.label.trim();
        const existing = await deps.nexDocsService.listFolders(tenant.id, client.id);
        const preview = {
          title: `Create folder: ${label}`,
          body: folderApprovalBody(client, label)
        };
        const approval = await deps.approvalQueue.create({
          tenantId: tenant.id,
          kind: "document",
          preview,
          execute: {
            service: "fielddocs",
            op: "createNexDocsFolder",
            args: {
              tenantId: tenant.id,
              clientId: client.id,
              label,
              ...(deps.viewerUserId ? { createdBy: deps.viewerUserId } : {})
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            client: { id: client.id, name: client.name },
            existingFolderCount: existing.length,
            approval: {
              id: approval.id,
              preview
            },
            writesAreApprovalQueuedOnly: true
          },
          sources: [source(approval.id, `ApprovalQueue folder create ${approval.id}`)]
        };
      }
    },
    {
      name: "uploadDocumentToFolder",
      description: "Queue a staff NexDocs upload from chat, then read the file, folder, and portal visibility back before it lands.",
      inputSchema: uploadDocumentToFolderInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = uploadDocumentToFolderInputSchema.parse(args);
        if (!deps.nexDocsService || !deps.approvalQueue) {
          throw new RailError("NexDocs uploads are not wired for approval in this tenant yet.", { provider: "native", op: "uploadDocumentToFolder", status: 501 });
        }
        const client = await resolveDocumentClient(deps.crmRepository, tenant.id, {
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.clientQuery ? { clientQuery: input.clientQuery } : {})
        }, "uploadDocumentToFolder");
        const folder = await resolveFolderForUpload(deps, tenant.id, client.id, input);
        const mimeType = inferMimeType(input.fileName, input.mimeType);
        const fileBase64 = input.fileBase64?.trim()
          ? input.fileBase64.trim()
          : Buffer.from(input.textContent?.trim() ?? "", "utf8").toString("base64");
        const label = input.label?.trim() || input.fileName.trim();
        const preview = {
          title: `Upload document: ${label}`,
          body: uploadApprovalBody({
            client,
            fileName: input.fileName.trim(),
            label,
            folderLabel: folder.folderLabel,
            mimeType
          })
        };
        const approval = await deps.approvalQueue.create({
          tenantId: tenant.id,
          kind: "document",
          preview,
          execute: {
            service: "fielddocs",
            op: "uploadNexDocsDocument",
            args: {
              tenantId: tenant.id,
              clientId: client.id,
              ...(folder.folderId ? { folderId: folder.folderId } : {}),
              label,
              fileName: input.fileName.trim(),
              mimeType,
              fileBase64,
              ...(input.propertyId ? { propertyId: input.propertyId } : {}),
              ...(input.jobId ? { jobId: input.jobId } : {}),
              ...(input.visitId ? { visitId: input.visitId } : {}),
              source: "staff_upload",
              ...(deps.viewerUserId ? { uploadedBy: deps.viewerUserId } : {})
            }
          },
          createdBy: "nexi"
        });
        return {
          result: {
            client: { id: client.id, name: client.name },
            approval: {
              id: approval.id,
              preview
            },
            writesAreApprovalQueuedOnly: true
          },
          sources: [source(approval.id, `ApprovalQueue document upload ${approval.id}`)]
        };
      }
    }
  ];
}

export const createFieldDocsReadTools = createFieldDocsTools;
