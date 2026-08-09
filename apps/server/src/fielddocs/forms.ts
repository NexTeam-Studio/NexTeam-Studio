import { randomUUID } from "node:crypto";
import { RailError } from "@nexteam/core";
import { z } from "zod";

export const formFieldSchema = z.object({
  id: z.string().min(1), label: z.string().min(1), type: z.enum(["text", "number", "boolean", "select", "multi_select", "date", "media"]),
  required: z.boolean().default(false), options: z.array(z.string().min(1)).optional(),
  visibleWhen: z.object({ fieldId: z.string().min(1), equals: z.union([z.string(), z.number(), z.boolean()]) }).optional()
}).superRefine((field, ctx) => {
  if (["select", "multi_select"].includes(field.type) && !field.options?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select fields require options." });
});
export const formSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1), description: z.string().optional(),
  active: z.boolean(), version: z.number().int().min(1), fields: z.array(formFieldSchema).min(1), createdAt: z.string(), updatedAt: z.string(), publishedAt: z.string().optional()
}).superRefine((form, ctx) => {
  const ids = new Set(form.fields.map((field) => field.id));
  form.fields.forEach((field, index) => {
    if (field.visibleWhen && (!ids.has(field.visibleWhen.fieldId) || field.visibleWhen.fieldId === field.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Conditional field must reference another field.", path: ["fields", index, "visibleWhen"] });
  });
});
export const formLinksSchema = z.object({ clientId: z.string().min(1).optional(), propertyId: z.string().min(1).optional(), jobId: z.string().min(1).optional(), visitId: z.string().min(1).optional(), documentId: z.string().min(1).optional() });
export const formResponseSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), formId: z.string().min(1), formVersion: z.number().int().min(1), status: z.enum(["draft", "submitted"]),
  values: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])), links: formLinksSchema, createdAt: z.string(), updatedAt: z.string(), submittedAt: z.string().optional(), createdBy: z.string().min(1), updatedBy: z.string().min(1)
});
export const formAuditSchema = z.object({ id: z.string().min(1), tenantId: z.string().min(1), responseId: z.string().min(1), action: z.enum(["created", "updated", "submitted"]), actorId: z.string().min(1), at: z.string(), changes: z.array(z.string()) });
export type TenantForm = z.infer<typeof formSchema>; export type FormResponse = z.infer<typeof formResponseSchema>; export type FormAudit = z.infer<typeof formAuditSchema>;

export function visibleFields(form: TenantForm, values: Record<string, unknown>) { return form.fields.filter((field) => !field.visibleWhen || values[field.visibleWhen.fieldId] === field.visibleWhen.equals); }
export function validateResponse(form: TenantForm, values: Record<string, unknown>, submit: boolean): void {
  const permitted = new Map(form.fields.map((field) => [field.id, field]));
  for (const key of Object.keys(values)) if (!permitted.has(key)) throw new RailError(`Unknown form field ${key}.`, { provider: "native", op: "validateFormResponse", status: 400 });
  for (const field of visibleFields(form, values)) {
    const value = values[field.id];
    if (submit && field.required && (value === undefined || value === "" || (Array.isArray(value) && !value.length))) throw new RailError(`${field.label} is required.`, { provider: "native", op: "validateFormResponse", status: 400 });
    if (value === undefined) continue;
    if ((field.type === "number" && typeof value !== "number") || (field.type === "boolean" && typeof value !== "boolean") || (["text", "date", "media", "select"].includes(field.type) && typeof value !== "string") || (field.type === "multi_select" && (!Array.isArray(value) || value.some((v) => typeof v !== "string")))) throw new RailError(`${field.label} has an invalid value.`, { provider: "native", op: "validateFormResponse", status: 400 });
    if (field.options && (Array.isArray(value) ? value : [value]).some((v) => !field.options?.includes(String(v)))) throw new RailError(`${field.label} contains an unavailable option.`, { provider: "native", op: "validateFormResponse", status: 400 });
  }
}
export function newForm(input: Omit<TenantForm, "id" | "version" | "createdAt" | "updatedAt">): TenantForm { const at = new Date().toISOString(); return formSchema.parse({ ...input, id: `form_${randomUUID()}`, version: 1, createdAt: at, updatedAt: at }) as TenantForm; }
