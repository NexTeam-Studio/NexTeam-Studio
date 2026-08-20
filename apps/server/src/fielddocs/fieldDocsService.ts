import { RailError, type Job, type Property, type QuoteSignatureRecord } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import {
  applyChecklistFieldUpdates,
  applyChecklistSectionStateUpdates,
  checklistFieldUpdateSchema,
  checklistSectionStateUpdateSchema,
  checklistTemplateSchema,
  completeChecklist,
  createChecklistFromTemplate,
  defaultChecklistTemplates,
  persistentChecklistFieldKey,
  toPersistentChecklistValue,
  type ChecklistFieldUpdate,
  type ChecklistSectionStateUpdate,
  type ChecklistInstance,
  type ChecklistTemplate
} from "./checklists.js";
import {
  defaultFieldDocsBundles,
  defaultFieldReportTemplates,
  fieldDocsBundleSchema,
  fieldDocsTextSnippetSchema,
  fieldReportTemplateSchema,
  type FieldDocsBundle,
  type FieldDocsTextSnippet,
  type FieldReportTemplate,
  type SignedDocumentRecord
} from "./fieldDocsRecords.js";
import type { MediaRepository } from "./mediaRepository.js";
import { createFieldReportRecord } from "./reportService.js";
import { formAuditSchema, formResponseSchema, formSchema, newForm, validateResponse, type FormResponse, type TenantForm } from "./forms.js";

export interface FieldDocsServiceDeps {
  mediaRepository: MediaRepository;
  crmRepository?: NativeCrmRepository | undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableChecklistTimestamp(checklist: ChecklistInstance): string {
  return checklist.completedAt ?? checklist.updatedAt ?? checklist.createdAt;
}

function mergeTemplateLibrary(seed: ChecklistTemplate[], stored: ChecklistTemplate[]): ChecklistTemplate[] {
  const byId = new Map(seed.map((template) => [template.id, template]));
  stored.forEach((template) => byId.set(template.id, template));
  return [...byId.values()].sort((left, right) => left.title.localeCompare(right.title));
}

function mergeRecordLibrary<T extends { id: string }>(seed: T[], stored: T[]): T[] {
  const byId = new Map(seed.map((record) => [record.id, record]));
  stored.forEach((record) => byId.set(record.id, record));
  return [...byId.values()];
}

function normalizeKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function bundleMatchKeys(job: Job): string[] {
  const keys = new Set<string>();
  if (job.title) {
    keys.add(normalizeKey(job.title));
  }
  const firstCatalogCode = job.lineItems.find((item) => item.catalogCode?.trim())?.catalogCode;
  if (firstCatalogCode) {
    keys.add(normalizeKey(firstCatalogCode));
  }
  const serviceType = job.intake?.fieldIndex?.service_type;
  if (typeof serviceType === "string") {
    keys.add(normalizeKey(serviceType));
  }
  return [...keys].filter(Boolean);
}

function mergePropertyPersistentValues(property: Property, checklist: ChecklistInstance): Property {
  const existing = property.fieldDocs?.persistentChecklistValues ?? {};
  const next = { ...existing };
  checklist.fields.forEach((field) => {
    const persistent = toPersistentChecklistValue({ checklist, field });
    if (!persistent) {
      return;
    }
    next[persistentChecklistFieldKey(checklist.templateId, field.fieldId)] = persistent;
  });
  return {
    ...property,
    fieldDocs: {
      ...(property.fieldDocs ?? {}),
      persistentChecklistValues: next
    }
  };
}

function assertChecklistHasCloseoutContext(checklist: ChecklistInstance): void {
  if (checklist.jobId || checklist.visitId) {
    return;
  }
  throw new RailError("Attach this checklist to a job or visit before completing it.", {
    provider: "native",
    op: "completeChecklist",
    status: 400
  });
}

export class FieldDocsService {
  constructor(private readonly deps: FieldDocsServiceDeps) {}

  async listTemplates(tenantId: string): Promise<ChecklistTemplate[]> {
    const stored = await this.deps.mediaRepository.listChecklistTemplates(tenantId);
    return mergeTemplateLibrary(defaultChecklistTemplates(tenantId), stored);
  }

  async listReportTemplates(tenantId: string): Promise<FieldReportTemplate[]> {
    const stored = await this.deps.mediaRepository.listReportTemplates(tenantId);
    return mergeRecordLibrary(defaultFieldReportTemplates(tenantId), stored).sort((left, right) => left.title.localeCompare(right.title));
  }

  async getReportTemplate(tenantId: string, templateId: string): Promise<FieldReportTemplate> {
    const template = (await this.listReportTemplates(tenantId)).find((candidate) => candidate.id === templateId);
    if (!template) {
      throw new RailError(`Field report template ${templateId} was not found.`, { provider: "native", op: "getFieldReportTemplate", status: 404 });
    }
    return template;
  }

  async upsertReportTemplate(input: FieldReportTemplate): Promise<FieldReportTemplate> {
    const parsed = fieldReportTemplateSchema.parse(input) as FieldReportTemplate;
    return this.deps.mediaRepository.upsertReportTemplate(parsed);
  }

  async listBundles(tenantId: string): Promise<FieldDocsBundle[]> {
    const stored = await this.deps.mediaRepository.listBundles(tenantId);
    return mergeRecordLibrary(defaultFieldDocsBundles(tenantId), stored).sort((left, right) => left.label.localeCompare(right.label));
  }

  async upsertBundle(input: FieldDocsBundle): Promise<FieldDocsBundle> {
    const parsed = fieldDocsBundleSchema.parse(input) as FieldDocsBundle;
    return this.deps.mediaRepository.upsertBundle(parsed);
  }

  async listTextSnippets(tenantId: string): Promise<FieldDocsTextSnippet[]> {
    return (await this.deps.mediaRepository.listTextSnippets(tenantId))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async upsertTextSnippet(input: FieldDocsTextSnippet): Promise<FieldDocsTextSnippet> {
    const parsed = fieldDocsTextSnippetSchema.parse(input) as FieldDocsTextSnippet;
    return this.deps.mediaRepository.upsertTextSnippet(parsed);
  }

  async getTemplate(tenantId: string, templateId: string): Promise<ChecklistTemplate> {
    const templates = await this.listTemplates(tenantId);
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) {
      throw new RailError(`Checklist template ${templateId} was not found.`, { provider: "native", op: "getChecklistTemplate", status: 404 });
    }
    return template;
  }

  async upsertTemplate(input: ChecklistTemplate): Promise<ChecklistTemplate> {
    const parsed = checklistTemplateSchema.parse(input) as ChecklistTemplate;
    return this.deps.mediaRepository.upsertChecklistTemplate(parsed);
  }

  async listForms(tenantId: string): Promise<TenantForm[]> { return (await this.deps.mediaRepository.listForms(tenantId)).sort((a, b) => a.title.localeCompare(b.title)); }
  async getForm(tenantId: string, id: string): Promise<TenantForm> { const form = await this.deps.mediaRepository.getForm(tenantId, id); if (!form) throw new RailError(`Form ${id} was not found.`, { provider: "native", op: "getForm", status: 404 }); return form; }
  async createForm(input: Omit<TenantForm, "id" | "version" | "createdAt" | "updatedAt">): Promise<TenantForm> { return this.deps.mediaRepository.saveForm(newForm(input)); }
  async reviseForm(input: TenantForm): Promise<TenantForm> { const current = await this.getForm(input.tenantId, input.id); const next = formSchema.parse({ ...input, version: current.version + 1, createdAt: current.createdAt, updatedAt: nowIso(), publishedAt: nowIso() }) as TenantForm; return this.deps.mediaRepository.saveForm(next); }
  async listFormResponses(tenantId: string, formId?: string): Promise<FormResponse[]> { return (await this.deps.mediaRepository.listFormResponses(tenantId)).filter((x) => !formId || x.formId === formId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async saveFormResponse(input: { tenantId: string; formId: string; responseId?: string; values: Record<string, string | number | boolean | string[]>; links: FormResponse["links"]; submit: boolean; actorId: string }): Promise<FormResponse> {
    const form = await this.getForm(input.tenantId, input.formId); if (!form.active) throw new RailError("This form is inactive.", { provider: "native", op: "saveFormResponse", status: 409 });
    const existing = input.responseId ? await this.deps.mediaRepository.getFormResponse(input.tenantId, input.responseId) : null;
    if (input.responseId && !existing) throw new RailError(`Form response ${input.responseId} was not found.`, { provider: "native", op: "saveFormResponse", status: 404 });
    if (existing?.status === "submitted") throw new RailError("Submitted form responses are immutable.", { provider: "native", op: "saveFormResponse", status: 409 });
    validateResponse(form, input.values, input.submit); const at = nowIso();
    const response = formResponseSchema.parse({ id: existing?.id ?? `form_response_${Math.random().toString(36).slice(2, 10)}`, tenantId: input.tenantId, formId: form.id, formVersion: form.version, status: input.submit ? "submitted" : "draft", values: input.values, links: input.links, createdAt: existing?.createdAt ?? at, updatedAt: at, ...(input.submit ? { submittedAt: at } : {}), createdBy: existing?.createdBy ?? input.actorId, updatedBy: input.actorId }) as FormResponse;
    const saved = await this.deps.mediaRepository.saveFormResponse(response); const changes = Object.keys(input.values).filter((key) => JSON.stringify(existing?.values[key]) !== JSON.stringify(input.values[key]));
    await this.deps.mediaRepository.saveFormAudit(formAuditSchema.parse({ id: `form_audit_${Math.random().toString(36).slice(2, 10)}`, tenantId: input.tenantId, responseId: saved.id, action: input.submit ? "submitted" : existing ? "updated" : "created", actorId: input.actorId, at, changes }) ); return saved;
  }

  async listChecklists(input: {
    tenantId: string;
    propertyId?: string | undefined;
    jobId?: string | undefined;
    visitId?: string | undefined;
    status?: "draft" | "completed" | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
  }): Promise<ChecklistInstance[]> {
    return (await this.deps.mediaRepository.listChecklists(input.tenantId))
      .filter((record) => !input.propertyId || record.propertyId === input.propertyId)
      .filter((record) => !input.jobId || record.jobId === input.jobId)
      .filter((record) => !input.visitId || record.visitId === input.visitId)
      .filter((record) => !input.status || record.status === input.status)
      .filter((record) => {
        const ts = stableChecklistTimestamp(record);
        return (!input.dateFrom || ts >= input.dateFrom) && (!input.dateTo || ts <= input.dateTo);
      })
      .sort((left, right) => stableChecklistTimestamp(right).localeCompare(stableChecklistTimestamp(left)));
  }

  async getChecklist(tenantId: string, checklistId: string): Promise<ChecklistInstance | null> {
    return this.deps.mediaRepository.getChecklist(tenantId, checklistId);
  }

  async createChecklist(input: {
    tenantId: string;
    templateId: string;
    propertyId?: string | undefined;
    jobId?: string | undefined;
    visitId?: string | undefined;
  }): Promise<ChecklistInstance> {
    const template = await this.getTemplate(input.tenantId, input.templateId);
    const propertyId = await this.resolvePropertyId(input.tenantId, input.propertyId, input.jobId);
    const property = propertyId ? await this.getProperty(input.tenantId, propertyId) : null;
    const checklist = createChecklistFromTemplate({
      tenantId: input.tenantId,
      template,
      propertyId: propertyId ?? undefined,
      jobId: input.jobId,
      visitId: input.visitId,
      persistentValues: property?.fieldDocs?.persistentChecklistValues
    });
    return this.deps.mediaRepository.saveChecklist(checklist);
  }

  async updateChecklist(input: {
    tenantId: string;
    checklistId: string;
    updates?: ChecklistFieldUpdate[] | undefined;
    sectionStateUpdates?: ChecklistSectionStateUpdate[] | undefined;
    complete?: boolean | undefined;
    actorId?: string | undefined;
  }): Promise<ChecklistInstance> {
    const existing = await this.deps.mediaRepository.getChecklist(input.tenantId, input.checklistId);
    if (!existing) {
      throw new RailError(`Checklist ${input.checklistId} was not found.`, { provider: "native", op: "updateChecklist", status: 404 });
    }
    const updates = (input.updates ?? []).map((update) => checklistFieldUpdateSchema.parse(update) as ChecklistFieldUpdate);
    const sectionStateUpdates = (input.sectionStateUpdates ?? []).map((update) => checklistSectionStateUpdateSchema.parse(update) as ChecklistSectionStateUpdate);
    const updated = applyChecklistSectionStateUpdates(applyChecklistFieldUpdates(existing, updates), sectionStateUpdates);
    if (input.complete) {
      assertChecklistHasCloseoutContext(updated);
      await this.assertChecklistMediaBelongsToContext(updated);
    }
    const next = input.complete
      ? completeChecklist(updated, [], { completedBy: input.actorId, sectionStateUpdates: [] })
      : updated;
    const saved = await this.deps.mediaRepository.saveChecklist(next);
    if (saved.status === "completed" && saved.propertyId && this.deps.crmRepository) {
      const property = await this.getProperty(saved.tenantId, saved.propertyId);
      if (property) {
        await this.deps.crmRepository.upsertProperty(mergePropertyPersistentValues(property, saved));
      }
    }
    return saved;
  }

  async getPropertyHistory(input: {
    tenantId: string;
    propertyId: string;
    templateId?: string | undefined;
    fieldId?: string | undefined;
  }): Promise<ChecklistInstance[]> {
    const completed = await this.listChecklists({
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      status: "completed"
    });
    return completed
      .filter((record) => !input.templateId || record.templateId === input.templateId)
      .filter((record) => !input.fieldId || record.fields.some((field) => field.fieldId === input.fieldId));
  }

  async listSignedDocuments(input: {
    tenantId: string;
    clientId?: string | undefined;
    jobId?: string | undefined;
  }): Promise<SignedDocumentRecord[]> {
    return (await this.deps.mediaRepository.listSignedDocuments(input.tenantId))
      .filter((record) => !input.clientId || record.clientId === input.clientId)
      .filter((record) => !input.jobId || record.jobId === input.jobId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createSignedDocument(input: {
    tenantId: string;
    clientId: string;
    jobId?: string | undefined;
    propertyId?: string | undefined;
    visitId?: string | undefined;
    kind: SignedDocumentRecord["kind"];
    title: string;
    bodyText: string;
    createdBy?: string | undefined;
  }): Promise<SignedDocumentRecord> {
    const timestamp = nowIso();
    return this.deps.mediaRepository.saveSignedDocument({
      id: `signed_doc_${Math.random().toString(36).slice(2, 10)}`,
      tenantId: input.tenantId,
      clientId: input.clientId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      ...(input.visitId ? { visitId: input.visitId } : {}),
      kind: input.kind,
      title: input.title,
      bodyText: input.bodyText,
      status: "pending_signature",
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async signSignedDocument(input: {
    tenantId: string;
    signedDocumentId: string;
    signature: QuoteSignatureRecord;
  }): Promise<SignedDocumentRecord> {
    const existing = await this.deps.mediaRepository.getSignedDocument(input.tenantId, input.signedDocumentId);
    if (!existing) {
      throw new RailError(`Signed document ${input.signedDocumentId} was not found.`, { provider: "native", op: "signSignedDocument", status: 404 });
    }
    if (existing.status === "signed") {
      throw new RailError(`Signed document ${input.signedDocumentId} is already signed.`, { provider: "native", op: "signSignedDocument", status: 409 });
    }
    const updatedAt = nowIso();
    return this.deps.mediaRepository.saveSignedDocument({
      ...existing,
      status: "signed",
      signature: input.signature,
      signedAt: input.signature.signedAt,
      updatedAt
    });
  }

  async maybeAttachBundleForJob(input: {
    tenantId: string;
    job: Job;
  }): Promise<{ bundle: FieldDocsBundle; checklist: ChecklistInstance; reportTemplate: FieldReportTemplate; report: ReturnType<typeof createFieldReportRecord> } | null> {
    const bundles = await this.listBundles(input.tenantId);
    const matchKeys = new Set(bundleMatchKeys(input.job));
    const bundle = bundles.find((candidate) => candidate.active && matchKeys.has(normalizeKey(candidate.jobTypeKey)));
    if (!bundle) {
      return null;
    }
    const reportTemplate = await this.getReportTemplate(input.tenantId, bundle.reportTemplateId);
    const existingChecklist = (await this.listChecklists({
      tenantId: input.tenantId,
      jobId: input.job.id
    })).find((record) => record.templateId === bundle.checklistTemplateId);
    const checklist = existingChecklist ?? await this.createChecklist({
      tenantId: input.tenantId,
      templateId: bundle.checklistTemplateId,
      propertyId: input.job.propertyId,
      jobId: input.job.id
    });
    const existingReport = (await this.deps.mediaRepository.listReports(input.tenantId))
      .find((record) => record.jobId === input.job.id && record.templateId === reportTemplate.id && record.status === "draft");
    const report = existingReport ?? await this.deps.mediaRepository.saveReport(createFieldReportRecord({
      tenantId: input.tenantId,
      jobId: input.job.id,
      propertyId: input.job.propertyId,
      kind: "field_report",
      title: reportTemplate.defaultReportTitle,
      findings: reportTemplate.sections.map((section) => section.defaultText).filter((value): value is string => Boolean(value?.trim())),
      mediaIds: [],
      checklistId: checklist.id,
      templateId: reportTemplate.id,
      status: "draft",
      watermarkEnabled: reportTemplate.watermarkByDefault
    }));
    return { bundle, checklist, reportTemplate, report };
  }

  private async resolvePropertyId(tenantId: string, propertyId?: string, jobId?: string): Promise<string | undefined> {
    if (propertyId || !jobId || !this.deps.crmRepository) {
      return propertyId;
    }
    const job = (await this.deps.crmRepository.listJobs(tenantId)).find((candidate) => candidate.id === jobId);
    return job?.propertyId;
  }

  private async getProperty(tenantId: string, propertyId: string): Promise<Property | null> {
    if (!this.deps.crmRepository) {
      return null;
    }
    return (await this.deps.crmRepository.listProperties(tenantId)).find((candidate) => candidate.id === propertyId) ?? null;
  }

  private async assertChecklistMediaBelongsToContext(checklist: ChecklistInstance): Promise<void> {
    const mediaIds = [...new Set(checklist.fields.flatMap((field) => field.mediaIds ?? []))];
    if (!mediaIds.length) {
      return;
    }
    const media = await Promise.all(mediaIds.map((mediaId) => this.deps.mediaRepository.getMedia(checklist.tenantId, mediaId)));
    const missingMediaId = mediaIds.find((mediaId, index) => !media[index]);
    if (missingMediaId) {
      throw new RailError(`Checklist evidence ${missingMediaId} was not found for this tenant.`, {
        provider: "native",
        op: "completeChecklist",
        status: 400
      });
    }
    const unrelatedMedia = media.find((record) => {
      if (!record) {
        return false;
      }
      return !(
        (checklist.jobId !== undefined && record.jobId === checklist.jobId)
        || (checklist.visitId !== undefined && record.visitId === checklist.visitId)
      );
    });
    if (unrelatedMedia) {
      throw new RailError("Checklist evidence must be attached to the same job or visit before completing it.", {
        provider: "native",
        op: "completeChecklist",
        status: 400
      });
    }
  }
}

export function createDraftTemplate(input: {
  tenantId: string;
  title: string;
  slug: string;
  description?: string | undefined;
  appliesTo?: "job" | "visit" | "job_or_visit" | undefined;
  sections?: ChecklistTemplate["sections"];
  fields: ChecklistTemplate["fields"];
}): ChecklistTemplate {
  const ts = nowIso();
  return checklistTemplateSchema.parse({
    id: `template_${Math.random().toString(36).slice(2, 10)}`,
    tenantId: input.tenantId,
    title: input.title,
    slug: input.slug,
    description: input.description,
    active: true,
    version: 1,
    appliesTo: input.appliesTo ?? "visit",
    ...(input.sections?.length ? { sections: input.sections } : {}),
    fields: input.fields,
    createdAt: ts,
    updatedAt: ts
  }) as ChecklistTemplate;
}
