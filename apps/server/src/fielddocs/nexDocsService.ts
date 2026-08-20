import { randomUUID } from "node:crypto";
import { PDFParse } from "pdf-parse";
import {
  RailError,
  type Invoice,
  type Job,
  type Media,
  type NexDocsDocument,
  type NexDocsDocumentKind,
  type NexDocsFolder,
  type Property,
  type Quote,
  type ReceiptReview,
  type SignedDocumentRecord
} from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { UsageLogWriter } from "@nexteam/nexi";
import { getAdminStorageBucket } from "../firebase.js";
import type { LedgerService } from "../crm/ledgerFoundation.js";
import type { SchedulingRepository } from "../scheduling/repository.js";
import { safeFilename } from "./uploadService.js";
import { searchMediaWithVisionFallback } from "./photoSearch.js";
import type { FieldReportRecord } from "./reportService.js";
import type { MediaRepository } from "./mediaRepository.js";
import { maybeRunNexDocsOcr, type NexDocsOcrFetch } from "./nexDocsOcr.js";

export const NEXDOCS_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SEARCH_TEXT_LIMIT = 24_000;
const GENERIC_UPLOAD_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

const NEXDOCS_UPLOAD_SPECS = [
  { mimeType: "application/pdf", extensions: ["pdf"] },
  { mimeType: "application/msword", extensions: ["doc"] },
  { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensions: ["docx"] },
  { mimeType: "application/vnd.ms-excel", extensions: ["xls"] },
  { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensions: ["xlsx"] },
  { mimeType: "text/csv", extensions: ["csv"] },
  { mimeType: "text/plain", extensions: ["txt"] },
  { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { mimeType: "image/png", extensions: ["png"] },
  { mimeType: "video/mp4", extensions: ["mp4", "m4v"] },
  { mimeType: "video/quicktime", extensions: ["mov"] },
  { mimeType: "video/webm", extensions: ["webm"] }
] as const;

export interface NexDocsLibraryEntry {
  id: string;
  section: "folder" | "office_records" | "nexcam";
  kind: NexDocsDocumentKind;
  source: NexDocsDocument["source"] | "nexcam";
  label: string;
  fileName: string;
  mimeType: string;
  occurredAt: string;
  hiddenFromClient: boolean;
  generated: boolean;
  propertyLabel: string;
  folderId?: string | undefined;
  folderLabel?: string | undefined;
  propertyId?: string | undefined;
  jobId?: string | undefined;
  visitId?: string | undefined;
  quoteId?: string | undefined;
  invoiceId?: string | undefined;
  receiptReviewId?: string | undefined;
  signedDocumentId?: string | undefined;
  reportId?: string | undefined;
  mediaId?: string | undefined;
  sizeBytes?: number | undefined;
  searchText?: string | undefined;
}

export interface NexDocsFolderView {
  folder: NexDocsFolder;
  documents: NexDocsLibraryEntry[];
}

export interface NexDocsSearchHit {
  entry: NexDocsLibraryEntry;
  score: number;
  matched: string[];
}

export interface NexDocsClientLibrary {
  clientId: string;
  folders: NexDocsFolderView[];
  unfiled: NexDocsLibraryEntry[];
  officeRecords: NexDocsLibraryEntry[];
  nexcam: {
    reports: NexDocsLibraryEntry[];
    signedDocuments: NexDocsLibraryEntry[];
    media: NexDocsLibraryEntry[];
  };
  searchResults: NexDocsSearchHit[];
  counts: {
    uploaded: number;
    officeRecords: number;
    nexcam: number;
    total: number;
  };
}

interface NexDocsServiceDeps {
  mediaRepository: MediaRepository;
  crmRepository: Pick<NativeCrmRepository, "listClients" | "listQuotes" | "listInvoices" | "listJobs" | "listProperties">;
  ledgerService?: Pick<LedgerService, "listReceiptReviews"> | undefined;
  storeUpload?: StoreNexDocsUpload | undefined;
  usageLog?: UsageLogWriter | undefined;
  ocrFetch?: NexDocsOcrFetch | undefined;
  /** Resolves an optional visit link without allowing a document to cross a job boundary. */
  schedulingRepository?: Pick<SchedulingRepository, "getVisit"> | undefined;
}

export interface UploadNexDocsDocumentInput {
  tenantId: string;
  clientId: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
  source: NexDocsDocument["source"];
  label?: string | undefined;
  folderId?: string | undefined;
  propertyId?: string | undefined;
  jobId?: string | undefined;
  visitId?: string | undefined;
  uploadedBy?: string | undefined;
}

export interface StoredNexDocsUpload {
  storageRef: string;
  sizeBytes: number;
  bytes: Buffer;
}

export interface NormalizedNexDocsUpload {
  fileName: string;
  mimeType: string;
  extension: string;
}

export type StoreNexDocsUpload = (input: {
  tenantId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
  env?: NodeJS.ProcessEnv | undefined;
}) => Promise<StoredNexDocsUpload>;

function nowIso(): string {
  return new Date().toISOString();
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, SEARCH_TEXT_LIMIT);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function textLikeMime(mimeType: string): boolean {
  return mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "text/csv";
}

function propertyLabelForPropertyId(properties: Property[], propertyId: string | undefined): string {
  if (!propertyId) {
    return "Client";
  }
  return properties.find((property) => property.id === propertyId)?.label ?? "Property";
}

function propertyLabelForJob(properties: Property[], jobsById: Map<string, Job>, jobId: string | undefined): string {
  if (!jobId) {
    return "Client";
  }
  return propertyLabelForPropertyId(properties, jobsById.get(jobId)?.propertyId);
}

function extensionForFile(fileName: string): string {
  return fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function parseStorageRef(storageRef: string): { bucketName: string; objectPath: string } | null {
  const match = storageRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
  return match ? { bucketName: match[1]!, objectPath: match[2]! } : null;
}

export function normalizeNexDocsUpload(input: { fileName: string; mimeType: string }): NormalizedNexDocsUpload {
  const fileName = safeFilename(input.fileName.trim());
  const extension = extensionForFile(fileName);
  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const byExtension = NEXDOCS_UPLOAD_SPECS.find((spec) => spec.extensions.some((candidate) => candidate === extension));
  const byMimeType = NEXDOCS_UPLOAD_SPECS.find((spec) => spec.mimeType === normalizedMimeType);
  const matched = byExtension ?? byMimeType;
  if (!matched) {
    throw new RailError("NexDocs accepts PDF, Office docs, CSV/TXT, JPG/PNG, and common video files right now.", {
      provider: "native",
      op: "uploadNexDocsDocument",
      status: 415
    });
  }
  const mimeType = GENERIC_UPLOAD_MIME_TYPES.has(normalizedMimeType) ? matched.mimeType : (byMimeType?.mimeType ?? matched.mimeType);
  return { fileName, mimeType, extension };
}

async function storeUploadedDocumentBytes(input: {
  tenantId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
  env?: NodeJS.ProcessEnv | undefined;
}): Promise<StoredNexDocsUpload> {
  const bucket = getAdminStorageBucket(input.env);
  if (!bucket) {
    throw new RailError("Firebase Storage is not configured for NexDocs uploads.", { provider: "firebase", op: "nexDocsUpload", status: 503 });
  }
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.byteLength > NEXDOCS_MAX_UPLOAD_BYTES) {
    throw new RailError("That file is too large for NexDocs right now.", { provider: "native", op: "nexDocsUpload", status: 413 });
  }
  const fileName = safeFilename(input.fileName);
  const objectPath = `tenants/${input.tenantId}/nexdocs/${input.documentId}/${fileName}`;
  await bucket.file(objectPath).save(bytes, {
    resumable: false,
    metadata: {
      contentType: input.mimeType,
      metadata: {
        tenantId: input.tenantId,
        documentId: input.documentId
      }
    }
  });
  return {
    storageRef: `gs://${bucket.name}/${objectPath}`,
    sizeBytes: bytes.byteLength,
    bytes
  };
}

export async function extractSearchText(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const lowerFileName = input.fileName.toLowerCase();
  try {
    if (input.mimeType === "application/pdf" || lowerFileName.endsWith(".pdf")) {
      const parser = new PDFParse({ data: input.bytes });
      const parsed = await parser.getText();
      await parser.destroy();
      return normalizeSearchText(parsed.text ?? "");
    }
    if (textLikeMime(input.mimeType) || /\.(?:txt|csv|json)$/i.test(lowerFileName)) {
      return normalizeSearchText(input.bytes.toString("utf8"));
    }
  } catch {
    return "";
  }
  return "";
}

function entrySearchScore(entry: NexDocsLibraryEntry, query: string): NexDocsSearchHit | null {
  const queryTokens = tokens(query);
  if (!queryTokens.length) {
    return null;
  }
  const fields = [
    entry.label,
    entry.fileName,
    entry.propertyLabel,
    entry.folderLabel ?? "",
    entry.searchText ?? ""
  ].map((field) => field.toLowerCase());
  const matched = queryTokens.filter((token) => fields.some((field) => field.includes(token)));
  if (!matched.length) {
    return null;
  }
  return {
    entry,
    score: matched.length,
    matched
  };
}

function recordMatchesClientScope(
  record: { clientId?: string | undefined; propertyId?: string | undefined; jobId?: string | undefined },
  clientId: string,
  propertyId: string | undefined,
  jobsById: Map<string, Job>,
  propertiesById: Map<string, Property>
): boolean {
  const resolvedClientId = record.clientId
    ?? (record.propertyId ? propertiesById.get(record.propertyId)?.clientId : undefined)
    ?? (record.jobId ? jobsById.get(record.jobId)?.clientId : undefined);
  if (resolvedClientId !== clientId) {
    return false;
  }
  if (!propertyId) {
    return true;
  }
  if (record.propertyId === propertyId) {
    return true;
  }
  return record.jobId ? jobsById.get(record.jobId)?.propertyId === propertyId : false;
}

function recordMatchesWorkScope(
  record: { jobId?: string | undefined; visitId?: string | undefined },
  jobId: string | undefined,
  visitId: string | undefined
): boolean {
  return (!jobId || record.jobId === jobId) && (!visitId || record.visitId === visitId);
}

function jobAllowsPortalFieldDocs(job: Job | undefined): boolean {
  return job?.clientVisibility?.hideFieldDocsFromPortal !== true;
}

function uploadedDocumentEntry(
  document: NexDocsDocument,
  properties: Property[],
  jobsById: Map<string, Job>,
  foldersById: Map<string, NexDocsFolder>
): NexDocsLibraryEntry {
  const propertyId = document.propertyId ?? (document.jobId ? jobsById.get(document.jobId)?.propertyId : undefined);
  return {
    id: document.id,
    section: "folder",
    kind: document.kind,
    source: document.source,
    label: document.label,
    fileName: document.fileName,
    mimeType: document.mimeType,
    occurredAt: document.updatedAt,
    hiddenFromClient: document.hiddenFromClient === true,
    generated: false,
    propertyLabel: propertyLabelForPropertyId(properties, propertyId),
    ...(document.folderId ? { folderId: document.folderId, folderLabel: foldersById.get(document.folderId)?.label } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(document.jobId ? { jobId: document.jobId } : {}),
    ...(document.visitId ? { visitId: document.visitId } : {}),
    ...(document.sizeBytes !== undefined ? { sizeBytes: document.sizeBytes } : {}),
    ...(document.searchText ? { searchText: document.searchText } : {})
  };
}

function quoteDocumentEntry(quote: Quote, properties: Property[], jobsById: Map<string, Job>): NexDocsLibraryEntry {
  const title = quote.title?.trim() || quote.number || quote.id;
  const pdfLabel = quote.number ?? quote.id;
  return {
    id: `quote_pdf_${quote.id}`,
    section: "office_records",
    kind: "quote_pdf",
    source: "generated",
    label: `${title} - ${pdfLabel} PDF`,
    fileName: `${pdfLabel}.pdf`,
    mimeType: "application/pdf",
    occurredAt: quote.updatedAt ?? quote.createdAt ?? nowIso(),
    hiddenFromClient: false,
    generated: true,
    propertyLabel: propertyLabelForJob(properties, jobsById, quote.jobId),
    ...(quote.jobId ? { jobId: quote.jobId } : {}),
    quoteId: quote.id,
    searchText: [quote.number, quote.title].filter(Boolean).join(" ")
  };
}

function invoiceDocumentEntry(invoice: Invoice, properties: Property[], jobsById: Map<string, Job>): NexDocsLibraryEntry {
  const title = invoice.title?.trim() || invoice.number || invoice.id;
  const pdfLabel = invoice.number ?? invoice.id;
  return {
    id: `invoice_pdf_${invoice.id}`,
    section: "office_records",
    kind: "invoice_pdf",
    source: "generated",
    label: `${title} - ${pdfLabel} PDF`,
    fileName: `${pdfLabel}.pdf`,
    mimeType: "application/pdf",
    occurredAt: invoice.updatedAt ?? invoice.sentAt ?? invoice.createdAt ?? nowIso(),
    hiddenFromClient: false,
    generated: true,
    propertyLabel: propertyLabelForJob(properties, jobsById, invoice.jobId),
    ...(invoice.jobId ? { jobId: invoice.jobId } : {}),
    invoiceId: invoice.id,
    searchText: [invoice.number, invoice.title, invoice.status].filter(Boolean).join(" ")
  };
}

function receiptDocumentEntry(review: ReceiptReview, properties: Property[], jobsById: Map<string, Job>): NexDocsLibraryEntry {
  return {
    id: `receipt_${review.id}`,
    section: "office_records",
    kind: "receipt",
    source: "generated",
    label: review.subject,
    fileName: `${review.subject.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase() || review.id}.pdf`,
    mimeType: "application/pdf",
    occurredAt: review.updatedAt ?? review.createdAt ?? nowIso(),
    hiddenFromClient: false,
    generated: true,
    propertyLabel: propertyLabelForJob(properties, jobsById, review.jobId),
    ...(review.jobId ? { jobId: review.jobId } : {}),
    receiptReviewId: review.id,
    searchText: [review.subject, review.invoiceId, review.quoteId].filter(Boolean).join(" ")
  };
}

function statementDocumentEntry(clientId: string): NexDocsLibraryEntry {
  return {
    id: `statement_${clientId}`,
    section: "office_records",
    kind: "statement",
    source: "generated",
    label: "Client statement",
    fileName: `statement-${clientId}.pdf`,
    mimeType: "application/pdf",
    occurredAt: nowIso(),
    hiddenFromClient: false,
    generated: true,
    propertyLabel: "Client",
    searchText: "client statement account statement"
  };
}

function reportDocumentEntry(report: FieldReportRecord, properties: Property[], jobsById: Map<string, Job>): NexDocsLibraryEntry {
  const propertyId = report.propertyId ?? jobsById.get(report.jobId)?.propertyId;
  return {
    id: `field_report_${report.id}`,
    section: "nexcam",
    kind: "field_report",
    source: "nexcam",
    label: report.title,
    fileName: `${report.title.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase() || report.id}.pdf`,
    mimeType: "application/pdf",
    occurredAt: report.postedAt ?? report.createdAt,
    hiddenFromClient: false,
    generated: true,
    propertyLabel: propertyLabelForPropertyId(properties, propertyId),
    ...(propertyId ? { propertyId } : {}),
    jobId: report.jobId,
    ...(report.visitId ? { visitId: report.visitId } : {}),
    reportId: report.id,
    searchText: [report.title, ...(report.findings ?? [])].join(" ")
  };
}

function signedDocumentEntry(record: SignedDocumentRecord, properties: Property[], jobsById: Map<string, Job>): NexDocsLibraryEntry {
  const propertyId = record.propertyId ?? (record.jobId ? jobsById.get(record.jobId)?.propertyId : undefined);
  return {
    id: `signed_document_${record.id}`,
    section: "nexcam",
    kind: "signed_document",
    source: "nexcam",
    label: record.title,
    fileName: `${record.title.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase() || record.id}.pdf`,
    mimeType: "application/pdf",
    occurredAt: record.signedAt ?? record.updatedAt ?? record.createdAt,
    hiddenFromClient: false,
    generated: true,
    propertyLabel: propertyLabelForPropertyId(properties, propertyId),
    ...(propertyId ? { propertyId } : {}),
    ...(record.jobId ? { jobId: record.jobId } : {}),
    ...(record.visitId ? { visitId: record.visitId } : {}),
    signedDocumentId: record.id,
    searchText: [record.title, record.bodyText, record.kind].join(" ")
  };
}

function mediaDocumentEntry(media: Media, properties: Property[], jobsById: Map<string, Job>): NexDocsLibraryEntry {
  const propertyId = media.propertyId ?? (media.jobId ? jobsById.get(media.jobId)?.propertyId : undefined);
  const label = media.aiCaption
    ?? `${media.type === "video"
      ? "Visit video"
      : media.type === "audio"
        ? "Visit audio"
        : media.type === "pdf"
          ? "Visit PDF"
          : "Visit photo"} ${media.id}`;
  return {
    id: `photo_${media.id}`,
    section: "nexcam",
    kind: "photo",
    source: "nexcam",
    label,
    fileName: label,
    mimeType: media.type === "video"
      ? "video/mp4"
      : media.type === "audio"
        ? "audio/m4a"
        : media.type === "pdf"
          ? "application/pdf"
          : "image/jpeg",
    occurredAt: media.exif?.ts ?? nowIso(),
    hiddenFromClient: media.hiddenFromClient === true,
    generated: true,
    propertyLabel: propertyLabelForPropertyId(properties, propertyId),
    ...(propertyId ? { propertyId } : {}),
    ...(media.jobId ? { jobId: media.jobId } : {}),
    ...(media.visitId ? { visitId: media.visitId } : {}),
    mediaId: media.id,
    searchText: unique([label, ...(media.aiTags ?? []), ...(media.manualTags ?? [])]).join(" ")
  };
}

export function staffDocumentHref(tenantId: string, entry: NexDocsLibraryEntry): string {
  if (entry.kind === "uploaded_file") {
    return `/api/nexdocs/documents/${encodeURIComponent(entry.id)}/file?tenantId=${encodeURIComponent(tenantId)}&download=1`;
  }
  if (entry.kind === "quote_pdf" && entry.quoteId) {
    return `/api/crm/quotes/${encodeURIComponent(entry.quoteId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "invoice_pdf" && entry.invoiceId) {
    return `/api/crm/invoices/${encodeURIComponent(entry.invoiceId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "receipt" && entry.receiptReviewId) {
    return `/api/crm/receipt-reviews/${encodeURIComponent(entry.receiptReviewId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "statement") {
    return `/api/crm/clients/${encodeURIComponent(entry.id.replace(/^statement_/, ""))}/statement.pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "field_report" && entry.reportId) {
    return `/api/fielddocs/reports/${encodeURIComponent(entry.reportId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "signed_document" && entry.signedDocumentId) {
    return `/api/fielddocs/signed-documents/${encodeURIComponent(entry.signedDocumentId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "photo" && entry.mediaId) {
    return `/api/media/${encodeURIComponent(entry.mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  return "#";
}

export function portalDocumentHref(tenantId: string, clientId: string, entry: NexDocsLibraryEntry): string {
  if (entry.kind === "uploaded_file") {
    return `/nexportal/documents/${encodeURIComponent(entry.id)}/file?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "quote_pdf" && entry.quoteId) {
    return `/nexportal/quotes/${encodeURIComponent(entry.quoteId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "invoice_pdf" && entry.invoiceId) {
    return `/nexportal/invoices/${encodeURIComponent(entry.invoiceId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "receipt" && entry.receiptReviewId) {
    return `/api/crm/receipt-reviews/${encodeURIComponent(entry.receiptReviewId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "statement") {
    return `/nexportal/statements/${encodeURIComponent(clientId)}.pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "field_report" && entry.reportId) {
    return `/api/fielddocs/reports/${encodeURIComponent(entry.reportId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "signed_document" && entry.signedDocumentId) {
    return `/api/fielddocs/signed-documents/${encodeURIComponent(entry.signedDocumentId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "photo" && entry.mediaId) {
    return `/api/media/${encodeURIComponent(entry.mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  return "#";
}

export class NexDocsService {
  constructor(private readonly deps: NexDocsServiceDeps) {}

  private async resolveDocumentLinks(input: Pick<UploadNexDocsDocumentInput, "tenantId" | "clientId" | "propertyId" | "jobId" | "visitId">): Promise<{
    propertyId?: string;
    jobId?: string;
    visitId?: string;
  }> {
    const [clients, properties, jobs] = await Promise.all([
      this.deps.crmRepository.listClients(input.tenantId),
      this.deps.crmRepository.listProperties(input.tenantId),
      this.deps.crmRepository.listJobs(input.tenantId)
    ]);
    if (!clients.some((client) => client.id === input.clientId)) {
      throw new RailError(`Client ${input.clientId} was not found.`, { provider: "native", op: "linkNexDocsDocument", status: 404 });
    }
    const property = input.propertyId ? properties.find((record) => record.id === input.propertyId) : undefined;
    if (input.propertyId && (!property || property.clientId !== input.clientId)) {
      throw new RailError("Selected property does not belong to this client.", { provider: "native", op: "linkNexDocsDocument", status: 409 });
    }
    let job = input.jobId ? jobs.find((record) => record.id === input.jobId) : undefined;
    if (input.jobId && (!job || job.clientId !== input.clientId)) {
      throw new RailError("Selected job does not belong to this client.", { provider: "native", op: "linkNexDocsDocument", status: 409 });
    }
    let visitId = input.visitId;
    if (visitId) {
      if (!this.deps.schedulingRepository) {
        throw new RailError("Visit linking is not configured for NexDocs.", { provider: "native", op: "linkNexDocsDocument", status: 503 });
      }
      const visit = await this.deps.schedulingRepository.getVisit(input.tenantId, visitId);
      if (!visit) {
        throw new RailError(`Visit ${visitId} was not found.`, { provider: "native", op: "linkNexDocsDocument", status: 404 });
      }
      job = job ?? jobs.find((record) => record.id === visit.jobId);
      if (!job || job.clientId !== input.clientId || visit.jobId !== job.id) {
        throw new RailError("Selected visit does not belong to this client's job.", { provider: "native", op: "linkNexDocsDocument", status: 409 });
      }
    }
    if (property && job?.propertyId && property.id !== job.propertyId) {
      throw new RailError("Selected property does not match the selected job.", { provider: "native", op: "linkNexDocsDocument", status: 409 });
    }
    return {
      ...(property ? { propertyId: property.id } : job?.propertyId ? { propertyId: job.propertyId } : {}),
      ...(job ? { jobId: job.id } : {}),
      ...(visitId ? { visitId } : {})
    };
  }

  async listFolders(tenantId: string, clientId: string): Promise<NexDocsFolder[]> {
    return (await this.deps.mediaRepository.listNexDocsFolders(tenantId))
      .filter((folder) => folder.clientId === clientId);
  }

  async createFolder(input: {
    tenantId: string;
    clientId: string;
    label: string;
    createdBy?: string | undefined;
  }): Promise<NexDocsFolder> {
    const label = input.label.trim();
    if (!label) {
      throw new RailError("Folder name is required.", { provider: "native", op: "createNexDocsFolder", status: 400 });
    }
    const existing = await this.listFolders(input.tenantId, input.clientId);
    if (existing.some((folder) => folder.label.trim().toLowerCase() === label.toLowerCase())) {
      throw new RailError(`A folder named "${label}" already exists for this client.`, { provider: "native", op: "createNexDocsFolder", status: 409 });
    }
    const timestamp = nowIso();
    return this.deps.mediaRepository.saveNexDocsFolder({
      id: `nexdocs_folder_${randomUUID()}`,
      tenantId: input.tenantId,
      clientId: input.clientId,
      label,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.createdBy ? { createdBy: input.createdBy } : {})
    });
  }

  async deleteFolder(input: { tenantId: string; clientId: string; folderId: string }): Promise<void> {
    const folder = await this.deps.mediaRepository.getNexDocsFolder(input.tenantId, input.folderId);
    if (!folder || folder.clientId !== input.clientId) {
      throw new RailError(`NexDocs folder ${input.folderId} was not found.`, { provider: "native", op: "deleteNexDocsFolder", status: 404 });
    }
    const docs = await this.deps.mediaRepository.listNexDocsDocuments(input.tenantId);
    if (docs.some((document) => document.clientId === input.clientId && document.folderId === input.folderId)) {
      throw new RailError("Move or delete the documents in this folder before deleting it.", { provider: "native", op: "deleteNexDocsFolder", status: 409 });
    }
    await this.deps.mediaRepository.deleteNexDocsFolder(input.tenantId, input.folderId);
  }

  async uploadDocument(input: UploadNexDocsDocumentInput, env: NodeJS.ProcessEnv = process.env): Promise<NexDocsDocument> {
    if (input.folderId) {
      const folder = await this.deps.mediaRepository.getNexDocsFolder(input.tenantId, input.folderId);
      if (!folder || folder.clientId !== input.clientId) {
        throw new RailError(`NexDocs folder ${input.folderId} was not found for this client.`, { provider: "native", op: "uploadNexDocsDocument", status: 404 });
      }
    }
    const links = await this.resolveDocumentLinks(input);
    const id = `nexdocs_doc_${randomUUID()}`;
    const timestamp = nowIso();
    const normalizedUpload = normalizeNexDocsUpload({
      fileName: input.fileName,
      mimeType: input.mimeType
    });
    const upload = await (this.deps.storeUpload ?? storeUploadedDocumentBytes)({
      tenantId: input.tenantId,
      documentId: id,
      fileName: normalizedUpload.fileName,
      mimeType: normalizedUpload.mimeType,
      fileBase64: input.fileBase64,
      env
    });
    let searchText = await extractSearchText({
      bytes: upload.bytes,
      fileName: normalizedUpload.fileName,
      mimeType: normalizedUpload.mimeType
    });
    if (!searchText) {
      const ocrResult = await maybeRunNexDocsOcr({
        tenantId: input.tenantId,
        fileName: normalizedUpload.fileName,
        mimeType: normalizedUpload.mimeType,
        bytes: upload.bytes,
        env,
        fetchImpl: this.deps.ocrFetch,
        usageLog: this.deps.usageLog
      });
      searchText = ocrResult.searchText ? normalizeSearchText(ocrResult.searchText) : "";
    }
    return this.deps.mediaRepository.saveNexDocsDocument({
      id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...links,
      kind: "uploaded_file",
      source: input.source,
      label: input.label?.trim() || normalizedUpload.fileName,
      fileName: normalizedUpload.fileName,
      mimeType: normalizedUpload.mimeType,
      storageRef: upload.storageRef,
      sizeBytes: upload.sizeBytes,
      ...(searchText ? { searchText } : {}),
      hiddenFromClient: false,
      ...(input.uploadedBy ? { uploadedBy: input.uploadedBy } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async getUploadedDocument(tenantId: string, documentId: string): Promise<NexDocsDocument> {
    const document = await this.deps.mediaRepository.getNexDocsDocument(tenantId, documentId);
    if (!document) {
      throw new RailError(`NexDocs document ${documentId} was not found.`, { provider: "native", op: "getNexDocsDocument", status: 404 });
    }
    return document;
  }

  async updateUploadedDocument(input: {
    tenantId: string;
    clientId: string;
    documentId: string;
    folderId?: string | null | undefined;
    label?: string | undefined;
    hiddenFromClient?: boolean | undefined;
  }): Promise<NexDocsDocument> {
    const existing = await this.getUploadedDocument(input.tenantId, input.documentId);
    if (existing.clientId !== input.clientId) {
      throw new RailError("That NexDocs document does not belong to this client.", { provider: "native", op: "updateNexDocsDocument", status: 403 });
    }
    if (input.folderId) {
      const folder = await this.deps.mediaRepository.getNexDocsFolder(input.tenantId, input.folderId);
      if (!folder || folder.clientId !== input.clientId) {
        throw new RailError(`NexDocs folder ${input.folderId} was not found for this client.`, { provider: "native", op: "updateNexDocsDocument", status: 404 });
      }
    }
    return this.deps.mediaRepository.updateNexDocsDocument(input.tenantId, input.documentId, {
      ...(input.folderId === null ? { folderId: undefined } : input.folderId ? { folderId: input.folderId } : {}),
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      ...(input.hiddenFromClient !== undefined ? { hiddenFromClient: input.hiddenFromClient } : {}),
      updatedAt: nowIso()
    });
  }

  async deleteUploadedDocument(input: { tenantId: string; clientId: string; documentId: string; env?: NodeJS.ProcessEnv | undefined }): Promise<void> {
    const existing = await this.getUploadedDocument(input.tenantId, input.documentId);
    if (existing.clientId !== input.clientId) {
      throw new RailError("That NexDocs document does not belong to this client.", { provider: "native", op: "deleteNexDocsDocument", status: 403 });
    }
    const bucket = getAdminStorageBucket(input.env);
    const storageRef = parseStorageRef(existing.storageRef);
    if (bucket && storageRef && bucket.name === storageRef.bucketName) {
      await bucket.file(storageRef.objectPath).delete({ ignoreNotFound: true });
    }
    await this.deps.mediaRepository.deleteNexDocsDocument(input.tenantId, input.documentId);
  }

  async listClientLibrary(input: {
    tenantId: string;
    clientId: string;
    propertyId?: string | undefined;
    jobId?: string | undefined;
    visitId?: string | undefined;
    viewer: "staff" | "portal";
    includeClientStatement?: boolean | undefined;
    q?: string | undefined;
  }): Promise<NexDocsClientLibrary> {
    const [properties, jobs, quotes, invoices, folders, uploadedDocs, media, reports, signedDocuments, receiptReviews] = await Promise.all([
      this.deps.crmRepository.listProperties(input.tenantId),
      this.deps.crmRepository.listJobs(input.tenantId),
      this.deps.crmRepository.listQuotes(input.tenantId),
      this.deps.crmRepository.listInvoices(input.tenantId),
      this.deps.mediaRepository.listNexDocsFolders(input.tenantId),
      this.deps.mediaRepository.listNexDocsDocuments(input.tenantId),
      this.deps.mediaRepository.listMedia(input.tenantId),
      this.deps.mediaRepository.listReports(input.tenantId),
      this.deps.mediaRepository.listSignedDocuments(input.tenantId),
      this.deps.ledgerService?.listReceiptReviews(input.tenantId) ?? Promise.resolve([])
    ]);
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const propertiesById = new Map(properties.map((property) => [property.id, property]));
    let scopedJobId = input.jobId;
    if (scopedJobId) {
      const job = jobsById.get(scopedJobId);
      if (!job || job.clientId !== input.clientId) {
        throw new RailError("Selected job does not belong to this client.", { provider: "native", op: "listNexDocsLibrary", status: 404 });
      }
    }
    if (input.visitId) {
      if (!this.deps.schedulingRepository) {
        throw new RailError("Visit filtering is not configured for NexDocs.", { provider: "native", op: "listNexDocsLibrary", status: 503 });
      }
      const visit = await this.deps.schedulingRepository.getVisit(input.tenantId, input.visitId);
      const visitJob = visit ? jobsById.get(visit.jobId) : undefined;
      if (!visit || !visitJob || visitJob.clientId !== input.clientId || (scopedJobId && visit.jobId !== scopedJobId)) {
        throw new RailError("Selected visit does not belong to this client and job.", { provider: "native", op: "listNexDocsLibrary", status: 404 });
      }
      scopedJobId = visit.jobId;
    }
    const folderList = folders
      .filter((folder) => folder.clientId === input.clientId)
      .sort((left, right) => left.label.localeCompare(right.label));
    const foldersById = new Map(folderList.map((folder) => [folder.id, folder]));
    const visibleUploadedDocs = uploadedDocs
      .filter((document) => recordMatchesClientScope(document, input.clientId, input.propertyId, jobsById, propertiesById))
      .filter((document) => recordMatchesWorkScope(document, scopedJobId, input.visitId))
      .filter((document) => input.viewer === "staff" || document.hiddenFromClient !== true)
      .map((document) => uploadedDocumentEntry(document, properties, jobsById, foldersById))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const visibleQuotes = quotes
      .filter((quote) => quote.clientId === input.clientId)
      .filter((quote) => recordMatchesWorkScope(quote, scopedJobId, input.visitId))
      .filter((quote) => !input.propertyId || jobsById.get(quote.jobId ?? "")?.propertyId === input.propertyId)
      .map((quote) => quoteDocumentEntry(quote, properties, jobsById));
    const visibleInvoices = invoices
      .filter((invoice) => invoice.clientId === input.clientId)
      .filter((invoice) => recordMatchesWorkScope(invoice, scopedJobId, input.visitId))
      .filter((invoice) => !input.propertyId || jobsById.get(invoice.jobId ?? "")?.propertyId === input.propertyId)
      .map((invoice) => invoiceDocumentEntry(invoice, properties, jobsById));
    const visibleReceipts = receiptReviews
      .filter((review) => review.clientId === input.clientId)
      .filter((review) => recordMatchesWorkScope(review, scopedJobId, input.visitId))
      .filter((review) => !input.propertyId || jobsById.get(review.jobId ?? "")?.propertyId === input.propertyId)
      .map((review) => receiptDocumentEntry(review, properties, jobsById));
    const officeRecords = [
      ...visibleQuotes,
      ...visibleInvoices,
      ...visibleReceipts,
      ...(input.includeClientStatement === false || input.propertyId || scopedJobId || input.visitId ? [] : [statementDocumentEntry(input.clientId)])
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const visibleReports = reports
      .filter((report) => recordMatchesClientScope(report, input.clientId, input.propertyId, jobsById, propertiesById))
      .filter((report) => recordMatchesWorkScope(report, scopedJobId, input.visitId))
      .filter((report) => input.viewer === "staff" || jobAllowsPortalFieldDocs(jobsById.get(report.jobId)))
      .map((report) => reportDocumentEntry(report, properties, jobsById))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const visibleSignedDocuments = signedDocuments
      .filter((record) => recordMatchesClientScope(record, input.clientId, input.propertyId, jobsById, propertiesById))
      .filter((record) => recordMatchesWorkScope(record, scopedJobId, input.visitId))
      .filter((record) => input.viewer === "staff" || jobAllowsPortalFieldDocs(record.jobId ? jobsById.get(record.jobId) : undefined))
      .map((record) => signedDocumentEntry(record, properties, jobsById))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const visibleMedia = media
      .filter((record) => recordMatchesClientScope(record, input.clientId, input.propertyId, jobsById, propertiesById))
      .filter((record) => recordMatchesWorkScope(record, scopedJobId, input.visitId))
      .filter((record) => input.viewer === "staff" || record.hiddenFromClient !== true)
      .filter((record) => input.viewer === "staff" || jobAllowsPortalFieldDocs(record.jobId ? jobsById.get(record.jobId) : undefined))
      .sort((left, right) => (right.exif?.ts ?? "").localeCompare(left.exif?.ts ?? ""));
    const mediaEntries = visibleMedia.map((record) => mediaDocumentEntry(record, properties, jobsById));
    const foldersView = folderList.map((folder) => ({
      folder,
      documents: visibleUploadedDocs
        .filter((entry) => entry.folderId === folder.id)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    }));
    const unfiled = visibleUploadedDocs.filter((entry) => !entry.folderId);
    const query = input.q?.trim() ?? "";
    const searchResults: NexDocsSearchHit[] = [];
    if (query) {
      const simpleEntries = [
        ...visibleUploadedDocs,
        ...officeRecords,
        ...visibleReports,
        ...visibleSignedDocuments
      ];
      simpleEntries.forEach((entry) => {
        const hit = entrySearchScore(entry, query);
        if (hit) {
          searchResults.push(hit);
        }
      });
      const mediaHits = await searchMediaWithVisionFallback(visibleMedia, query, 12);
      mediaHits.forEach((hit) => {
        const entry = mediaDocumentEntry(hit.media, properties, jobsById);
        searchResults.push({
          entry,
          score: hit.score,
          matched: hit.matched
        });
      });
      searchResults.sort((left, right) => right.score - left.score || right.entry.occurredAt.localeCompare(left.entry.occurredAt));
    }
    return {
      clientId: input.clientId,
      folders: foldersView,
      unfiled,
      officeRecords,
      nexcam: {
        reports: visibleReports,
        signedDocuments: visibleSignedDocuments,
        media: mediaEntries
      },
      searchResults,
      counts: {
        uploaded: visibleUploadedDocs.length,
        officeRecords: officeRecords.length,
        nexcam: visibleReports.length + visibleSignedDocuments.length + mediaEntries.length,
        total: visibleUploadedDocs.length + officeRecords.length + visibleReports.length + visibleSignedDocuments.length + mediaEntries.length
      }
    };
  }
}
