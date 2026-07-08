import { z } from "zod";
import {
  RailError,
  type ApprovalQueueService,
  type CRMProvider,
  type Invoice,
  type Job,
  type NexiTool,
  type Quote,
  type Source,
  type Tenant
} from "@nexteam/core";
import { buildQuoteDraft, draftQuoteInputSchema } from "./quoteBuilder.js";

const clientLookupInputSchema = z.object({ q: z.string().default("") });
const createClientInputSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1).optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  consent: z.object({ email: z.boolean(), sms: z.boolean() }).default({ email: false, sms: false })
});
const draftQuoteToolInputSchema = draftQuoteInputSchema.omit({ tenantId: true });
const getPipelineInputSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});
const invoiceStatusInputSchema = z.object({
  invoiceId: z.string().optional(),
  clientId: z.string().optional()
});

interface InvoiceReadableProvider extends CRMProvider {
  getInvoices?: () => Promise<Invoice[]>;
}

interface QuoteMutableProvider extends CRMProvider {
  updateQuote?: (id: string, patch: Partial<Quote>) => Promise<Quote>;
}

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function defaultRange(): { from: string; to: string } {
  return { from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };
}

function groupJobs(jobs: Job[]): Record<Job["status"], number> {
  return jobs.reduce<Record<Job["status"], number>>((groups, job) => {
    groups[job.status] = (groups[job.status] ?? 0) + 1;
    return groups;
  }, {
    lead: 0,
    quoted: 0,
    scheduled: 0,
    in_progress: 0,
    complete: 0,
    invoiced: 0,
    paid: 0
  });
}

export function createCrmReadTools(provider: CRMProvider): NexiTool[] {
  const readable = provider as InvoiceReadableProvider;
  return [
    {
      name: "clientLookup",
      description: "Read native CRM clients by name, company, email, or phone. Pass an empty query for the tenant client list.",
      inputSchema: clientLookupInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = clientLookupInputSchema.parse(args);
        const clients = await provider.getClients(input.q);
        return {
          result: { clients },
          sources: [source("clients", "Native CRM clients")]
        };
      }
    },
    {
      name: "getPipeline",
      description: "Read native CRM jobs grouped by pipeline status.",
      inputSchema: getPipelineInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = getPipelineInputSchema.parse(args);
        const fallback = defaultRange();
        const jobs = await provider.getJobs({ from: input.from ?? fallback.from, to: input.to ?? fallback.to });
        return {
          result: { counts: groupJobs(jobs), jobs },
          sources: [source("jobs", "Native CRM jobs")]
        };
      }
    },
    {
      name: "invoiceStatus",
      description: "Read native CRM invoice status by invoice id or client id.",
      inputSchema: invoiceStatusInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!readable.getInvoices) {
          throw new RailError("The configured CRM provider cannot read native invoices.", { provider: "native", op: "invoiceStatus", status: 501 });
        }
        const input = invoiceStatusInputSchema.parse(args);
        const invoices = (await readable.getInvoices()).filter((invoice) =>
          (input.invoiceId ? invoice.id === input.invoiceId : true)
          && (input.clientId ? invoice.clientId === input.clientId : true)
        );
        return {
          result: { invoices },
          sources: invoices.length
            ? invoices.map((invoice) => source(invoice.id, `Native invoice ${invoice.title}`))
            : [source("invoices", "Native CRM invoices")]
        };
      }
    }
  ];
}

export function createCrmTools(provider: CRMProvider, approvalQueue: ApprovalQueueService): NexiTool[] {
  return [
    ...createCrmReadTools(provider),
    {
      name: "createClient",
      description: "Create a native CRM client. This writes only to the native client collection for the current tenant.",
      inputSchema: createClientInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!provider.createClient) {
          throw new RailError("The configured CRM provider cannot create native clients.", { provider: "native", op: "createClient", status: 501 });
        }
        const input = createClientInputSchema.parse(args);
        const client = await provider.createClient({
          tenantId: tenant.id,
          name: input.name,
          company: input.company,
          emails: input.emails,
          phones: input.phones,
          consent: input.consent
        });
        return {
          result: { client },
          sources: [source(client.id, `Native client ${client.name}`)]
        };
      }
    },
    {
      name: "draftQuote",
      description: "Draft a native CRM quote from VGB catalog codes and place it in the ApprovalQueue.",
      inputSchema: draftQuoteToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!provider.draftQuote) {
          throw new RailError("The configured CRM provider cannot draft native quotes.", { provider: "native", op: "draftQuote", status: 501 });
        }
        const input = draftQuoteToolInputSchema.parse(args);
        const quote = await provider.draftQuote(buildQuoteDraft({ ...input, tenantId: tenant.id }));
        const approval = await approvalQueue.create({
          tenantId: tenant.id,
          kind: "quote",
          preview: {
            title: quote.title,
            body: quote.lineItems.map((item) => `${item.code} ${item.name}: $${item.total.toFixed(2)}`).join("\n")
          },
          execute: { service: "crm", op: "sendQuote", args: { tenantId: tenant.id, quoteId: quote.id } },
          createdBy: "nexi"
        });
        const mutable = provider as QuoteMutableProvider;
        const approvedQuote = mutable.updateQuote ? await mutable.updateQuote(quote.id, { approvalId: approval.id }) : quote;
        return {
          result: { quote: approvedQuote, approval },
          sources: [
            source(approvedQuote.id, `Native quote ${approvedQuote.title}`),
            source("jobber-products-services", "Jobber-seeded pool leak line-item catalog")
          ]
        };
      }
    }
  ];
}
