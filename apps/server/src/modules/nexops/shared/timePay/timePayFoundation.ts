import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RailError } from "@nexteam/core";

const isoDateSchema = z.string().datetime({ offset: true });
const moneySchema = z.number().finite().min(0).max(100000000);
const minutesSchema = z.number().int().min(0).max(24 * 60);

/** Categories are deliberately separate so overtime and payroll rules remain external-policy decisions. */
export const laborCategorySchema = z.enum(["job", "drive", "non_job"]);
export const laborPayTypeSchema = z.enum(["regular", "overtime", "double_time", "unpaid"]);
export const laborStatusSchema = z.enum(["active", "voided"]);
export const compensationKindSchema = z.enum(["commission", "bonus"]);

const laborFactRecordSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), employeeId: z.string().min(1),
  jobId: z.string().min(1).optional(), category: laborCategorySchema, payType: laborPayTypeSchema.default("regular"),
  startedAt: isoDateSchema, endedAt: isoDateSchema, minutes: minutesSchema,
  productivityUnits: z.number().finite().min(0).max(1000000).optional(), productivityUnitLabel: z.string().trim().min(1).max(80).optional(),
  note: z.string().trim().max(2000).optional(), externalRef: z.string().trim().min(1).max(200).optional(),
  status: laborStatusSchema, createdAt: isoDateSchema, createdBy: z.string().min(1), voidedAt: isoDateSchema.optional(), voidedBy: z.string().min(1).optional(), voidReason: z.string().trim().min(1).max(1000).optional()
});
export const laborFactSchema = laborFactRecordSchema.superRefine((fact, context) => {
  if (fact.endedAt <= fact.startedAt) context.addIssue({ code: z.ZodIssueCode.custom, message: "endedAt must be after startedAt." });
  if (fact.minutes !== Math.round((Date.parse(fact.endedAt) - Date.parse(fact.startedAt)) / 60000)) context.addIssue({ code: z.ZodIssueCode.custom, message: "minutes must match the clock interval." });
  if (fact.category === "job" && !fact.jobId) context.addIssue({ code: z.ZodIssueCode.custom, message: "Job labor requires jobId." });
  if (fact.category !== "job" && fact.jobId) context.addIssue({ code: z.ZodIssueCode.custom, message: "Only job labor may have jobId." });
  if ((fact.productivityUnits === undefined) !== (fact.productivityUnitLabel === undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Productivity units require both value and label." });
  if (fact.status === "voided" && (!fact.voidedAt || !fact.voidedBy || !fact.voidReason)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Voided labor facts require audit metadata." });
  if (fact.status === "active" && (fact.voidedAt || fact.voidedBy || fact.voidReason)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Active labor facts cannot have void metadata." });
});
export type LaborFact = z.infer<typeof laborFactSchema>;

const compensationRecordSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), employeeId: z.string().min(1), jobId: z.string().min(1).optional(),
  kind: compensationKindSchema, amount: moneySchema, occurredAt: isoDateSchema, note: z.string().trim().max(2000).optional(), externalRef: z.string().trim().min(1).max(200).optional(),
  status: laborStatusSchema, createdAt: isoDateSchema, createdBy: z.string().min(1), voidedAt: isoDateSchema.optional(), voidedBy: z.string().min(1).optional(), voidReason: z.string().trim().min(1).max(1000).optional()
});
export const compensationFactSchema = compensationRecordSchema.superRefine((fact, context) => {
  if (fact.status === "voided" && (!fact.voidedAt || !fact.voidedBy || !fact.voidReason)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Voided compensation facts require audit metadata." });
  if (fact.status === "active" && (fact.voidedAt || fact.voidedBy || fact.voidReason)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Active compensation facts cannot have void metadata." });
});
export type CompensationFact = z.infer<typeof compensationFactSchema>;
export type TimePayEvent = { id: string; tenantId: string; factId: string; factType: "labor" | "compensation"; command: "created" | "voided"; actorId: string; occurredAt: string; snapshot: LaborFact | CompensationFact };

export interface TimePayRepository {
  listLabor(tenantId: string, employeeId?: string): Promise<LaborFact[]>; getLabor(tenantId: string, id: string): Promise<LaborFact | null>; saveLabor(fact: LaborFact): Promise<LaborFact>;
  listCompensation(tenantId: string, employeeId?: string): Promise<CompensationFact[]>; getCompensation(tenantId: string, id: string): Promise<CompensationFact | null>; saveCompensation(fact: CompensationFact): Promise<CompensationFact>;
  appendEvent(event: TimePayEvent): Promise<void>; listEvents(tenantId: string, factId?: string): Promise<TimePayEvent[]>;
}
export class MemoryTimePayRepository implements TimePayRepository {
  private readonly labor = new Map<string, LaborFact>(); private readonly compensation = new Map<string, CompensationFact>(); private readonly events: TimePayEvent[] = [];
  async listLabor(tenantId: string, employeeId?: string) { return [...this.labor.values()].filter((x) => x.tenantId === tenantId && (!employeeId || x.employeeId === employeeId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  async getLabor(tenantId: string, id: string) { const x = this.labor.get(id); return x?.tenantId === tenantId ? x : null; }
  async saveLabor(fact: LaborFact) { this.labor.set(fact.id, laborFactSchema.parse(fact)); return fact; }
  async listCompensation(tenantId: string, employeeId?: string) { return [...this.compensation.values()].filter((x) => x.tenantId === tenantId && (!employeeId || x.employeeId === employeeId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); }
  async getCompensation(tenantId: string, id: string) { const x = this.compensation.get(id); return x?.tenantId === tenantId ? x : null; }
  async saveCompensation(fact: CompensationFact) { this.compensation.set(fact.id, compensationFactSchema.parse(fact)); return fact; }
  async appendEvent(event: TimePayEvent) { this.events.push(event); }
  async listEvents(tenantId: string, factId?: string) { return this.events.filter((x) => x.tenantId === tenantId && (!factId || x.factId === factId)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); }
}

export const createLaborFactInputSchema = laborFactRecordSchema.omit({ id: true, minutes: true, status: true, createdAt: true, createdBy: true, voidedAt: true, voidedBy: true, voidReason: true });
export const createCompensationFactInputSchema = compensationRecordSchema.omit({ id: true, status: true, createdAt: true, createdBy: true, voidedAt: true, voidedBy: true, voidReason: true });
export const voidTimePayFactInputSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export const payrollExportInputSchema = z.object({ employeeId: z.string().min(1).optional(), periodStart: isoDateSchema, periodEnd: isoDateSchema }).superRefine((value, context) => { if (value.periodEnd <= value.periodStart) context.addIssue({ code: z.ZodIssueCode.custom, message: "periodEnd must be after periodStart." }); });

export class TimePayService {
  constructor(private readonly repository: TimePayRepository, private readonly clock: () => Date = () => new Date()) {}
  async listLabor(tenantId: string, employeeId?: string) { return this.repository.listLabor(tenantId, employeeId); }
  async listCompensation(tenantId: string, employeeId?: string) { return this.repository.listCompensation(tenantId, employeeId); }
  async events(tenantId: string, factId?: string) { return this.repository.listEvents(tenantId, factId); }
  async createLabor(input: z.input<typeof createLaborFactInputSchema>, actorId: string) { const parsed = createLaborFactInputSchema.parse(input); const fact = laborFactSchema.parse({ ...parsed, id: `labor_${randomUUID()}`, minutes: Math.round((Date.parse(parsed.endedAt) - Date.parse(parsed.startedAt)) / 60000), status: "active", createdAt: this.clock().toISOString(), createdBy: actorId }); await this.repository.saveLabor(fact); await this.event(fact, "labor", "created", actorId); return fact; }
  async createCompensation(input: z.input<typeof createCompensationFactInputSchema>, actorId: string) { const parsed = createCompensationFactInputSchema.parse(input); const fact = compensationFactSchema.parse({ ...parsed, id: `compensation_${randomUUID()}`, status: "active", createdAt: this.clock().toISOString(), createdBy: actorId }); await this.repository.saveCompensation(fact); await this.event(fact, "compensation", "created", actorId); return fact; }
  async voidLabor(tenantId: string, id: string, input: z.input<typeof voidTimePayFactInputSchema>, actorId: string) { const current = await this.repository.getLabor(tenantId, id); if (!current) throw new RailError("Labor fact was not found.", { provider: "native", op: "voidLaborFact", status: 404 }); if (current.status === "voided") throw new RailError("Labor fact has already been voided.", { provider: "native", op: "voidLaborFact", status: 409 }); const fact = laborFactSchema.parse({ ...current, status: "voided", voidedAt: this.clock().toISOString(), voidedBy: actorId, voidReason: voidTimePayFactInputSchema.parse(input).reason }); await this.repository.saveLabor(fact); await this.event(fact, "labor", "voided", actorId); return fact; }
  async voidCompensation(tenantId: string, id: string, input: z.input<typeof voidTimePayFactInputSchema>, actorId: string) { const current = await this.repository.getCompensation(tenantId, id); if (!current) throw new RailError("Compensation fact was not found.", { provider: "native", op: "voidCompensationFact", status: 404 }); if (current.status === "voided") throw new RailError("Compensation fact has already been voided.", { provider: "native", op: "voidCompensationFact", status: 409 }); const fact = compensationFactSchema.parse({ ...current, status: "voided", voidedAt: this.clock().toISOString(), voidedBy: actorId, voidReason: voidTimePayFactInputSchema.parse(input).reason }); await this.repository.saveCompensation(fact); await this.event(fact, "compensation", "voided", actorId); return fact; }
  async payrollDraft(tenantId: string, raw: z.input<typeof payrollExportInputSchema>) { const input = payrollExportInputSchema.parse(raw); const inPeriod = (x: { occurredAt?: string; startedAt?: string }) => (x.occurredAt ?? x.startedAt!) >= input.periodStart && (x.occurredAt ?? x.startedAt!) < input.periodEnd; const labor = (await this.listLabor(tenantId, input.employeeId)).filter((x) => x.status === "active" && inPeriod(x)); const compensation = (await this.listCompensation(tenantId, input.employeeId)).filter((x) => x.status === "active" && inPeriod(x)); const byPayType = Object.fromEntries(["regular", "overtime", "double_time", "unpaid"].map((payType) => [payType, labor.filter((x) => x.payType === payType).reduce((total, x) => total + x.minutes, 0)])); return { tenantId, employeeId: input.employeeId ?? null, periodStart: input.periodStart, periodEnd: input.periodEnd, mode: "draft_only" as const, externalPayrollSubmission: "not_supported" as const, laborMinutesByPayType: byPayType, laborMinutesByCategory: Object.fromEntries(["job", "drive", "non_job"].map((category) => [category, labor.filter((x) => x.category === category).reduce((total, x) => total + x.minutes, 0)])), commissionAmount: compensation.filter((x) => x.kind === "commission").reduce((total, x) => total + x.amount, 0), bonusAmount: compensation.filter((x) => x.kind === "bonus").reduce((total, x) => total + x.amount, 0), productivity: labor.filter((x) => x.productivityUnits !== undefined).map((x) => ({ employeeId: x.employeeId, jobId: x.jobId ?? null, units: x.productivityUnits!, unitLabel: x.productivityUnitLabel!, minutes: x.minutes })) }; }
  private async event(snapshot: LaborFact | CompensationFact, factType: TimePayEvent["factType"], command: TimePayEvent["command"], actorId: string) { await this.repository.appendEvent({ id: `time_pay_event_${randomUUID()}`, tenantId: snapshot.tenantId, factId: snapshot.id, factType, command, actorId, occurredAt: this.clock().toISOString(), snapshot }); }
}
