import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  clientSchema,
  invoiceSchema,
  jobSchema,
  propertySchema,
  quoteSchema,
  type Client,
  type Invoice,
  type Job,
  type Property,
  type Quote
} from "@nexteam/core";
import { RailError } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { ZodSchema } from "zod";

type CollectionName = "clients" | "properties" | "jobs" | "quotes" | "invoices";

function asDocumentData(value: object): DocumentData {
  return value as DocumentData;
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

  async listJobs(tenantId: string): Promise<Job[]> {
    return (await this.listByTenant("jobs", tenantId, jobSchema)) as Job[];
  }

  async listQuotes(tenantId: string): Promise<Quote[]> {
    return (await this.listByTenant("quotes", tenantId, quoteSchema)) as Quote[];
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return (await this.listByTenant("invoices", tenantId, invoiceSchema)) as Invoice[];
  }

  async createClient(client: Client): Promise<Client> {
    await this.db.collection("clients").doc(client.id).set(asDocumentData(client));
    return clientSchema.parse(client);
  }

  async createQuote(quote: Quote): Promise<Quote> {
    await this.db.collection("quotes").doc(quote.id).set(asDocumentData(quote));
    return quoteSchema.parse(quote);
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
}
