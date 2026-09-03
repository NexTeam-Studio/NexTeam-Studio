import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ClientProfileTab } from "../domain/nexopsNavigation";
import type {
  CrmClient,
  CrmClientsResponse,
  CrmInvoice,
  CrmJob,
  CrmPaymentSummary,
  CrmPaymentsResponse,
  CrmProperty,
  CrmQuote,
  CrmReceiptReviewSummary,
  CrmReceiptReviewsResponse,
  CrmRecordsResponse,
  CrmRequestSummary,
  CrmRequestsResponse,
  TenantUserRecord,
  TenantUsersResponse
} from "../contracts/workspaceContracts";

export function useNexOpsWorkspaceRecords(options: {
  tenantId: string;
  activeClientProfileTab: ClientProfileTab | null;
  setSelectedClientId: Dispatch<SetStateAction<string>>;
}) {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [properties, setProperties] = useState<CrmProperty[]>([]);
  const [jobs, setJobs] = useState<CrmJob[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [invoices, setInvoices] = useState<CrmInvoice[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserRecord[]>([]);
  const [requests, setRequests] = useState<CrmRequestSummary[]>([]);
  const [payments, setPayments] = useState<CrmPaymentSummary[]>([]);
  const [receiptReviews, setReceiptReviews] = useState<CrmReceiptReviewSummary[]>([]);
  const [status, setStatus] = useState("Loading clients...");
  const [nextClientCursor, setNextClientCursor] = useState<string | undefined>();
  const [loadingMoreClients, setLoadingMoreClients] = useState(false);

  function clearRelatedRecords(): void {
    setProperties([]);
    setJobs([]);
    setQuotes([]);
    setInvoices([]);
    setTenantUsers([]);
    setRequests([]);
    setPayments([]);
    setReceiptReviews([]);
  }

  async function refreshRelatedRecords(): Promise<void> {
    try {
      const tenantId = options.tenantId;
      const [propertiesBody, jobsBody, quotesBody, invoicesBody, tenantUsersBody, requestsBody, paymentsBody, receiptReviewsBody] = await Promise.all([
        fetch(`/api/crm/properties?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/quotes?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/invoices?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/users`).then((response) => response.json() as Promise<TenantUsersResponse>),
        fetch(`/api/crm/requests?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRequestsResponse>),
        fetch(`/api/crm/payments?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmPaymentsResponse>),
        fetch(`/api/crm/receipt-reviews?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmReceiptReviewsResponse>)
      ]);
      setProperties(propertiesBody.ok ? propertiesBody.properties ?? [] : []);
      setJobs(jobsBody.ok ? jobsBody.jobs ?? [] : []);
      setQuotes(quotesBody.ok ? quotesBody.quotes ?? [] : []);
      setInvoices(invoicesBody.ok ? invoicesBody.invoices ?? [] : []);
      setTenantUsers(tenantUsersBody.ok ? tenantUsersBody.users ?? [] : []);
      setRequests(requestsBody.ok ? requestsBody.requests ?? [] : []);
      setPayments(paymentsBody.ok ? paymentsBody.payments ?? [] : []);
      setReceiptReviews(receiptReviewsBody.ok ? receiptReviewsBody.receiptReviews ?? [] : []);
    } catch {
      clearRelatedRecords();
    }
  }

  async function refresh(): Promise<void> {
    setStatus("Loading clients...");
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(options.tenantId)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setClients([]);
        setStatus(body.error ?? "Clients are unavailable right now.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients(nextClients);
      setNextClientCursor(body.nextCursor);
      options.setSelectedClientId((current) => {
        if (current && nextClients.some((client) => client.id === current)) return current;
        return options.activeClientProfileTab ? current : nextClients[0]?.id ?? "";
      });
      setStatus(nextClients.length ? `${nextClients.length} native NexOps client${nextClients.length === 1 ? "" : "s"} loaded.` : "No native NexOps clients yet.");
      void refreshRelatedRecords();
    } catch {
      setClients([]);
      clearRelatedRecords();
      setStatus("Clients API unreachable.");
    }
  }

  async function loadMoreClients(): Promise<void> {
    if (!nextClientCursor || loadingMoreClients) return;
    setLoadingMoreClients(true);
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(options.tenantId)}&cursor=${encodeURIComponent(nextClientCursor)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setStatus(body.error ?? "More clients are unavailable right now.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients((current) => {
        const knownIds = new Set(current.map((client) => client.id));
        return [...current, ...nextClients.filter((client) => !knownIds.has(client.id))];
      });
      setNextClientCursor(body.nextCursor);
      setStatus(nextClients.length ? `${nextClients.length} more native NexOps client${nextClients.length === 1 ? "" : "s"} loaded.` : "No more native NexOps clients.");
    } catch {
      setStatus("More clients are unavailable right now.");
    } finally {
      setLoadingMoreClients(false);
    }
  }

  useEffect(() => {
    void refresh();
    const onCrmMutation = () => void refresh();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [options.tenantId]);

  return {
    clients,
    properties,
    jobs,
    quotes,
    invoices,
    tenantUsers,
    requests,
    payments,
    receiptReviews,
    status,
    hasMoreClients: Boolean(nextClientCursor),
    loadingMoreClients,
    setClients,
    refresh,
    loadMoreClients
  };
}
