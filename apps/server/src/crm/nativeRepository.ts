import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  clientSchema,
  crmSettingsSchema,
  invoiceSchema,
  jobSchema,
  propertySchema,
  quoteSchema,
  quoteTemplateSchema,
  requestFormSchema,
  serviceRequestSchema,
  type Client,
  type CrmSettings,
  type DocumentSequenceKind,
  type Invoice,
  type Job,
  type Property,
  type Quote,
  type QuoteTemplate,
  type RequestForm,
  type ServiceRequest
} from "@nexteam/core";
import { RailError } from "@nexteam/core";
import { defaultCrmSettings, defaultQuoteTemplates, type NativeCrmRepository } from "@nexteam/providers";
import { advanceDocumentNumber } from "@nexteam/shared";
import type { ZodSchema } from "zod";

type CollectionName = "clients" | "properties" | "requests" | "requestForms" | "crmSettings" | "quoteTemplates" | "jobs" | "quotes" | "invoices";

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

export class FirestoreNativeCrmRepository implements NativeCrmRepository {
  constructor(private readonly db: Firestore) {}

  private async listByTenant<T>(collectionName: CollectionName, tenantId: string, schema: ZodSchema<T>): Promise<T[]> {
    const snapshot = await this.db.collection(collectionName).where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => schema.parse(doc.data()));
  }

  async listClients(tenantId: string): Promise<Client[]> {
    return (await this.listByTenant("clients", tenantId, clientSchema)) as Client[];
  }

  async listProperties(tenantId: string): Promise<Property[]> {
    return (await this.listByTenant("properties", tenantId, propertySchema)) as Property[];
  }

  async deleteClient(tenantId: string, clientId: string): Promise<void> {
    const ref = this.db.collection("clients").doc(clientId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return;
    }
    const parsed = clientSchema.parse(snapshot.data()) as Client;
    if (parsed.tenantId !== tenantId) {
      throw new RailError(`Client ${clientId} was not found for tenant ${tenantId}.`, { provider: "native", op: "deleteClient", status: 404 });
    }
    await ref.delete();
  }

  async deletePropertiesForClient(tenantId: string, clientId: string): Promise<string[]> {
    const snapshot = await this.db
      .collection("properties")
      .where("tenantId", "==", tenantId)
      .where("clientId", "==", clientId)
      .get();
    if (snapshot.empty) {
      return [];
    }
    const batch = this.db.batch();
    const deletedIds: string[] = [];
    for (const doc of snapshot.docs) {
      deletedIds.push(doc.id);
      batch.delete(doc.ref);
    }
    await batch.commit();
    return deletedIds;
  }

  async listRequests(tenantId: string): Promise<ServiceRequest[]> {
    return (await this.listByTenant("requests", tenantId, serviceRequestSchema))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)) as ServiceRequest[];
  }

  async getRequest(tenantId: string, id: string): Promise<ServiceRequest | null> {
    const snapshot = await this.db.collection("requests").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = serviceRequestSchema.parse(snapshot.data()) as ServiceRequest;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async createRequest(request: ServiceRequest): Promise<ServiceRequest> {
    const parsed = serviceRequestSchema.parse(request) as ServiceRequest;
    await this.db.collection("requests").doc(parsed.id).set(asDocumentData(parsed));
    return parsed;
  }

  async updateRequest(id: string, patch: Partial<ServiceRequest>): Promise<ServiceRequest> {
    const ref = this.db.collection("requests").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new RailError(`Native request ${id} was not found.`, { provider: "native", op: "updateRequest", status: 404 });
    }
    const next = serviceRequestSchema.parse({ ...snapshot.data(), ...patch }) as ServiceRequest;
    await ref.set(asDocumentData(next));
    return next;
  }

  async listRequestForms(tenantId: string): Promise<RequestForm[]> {
    return (await this.listByTenant("requestForms", tenantId, requestFormSchema))
      .sort((left, right) => left.title.localeCompare(right.title)) as RequestForm[];
  }

  async getRequestForm(tenantId: string, id: string): Promise<RequestForm | null> {
    const snapshot = await this.db.collection("requestForms").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = requestFormSchema.parse(snapshot.data()) as RequestForm;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async getRequestFormBySlug(tenantId: string, slug: string): Promise<RequestForm | null> {
    const snapshot = await this.db
      .collection("requestForms")
      .where("tenantId", "==", tenantId)
      .where("slug", "==", slug)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? (requestFormSchema.parse(doc.data()) as RequestForm) : null;
  }

  async upsertRequestForm(form: RequestForm): Promise<RequestForm> {
    const parsed = requestFormSchema.parse(form) as RequestForm;
    await this.db.collection("requestForms").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async getCrmSettings(tenantId: string): Promise<CrmSettings> {
    const snapshot = await this.db.collection("crmSettings").doc(tenantId).get();
    if (!snapshot.exists) {
      return defaultCrmSettings(tenantId);
    }
    const parsed = crmSettingsSchema.safeParse(snapshot.data());
    return parsed.success ? parsed.data as CrmSettings : defaultCrmSettings(tenantId);
  }

  async saveCrmSettings(settings: CrmSettings): Promise<CrmSettings> {
    const parsed = crmSettingsSchema.parse(settings) as CrmSettings;
    await this.db.collection("crmSettings").doc(parsed.tenantId).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listQuoteTemplates(tenantId: string): Promise<QuoteTemplate[]> {
    const templates = (await this.listByTenant("quoteTemplates", tenantId, quoteTemplateSchema))
      .sort((left, right) => left.name.localeCompare(right.name)) as QuoteTemplate[];
    return templates.length ? templates : defaultQuoteTemplates(tenantId);
  }

  async getQuoteTemplate(tenantId: string, id: string): Promise<QuoteTemplate | null> {
    const snapshot = await this.db.collection("quoteTemplates").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = quoteTemplateSchema.parse(snapshot.data()) as QuoteTemplate;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertQuoteTemplate(template: QuoteTemplate): Promise<QuoteTemplate> {
    const parsed = quoteTemplateSchema.parse(template) as QuoteTemplate;
    await this.db.collection("quoteTemplates").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listJobs(tenantId: string): Promise<Job[]> {
    return (await this.listByTenant("jobs", tenantId, jobSchema)) as Job[];
  }

  async listQuotes(tenantId: string): Promise<Quote[]> {
    return (await this.listByTenant("quotes", tenantId, quoteSchema)) as Quote[];
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return (await this.listByTenant("invoices", tenantId, invoiceSchema)) as Invoice[];
  }

  async getQuote(tenantId: string, id: string): Promise<Quote | null> {
    const snapshot = await this.db.collection("quotes").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = quoteSchema.parse(snapshot.data()) as Quote;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async createClient(client: Client): Promise<Client> {
    await this.db.collection("clients").doc(client.id).set(asDocumentData(client));
    return clientSchema.parse(client);
  }

  async upsertClient(client: Client): Promise<Client> {
    const parsed = clientSchema.parse(client) as Client;
    await this.db.collection("clients").doc(parsed.id).set(asDocumentData(parsed), { merge: false });
    return parsed;
  }

  async upsertProperty(property: Property): Promise<Property> {
    const parsed = propertySchema.parse(property) as Property;
    await this.db.collection("properties").doc(parsed.id).set(asDocumentData(parsed), { merge: false });
    return parsed;
  }

  async upsertJob(job: Job): Promise<Job> {
    const parsed = jobSchema.parse(job) as Job;
    await this.db.collection("jobs").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async createQuote(quote: Quote): Promise<Quote> {
    await this.db.collection("quotes").doc(quote.id).set(asDocumentData(quote));
    return quoteSchema.parse(quote);
  }

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    await this.db.collection("invoices").doc(invoice.id).set(asDocumentData(invoice));
    return invoiceSchema.parse(invoice) as Invoice;
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    const ref = this.db.collection("quotes").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new RailError(`Native quote ${id} was not found.`, { provider: "native", op: "updateQuote", status: 404 });
    }
    const next = quoteSchema.parse({ ...snapshot.data(), ...patch }) as Quote;
    await ref.set(asDocumentData(next));
    return next;
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const ref = this.db.collection("invoices").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new RailError(`Native invoice ${id} was not found.`, { provider: "native", op: "updateInvoice", status: 404 });
    }
    const next = invoiceSchema.parse({ ...snapshot.data(), ...patch }) as Invoice;
    await ref.set(asDocumentData(next));
    return next;
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
    const ref = this.db.collection("jobs").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new RailError(`Native job ${id} was not found.`, { provider: "native", op: "updateJob", status: 404 });
    }
    const next = jobSchema.parse({ ...snapshot.data(), ...patch }) as Job;
    await ref.set(asDocumentData(next));
    return next;
  }

  async reserveDocumentNumber(tenantId: string, kind: DocumentSequenceKind): Promise<string> {
    const ref = this.db.collection("crmSettings").doc(tenantId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const parsed = snapshot.exists ? crmSettingsSchema.safeParse(snapshot.data()) : null;
      const current = parsed?.success ? parsed.data as CrmSettings : defaultCrmSettings(tenantId);
      if (current.tenantId !== tenantId) {
        throw new RailError("Numbering settings do not belong to the requested tenant.", { provider: "native", op: "reserveDocumentNumber", status: 403 });
      }
      const reservation = advanceDocumentNumber(current.documentNumbering[kind]);
      const next = crmSettingsSchema.parse({
        ...current,
        documentNumbering: { ...current.documentNumbering, [kind]: reservation.nextRule },
        updatedAt: new Date().toISOString()
      }) as CrmSettings;
      transaction.set(ref, asDocumentData(next), { merge: true });
      return reservation.number;
    });
  }
}
