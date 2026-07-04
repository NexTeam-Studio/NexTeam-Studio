import {
  RailError,
  type Client,
  type CRMProvider,
  type Invoice,
  type Job,
  type JobDetail,
  type Property,
  type Quote
} from "@nexteam/core";

export interface NativeCrmRepository {
  listClients(tenantId: string): Promise<Client[]>;
  listProperties(tenantId: string): Promise<Property[]>;
  listJobs(tenantId: string): Promise<Job[]>;
  listQuotes(tenantId: string): Promise<Quote[]>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
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
  constructor(private readonly records: NativeCrmRecords = {}) {}

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
    return (this.records.invoices ?? []).filter((record) => record.tenantId === tenantId);
  }
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
}
