import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  captureBatchSchema,
  mediaSchema,
  nexDocsDocumentSchema,
  nexDocsFolderSchema,
  RailError,
  type CaptureBatch,
  type Media,
  type NexDocsDocument,
  type NexDocsFolder
} from "@nexteam/core";
import { checklistInstanceSchema, checklistTemplateSchema, type ChecklistInstance, type ChecklistTemplate } from "./checklists.js";
import {
  fieldDocsBundleSchema,
  fieldDocsTextSnippetSchema,
  fieldReportTemplateSchema,
  type FieldDocsBundle,
  type FieldDocsTextSnippet,
  type FieldReportTemplate,
  type SignedDocumentRecord
} from "./fieldDocsRecords.js";
import { fieldReportRecordSchema, type FieldReportRecord } from "./reportService.js";
import { signedDocumentRecordSchema } from "@nexteam/core";
import { formAuditSchema, formResponseSchema, formSchema, type FormAudit, type FormResponse, type TenantForm } from "./forms.js";

export interface MediaRepository {
  listMedia(tenantId: string): Promise<Media[]>;
  getMedia(tenantId: string, id: string): Promise<Media | null>;
  saveMedia(media: Media): Promise<Media>;
  updateMedia(tenantId: string, id: string, patch: Partial<Media>): Promise<Media>;
  listCaptureBatches(tenantId: string): Promise<CaptureBatch[]>;
  getCaptureBatch(tenantId: string, id: string): Promise<CaptureBatch | null>;
  saveCaptureBatch(batch: CaptureBatch): Promise<CaptureBatch>;
  updateCaptureBatch(tenantId: string, id: string, patch: Partial<CaptureBatch>): Promise<CaptureBatch>;
  listChecklistTemplates(tenantId: string): Promise<ChecklistTemplate[]>;
  getChecklistTemplate(tenantId: string, id: string): Promise<ChecklistTemplate | null>;
  upsertChecklistTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate>;
  listChecklists(tenantId: string): Promise<ChecklistInstance[]>;
  saveChecklist(checklist: ChecklistInstance): Promise<ChecklistInstance>;
  getChecklist(tenantId: string, id: string): Promise<ChecklistInstance | null>;
  listForms(tenantId: string): Promise<TenantForm[]>;
  getForm(tenantId: string, id: string): Promise<TenantForm | null>;
  saveForm(form: TenantForm): Promise<TenantForm>;
  listFormResponses(tenantId: string): Promise<FormResponse[]>;
  getFormResponse(tenantId: string, id: string): Promise<FormResponse | null>;
  saveFormResponse(response: FormResponse): Promise<FormResponse>;
  listFormAudit(tenantId: string, responseId: string): Promise<FormAudit[]>;
  saveFormAudit(audit: FormAudit): Promise<FormAudit>;
  listReports(tenantId: string): Promise<FieldReportRecord[]>;
  saveReport(report: FieldReportRecord): Promise<FieldReportRecord>;
  getReport(tenantId: string, id: string): Promise<FieldReportRecord | null>;
  listReportTemplates(tenantId: string): Promise<FieldReportTemplate[]>;
  upsertReportTemplate(template: FieldReportTemplate): Promise<FieldReportTemplate>;
  getReportTemplate(tenantId: string, id: string): Promise<FieldReportTemplate | null>;
  listBundles(tenantId: string): Promise<FieldDocsBundle[]>;
  upsertBundle(bundle: FieldDocsBundle): Promise<FieldDocsBundle>;
  getBundle(tenantId: string, id: string): Promise<FieldDocsBundle | null>;
  listTextSnippets(tenantId: string): Promise<FieldDocsTextSnippet[]>;
  upsertTextSnippet(snippet: FieldDocsTextSnippet): Promise<FieldDocsTextSnippet>;
  getTextSnippet(tenantId: string, id: string): Promise<FieldDocsTextSnippet | null>;
  listSignedDocuments(tenantId: string): Promise<SignedDocumentRecord[]>;
  saveSignedDocument(record: SignedDocumentRecord): Promise<SignedDocumentRecord>;
  getSignedDocument(tenantId: string, id: string): Promise<SignedDocumentRecord | null>;
  listNexDocsFolders(tenantId: string): Promise<NexDocsFolder[]>;
  getNexDocsFolder(tenantId: string, id: string): Promise<NexDocsFolder | null>;
  saveNexDocsFolder(folder: NexDocsFolder): Promise<NexDocsFolder>;
  deleteNexDocsFolder(tenantId: string, id: string): Promise<void>;
  listNexDocsDocuments(tenantId: string): Promise<NexDocsDocument[]>;
  getNexDocsDocument(tenantId: string, id: string): Promise<NexDocsDocument | null>;
  saveNexDocsDocument(document: NexDocsDocument): Promise<NexDocsDocument>;
  updateNexDocsDocument(tenantId: string, id: string, patch: Partial<NexDocsDocument>): Promise<NexDocsDocument>;
  deleteNexDocsDocument(tenantId: string, id: string): Promise<void>;
}

export class MemoryMediaRepository implements MediaRepository {
  private readonly records: Media[];
  private readonly templates: ChecklistTemplate[];
  private readonly checklists: ChecklistInstance[];
  private readonly forms: TenantForm[] = [];
  private readonly formResponses: FormResponse[] = [];
  private readonly formAudits: FormAudit[] = [];
  private readonly reports: FieldReportRecord[];
  private readonly reportTemplates: FieldReportTemplate[];
  private readonly bundles: FieldDocsBundle[];
  private readonly textSnippets: FieldDocsTextSnippet[];
  private readonly signedDocuments: SignedDocumentRecord[];
  private readonly nexDocsFolders: NexDocsFolder[];
  private readonly nexDocsDocuments: NexDocsDocument[];
  private readonly captureBatches: CaptureBatch[];

  constructor(
    records: Media[] = [],
    checklists: ChecklistInstance[] = [],
    reports: FieldReportRecord[] = [],
    templates: ChecklistTemplate[] = [],
    reportTemplates: FieldReportTemplate[] = [],
    bundles: FieldDocsBundle[] = [],
    textSnippets: FieldDocsTextSnippet[] = [],
    signedDocuments: SignedDocumentRecord[] = [],
    nexDocsFolders: NexDocsFolder[] = [],
    nexDocsDocuments: NexDocsDocument[] = [],
    captureBatches: CaptureBatch[] = []
  ) {
    // Preserve older positional fixtures that passed capture batches before NexDocs
    // introduced the extra folder/document arrays ahead of that slot.
    const legacyCaptureBatchArg =
      captureBatches.length === 0
      && nexDocsDocuments.length === 0
      && nexDocsFolders.every(
        (record) => typeof record === "object"
          && record !== null
          && "status" in record
          && "createdBy" in record
          && "mediaIds" in record
      );
    const resolvedNexDocsFolders = legacyCaptureBatchArg ? [] : nexDocsFolders;
    const resolvedCaptureBatches = legacyCaptureBatchArg
      ? (nexDocsFolders as unknown as CaptureBatch[])
      : captureBatches;
    this.records = [...records];
    this.templates = [...templates];
    this.checklists = [...checklists];
    this.reports = [...reports];
    this.reportTemplates = [...reportTemplates];
    this.bundles = [...bundles];
    this.textSnippets = [...textSnippets];
    this.signedDocuments = [...signedDocuments];
    this.nexDocsFolders = [...resolvedNexDocsFolders];
    this.nexDocsDocuments = [...nexDocsDocuments];
    this.captureBatches = [...resolvedCaptureBatches];
  }

  async listMedia(tenantId: string): Promise<Media[]> {
    return this.records.filter((record) => record.tenantId === tenantId);
  }

  async getMedia(tenantId: string, id: string): Promise<Media | null> {
    return this.records.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async saveMedia(media: Media): Promise<Media> {
    this.records.push(media);
    return media;
  }

  async updateMedia(tenantId: string, id: string, patch: Partial<Media>): Promise<Media> {
    const index = this.records.findIndex((record) => record.id === id && record.tenantId === tenantId);
    if (index === -1) {
      throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
    }
    const existing = this.records[index];
    if (!existing) {
      throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
    }
    const next = mediaSchema.parse({ ...existing, ...patch, tenantId }) as Media;
    this.records[index] = next;
    return next;
  }

  async listCaptureBatches(tenantId: string): Promise<CaptureBatch[]> {
    return this.captureBatches
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getCaptureBatch(tenantId: string, id: string): Promise<CaptureBatch | null> {
    return this.captureBatches.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async saveCaptureBatch(batch: CaptureBatch): Promise<CaptureBatch> {
    const parsed = captureBatchSchema.parse(batch) as CaptureBatch;
    const index = this.captureBatches.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.captureBatches.push(parsed);
    } else {
      this.captureBatches[index] = parsed;
    }
    return parsed;
  }

  async updateCaptureBatch(tenantId: string, id: string, patch: Partial<CaptureBatch>): Promise<CaptureBatch> {
    const index = this.captureBatches.findIndex((record) => record.id === id && record.tenantId === tenantId);
    if (index === -1) {
      throw new RailError(`Capture batch ${id} was not found.`, { provider: "native", op: "updateCaptureBatch", status: 404 });
    }
    const existing = this.captureBatches[index];
    if (!existing) {
      throw new RailError(`Capture batch ${id} was not found.`, { provider: "native", op: "updateCaptureBatch", status: 404 });
    }
    const next = captureBatchSchema.parse({ ...existing, ...patch, tenantId }) as CaptureBatch;
    this.captureBatches[index] = next;
    return next;
  }

  async listChecklistTemplates(tenantId: string): Promise<ChecklistTemplate[]> {
    return this.templates.filter((record) => record.tenantId === tenantId);
  }

  async getChecklistTemplate(tenantId: string, id: string): Promise<ChecklistTemplate | null> {
    return this.templates.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async upsertChecklistTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
    const parsed = checklistTemplateSchema.parse(template) as ChecklistTemplate;
    const index = this.templates.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.templates.push(parsed);
    } else {
      this.templates[index] = parsed;
    }
    return parsed;
  }

  async listChecklists(tenantId: string): Promise<ChecklistInstance[]> {
    return this.checklists.filter((record) => record.tenantId === tenantId);
  }

  async saveChecklist(checklist: ChecklistInstance): Promise<ChecklistInstance> {
    const parsed = checklistInstanceSchema.parse(checklist) as ChecklistInstance;
    const index = this.checklists.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.checklists.push(parsed);
    } else {
      this.checklists[index] = parsed;
    }
    return parsed;
  }

  async getChecklist(tenantId: string, id: string): Promise<ChecklistInstance | null> {
    return this.checklists.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }
  async listForms(tenantId: string): Promise<TenantForm[]> { return this.forms.filter((x) => x.tenantId === tenantId); }
  async getForm(tenantId: string, id: string): Promise<TenantForm | null> { return this.forms.find((x) => x.tenantId === tenantId && x.id === id) ?? null; }
  async saveForm(form: TenantForm): Promise<TenantForm> { const parsed = formSchema.parse(form) as TenantForm; const i = this.forms.findIndex((x) => x.id === parsed.id); if (i < 0) this.forms.push(parsed); else this.forms[i] = parsed; return parsed; }
  async listFormResponses(tenantId: string): Promise<FormResponse[]> { return this.formResponses.filter((x) => x.tenantId === tenantId); }
  async getFormResponse(tenantId: string, id: string): Promise<FormResponse | null> { return this.formResponses.find((x) => x.tenantId === tenantId && x.id === id) ?? null; }
  async saveFormResponse(response: FormResponse): Promise<FormResponse> { const parsed = formResponseSchema.parse(response) as FormResponse; const i = this.formResponses.findIndex((x) => x.id === parsed.id); if (i < 0) this.formResponses.push(parsed); else this.formResponses[i] = parsed; return parsed; }
  async listFormAudit(tenantId: string, responseId: string): Promise<FormAudit[]> { return this.formAudits.filter((x) => x.tenantId === tenantId && x.responseId === responseId); }
  async saveFormAudit(audit: FormAudit): Promise<FormAudit> { const parsed = formAuditSchema.parse(audit) as FormAudit; this.formAudits.push(parsed); return parsed; }

  async listReports(tenantId: string): Promise<FieldReportRecord[]> {
    return this.reports.filter((record) => record.tenantId === tenantId);
  }

  async saveReport(report: FieldReportRecord): Promise<FieldReportRecord> {
    const parsed = fieldReportRecordSchema.parse(report) as FieldReportRecord;
    const index = this.reports.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.reports.push(parsed);
    } else {
      this.reports[index] = parsed;
    }
    return parsed;
  }

  async getReport(tenantId: string, id: string): Promise<FieldReportRecord | null> {
    return this.reports.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async listReportTemplates(tenantId: string): Promise<FieldReportTemplate[]> {
    return this.reportTemplates.filter((record) => record.tenantId === tenantId);
  }

  async upsertReportTemplate(template: FieldReportTemplate): Promise<FieldReportTemplate> {
    const parsed = fieldReportTemplateSchema.parse(template) as FieldReportTemplate;
    const index = this.reportTemplates.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.reportTemplates.push(parsed);
    } else {
      this.reportTemplates[index] = parsed;
    }
    return parsed;
  }

  async getReportTemplate(tenantId: string, id: string): Promise<FieldReportTemplate | null> {
    return this.reportTemplates.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async listBundles(tenantId: string): Promise<FieldDocsBundle[]> {
    return this.bundles.filter((record) => record.tenantId === tenantId);
  }

  async upsertBundle(bundle: FieldDocsBundle): Promise<FieldDocsBundle> {
    const parsed = fieldDocsBundleSchema.parse(bundle) as FieldDocsBundle;
    const index = this.bundles.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.bundles.push(parsed);
    } else {
      this.bundles[index] = parsed;
    }
    return parsed;
  }

  async getBundle(tenantId: string, id: string): Promise<FieldDocsBundle | null> {
    return this.bundles.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async listTextSnippets(tenantId: string): Promise<FieldDocsTextSnippet[]> {
    return this.textSnippets.filter((record) => record.tenantId === tenantId);
  }

  async upsertTextSnippet(snippet: FieldDocsTextSnippet): Promise<FieldDocsTextSnippet> {
    const parsed = fieldDocsTextSnippetSchema.parse(snippet) as FieldDocsTextSnippet;
    const index = this.textSnippets.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.textSnippets.push(parsed);
    } else {
      this.textSnippets[index] = parsed;
    }
    return parsed;
  }

  async getTextSnippet(tenantId: string, id: string): Promise<FieldDocsTextSnippet | null> {
    return this.textSnippets.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async listSignedDocuments(tenantId: string): Promise<SignedDocumentRecord[]> {
    return this.signedDocuments.filter((record) => record.tenantId === tenantId);
  }

  async saveSignedDocument(record: SignedDocumentRecord): Promise<SignedDocumentRecord> {
    const parsed = signedDocumentRecordSchema.parse(record) as SignedDocumentRecord;
    const index = this.signedDocuments.findIndex((candidate) => candidate.id === parsed.id);
    if (index === -1) {
      this.signedDocuments.push(parsed);
    } else {
      this.signedDocuments[index] = parsed;
    }
    return parsed;
  }

  async getSignedDocument(tenantId: string, id: string): Promise<SignedDocumentRecord | null> {
    return this.signedDocuments.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async listNexDocsFolders(tenantId: string): Promise<NexDocsFolder[]> {
    return this.nexDocsFolders
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async getNexDocsFolder(tenantId: string, id: string): Promise<NexDocsFolder | null> {
    return this.nexDocsFolders.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async saveNexDocsFolder(folder: NexDocsFolder): Promise<NexDocsFolder> {
    const parsed = nexDocsFolderSchema.parse(folder) as NexDocsFolder;
    const index = this.nexDocsFolders.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.nexDocsFolders.push(parsed);
    } else {
      this.nexDocsFolders[index] = parsed;
    }
    return parsed;
  }

  async deleteNexDocsFolder(tenantId: string, id: string): Promise<void> {
    const index = this.nexDocsFolders.findIndex((record) => record.tenantId === tenantId && record.id === id);
    if (index === -1) {
      throw new RailError(`NexDocs folder ${id} was not found.`, { provider: "native", op: "deleteNexDocsFolder", status: 404 });
    }
    this.nexDocsFolders.splice(index, 1);
  }

  async listNexDocsDocuments(tenantId: string): Promise<NexDocsDocument[]> {
    return this.nexDocsDocuments
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getNexDocsDocument(tenantId: string, id: string): Promise<NexDocsDocument | null> {
    return this.nexDocsDocuments.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async saveNexDocsDocument(document: NexDocsDocument): Promise<NexDocsDocument> {
    const parsed = nexDocsDocumentSchema.parse(document) as NexDocsDocument;
    const index = this.nexDocsDocuments.findIndex((record) => record.id === parsed.id);
    if (index === -1) {
      this.nexDocsDocuments.push(parsed);
    } else {
      this.nexDocsDocuments[index] = parsed;
    }
    return parsed;
  }

  async updateNexDocsDocument(tenantId: string, id: string, patch: Partial<NexDocsDocument>): Promise<NexDocsDocument> {
    const index = this.nexDocsDocuments.findIndex((record) => record.id === id && record.tenantId === tenantId);
    if (index === -1) {
      throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "updateNexDocsDocument", status: 404 });
    }
    const existing = this.nexDocsDocuments[index];
    if (!existing) {
      throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "updateNexDocsDocument", status: 404 });
    }
    const next = nexDocsDocumentSchema.parse({ ...existing, ...patch, tenantId }) as NexDocsDocument;
    this.nexDocsDocuments[index] = next;
    return next;
  }

  async deleteNexDocsDocument(tenantId: string, id: string): Promise<void> {
    const index = this.nexDocsDocuments.findIndex((record) => record.tenantId === tenantId && record.id === id);
    if (index === -1) {
      throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "deleteNexDocsDocument", status: 404 });
    }
    this.nexDocsDocuments.splice(index, 1);
  }
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefined(entry)])
    );
  }
  return value;
}

function asDocumentData(value: object): DocumentData {
  return removeUndefined(value) as DocumentData;
}

export class FirestoreMediaRepository implements MediaRepository {
  constructor(private readonly db: Firestore) {}

  private async writeTenantRecord(collection: string, id: string, tenantId: string, value: object, merge = false): Promise<void> {
    const ref = this.db.collection(collection).doc(id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const storedTenantId = snapshot.data()?.tenantId;
        if (storedTenantId !== tenantId) {
          throw new RailError(`${collection} ${id} belongs to another tenant.`, { provider: "native", op: "tenantWrite", status: 403 });
        }
      }
      if (merge) {
        transaction.set(ref, asDocumentData(value), { merge: true });
      } else {
        transaction.set(ref, asDocumentData(value));
      }
    });
  }

  async listMedia(tenantId: string): Promise<Media[]> {
    const snapshot = await this.db.collection("media").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => mediaSchema.parse(doc.data()) as Media);
  }

  async getMedia(tenantId: string, id: string): Promise<Media | null> {
    const snapshot = await this.db.collection("media").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = mediaSchema.parse(snapshot.data()) as Media;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async saveMedia(media: Media): Promise<Media> {
    const parsed = mediaSchema.parse(media) as Media;
    await this.writeTenantRecord("media", parsed.id, parsed.tenantId, parsed);
    return parsed;
  }

  async updateMedia(tenantId: string, id: string, patch: Partial<Media>): Promise<Media> {
    const ref = this.db.collection("media").doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
      }
      const existing = mediaSchema.parse(snapshot.data()) as Media;
      if (existing.tenantId !== tenantId) {
        throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
      }
      const next = mediaSchema.parse({ ...existing, ...patch, tenantId }) as Media;
      transaction.set(ref, asDocumentData(next));
      return next;
    });
  }

  async listCaptureBatches(tenantId: string): Promise<CaptureBatch[]> {
    const snapshot = await this.db.collection("captureBatches").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => captureBatchSchema.parse(doc.data()) as CaptureBatch)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getCaptureBatch(tenantId: string, id: string): Promise<CaptureBatch | null> {
    const snapshot = await this.db.collection("captureBatches").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = captureBatchSchema.parse(snapshot.data()) as CaptureBatch;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async saveCaptureBatch(batch: CaptureBatch): Promise<CaptureBatch> {
    const parsed = captureBatchSchema.parse(batch) as CaptureBatch;
    await this.writeTenantRecord("captureBatches", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async updateCaptureBatch(tenantId: string, id: string, patch: Partial<CaptureBatch>): Promise<CaptureBatch> {
    const ref = this.db.collection("captureBatches").doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new RailError(`Capture batch ${id} was not found.`, { provider: "native", op: "updateCaptureBatch", status: 404 });
      }
      const existing = captureBatchSchema.parse(snapshot.data()) as CaptureBatch;
      if (existing.tenantId !== tenantId) {
        throw new RailError(`Capture batch ${id} was not found.`, { provider: "native", op: "updateCaptureBatch", status: 404 });
      }
      const next = captureBatchSchema.parse({ ...existing, ...patch, tenantId }) as CaptureBatch;
      transaction.set(ref, asDocumentData(next), { merge: true });
      return next;
    });
  }

  async listChecklistTemplates(tenantId: string): Promise<ChecklistTemplate[]> {
    const snapshot = await this.db.collection("fieldDocsTemplates").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => checklistTemplateSchema.parse(doc.data()) as ChecklistTemplate);
  }

  async getChecklistTemplate(tenantId: string, id: string): Promise<ChecklistTemplate | null> {
    const snapshot = await this.db.collection("fieldDocsTemplates").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = checklistTemplateSchema.parse(snapshot.data()) as ChecklistTemplate;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertChecklistTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
    const parsed = checklistTemplateSchema.parse(template) as ChecklistTemplate;
    await this.writeTenantRecord("fieldDocsTemplates", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async listChecklists(tenantId: string): Promise<ChecklistInstance[]> {
    const snapshot = await this.db.collection("checklists").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => checklistInstanceSchema.parse(doc.data()) as ChecklistInstance);
  }

  async saveChecklist(checklist: ChecklistInstance): Promise<ChecklistInstance> {
    const parsed = checklistInstanceSchema.parse(checklist) as ChecklistInstance;
    await this.writeTenantRecord("checklists", parsed.id, parsed.tenantId, parsed);
    return parsed;
  }

  async getChecklist(tenantId: string, id: string): Promise<ChecklistInstance | null> {
    const snapshot = await this.db.collection("checklists").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = checklistInstanceSchema.parse(snapshot.data()) as ChecklistInstance;
    return parsed.tenantId === tenantId ? parsed : null;
  }
  async listForms(tenantId: string): Promise<TenantForm[]> { const s = await this.db.collection("tenantForms").where("tenantId", "==", tenantId).get(); return s.docs.map((d) => formSchema.parse(d.data()) as TenantForm); }
  async getForm(tenantId: string, id: string): Promise<TenantForm | null> { const s = await this.db.collection("tenantForms").doc(id).get(); if (!s.exists) return null; const value = formSchema.parse(s.data()) as TenantForm; return value.tenantId === tenantId ? value : null; }
  async saveForm(form: TenantForm): Promise<TenantForm> { const parsed = formSchema.parse(form) as TenantForm; await this.writeTenantRecord("tenantForms", parsed.id, parsed.tenantId, parsed); return parsed; }
  async listFormResponses(tenantId: string): Promise<FormResponse[]> { const s = await this.db.collection("tenantFormResponses").where("tenantId", "==", tenantId).get(); return s.docs.map((d) => formResponseSchema.parse(d.data()) as FormResponse); }
  async getFormResponse(tenantId: string, id: string): Promise<FormResponse | null> { const s = await this.db.collection("tenantFormResponses").doc(id).get(); if (!s.exists) return null; const value = formResponseSchema.parse(s.data()) as FormResponse; return value.tenantId === tenantId ? value : null; }
  async saveFormResponse(response: FormResponse): Promise<FormResponse> { const parsed = formResponseSchema.parse(response) as FormResponse; await this.writeTenantRecord("tenantFormResponses", parsed.id, parsed.tenantId, parsed); return parsed; }
  async listFormAudit(tenantId: string, responseId: string): Promise<FormAudit[]> { const s = await this.db.collection("tenantFormAudit").where("tenantId", "==", tenantId).get(); return s.docs.map((d) => formAuditSchema.parse(d.data()) as FormAudit).filter((x) => x.responseId === responseId).sort((a,b) => a.at.localeCompare(b.at)); }
  async saveFormAudit(audit: FormAudit): Promise<FormAudit> { const parsed = formAuditSchema.parse(audit) as FormAudit; await this.writeTenantRecord("tenantFormAudit", parsed.id, parsed.tenantId, parsed); return parsed; }

  async listReports(tenantId: string): Promise<FieldReportRecord[]> {
    const snapshot = await this.db.collection("fieldReports").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => fieldReportRecordSchema.parse(doc.data()) as FieldReportRecord);
  }

  async saveReport(report: FieldReportRecord): Promise<FieldReportRecord> {
    const parsed = fieldReportRecordSchema.parse(report) as FieldReportRecord;
    await this.writeTenantRecord("fieldReports", parsed.id, parsed.tenantId, parsed);
    return parsed;
  }

  async getReport(tenantId: string, id: string): Promise<FieldReportRecord | null> {
    const snapshot = await this.db.collection("fieldReports").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = fieldReportRecordSchema.parse(snapshot.data()) as FieldReportRecord;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async listReportTemplates(tenantId: string): Promise<FieldReportTemplate[]> {
    const snapshot = await this.db.collection("fieldReportTemplates").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => fieldReportTemplateSchema.parse(doc.data()) as FieldReportTemplate);
  }

  async upsertReportTemplate(template: FieldReportTemplate): Promise<FieldReportTemplate> {
    const parsed = fieldReportTemplateSchema.parse(template) as FieldReportTemplate;
    await this.writeTenantRecord("fieldReportTemplates", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async getReportTemplate(tenantId: string, id: string): Promise<FieldReportTemplate | null> {
    const snapshot = await this.db.collection("fieldReportTemplates").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = fieldReportTemplateSchema.parse(snapshot.data()) as FieldReportTemplate;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async listBundles(tenantId: string): Promise<FieldDocsBundle[]> {
    const snapshot = await this.db.collection("fieldDocsBundles").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => fieldDocsBundleSchema.parse(doc.data()) as FieldDocsBundle);
  }

  async upsertBundle(bundle: FieldDocsBundle): Promise<FieldDocsBundle> {
    const parsed = fieldDocsBundleSchema.parse(bundle) as FieldDocsBundle;
    await this.writeTenantRecord("fieldDocsBundles", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async getBundle(tenantId: string, id: string): Promise<FieldDocsBundle | null> {
    const snapshot = await this.db.collection("fieldDocsBundles").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = fieldDocsBundleSchema.parse(snapshot.data()) as FieldDocsBundle;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async listTextSnippets(tenantId: string): Promise<FieldDocsTextSnippet[]> {
    const snapshot = await this.db.collection("fieldDocsTextSnippets").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => fieldDocsTextSnippetSchema.parse(doc.data()) as FieldDocsTextSnippet);
  }

  async upsertTextSnippet(snippet: FieldDocsTextSnippet): Promise<FieldDocsTextSnippet> {
    const parsed = fieldDocsTextSnippetSchema.parse(snippet) as FieldDocsTextSnippet;
    await this.writeTenantRecord("fieldDocsTextSnippets", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async getTextSnippet(tenantId: string, id: string): Promise<FieldDocsTextSnippet | null> {
    const snapshot = await this.db.collection("fieldDocsTextSnippets").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = fieldDocsTextSnippetSchema.parse(snapshot.data()) as FieldDocsTextSnippet;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async listSignedDocuments(tenantId: string): Promise<SignedDocumentRecord[]> {
    const snapshot = await this.db.collection("signedDocuments").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => signedDocumentRecordSchema.parse(doc.data()) as SignedDocumentRecord);
  }

  async saveSignedDocument(record: SignedDocumentRecord): Promise<SignedDocumentRecord> {
    const parsed = signedDocumentRecordSchema.parse(record) as SignedDocumentRecord;
    await this.writeTenantRecord("signedDocuments", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async getSignedDocument(tenantId: string, id: string): Promise<SignedDocumentRecord | null> {
    const snapshot = await this.db.collection("signedDocuments").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = signedDocumentRecordSchema.parse(snapshot.data()) as SignedDocumentRecord;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async listNexDocsFolders(tenantId: string): Promise<NexDocsFolder[]> {
    const snapshot = await this.db.collection("nexDocsFolders").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => nexDocsFolderSchema.parse(doc.data()) as NexDocsFolder)
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async getNexDocsFolder(tenantId: string, id: string): Promise<NexDocsFolder | null> {
    const snapshot = await this.db.collection("nexDocsFolders").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = nexDocsFolderSchema.parse(snapshot.data()) as NexDocsFolder;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async saveNexDocsFolder(folder: NexDocsFolder): Promise<NexDocsFolder> {
    const parsed = nexDocsFolderSchema.parse(folder) as NexDocsFolder;
    await this.writeTenantRecord("nexDocsFolders", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async deleteNexDocsFolder(tenantId: string, id: string): Promise<void> {
    const ref = this.db.collection("nexDocsFolders").doc(id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new RailError(`NexDocs folder ${id} was not found.`, { provider: "native", op: "deleteNexDocsFolder", status: 404 });
      }
      const existing = nexDocsFolderSchema.parse(snapshot.data()) as NexDocsFolder;
      if (existing.tenantId !== tenantId) {
        throw new RailError(`NexDocs folder ${id} was not found.`, { provider: "native", op: "deleteNexDocsFolder", status: 404 });
      }
      transaction.delete(ref);
    });
  }

  async listNexDocsDocuments(tenantId: string): Promise<NexDocsDocument[]> {
    const snapshot = await this.db.collection("nexDocsDocuments").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => nexDocsDocumentSchema.parse(doc.data()) as NexDocsDocument)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getNexDocsDocument(tenantId: string, id: string): Promise<NexDocsDocument | null> {
    const snapshot = await this.db.collection("nexDocsDocuments").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = nexDocsDocumentSchema.parse(snapshot.data()) as NexDocsDocument;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async saveNexDocsDocument(document: NexDocsDocument): Promise<NexDocsDocument> {
    const parsed = nexDocsDocumentSchema.parse(document) as NexDocsDocument;
    await this.writeTenantRecord("nexDocsDocuments", parsed.id, parsed.tenantId, parsed, true);
    return parsed;
  }

  async updateNexDocsDocument(tenantId: string, id: string, patch: Partial<NexDocsDocument>): Promise<NexDocsDocument> {
    const ref = this.db.collection("nexDocsDocuments").doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "updateNexDocsDocument", status: 404 });
      }
      const existing = nexDocsDocumentSchema.parse(snapshot.data()) as NexDocsDocument;
      if (existing.tenantId !== tenantId) {
        throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "updateNexDocsDocument", status: 404 });
      }
      const next = nexDocsDocumentSchema.parse({ ...existing, ...patch, tenantId }) as NexDocsDocument;
      transaction.set(ref, asDocumentData(next), { merge: true });
      return next;
    });
  }

  async deleteNexDocsDocument(tenantId: string, id: string): Promise<void> {
    const ref = this.db.collection("nexDocsDocuments").doc(id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "deleteNexDocsDocument", status: 404 });
      }
      const existing = nexDocsDocumentSchema.parse(snapshot.data()) as NexDocsDocument;
      if (existing.tenantId !== tenantId) {
        throw new RailError(`NexDocs document ${id} was not found.`, { provider: "native", op: "deleteNexDocsDocument", status: 404 });
      }
      transaction.delete(ref);
    });
  }
}
