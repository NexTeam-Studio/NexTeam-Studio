import { randomUUID } from "node:crypto";
import {
  type CrmSettings,
  RailError,
  type Client,
  type CRMProvider,
  type DocumentSequenceKind,
  type Invoice,
  type Job,
  type JobDetail,
  type JobStatus,
  type NewClient,
  type Property,
  type Quote,
  type QuoteDraft,
  type QuoteTemplate,
  type RequestForm,
  type ServiceRequest,
  jobSchema
} from "@nexteam/core";

export interface NativeCrmRepository {
  listClients(tenantId: string): Promise<Client[]>;
  listProperties(tenantId: string): Promise<Property[]>;
  listRequests(tenantId: string): Promise<ServiceRequest[]>;
  getRequest(tenantId: string, id: string): Promise<ServiceRequest | null>;
  createRequest(request: ServiceRequest): Promise<ServiceRequest>;
  updateRequest(id: string, patch: Partial<ServiceRequest>): Promise<ServiceRequest>;
  listRequestForms(tenantId: string): Promise<RequestForm[]>;
  getRequestForm(tenantId: string, id: string): Promise<RequestForm | null>;
  getRequestFormBySlug(tenantId: string, slug: string): Promise<RequestForm | null>;
  upsertRequestForm(form: RequestForm): Promise<RequestForm>;
  getCrmSettings(tenantId: string): Promise<CrmSettings>;
  saveCrmSettings(settings: CrmSettings): Promise<CrmSettings>;
  listQuoteTemplates(tenantId: string): Promise<QuoteTemplate[]>;
  getQuoteTemplate(tenantId: string, id: string): Promise<QuoteTemplate | null>;
  upsertQuoteTemplate(template: QuoteTemplate): Promise<QuoteTemplate>;
  listJobs(tenantId: string): Promise<Job[]>;
  listQuotes(tenantId: string): Promise<Quote[]>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
  getQuote(tenantId: string, id: string): Promise<Quote | null>;
  createClient(client: Client): Promise<Client>;
  upsertClient(client: Client): Promise<Client>;
  upsertProperty(property: Property): Promise<Property>;
  upsertJob(job: Job): Promise<Job>;
  createQuote(quote: Quote): Promise<Quote>;
  createInvoice(invoice: Invoice): Promise<Invoice>;
  updateQuote(id: string, patch: Partial<Quote>): Promise<Quote>;
  updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice>;
  updateJob(id: string, patch: Partial<Job>): Promise<Job>;
  reserveDocumentNumber(tenantId: string, kind: DocumentSequenceKind): Promise<string>;
}

export interface NativeCrmRecords {
  clients?: Client[];
  properties?: Property[];
  requests?: ServiceRequest[];
  requestForms?: RequestForm[];
  crmSettings?: CrmSettings[];
  quoteTemplates?: QuoteTemplate[];
  jobs?: Job[];
  quotes?: Quote[];
  invoices?: Invoice[];
}

function matchesQuery(values: Array<string | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || values.filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function clientSearchValues(client: Client): Array<string | undefined> {
  const contactValues = (client.contacts ?? []).flatMap((contact) => [
    contact.personName?.firstName,
    contact.personName?.lastName,
    contact.company,
    contact.role,
    ...contact.emails.map((email) => email.value),
    ...contact.phones.map((phone) => phone.value)
  ]);
  return [
    client.name,
    client.company,
    client.personName?.firstName,
    client.personName?.lastName,
    ...client.emails,
    ...client.phones,
    ...contactValues
  ];
}

function sameNativeRecord<T extends { id: string; externalIds?: { jobber?: string | undefined } | undefined }>(left: T, right: T): boolean {
  return left.id === right.id || Boolean(left.externalIds?.jobber && left.externalIds.jobber === right.externalIds?.jobber);
}

function defaultCrmSettingsTimestamp(): string {
  return "2026-07-12T00:00:00.000Z";
}

export function defaultCrmSettings(tenantId: string): CrmSettings {
  const timestamp = defaultCrmSettingsTimestamp();
  return {
    tenantId,
    documentNumbering: {
      request: { prefix: "REQ", separator: "-", padWidth: 4, nextValue: 1 },
      quote: { prefix: "Q", separator: "-", padWidth: 4, nextValue: 1 },
      job: { prefix: "JOB", separator: "-", padWidth: 4, nextValue: 1 },
      invoice: { prefix: "INV", separator: "-", padWidth: 4, nextValue: 1 }
    },
    quoteDefaults: {
      expiryDays: 30,
      autoSaveCardOnDeposit: true,
      approvalRules: {
        requireSignature: true,
        requireDeposit: true,
        requireCardOnFile: true,
        depositKind: "percent",
        depositValue: 50
      },
      terms: "Pricing stays valid through the expiry date shown on this quote. Scheduling begins after approval and any required deposit steps are complete."
    },
    invoiceDefaults: {
      dueDays: 0,
      terms: "Payment is due as scheduled on the invoice. Reach out to the office before the due date if anything needs to be reviewed.",
      delivery: {
        emailIncludePdf: true,
        emailIncludeSummary: true,
        emailIncludePayLink: true,
        smsIncludeSummary: true,
        smsIncludePayLink: true,
        smsIncludeHostedLink: true
      }
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function defaultQuoteTemplates(tenantId: string): QuoteTemplate[] {
  const settings = defaultCrmSettings(tenantId);
  const timestamp = defaultCrmSettingsTimestamp();
  return [
    {
      id: `quote_template_standard_${tenantId}`,
      tenantId,
      name: "Standard quote",
      description: "Default office template with signature, deposit, and card-on-file enabled.",
      titlePrefix: "Quote",
      defaultApprovalRules: settings.quoteDefaults.approvalRules,
      expiryDays: settings.quoteDefaults.expiryDays,
      terms: settings.quoteDefaults.terms,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];
}

function formatDocumentNumber(prefix: string, separator: string, padWidth: number, nextValue: number): string {
  const serial = String(nextValue).padStart(padWidth, "0");
  return prefix.trim() ? `${prefix}${separator}${serial}` : serial;
}

function normalizeJobRecord(job: Job): Job {
  return jobSchema.parse(job) as Job;
}

export class MemoryNativeCrmRepository implements NativeCrmRepository {
  private readonly records: Required<NativeCrmRecords>;

  constructor(records: NativeCrmRecords = {}) {
    this.records = {
      clients: [...(records.clients ?? [])],
      properties: [...(records.properties ?? [])],
      requests: [...(records.requests ?? [])],
      requestForms: [...(records.requestForms ?? [])],
      crmSettings: [...(records.crmSettings ?? [])],
      quoteTemplates: [...(records.quoteTemplates ?? [])],
      jobs: (records.jobs ?? []).map((job) => normalizeJobRecord(job)),
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

  async listRequests(tenantId: string): Promise<ServiceRequest[]> {
    return (this.records.requests ?? [])
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRequest(tenantId: string, id: string): Promise<ServiceRequest | null> {
    return this.records.requests.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async createRequest(request: ServiceRequest): Promise<ServiceRequest> {
    this.records.requests.push(request);
    return request;
  }

  async updateRequest(id: string, patch: Partial<ServiceRequest>): Promise<ServiceRequest> {
    const index = this.records.requests.findIndex((request) => request.id === id);
    if (index === -1) {
      throw new RailError(`Native request ${id} was not found.`, { provider: "native", op: "updateRequest", status: 404 });
    }
    const existing = this.records.requests[index];
    if (!existing) {
      throw new RailError(`Native request ${id} was not found.`, { provider: "native", op: "updateRequest", status: 404 });
    }
    const next: ServiceRequest = { ...existing, ...patch };
    this.records.requests[index] = next;
    return next;
  }

  async listRequestForms(tenantId: string): Promise<RequestForm[]> {
    return (this.records.requestForms ?? [])
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async getRequestForm(tenantId: string, id: string): Promise<RequestForm | null> {
    return this.records.requestForms.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async getRequestFormBySlug(tenantId: string, slug: string): Promise<RequestForm | null> {
    return this.records.requestForms.find((record) => record.tenantId === tenantId && record.slug === slug) ?? null;
  }

  async upsertRequestForm(form: RequestForm): Promise<RequestForm> {
    const index = this.records.requestForms.findIndex((record) => record.id === form.id || (record.tenantId === form.tenantId && record.slug === form.slug));
    if (index === -1) {
      this.records.requestForms.push(form);
      return form;
    }
    const existing = this.records.requestForms[index];
    const next = { ...existing, ...form };
    this.records.requestForms[index] = next;
    return next;
  }

  async getCrmSettings(tenantId: string): Promise<CrmSettings> {
    return this.records.crmSettings.find((record) => record.tenantId === tenantId) ?? defaultCrmSettings(tenantId);
  }

  async saveCrmSettings(settings: CrmSettings): Promise<CrmSettings> {
    const index = this.records.crmSettings.findIndex((record) => record.tenantId === settings.tenantId);
    if (index === -1) {
      this.records.crmSettings.push(settings);
      return settings;
    }
    const existing = this.records.crmSettings[index];
    const next = { ...existing, ...settings };
    this.records.crmSettings[index] = next;
    return next;
  }

  async listQuoteTemplates(tenantId: string): Promise<QuoteTemplate[]> {
    const templates = this.records.quoteTemplates.filter((record) => record.tenantId === tenantId);
    return templates.length ? templates : defaultQuoteTemplates(tenantId);
  }

  async getQuoteTemplate(tenantId: string, id: string): Promise<QuoteTemplate | null> {
    return this.records.quoteTemplates.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async upsertQuoteTemplate(template: QuoteTemplate): Promise<QuoteTemplate> {
    const index = this.records.quoteTemplates.findIndex((record) => record.id === template.id);
    if (index === -1) {
      this.records.quoteTemplates.push(template);
      return template;
    }
    const existing = this.records.quoteTemplates[index];
    const next = { ...existing, ...template };
    this.records.quoteTemplates[index] = next;
    return next;
  }

  async listJobs(tenantId: string): Promise<Job[]> {
    return (this.records.jobs ?? [])
      .filter((record) => record.tenantId === tenantId)
      .map((record) => normalizeJobRecord(record));
  }

  async listQuotes(tenantId: string): Promise<Quote[]> {
    return (this.records.quotes ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return this.records.invoices.filter((record) => record.tenantId === tenantId);
  }

  async getQuote(tenantId: string, id: string): Promise<Quote | null> {
    return this.records.quotes.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async createClient(client: Client): Promise<Client> {
    this.records.clients.push(client);
    return client;
  }

  async upsertClient(client: Client): Promise<Client> {
    const index = this.records.clients.findIndex((record) => sameNativeRecord(record, client));
    if (index === -1) {
      this.records.clients.push(client);
      return client;
    }
    const existing = this.records.clients[index];
    const next = { ...existing, ...client };
    this.records.clients[index] = next;
    return next;
  }

  async upsertProperty(property: Property): Promise<Property> {
    const index = this.records.properties.findIndex((record) => sameNativeRecord(record, property));
    if (index === -1) {
      this.records.properties.push(property);
      return property;
    }
    const existing = this.records.properties[index];
    const next = { ...existing, ...property };
    this.records.properties[index] = next;
    return next;
  }

  async upsertJob(job: Job): Promise<Job> {
    const normalized = normalizeJobRecord(job);
    const index = this.records.jobs.findIndex((record) => sameNativeRecord(record, normalized));
    if (index === -1) {
      this.records.jobs.push(normalized);
      return normalized;
    }
    const existing = this.records.jobs[index];
    const next = normalizeJobRecord({ ...existing, ...normalized });
    this.records.jobs[index] = next;
    return next;
  }

  async createQuote(quote: Quote): Promise<Quote> {
    this.records.quotes.push(quote);
    return quote;
  }

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    this.records.invoices.push(invoice);
    return invoice;
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

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const index = this.records.invoices.findIndex((invoice) => invoice.id === id);
    if (index === -1) {
      throw new RailError(`Native invoice ${id} was not found.`, { provider: "native", op: "updateInvoice", status: 404 });
    }
    const existing = this.records.invoices[index];
    if (!existing) {
      throw new RailError(`Native invoice ${id} was not found.`, { provider: "native", op: "updateInvoice", status: 404 });
    }
    const next: Invoice = { ...existing, ...patch };
    this.records.invoices[index] = next;
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
    const next = normalizeJobRecord({ ...existing, ...patch } as Job);
    this.records.jobs[index] = next;
    return next;
  }

  async reserveDocumentNumber(tenantId: string, kind: DocumentSequenceKind): Promise<string> {
    const settings = await this.getCrmSettings(tenantId);
    const rule = settings.documentNumbering[kind];
    const number = formatDocumentNumber(rule.prefix, rule.separator, rule.padWidth, rule.nextValue);
    await this.saveCrmSettings({
      ...settings,
      documentNumbering: {
        ...settings.documentNumbering,
        [kind]: {
          ...rule,
          nextValue: rule.nextValue + 1
        }
      },
      updatedAt: new Date().toISOString()
    });
    return number;
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
    return clients.filter((client) => matchesQuery(clientSearchValues(client), q));
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

  async createQuote(quote: Quote): Promise<Quote> {
    if (quote.tenantId !== this.tenantId) {
      throw new RailError("Native quote tenant mismatch.", { provider: "native", op: "createQuote", status: 403 });
    }
    return this.repository.createQuote(quote);
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
      personName: d.personName,
      displayNamePreference: d.displayNamePreference,
      billingAddress: d.billingAddress,
      billingSameAsPrimaryProperty: d.billingSameAsPrimaryProperty,
      contacts: d.contacts,
      communicationSettings: d.communicationSettings,
      emails: d.emails,
      phones: d.phones,
      tags: [],
      consent: d.consent,
      customFields: d.customFields
    };
    return this.repository.createClient(client);
  }

  async createJob(job: Job): Promise<Job> {
    if (job.tenantId !== this.tenantId) {
      throw new RailError("Native job tenant mismatch.", { provider: "native", op: "createJob", status: 403 });
    }
    return this.repository.upsertJob(job);
  }

  async draftQuote(d: QuoteDraft): Promise<Quote> {
    if (d.tenantId !== this.tenantId) {
      throw new RailError("Native quote tenant mismatch.", { provider: "native", op: "draftQuote", status: 403 });
    }
    const timestamp = new Date().toISOString();
    const quote: Quote = {
      id: makeId("quote"),
      tenantId: d.tenantId,
      number: await this.repository.reserveDocumentNumber(d.tenantId, "quote"),
      clientId: d.clientId,
      jobId: d.jobId,
      ...(d.requestId ? { requestId: d.requestId } : {}),
      ...(d.templateId ? { templateId: d.templateId } : {}),
      version: 1,
      status: "draft",
      title: d.title,
      lineItems: d.lineItems,
      totals: totals(d.lineItems),
      approvalRules: d.approvalRules,
      ...(d.discount ? { discount: d.discount } : {}),
      ...(d.expiresAt ? { expiresAt: d.expiresAt } : {}),
      ...(d.terms ? { terms: d.terms } : {}),
      portal: {},
      delivery: [],
      changeRequests: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      pdfRef: `native://quotes/${d.tenantId}/pending/${makeId("pdf")}.pdf`
    };
    return this.repository.createQuote(quote);
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    return this.repository.updateQuote(id, patch);
  }

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    if (invoice.tenantId !== this.tenantId) {
      throw new RailError("Native invoice tenant mismatch.", { provider: "native", op: "createInvoice", status: 403 });
    }
    return this.repository.createInvoice(invoice);
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const invoice = await this.repository.updateInvoice(id, patch);
    if (invoice.tenantId !== this.tenantId) {
      throw new RailError("Native invoice tenant mismatch.", { provider: "native", op: "updateInvoice", status: 403 });
    }
    return invoice;
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
    const job = await this.repository.updateJob(id, patch);
    if (job.tenantId !== this.tenantId) {
      throw new RailError("Native job tenant mismatch.", { provider: "native", op: "updateJob", status: 403 });
    }
    return job;
  }

  async updateJobStatus(id: string, s: JobStatus): Promise<Job> {
    const job = await this.repository.updateJob(id, { status: s });
    if (job.tenantId !== this.tenantId) {
      throw new RailError("Native job tenant mismatch.", { provider: "native", op: "updateJobStatus", status: 403 });
    }
    return job;
  }
}
