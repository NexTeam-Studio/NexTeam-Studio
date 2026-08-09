import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RailError } from "@nexteam/core";

const isoDateSchema = z.string().datetime({ offset: true });
export const agreementKindSchema = z.enum(["recurring_service", "membership", "maintenance_plan", "commercial"]);
export const agreementStatusSchema = z.enum(["draft", "active", "paused", "cancelled", "expired"]);
export const agreementCadenceSchema = z.enum(["weekly", "monthly", "quarterly", "annual", "custom"]);
export const agreementLineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(100000).default(1),
  unitPrice: z.number().min(0).max(100000000).optional()
});

const agreementRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  kind: agreementKindSchema,
  status: agreementStatusSchema,
  cadence: agreementCadenceSchema,
  customCadenceDays: z.number().int().min(1).max(3650).optional(),
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional(),
  nextServiceAt: isoDateSchema.optional(),
  lineItems: z.array(agreementLineItemSchema).max(100).default([]),
  terms: z.string().trim().max(20000).optional(),
  billingMode: z.literal("manual_invoice_only"),
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export const agreementSchema = agreementRecordSchema.superRefine((agreement, context) => {
  if (agreement.cadence === "custom" && !agreement.customCadenceDays) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Custom cadence requires customCadenceDays.", path: ["customCadenceDays"] });
  }
  if (agreement.cadence !== "custom" && agreement.customCadenceDays !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "customCadenceDays is allowed only for custom cadence.", path: ["customCadenceDays"] });
  }
  if (agreement.endDate && agreement.endDate < agreement.startDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "endDate must not precede startDate.", path: ["endDate"] });
  }
});

export type Agreement = z.infer<typeof agreementSchema>;
export type AgreementCommand = "created" | "activated" | "paused" | "resumed" | "cancelled" | "updated";
export interface AgreementEvent { id: string; tenantId: string; agreementId: string; command: AgreementCommand; actorId: string; occurredAt: string; }
export interface AgreementRepository {
  list(tenantId: string): Promise<Agreement[]>;
  get(tenantId: string, id: string): Promise<Agreement | null>;
  save(agreement: Agreement): Promise<Agreement>;
  appendEvent(event: AgreementEvent): Promise<void>;
  listEvents(tenantId: string, agreementId: string): Promise<AgreementEvent[]>;
}

export class MemoryAgreementRepository implements AgreementRepository {
  private readonly agreements = new Map<string, Agreement>();
  private readonly events: AgreementEvent[] = [];
  constructor(seed: Agreement[] = []) { for (const agreement of seed) this.agreements.set(agreement.id, agreementSchema.parse(agreement)); }
  async list(tenantId: string) { return [...this.agreements.values()].filter((row) => row.tenantId === tenantId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(tenantId: string, id: string) { const row = this.agreements.get(id); return row?.tenantId === tenantId ? row : null; }
  async save(agreement: Agreement) { const existing = this.agreements.get(agreement.id); if (existing && existing.tenantId !== agreement.tenantId) throw new RailError("Agreement belongs to another tenant.", { provider: "native", op: "saveAgreement", status: 409 }); this.agreements.set(agreement.id, agreementSchema.parse(agreement)); return agreement; }
  async appendEvent(event: AgreementEvent) { this.events.push(event); }
  async listEvents(tenantId: string, agreementId: string) { return this.events.filter((event) => event.tenantId === tenantId && event.agreementId === agreementId); }
}

export const agreementCreateInputSchema = agreementRecordSchema.omit({ id: true, status: true, billingMode: true, version: true, createdAt: true, updatedAt: true, nextServiceAt: true });
export const agreementPatchInputSchema = agreementCreateInputSchema.omit({ tenantId: true, clientId: true }).partial();

function addCadence(startDate: string, cadence: Agreement["cadence"], customDays?: number): string {
  const date = new Date(startDate);
  if (cadence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  if (cadence === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  if (cadence === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3);
  if (cadence === "annual") date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (cadence === "custom") date.setUTCDate(date.getUTCDate() + (customDays ?? 0));
  return date.toISOString();
}

export class AgreementService {
  constructor(private readonly repository: AgreementRepository, private readonly clock: () => Date = () => new Date()) {}
  async list(tenantId: string) { return this.repository.list(tenantId); }
  async get(tenantId: string, id: string) { return this.repository.get(tenantId, id); }
  async events(tenantId: string, id: string) { return this.repository.listEvents(tenantId, id); }
  async create(input: z.input<typeof agreementCreateInputSchema>, actorId: string): Promise<Agreement> {
    const parsed = agreementCreateInputSchema.parse(input);
    const now = this.clock().toISOString();
    const agreement = agreementSchema.parse({ ...parsed, id: `agreement_${randomUUID()}`, status: "draft", billingMode: "manual_invoice_only", version: 1, createdAt: now, updatedAt: now });
    await this.repository.save(agreement); await this.event(agreement, "created", actorId); return agreement;
  }
  async update(tenantId: string, id: string, patch: z.input<typeof agreementPatchInputSchema>, actorId: string): Promise<Agreement> {
    const existing = await this.required(tenantId, id); if (existing.status !== "draft") throw new RailError("Only draft agreements may be edited; pause or cancel an active agreement instead.", { provider: "native", op: "updateAgreement", status: 409 });
    const next = agreementSchema.parse({ ...existing, ...agreementPatchInputSchema.parse(patch), id, tenantId, version: existing.version + 1, updatedAt: this.clock().toISOString() });
    await this.repository.save(next); await this.event(next, "updated", actorId); return next;
  }
  async transition(tenantId: string, id: string, command: Exclude<AgreementCommand, "created" | "updated">, actorId: string): Promise<Agreement> {
    const existing = await this.required(tenantId, id); const now = this.clock().toISOString();
    const allowed: Record<typeof existing.status, AgreementCommand[]> = { draft: ["activated", "cancelled"], active: ["paused", "cancelled"], paused: ["resumed", "cancelled"], cancelled: [], expired: [] };
    if (!allowed[existing.status].includes(command)) throw new RailError(`Agreement cannot be ${command} from ${existing.status}.`, { provider: "native", op: "transitionAgreement", status: 409 });
    const status = command === "activated" || command === "resumed" ? "active" : command === "paused" ? "paused" : "cancelled";
    const next = agreementSchema.parse({ ...existing, status, nextServiceAt: status === "active" ? (existing.nextServiceAt ?? addCadence(existing.startDate, existing.cadence, existing.customCadenceDays)) : undefined, version: existing.version + 1, updatedAt: now });
    await this.repository.save(next); await this.event(next, command, actorId); return next;
  }
  private async required(tenantId: string, id: string) { const agreement = await this.repository.get(tenantId, id); if (!agreement) throw new RailError("Agreement was not found.", { provider: "native", op: "getAgreement", status: 404 }); return agreement; }
  private async event(agreement: Agreement, command: AgreementCommand, actorId: string) { await this.repository.appendEvent({ id: `agreement_event_${randomUUID()}`, tenantId: agreement.tenantId, agreementId: agreement.id, command, actorId, occurredAt: this.clock().toISOString() }); }
}
