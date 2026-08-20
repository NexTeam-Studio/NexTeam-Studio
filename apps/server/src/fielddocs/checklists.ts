import { randomUUID } from "node:crypto";
import { RailError, type FieldDocsPersistentChecklistValue } from "@nexteam/core";
import { z } from "zod";

export const checklistFieldTypeSchema = z.enum([
  "multi_select",
  "count",
  "measurement",
  "pass_fail",
  "free_text",
  "photo_attachment"
]);
export const checklistFieldMemorySchema = z.enum(["property", "visit"]);
export const checklistPassFailSchema = z.enum(["pending", "pass", "fail", "not_applicable"]);
export const checklistApplyScopeSchema = z.enum(["job", "visit", "job_or_visit"]);
export const checklistSectionStatusSchema = z.enum(["active", "not_applicable"]);

export const checklistTemplateSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  allowNa: z.boolean().default(false)
});

export const checklistTemplateFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  section: z.string().min(1),
  type: checklistFieldTypeSchema,
  memory: checklistFieldMemorySchema,
  required: z.boolean().default(true),
  photoRequiredDefault: z.boolean().default(false),
  helpText: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  unit: z.string().optional()
});

export const checklistTemplateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  active: z.boolean(),
  version: z.number().int().min(1),
  appliesTo: checklistApplyScopeSchema,
  system: z.boolean().optional(),
  sections: z.array(checklistTemplateSectionSchema).optional(),
  fields: z.array(checklistTemplateFieldSchema).min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const checklistSectionStateSchema = z.object({
  section: z.string().min(1),
  status: checklistSectionStatusSchema.default("active"),
  updatedAt: z.string(),
  updatedBy: z.string().optional()
});

export const checklistFieldResponseSchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().min(1),
  section: z.string().min(1),
  type: checklistFieldTypeSchema,
  memory: checklistFieldMemorySchema,
  required: z.boolean(),
  photoRequired: z.boolean().default(false),
  helpText: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  unit: z.string().optional(),
  status: checklistPassFailSchema.default("pending"),
  note: z.string().optional(),
  numberValue: z.number().optional(),
  multiValue: z.array(z.string().min(1)).optional(),
  mediaIds: z.array(z.string().min(1)).optional()
});

export const checklistInstanceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  templateId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  title: z.string().min(1),
  status: z.enum(["draft", "completed"]).default("draft"),
  sectionStates: z.array(checklistSectionStateSchema).default([]),
  fields: z.array(checklistFieldResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  completedBy: z.string().optional()
});

// Checklist records created before the field-response model used `items` and did
// not record an update timestamp.  Read them compatibly so one historical record
// cannot make a scoped field workspace unavailable.  This is intentionally
// read-only: a subsequent checklist update writes the current canonical shape.
const legacyChecklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(true),
  status: checklistPassFailSchema.default("pending"),
  note: z.string().optional()
});

const legacyChecklistInstanceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  templateId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  title: z.string().min(1),
  items: z.array(legacyChecklistItemSchema),
  createdAt: z.string().min(1)
});

export function parseStoredChecklist(value: unknown): ChecklistInstance {
  const canonical = checklistInstanceSchema.safeParse(value);
  if (canonical.success) {
    return canonical.data as ChecklistInstance;
  }
  const legacy = legacyChecklistInstanceSchema.safeParse(value);
  if (!legacy.success) {
    return checklistInstanceSchema.parse(value) as ChecklistInstance;
  }
  return checklistInstanceSchema.parse({
    ...legacy.data,
    status: "draft",
    sectionStates: [],
    fields: legacy.data.items.map((item) => ({
      fieldId: item.id,
      label: item.label,
      section: "Legacy checklist",
      type: "free_text",
      memory: "visit",
      required: item.required,
      photoRequired: false,
      status: item.status,
      ...(item.note ? { note: item.note } : {})
    })),
    updatedAt: legacy.data.createdAt
  }) as ChecklistInstance;
}

export type ChecklistTemplateSection = z.infer<typeof checklistTemplateSectionSchema>;
export type ChecklistTemplateField = z.infer<typeof checklistTemplateFieldSchema>;
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;
export type ChecklistSectionState = z.infer<typeof checklistSectionStateSchema>;
export type ChecklistFieldResponse = z.infer<typeof checklistFieldResponseSchema>;
export type ChecklistInstance = z.infer<typeof checklistInstanceSchema>;
type SeedChecklistTemplateField = Omit<ChecklistTemplateField, "required" | "photoRequiredDefault"> & { required?: boolean; photoRequiredDefault?: boolean };

export const checklistFieldUpdateSchema = z.object({
  fieldId: z.string().min(1),
  status: checklistPassFailSchema.optional(),
  note: z.string().optional(),
  numberValue: z.number().optional(),
  multiValue: z.array(z.string().min(1)).optional(),
  mediaIds: z.array(z.string().min(1)).optional(),
  photoRequired: z.boolean().optional()
});

export const checklistSectionStateUpdateSchema = z.object({
  section: z.string().min(1),
  status: checklistSectionStatusSchema,
  updatedBy: z.string().optional()
});

export type ChecklistFieldUpdate = z.infer<typeof checklistFieldUpdateSchema>;
export type ChecklistSectionStateUpdate = z.infer<typeof checklistSectionStateUpdateSchema>;

export const checklistItemUpdateSchema = z.object({
  id: z.string().min(1),
  status: checklistPassFailSchema.optional(),
  note: z.string().optional()
});

export type ChecklistItemUpdate = z.infer<typeof checklistItemUpdateSchema>;

export const LEAK_DETECTION_TEMPLATE_ID = "leak_detection_checklist_v1";

function nowIso(): string {
  return new Date().toISOString();
}

function seededTimestamp(): string {
  return "2026-07-18T00:00:00.000Z";
}

function leakDetectionTemplateFields(): SeedChecklistTemplateField[] {
  return [
    { id: "item_1", section: "Summary", memory: "visit", type: "free_text", label: "Client, city/state, service date, and completion time" },
    { id: "item_2", section: "Summary", memory: "visit", type: "free_text", label: "Technician name(s)" },
    { id: "item_3", section: "Summary", memory: "visit", type: "pass_fail", label: "Loss beyond evaporation present" },
    { id: "item_4", section: "Summary", memory: "visit", type: "pass_fail", label: "Leak located" },
    { id: "item_5", section: "Details/Results", memory: "visit", type: "free_text", label: "Free-text findings" },
    { id: "item_6", section: "Details/Results", memory: "visit", type: "photo_attachment", label: "Annotated findings photos selected" },
    { id: "item_7", section: "Additional Notes", memory: "property", type: "free_text", label: "Site conventions and numbering notes" },
    { id: "item_8", section: "Conditions Upon Arrival", memory: "visit", type: "free_text", label: "Weather conditions" },
    { id: "item_9", section: "Conditions Upon Arrival", memory: "visit", type: "measurement", label: "Daily evaporation index", unit: "in/day" },
    { id: "item_10", section: "Conditions Upon Arrival", memory: "visit", type: "measurement", label: "Reported daily water loss", unit: "in/day" },
    { id: "item_11", section: "Conditions Upon Arrival", memory: "property", type: "free_text", label: "Pre-existing site conditions" },
    {
      id: "item_12",
      section: "Pool/Spa Overview",
      memory: "property",
      type: "multi_select",
      label: "Residential/commercial and inground/above-ground",
      options: ["Residential", "Commercial", "Inground", "Above-ground"]
    },
    { id: "item_13", section: "Pool/Spa Overview", memory: "property", type: "free_text", label: "Construction type and special features" },
    { id: "item_14", section: "Pool/Spa Overview", memory: "property", type: "count", label: "Pool skimmer count" },
    { id: "item_15", section: "Pool/Spa Overview", memory: "property", type: "count", label: "Spa skimmer count" },
    { id: "item_16", section: "Pool/Spa Overview", memory: "property", type: "count", label: "Catch basin skimmer count" },
    { id: "item_17", section: "Measurements", memory: "property", type: "measurement", label: "Pool total gallons", unit: "gallons" },
    { id: "item_18", section: "Measurements", memory: "property", type: "measurement", label: "Spa total gallons", unit: "gallons" },
    { id: "item_19", section: "Measurements", memory: "property", type: "measurement", label: "Catch basin total gallons", unit: "gallons" },
    { id: "item_20", section: "Filtration Overview", memory: "property", type: "free_text", label: "Filter type and water system" },
    { id: "item_21", section: "Filtration Overview", memory: "property", type: "free_text", label: "Electrical, pumps, motors, and equipment-pad notes" },
    { id: "item_22", section: "Testing Procedures", memory: "visit", type: "free_text", label: "Testing procedures used" },
    { id: "item_23", section: "Testing Procedures", memory: "visit", type: "pass_fail", label: "Testing procedures successful" },
    { id: "item_24", section: "Results", memory: "visit", type: "pass_fail", label: "Structure pass/fail and issue description" },
    { id: "item_25", section: "Results", memory: "visit", type: "pass_fail", label: "Lights pass/fail and issue description" },
    { id: "item_26", section: "Results", memory: "visit", type: "pass_fail", label: "Plumbing pass/fail and issue description" },
    { id: "item_27", section: "Results", memory: "visit", type: "pass_fail", label: "Roof solar pass/fail and issue description" },
    { id: "item_28", section: "Results", memory: "visit", type: "pass_fail", label: "Filtration pass/fail and issue description" },
    { id: "item_29", section: "Results", memory: "visit", type: "free_text", label: "Defects without water loss noted separately from failed systems" },
    { id: "item_30", section: "Media", memory: "visit", type: "photo_attachment", label: "Before, testing, findings, and closeout photos attached" },
    { id: "item_31", section: "Report", memory: "visit", type: "pass_fail", label: "Client-facing report PDF generated and reviewed" },
    { id: "item_32", section: "Closeout", memory: "visit", type: "free_text", label: "Recommended repair, next step, or no-leak conclusion" },
    {
      id: "item_33",
      section: "Closeout",
      memory: "visit",
      type: "multi_select",
      label: "Receipt/report delivery method confirmed",
      options: ["Email", "PDF download", "Printed copy", "Portal only"]
    }
  ];
}

export function leakDetectionChecklistTemplate(tenantId: string): ChecklistTemplate {
  return checklistTemplateSchema.parse({
    id: LEAK_DETECTION_TEMPLATE_ID,
    tenantId,
    slug: "aquatrace-leak-detection",
    title: "Aquatrace Leak Detection Checklist",
    description: "Seeded leak-detection template generalized into the reusable NexCam library.",
    active: true,
    version: 2,
    appliesTo: "job_or_visit",
    system: true,
    sections: [
      { id: "summary", title: "Summary", allowNa: false },
      { id: "details_results", title: "Details/Results", allowNa: false },
      { id: "additional_notes", title: "Additional Notes", allowNa: false },
      { id: "conditions_upon_arrival", title: "Conditions Upon Arrival", allowNa: false },
      { id: "pool_spa_overview", title: "Pool/Spa Overview", allowNa: true },
      { id: "measurements", title: "Measurements", allowNa: true },
      { id: "filtration_overview", title: "Filtration Overview", allowNa: false },
      { id: "testing_procedures", title: "Testing Procedures", allowNa: false },
      { id: "results", title: "Results", allowNa: false },
      { id: "media", title: "Media", allowNa: false },
      { id: "report", title: "Report", allowNa: false },
      { id: "closeout", title: "Closeout", allowNa: false }
    ],
    fields: leakDetectionTemplateFields(),
    createdAt: seededTimestamp(),
    updatedAt: seededTimestamp()
  }) as ChecklistTemplate;
}

export function defaultChecklistTemplates(tenantId: string): ChecklistTemplate[] {
  return [leakDetectionChecklistTemplate(tenantId)];
}

export function summarizeChecklistTemplate(template: ChecklistTemplate) {
  const sections = template.sections?.length
    ? template.sections
    : [...new Set(template.fields.map((field) => field.section))].map((section) => ({
        id: section.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        title: section,
        allowNa: false
      }));
  return {
    id: template.id,
    slug: template.slug,
    title: template.title,
    description: template.description,
    active: template.active,
    version: template.version,
    appliesTo: template.appliesTo,
    system: template.system ?? false,
    sections,
    itemCount: template.fields.length,
    propertyPersistentCount: template.fields.filter((field) => field.memory === "property").length,
    visitFreshCount: template.fields.filter((field) => field.memory === "visit").length,
    fieldTypes: [...new Set(template.fields.map((field) => field.type))],
    fields: template.fields
  };
}

export function persistentChecklistFieldKey(templateId: string, fieldId: string): string {
  return `${templateId}:${fieldId}`;
}

function applyPersistentValue(field: ChecklistTemplateField, persistent: FieldDocsPersistentChecklistValue | undefined): ChecklistFieldResponse {
  return checklistFieldResponseSchema.parse({
    fieldId: field.id,
    label: field.label,
    section: field.section,
    type: field.type,
    memory: field.memory,
    required: field.required ?? true,
    photoRequired: field.photoRequiredDefault ?? false,
    helpText: field.helpText,
    options: field.options,
    unit: field.unit,
    status: persistent?.status ?? "pending",
    note: persistent?.note,
    numberValue: persistent?.numberValue,
    multiValue: persistent?.multiValue,
    mediaIds: persistent?.mediaIds
  }) as ChecklistFieldResponse;
}

function uniqueSections(template: ChecklistTemplate): ChecklistTemplateSection[] {
  if (template.sections?.length) {
    return template.sections;
  }
  return [...new Set(template.fields.map((field) => field.section))].map((section) => ({
    id: section.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    title: section,
    allowNa: false
  }));
}

export function createChecklistFromTemplate(input: {
  id?: string | undefined;
  tenantId: string;
  template: ChecklistTemplate;
  propertyId?: string | undefined;
  jobId?: string | undefined;
  visitId?: string | undefined;
  persistentValues?: Record<string, FieldDocsPersistentChecklistValue> | undefined;
}): ChecklistInstance {
  const createdAt = nowIso();
  const sections = uniqueSections(input.template);
  return checklistInstanceSchema.parse({
    id: input.id ?? `checklist_${randomUUID()}`,
    tenantId: input.tenantId,
    templateId: input.template.id,
    propertyId: input.propertyId,
    jobId: input.jobId,
    visitId: input.visitId,
    title: input.template.title,
    status: "draft",
    sectionStates: sections.map((section) => ({
      section: section.title,
      status: "active" as const,
      updatedAt: createdAt
    })),
    fields: input.template.fields.map((field) =>
      applyPersistentValue(field, input.persistentValues?.[persistentChecklistFieldKey(input.template.id, field.id)])
    ),
    createdAt,
    updatedAt: createdAt
  }) as ChecklistInstance;
}

function mergeField(existing: ChecklistFieldResponse, update: ChecklistFieldUpdate): ChecklistFieldResponse {
  return checklistFieldResponseSchema.parse({
    ...existing,
    ...(update.status !== undefined ? { status: update.status } : {}),
    ...(update.note !== undefined ? { note: update.note } : {}),
    ...(update.numberValue !== undefined ? { numberValue: update.numberValue } : {}),
    ...(update.multiValue !== undefined ? { multiValue: update.multiValue } : {}),
    ...(update.mediaIds !== undefined ? { mediaIds: update.mediaIds } : {}),
    ...(update.photoRequired !== undefined ? { photoRequired: update.photoRequired } : {})
  }) as ChecklistFieldResponse;
}

export function applyChecklistFieldUpdates(checklist: ChecklistInstance, updates: ChecklistFieldUpdate[] = []): ChecklistInstance {
  if (!updates.length) {
    return checklist;
  }
  const updateById = new Map(updates.map((update) => [update.fieldId, update]));
  return checklistInstanceSchema.parse({
    ...checklist,
    fields: checklist.fields.map((field) => {
      const update = updateById.get(field.fieldId);
      return update ? mergeField(field, update) : field;
    }),
    updatedAt: nowIso()
  }) as ChecklistInstance;
}

export function applyChecklistSectionStateUpdates(checklist: ChecklistInstance, updates: ChecklistSectionStateUpdate[] = []): ChecklistInstance {
  if (!updates.length) {
    return checklist;
  }
  const updateBySection = new Map(updates.map((update) => [update.section, update]));
  const updatedAt = nowIso();
  return checklistInstanceSchema.parse({
    ...checklist,
    sectionStates: checklist.sectionStates.map((section) => {
      const update = updateBySection.get(section.section);
      return update ? {
        ...section,
        status: update.status,
        updatedAt,
        ...(update.updatedBy ? { updatedBy: update.updatedBy } : {})
      } : section;
    }),
    updatedAt
  }) as ChecklistInstance;
}

function fieldBlockedBySection(field: ChecklistFieldResponse, checklist: ChecklistInstance): boolean {
  return checklist.sectionStates.some((section) => section.section === field.section && section.status === "not_applicable");
}

function validateChecklistForCompletion(checklist: ChecklistInstance): void {
  const missing = checklist.fields.filter((field) => {
    if (fieldBlockedBySection(field, checklist)) {
      return false;
    }
    if (field.photoRequired && !(field.mediaIds?.length)) {
      return true;
    }
    // Photo-only fields use the per-instance photoRequired toggle as their gate.
    // If the requirement is waived for this checklist, don't let generic
    // required-value validation force the media attachment back on.
    if (field.type === "photo_attachment") {
      return false;
    }
    return field.required && !hasMeaningfulValue(field);
  });
  if (!missing.length) {
    return;
  }
  const labels = missing.slice(0, 3).map((field) => field.label).join(", ");
  throw new RailError(`Complete required checklist evidence before finishing: ${labels}${missing.length > 3 ? ", and more." : "."}`, {
    provider: "native",
    op: "completeChecklist",
    status: 400
  });
}

export function completeChecklist(
  checklist: ChecklistInstance,
  updates: ChecklistFieldUpdate[] = [],
  options?: { completedBy?: string | undefined; sectionStateUpdates?: ChecklistSectionStateUpdate[] | undefined }
): ChecklistInstance {
  const updated = applyChecklistFieldUpdates(checklist, updates);
  const withSections = applyChecklistSectionStateUpdates(updated, options?.sectionStateUpdates ?? []);
  validateChecklistForCompletion(withSections);
  const completedAt = nowIso();
  return checklistInstanceSchema.parse({
    ...withSections,
    status: "completed",
    updatedAt: completedAt,
    completedAt,
    ...(options?.completedBy ? { completedBy: options.completedBy } : {})
  }) as ChecklistInstance;
}

function hasMeaningfulValue(field: ChecklistFieldResponse): boolean {
  return Boolean(
    (field.note && field.note.trim())
      || field.numberValue !== undefined
      || (field.multiValue?.length ?? 0) > 0
      || (field.mediaIds?.length ?? 0) > 0
      || field.status !== "pending"
  );
}

export function toPersistentChecklistValue(input: {
  checklist: ChecklistInstance;
  field: ChecklistFieldResponse;
}): FieldDocsPersistentChecklistValue | null {
  if (input.field.memory !== "property" || !hasMeaningfulValue(input.field)) {
    return null;
  }
  return {
    templateId: input.checklist.templateId,
    fieldId: input.field.fieldId,
    label: input.field.label,
    type: input.field.type,
    status: input.field.status,
    ...(input.field.note ? { note: input.field.note } : {}),
    ...(input.field.numberValue !== undefined ? { numberValue: input.field.numberValue } : {}),
    ...(input.field.multiValue?.length ? { multiValue: input.field.multiValue } : {}),
    ...(input.field.mediaIds?.length ? { mediaIds: input.field.mediaIds } : {}),
    ...(input.field.unit ? { unit: input.field.unit } : {}),
    updatedAt: input.checklist.completedAt ?? input.checklist.updatedAt,
    sourceChecklistId: input.checklist.id,
    ...(input.checklist.visitId ? { sourceVisitId: input.checklist.visitId } : {})
  };
}

export function formatChecklistFieldValue(field: ChecklistFieldResponse): string {
  if (field.photoRequired && !(field.mediaIds?.length)) {
    return "Photo still required";
  }
  if (field.type === "photo_attachment") {
    return field.mediaIds?.length ? `${field.mediaIds.length} photo${field.mediaIds.length === 1 ? "" : "s"}` : "No photos attached";
  }
  if (field.type === "multi_select") {
    return field.multiValue?.length ? field.multiValue.join(", ") : "No selection";
  }
  if (field.type === "count" || field.type === "measurement") {
    return field.numberValue !== undefined ? `${field.numberValue}${field.unit ? ` ${field.unit}` : ""}` : "No value recorded";
  }
  if (field.type === "pass_fail") {
    const label = field.status.replace(/_/g, " ");
    return field.note?.trim() ? `${label}: ${field.note.trim()}` : label;
  }
  return field.note?.trim() || "No note recorded";
}

export function createLeakDetectionChecklist(input: {
  tenantId: string;
  propertyId?: string | undefined;
  jobId?: string | undefined;
  visitId?: string | undefined;
  itemUpdates?: ChecklistItemUpdate[] | undefined;
}): ChecklistInstance {
  const template = leakDetectionChecklistTemplate(input.tenantId);
  const checklist = createChecklistFromTemplate({
    tenantId: input.tenantId,
    template,
    propertyId: input.propertyId,
    jobId: input.jobId,
    visitId: input.visitId
  });
  const mappedUpdates = (input.itemUpdates ?? []).map((item) => ({
    fieldId: item.id,
    ...(item.status !== undefined ? { status: item.status } : {}),
    ...(item.note !== undefined ? { note: item.note } : {})
  }));
  return applyChecklistFieldUpdates(checklist, mappedUpdates);
}
