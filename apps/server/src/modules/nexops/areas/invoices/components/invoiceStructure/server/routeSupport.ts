import { RailError, type Client, type Invoice } from "@nexteam/core";
import type { NativeAdapter } from "@nexteam/providers";
import type { CrmRouteDeps } from "../../../../../shared/runtime/routeComposition.js";

export function createInvoiceRouteSupport(input: {
  providerForTenant: (tenantId: string) => NativeAdapter;
  ledger: () => NonNullable<CrmRouteDeps["ledgerService"]>;
  hasLedgerService: boolean;
}) {
  async function getInvoiceAndClient(tenantId: string, invoiceId: string): Promise<{ provider: NativeAdapter; invoice: Invoice; client?: Client }> {
    const provider = input.providerForTenant(tenantId);
    const invoice = input.hasLedgerService
      ? await input.ledger().getInvoice(tenantId, invoiceId)
      : (await provider.getInvoices()).find((candidate) => candidate.id === invoiceId) ?? null;
    if (!invoice) throw new RailError(`Native invoice ${invoiceId} was not found.`, { provider: "native", op: "getInvoice", status: 404 });
    const client = (await provider.getClients("")).find((candidate) => candidate.id === invoice.clientId);
    return client ? { provider, invoice, client } : { provider, invoice };
  }

  return { getInvoiceAndClient };
}
