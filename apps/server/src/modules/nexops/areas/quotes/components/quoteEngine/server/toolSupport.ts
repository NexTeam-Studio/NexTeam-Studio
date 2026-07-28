import { type ApprovalQueueService, type Client, type CRMProvider, type Quote, type Tenant } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { z } from "zod";
import { materializeQuoteRecord, quotePreviewBody } from "../domain/quoteFoundation.js";
import { resolveExactClientId } from "../../../../../shared/tools/clientResolution.js";
import type { createQuoteToolInputSchema } from "./toolSchemas.js";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function quoteMatchesQuery(quote: Quote, query: string, clients: Client[]): boolean {
  const needle = normalized(query.trim());
  if (!needle) {
    return true;
  }
  const client = clients.find((candidate) => candidate.id === quote.clientId);
  return [
    quote.id,
    quote.number,
    quote.title,
    quote.status,
    client?.name,
    ...(client?.emails ?? []),
    ...(client?.phones ?? [])
  ].some((value) => normalized(String(value ?? "")).includes(needle));
}

export function quoteSummary(quote: Quote, clients: Client[]): {
  id: string;
  number?: string | undefined;
  title: string;
  clientName: string;
  status: Quote["status"];
  total: number;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
} {
  return {
    id: quote.id,
    ...(quote.number ? { number: quote.number } : {}),
    title: quote.title,
    clientName: clients.find((candidate) => candidate.id === quote.clientId)?.name ?? quote.clientId,
    status: quote.status,
    total: quote.totals.total,
    ...(quote.expiresAt ? { expiresAt: quote.expiresAt } : {}),
    ...(quote.requestId ? { requestId: quote.requestId } : {})
  };
}

export async function queueQuoteCreateApproval(
  tenant: Tenant,
  input: z.infer<typeof createQuoteToolInputSchema>,
  provider: CRMProvider,
  repository: NativeCrmRepository,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  pendingQuote: Quote;
  writesAreApprovalQueuedOnly: true;
}> {
  const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "createQuote");
  const quote = await materializeQuoteRecord(repository, {
    ...input,
    tenantId: tenant.id,
    clientId
  });
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "quote",
    preview: {
      title: `Create quote: ${quote.title}`,
      body: quotePreviewBody(quote)
    },
    execute: {
      service: "crm",
      op: "createQuote",
      args: {
        tenantId: tenant.id,
        quote: JSON.parse(JSON.stringify(quote)) as Quote
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingQuote: {
      ...quote,
      approvalId: approval.id,
      status: "pending_approval"
    },
    writesAreApprovalQueuedOnly: true
  };
}
