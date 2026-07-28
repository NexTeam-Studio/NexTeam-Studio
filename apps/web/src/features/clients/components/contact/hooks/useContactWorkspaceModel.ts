import { useEffect, type Dispatch, type SetStateAction } from "react";
import type {
  CrmClient,
  CrmInvoice,
  CrmJob,
  CrmPaymentSummary,
  CrmProperty,
  CrmQuote,
  CrmReceiptReviewSummary,
  CrmRequestSummary
} from "../../../../nexopsShell/contracts/workspaceContracts";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  customFieldRecordToDraftRows,
  primaryClientPhoneValue,
  type ClientProfileMobileBucket,
  type CustomFieldDraftRow
} from "../domain/clientProfile";
import { clientDisplayName, clientHasTextReadyContact, clientPrimaryAddress, clientStatusLabel, contactSummary } from "../../../../nexopsShell/workspaceSupport";
import { useContactFormController } from "./useContactFormController";

export function useContactWorkspaceModel(input: {
  tenantId: string;
  clients: CrmClient[];
  properties: CrmProperty[];
  jobs: CrmJob[];
  quotes: CrmQuote[];
  invoices: CrmInvoice[];
  payments: CrmPaymentSummary[];
  receiptReviews: CrmReceiptReviewSummary[];
  requests: CrmRequestSummary[];
  query: string;
  selectedClientId: string;
  refresh: () => Promise<void>;
  onSaved: (clientId: string) => void;
  setClientOverviewCustomFieldsDraft: Dispatch<SetStateAction<CustomFieldDraftRow[]>>;
  setClientOverviewCustomFieldsOpen: Dispatch<SetStateAction<boolean>>;
  setMobileClientExpandedBucket: Dispatch<SetStateAction<ClientProfileMobileBucket | null>>;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const filteredClients = input.clients.filter((client) => !normalizedQuery || [
    clientDisplayName(client),
    contactSummary(client),
    clientPrimaryAddress(client),
    ...(client.tags ?? [])
  ].join(" ").toLowerCase().includes(normalizedQuery));
  const selectedClient = input.selectedClientId
    ? input.clients.find((client) => client.id === input.selectedClientId) ?? null
    : filteredClients[0] ?? null;
  const selectedContact = selectedClient?.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? selectedClient?.contacts?.[0];
  const selectedPhone = selectedContact?.phones?.find((phone) => phone.primary) ?? selectedContact?.phones?.[0];
  const selectedPhoneValue = selectedClient ? primaryClientPhoneValue({ contactPhones: selectedContact?.phones, clientPhones: selectedClient.phones }) : "";
  const selectedEmail = selectedContact?.emails?.find((email) => email.primary)?.value ?? selectedContact?.emails?.[0]?.value ?? selectedClient?.emails[0];
  const selectedProperties = selectedClient ? input.properties.filter((property) => property.clientId === selectedClient.id) : [];
  const contactForm = useContactFormController({
    tenantId: input.tenantId,
    clients: input.clients,
    selectedClientId: input.selectedClientId,
    selectedClient: selectedClient ?? undefined,
    selectedProperty: selectedProperties[0] ?? null,
    onRefresh: input.refresh,
    onSaved: input.onSaved
  });
  const selectedRequests = selectedClient ? input.requests.filter((request) => request.selectedClientId === selectedClient.id) : [];
  const selectedJobs = selectedClient ? input.jobs.filter((job) => job.clientId === selectedClient.id) : [];
  const selectedQuotes = selectedClient ? input.quotes.filter((quote) => quote.clientId === selectedClient.id) : [];
  const selectedInvoices = selectedClient ? input.invoices.filter((invoice) => invoice.clientId === selectedClient.id) : [];
  const selectedPayments = selectedClient ? input.payments.filter((payment) => payment.clientId === selectedClient.id) : [];
  const selectedReceiptReviewSummaries = selectedClient
    ? input.receiptReviews.filter((review) => review.clientId === selectedClient.id || selectedInvoices.some((invoice) => invoice.id === review.invoiceId))
    : [];

  useEffect(() => {
    input.setClientOverviewCustomFieldsDraft(customFieldRecordToDraftRows(selectedClient?.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_profile"));
    input.setClientOverviewCustomFieldsOpen(false);
    input.setMobileClientExpandedBucket(null);
  }, [selectedClient?.id]);

  return {
    activeCount: input.clients.filter((client) => clientStatusLabel(client) === "Active").length,
    contactForm,
    filteredClients,
    leadCount: input.clients.filter((client) => clientStatusLabel(client) === "Lead").length,
    selectedClient,
    selectedContact,
    selectedEmail,
    selectedInvoices,
    selectedJobs,
    selectedPayments,
    selectedPhone,
    selectedPhoneValue,
    selectedProperties,
    selectedQuotes,
    selectedReceiptReviewSummaries,
    selectedRequests,
    textReadyCount: input.clients.filter(clientHasTextReadyContact).length
  };
}
