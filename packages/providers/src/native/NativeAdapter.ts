import { randomUUID } from "node:crypto";
import {
  RailError,
  type Client,
  type CRMProvider,
  type Invoice,
  type Job,
  type JobDetail,
  type JobStatus,
  type NewClient,
  type Property,
  type Quote,
  type QuoteDraft
} from "@nexteam/core";

export interface NativeCrmRepository {
  listClients(tenantId: string): Promise<Client[]>;
  listProperties(tenantId: string): Promise<Property[]>;
  listJobs(tenantId: string): Promise<Job[]>;
  listQuotes(tenantId: string): Promise<Quote[]>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
  createClient(client: Client): Promise<Client>;
  createQuote(quote: Quote): Promise<Quote>;
  updateQuote(id: string, patch: Partial<Quote>): Promise<Quote>;
  updateJob(id: string, patch: Partial<Job>): Promise<Job>;
}

export interface NativeCrmRecords {
  clients?: Client[];
  properties?: Property[];
  jobs?: Job[];
  quotes?: Quote[];
  invoices?: Invoice[];
}

function matchesQuery(values: Array<string | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || values.filter(Boolean).join(" ").toLowerCase().includes(needle);
}

export class MemoryNativeCrmRepository implements NativeCrmRepository {
  private readonly records: Required<NativeCrmRecords>;

  constructor(records: NativeCrmRecords = {}) {
    this.records = {
      clients: [...(records.clients ?? [])],
      properties: [...(records.properties ?? [])],
      jobs: [...(records.jobs ?? [])],
      quotes: [...(records.quotes ?? [])],
      invoices: [...(records.invoices ?? [])]
    };
  }

  async listClients(tenantId: string): Promise<Client[]> {
    return (this.records.clients ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listProperties(tenantId: string): Promise<Property[]> {
    return (this.records.properties ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listJobs(tenantId: string): Promise<Job[]> {
    return (this.records.jobs ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listQuotes(tenantId: string): Promise<Quote[]> {
    return (this.records.quotes ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return this.records.invoices.filter((record) => record.tenantId === tenantId);
  }

  async createClient(client: Client): Promise<Client> {
    this.records.clients.push(client);
    return client;
  }

  async createQuote(quote: Quote): Promise<Quote> {
    this.records.quotes.push(quote);
    return quote;
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    const index = this.records.quotes.findIndex((quote) => quote.id === id);
    if (index === -1) {
      throw new RailError(`Native quote ${id} was not found.`, { provider: "native", op: "updateQuote", status: 404 });
    }
    const existing = this.records.quotes[index];
    if (!existing) {
      throw new RailError(`Native quote ${id} was not found.`, { provider: "native", op: "updateQuote", status: 404 });
    }
    const next: Quote = { ...existing, ...patch };
    this.records.quotes[index] = next;
    return next;
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
    const index = this.records.jobs.findIndex((job) => job.id === id);
    if (index === -1) {
      throw new RailError(`Native job ${id} was not found.`, { provider: "native", op: "updateJob", status: 404 });
    }
    const existing = this.records.jobs[index];
    if (!existing) {
      throw new RailError(`Native job ${id} was not found.`, { provider: "native", op: "updateJob", status: 404 });
    }
    const next: Job = { ...existing, ...patch };
    this.records.jobs[index] = next;
    return next;
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function totals(lineItems: QuoteDraft["lineItems"]): Quote["totals"] {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  return { subtotal, tax: 0, total: subtotal };
}

export class NativeAdapter implements CRMProvider {
  constructor(
    private readonly repository: NativeCrmRepository,
    private readonly tenantId: string
  ) {}

  static fromRecords(tenantId: string, records: NativeCrmRecords): NativeAdapter {
    return new NativeAdapter(new MemoryNativeCrmRepository(records), tenantId);
  }

  async getClients(q: string): Promise<Client[]> {
    const clients = await this.repository.listClients(this.tenantId);
    return clients.filter((client) => matchesQuery([client.name, client.company, ...client.emails, ...client.phones], q));
  }

  async getJobs(_range: { from: string; to: string }): Promise<Job[]> {
    return this.repository.listJobs(this.tenantId);
  }

  async getJobDetail(ref: { id?: string; nameQuery?: string }): Promise<JobDetail> {
    const [jobs, clients, properties] = await Promise.all([
      this.repository.listJobs(this.tenantId),
      this.repository.listClients(this.tenantId),
      this.repository.listProperties(this.tenantId)
    ]);
    const query = ref.nameQuery?.trim().toLowerCase() ?? "";
    const job = jobs.find((candidate) => candidate.id === ref.id || candidate.externalIds?.jobber === ref.id)
      ?? jobs.find((candidate) => matchesQuery([candidate.title, candidate.status], query));
    if (!job) {
      throw new RailError("No matching native job was found.", { provider: "native", op: "getJobDetail", status: 404 });
    }
    return {
      ...job,
      client: clients.find((client) => client.id === job.clientId),
      property: job.propertyId ? properties.find((property) => property.id === job.propertyId) : undefined
    };
  }

  async getQuotes(): Promise<Quote[]> {
    return this.repository.listQuotes(this.tenantId);
  }

  async getInvoices(): Promise<Invoice[]> {
    return this.repository.listInvoices(this.tenantId);
  }

  async createClient(d: NewClient): Promise<Client> {
    if (d.tenantId !== this.tenantId) {
      throw new RailError("Native client tenant mismatch.", { provider: "native", op: "createClient", status: 403 });
    }
    const client: Client = {
      id: makeId("client"),
      tenantId: d.tenantId,
      name: d.name,
      company: d.company,
      emails: d.emails,
      phones: d.phones,
      tags: [],
      consent: d.consent
    };
    return this.repository.createClient(client);
  }

  async draftQuote(d: QuoteDraft): Promise<Quote> {
    if (d.tenantId !== this.tenantId) {
      throw new RailError("Native quote tenant mismatch.", { provider: "native", op: "draftQuote", status: 403 });
    }
    const quote: Quote = {
      id: makeId("quote"),
      tenantId: d.tenantId,
      clientId: d.clientId,
      jobId: d.jobId,
      status: "pending_approval",
      title: d.title,
      lineItems: d.lineItems,
      totals: totals(d.lineItems),
      pdfRef: `native://quotes/${d.tenantId}/pending/${makeId("pdf")}.pdf`
    };
    return this.repository.createQuote(quote);
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    return this.repository.updateQuote(id, patch);
  }

  async updateJobStatus(id: string, s: JobStatus): Promise<Job> {
    const job = await this.repository.updateJob(id, { status: s });
    if (job.tenantId !== this.tenantId) {
      throw new RailError("Native job tenant mismatch.", { provider: "native", op: "updateJobStatus", status: 403 });
    }
    return job;
  }
}
