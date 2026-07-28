import type { CRMProvider, Invoice, NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { invoiceStatusInputSchema } from "./toolSchemas.js";

export function createInvoiceStructureNexiTools(context: CrmToolContext, _includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    options,
    provider,
    source
  } = context;
  const readable = provider as CRMProvider & { getInvoices?: () => Promise<Invoice[]> };
  return [
    ...[{
      name: "invoiceStatus",
      description: "Read native CRM invoice status by invoice id or client id.",
      inputSchema: invoiceStatusInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!readable.getInvoices && !options.ledgerService) {
          throw new RailError("The configured CRM provider cannot read native invoices.", { provider: "native", op: "invoiceStatus", status: 501 });
        }
        const input = invoiceStatusInputSchema.parse(args);
        const invoices = (options.ledgerService ? await options.ledgerService.listInvoices(_tenant.id) : await readable.getInvoices!()).filter((invoice) =>
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
    }]
  ];
}
