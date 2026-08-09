import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RailError, type Invoice } from "@nexteam/core";

const isoDateSchema = z.string().datetime({ offset: true });
const moneySchema = z.number().finite().min(0).max(100000000);

export const jobCostCategorySchema = z.enum(["labor", "material", "other_direct"]);
export const jobCostSourceSchema = z.enum(["manual", "expense", "time_entry", "vendor_bill"]);
const jobCostFactRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  category: jobCostCategorySchema,
  source: jobCostSourceSchema,
  /** Null is an explicitly recorded, not-yet-known actual cost. */
  amount: moneySchema.nullable(),
  occurredAt: isoDateSchema,
  note: z.string().trim().max(2000).optional(),
  externalRef: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "voided"]),
  createdAt: isoDateSchema,
  createdBy: z.string().min(1),
  voidedAt: isoDateSchema.optional(),
  voidedBy: z.string().min(1).optional(),
  voidReason: z.string().trim().min(1).max(1000).optional()
});

export const jobCostFactSchema = jobCostFactRecordSchema.superRefine((fact, context) => {
  if (fact.status === "voided" && (!fact.voidedAt || !fact.voidedBy || !fact.voidReason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Voided cost facts require audit metadata." });
  }
  if (fact.status === "active" && (fact.voidedAt || fact.voidedBy || fact.voidReason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Active cost facts cannot have void metadata." });
  }
});

export type JobCostFact = z.infer<typeof jobCostFactSchema>;
export type JobCostFactCommand = "created" | "voided";
export interface JobCostFactEvent {
  id: string;
  tenantId: string;
  jobId: string;
  costFactId: string;
  command: JobCostFactCommand;
  actorId: string;
  occurredAt: string;
  /** Immutable copy of the fact at the time of the audit event. */
  snapshot: JobCostFact;
}

export interface JobCostingRepository {
  listFacts(tenantId: string, jobId: string): Promise<JobCostFact[]>;
  getFact(tenantId: string, id: string): Promise<JobCostFact | null>;
  saveFact(fact: JobCostFact): Promise<JobCostFact>;
  appendEvent(event: JobCostFactEvent): Promise<void>;
  listEvents(tenantId: string, jobId: string): Promise<JobCostFactEvent[]>;
}

export class MemoryJobCostingRepository implements JobCostingRepository {
  private readonly facts = new Map<string, JobCostFact>();
  private readonly events: JobCostFactEvent[] = [];
  async listFacts(tenantId: string, jobId: string) { return [...this.facts.values()].filter((fact) => fact.tenantId === tenantId && fact.jobId === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async getFact(tenantId: string, id: string) { const fact = this.facts.get(id); return fact?.tenantId === tenantId ? fact : null; }
  async saveFact(fact: JobCostFact) { const current = this.facts.get(fact.id); if (current && current.tenantId !== fact.tenantId) throw new RailError("Cost fact belongs to another tenant.", { provider: "native", op: "saveJobCostFact", status: 409 }); this.facts.set(fact.id, jobCostFactSchema.parse(fact)); return fact; }
  async appendEvent(event: JobCostFactEvent) { this.events.push(event); }
  async listEvents(tenantId: string, jobId: string) { return this.events.filter((event) => event.tenantId === tenantId && event.jobId === jobId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); }
}

export const createJobCostFactInputSchema = jobCostFactRecordSchema.omit({ id: true, status: true, createdAt: true, createdBy: true, voidedAt: true, voidedBy: true, voidReason: true });
export const voidJobCostFactInputSchema = z.object({ reason: z.string().trim().min(1).max(1000) });

function money(value: number): number { return Number(value.toFixed(2)); }

function invoiceRevenueForJob(invoice: Invoice, jobId: string): number | null {
  if (invoice.status === "draft" || invoice.status === "void" || invoice.status === "bad_debt") return null;
  const reference = invoice.jobReferences?.find((candidate) => candidate.jobId === jobId);
  if (reference) return reference.amount;
  if (invoice.jobId === jobId && (!invoice.jobIds || invoice.jobIds.length <= 1)) return invoice.totals.total;
  return null;
}

export interface JobProfitabilitySummary {
  tenantId: string;
  jobId: string;
  actualRevenue: number | null;
  actualCost: number | null;
  actualGrossProfit: number | null;
  actualGrossMarginPercent: number | null;
  activeCostFactCount: number;
  unknownCostFactCount: number;
  revenueInvoiceIds: string[];
  confidence: "exact" | "incomplete";
}

export class JobCostingService {
  constructor(private readonly repository: JobCostingRepository, private readonly clock: () => Date = () => new Date()) {}
  async listFacts(tenantId: string, jobId: string) { return this.repository.listFacts(tenantId, jobId); }
  async events(tenantId: string, jobId: string) { return this.repository.listEvents(tenantId, jobId); }
  async create(input: z.input<typeof createJobCostFactInputSchema>, actorId: string): Promise<JobCostFact> {
    const parsed = createJobCostFactInputSchema.parse(input);
    const timestamp = this.clock().toISOString();
    const fact = jobCostFactSchema.parse({ ...parsed, id: `job_cost_${randomUUID()}`, status: "active", createdAt: timestamp, createdBy: actorId });
    await this.repository.saveFact(fact); await this.event(fact, "created", actorId); return fact;
  }
  async void(tenantId: string, id: string, input: z.input<typeof voidJobCostFactInputSchema>, actorId: string): Promise<JobCostFact> {
    const current = await this.repository.getFact(tenantId, id);
    if (!current) throw new RailError("Cost fact was not found.", { provider: "native", op: "voidJobCostFact", status: 404 });
    if (current.status === "voided") throw new RailError("Cost fact has already been voided.", { provider: "native", op: "voidJobCostFact", status: 409 });
    const parsed = voidJobCostFactInputSchema.parse(input);
    const fact = jobCostFactSchema.parse({ ...current, status: "voided", voidedAt: this.clock().toISOString(), voidedBy: actorId, voidReason: parsed.reason });
    await this.repository.saveFact(fact); await this.event(fact, "voided", actorId); return fact;
  }
  async summarize(tenantId: string, jobId: string, invoices: Invoice[]): Promise<JobProfitabilitySummary> {
    const facts = await this.repository.listFacts(tenantId, jobId);
    const activeFacts = facts.filter((fact) => fact.status === "active");
    const unknownCostFactCount = activeFacts.filter((fact) => fact.amount === null).length;
    const revenueFacts = invoices.filter((invoice) => invoice.tenantId === tenantId).map((invoice) => ({ invoice, revenue: invoiceRevenueForJob(invoice, jobId) })).filter((entry): entry is { invoice: Invoice; revenue: number } => entry.revenue !== null);
    const actualRevenue = revenueFacts.length ? money(revenueFacts.reduce((sum, entry) => sum + entry.revenue, 0)) : null;
    const actualCost = unknownCostFactCount ? null : money(activeFacts.reduce((sum, fact) => sum + (fact.amount ?? 0), 0));
    const actualGrossProfit = actualRevenue === null || actualCost === null ? null : money(actualRevenue - actualCost);
    return { tenantId, jobId, actualRevenue, actualCost, actualGrossProfit, actualGrossMarginPercent: actualGrossProfit === null || !actualRevenue ? null : money((actualGrossProfit / actualRevenue) * 100), activeCostFactCount: activeFacts.length, unknownCostFactCount, revenueInvoiceIds: revenueFacts.map((entry) => entry.invoice.id), confidence: actualRevenue !== null && actualCost !== null ? "exact" : "incomplete" };
  }
  private async event(fact: JobCostFact, command: JobCostFactCommand, actorId: string) { await this.repository.appendEvent({ id: `job_cost_event_${randomUUID()}`, tenantId: fact.tenantId, jobId: fact.jobId, costFactId: fact.id, command, actorId, occurredAt: this.clock().toISOString(), snapshot: fact }); }
}
