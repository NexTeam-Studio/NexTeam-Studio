import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  customFieldDraftRowsToRecord,
  customFieldRecordToDraftRows,
  type CustomFieldDraftRow,
  validateCustomFieldDraftRows
} from "../../contact/domain/clientProfile";
import {
  isProtectedLegacyClient,
  protectedLegacyClientDeleteMessage
} from "../domain/clientDeletionPolicy";
import { clientDisplayName } from "../../../../nexopsShell/workspaceSupport";
import type {
  ClientPortalActivityEntry,
  ClientPortalActivityResponse,
  CrmClient,
  CrmClientCreateResponse,
  FieldDocsMediaListResponse,
  FieldDocsReportsListResponse,
  ReviewSequenceRecord,
  ReviewSequenceStatusResponse,
  SendPortalLinkResponse,
  SignedDocumentRecord,
  SignedDocumentsResponse
} from "../../../../nexopsShell/contracts/workspaceContracts";

export function useClientDetailsRails(options: {
  tenantId: string;
  selectedClientId: string;
  clients: CrmClient[];
  setClients: Dispatch<SetStateAction<CrmClient[]>>;
  onReturnToRoster: () => void;
  onRefreshAll: () => Promise<void>;
  onMutation: () => void;
}) {
  const [clientPortalActivity, setClientPortalActivity] = useState<ClientPortalActivityEntry[]>([]);
  const [clientReviewSequences, setClientReviewSequences] = useState<ReviewSequenceRecord[]>([]);
  const [clientFieldMedia, setClientFieldMedia] = useState<NonNullable<FieldDocsMediaListResponse["media"]>>([]);
  const [clientFieldReports, setClientFieldReports] = useState<NonNullable<FieldDocsReportsListResponse["reports"]>>([]);
  const [clientSignedDocuments, setClientSignedDocuments] = useState<SignedDocumentRecord[]>([]);
  const [clientRailStatus, setClientRailStatus] = useState("Portal activity and review follow-up will load when a client is selected.");
  const [clientRailBusy, setClientRailBusy] = useState("");
  const [lastPortalLink, setLastPortalLink] = useState("");
  const [clientOverviewCustomFieldsDraft, setClientOverviewCustomFieldsDraft] = useState<CustomFieldDraftRow[]>([]);
  const [clientOverviewCustomFieldsOpen, setClientOverviewCustomFieldsOpen] = useState(false);
  const selectedClient = options.clients.find((client) => client.id === options.selectedClientId);
  const clientOverviewCustomFieldValidation = validateCustomFieldDraftRows(clientOverviewCustomFieldsDraft, CLIENT_CUSTOM_FIELD_RESERVED_LABELS);

  function clearRails(): void {
    setClientPortalActivity([]);
    setClientReviewSequences([]);
    setClientFieldMedia([]);
    setClientFieldReports([]);
    setClientSignedDocuments([]);
  }

  async function refreshClientRails(clientId = options.selectedClientId, tenantId = options.tenantId): Promise<void> {
    if (!clientId) {
      clearRails();
      setClientRailStatus("Portal activity and review follow-up will load when a client is selected.");
      return;
    }
    setClientRailStatus("Loading portal activity, review follow-up, and NexCam rails...");
    try {
      const [activityBody, reviewBody, mediaBody, reportsBody, signedDocsBody] = await Promise.all([
        fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/portal-activity?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<ClientPortalActivityResponse>),
        fetch(`/api/crm/review-sequences?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}`).then((response) => response.json() as Promise<ReviewSequenceStatusResponse>),
        fetch(`/api/fielddocs/media?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&limit=8`).then((response) => response.json() as Promise<FieldDocsMediaListResponse>),
        fetch(`/api/fielddocs/reports?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&limit=6`).then((response) => response.json() as Promise<FieldDocsReportsListResponse>),
        fetch(`/api/fielddocs/signed-documents?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}`).then((response) => response.json() as Promise<SignedDocumentsResponse>)
      ]);
      const nextActivity = activityBody.ok ? activityBody.activity ?? [] : [];
      const nextSequences = reviewBody.ok ? reviewBody.sequences ?? [] : [];
      const nextMedia = mediaBody.ok ? mediaBody.media ?? [] : [];
      const nextReports = reportsBody.ok ? reportsBody.reports ?? [] : [];
      const nextSignedDocs = signedDocsBody.ok ? signedDocsBody.records ?? [] : [];
      setClientPortalActivity(nextActivity);
      setClientReviewSequences(nextSequences);
      setClientFieldMedia(nextMedia);
      setClientFieldReports(nextReports);
      setClientSignedDocuments(nextSignedDocs);
      if (!activityBody.ok || !reviewBody.ok || !mediaBody.ok || !reportsBody.ok || !signedDocsBody.ok) {
        setClientRailStatus(activityBody.error ?? reviewBody.error ?? mediaBody.error ?? reportsBody.error ?? signedDocsBody.error ?? "Client portal rails are unavailable right now.");
        return;
      }
      setClientRailStatus(nextSequences.length
        ? `${nextActivity.length} portal event${nextActivity.length === 1 ? "" : "s"}, ${nextSequences.length} review sequence${nextSequences.length === 1 ? "" : "s"}, ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} loaded.`
        : nextActivity.length
          ? `${nextActivity.length} portal event${nextActivity.length === 1 ? "" : "s"} loaded. No review follow-up is active for this client. ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} are on the rail.`
          : nextMedia.length || nextReports.length || nextSignedDocs.length
            ? `No portal activity or review follow-up is recorded yet. NexCam already has ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} for this client.`
            : "No portal activity, review follow-up, or NexCam media is recorded for this client yet.");
    } catch {
      clearRails();
      setClientRailStatus("Client portal rails are unavailable right now.");
    }
  }

  async function sendClientPortalLink(clientId: string, propertyId?: string): Promise<void> {
    setClientRailBusy(propertyId ? `portal-link-${propertyId}` : "portal-link");
    setClientRailStatus("Sending portal link...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/portal-link`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: options.tenantId, ...(propertyId ? { propertyId } : {}) })
      }).then((response) => response.json() as Promise<SendPortalLinkResponse>);
      if (!body.ok || !body.portalLink) {
        setClientRailStatus(body.error ?? "Portal link could not be sent.");
        return;
      }
      setLastPortalLink(body.portalLink);
      setClientRailStatus(`Portal link sent by ${body.delivery ?? "direct"} to ${body.target ?? "the saved client destination"}.`);
      await refreshClientRails(clientId);
    } catch {
      setClientRailStatus("Portal link could not be sent.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function sendClientStatement(clientId: string): Promise<void> {
    setClientRailBusy("send-statement");
    setClientRailStatus("Sending client statement...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/statements/send`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: options.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; target?: string; error?: string }>);
      if (!body.ok) {
        setClientRailStatus(body.error ?? "Statement send failed.");
        return;
      }
      setClientRailStatus(`Statement sent to ${body.target ?? "the saved client destination"}.`);
      await refreshClientRails(clientId);
    } catch {
      setClientRailStatus("Statement send failed.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function deleteClientRecord(clientId: string): Promise<void> {
    const client = options.clients.find((entry) => entry.id === clientId);
    if (!client) {
      setClientRailStatus("That client is no longer on the rail.");
      return;
    }
    if (isProtectedLegacyClient(client)) {
      setClientRailStatus(protectedLegacyClientDeleteMessage());
      return;
    }
    if (!window.confirm(`Delete ${clientDisplayName(client)}? This removes the client and any linked properties only when there is no saved request, quote, job, or invoice history.`)) return;
    setClientRailBusy("delete-client");
    setClientRailStatus(`Deleting ${clientDisplayName(client)}...`);
    try {
      const response = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}?tenantId=${encodeURIComponent(options.tenantId)}`, { method: "DELETE" });
      const body = await response.json() as { ok: boolean; error?: string; deletedPropertyIds?: string[] };
      if (!response.ok || !body.ok) {
        setClientRailStatus(body.error ?? "Client delete failed.");
        return;
      }
      options.onMutation();
      options.onReturnToRoster();
      await options.onRefreshAll();
      setClientRailStatus(`${clientDisplayName(client)} deleted${body.deletedPropertyIds?.length ? ` with ${body.deletedPropertyIds.length} linked propert${body.deletedPropertyIds.length === 1 ? "y" : "ies"}` : ""}.`);
    } catch {
      setClientRailStatus("Client delete failed.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function saveClientMarketingConsent(clientId: string, marketing: boolean): Promise<void> {
    setClientRailBusy("marketing-consent");
    setClientRailStatus(marketing ? "Turning marketing consent on..." : "Turning marketing consent off and checking live showcases...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: options.tenantId, consent: {
          ...(selectedClient?.consent.email !== undefined ? { email: selectedClient.consent.email } : {}),
          ...(selectedClient?.consent.sms !== undefined ? { sms: selectedClient.consent.sms } : {}), marketing
        } })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setClientRailStatus(body.error ?? "Marketing consent could not be updated.");
        return;
      }
      options.setClients((current) => current.map((client) => client.id === body.client?.id ? body.client : client));
      setClientRailStatus(marketing ? "Marketing consent is on for this client." : "Marketing consent is off. Future NexReach generation is blocked and any live showcase is flagged for review.");
    } catch {
      setClientRailStatus("Marketing consent could not be updated.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function saveClientOverviewCustomFields(clientId: string): Promise<void> {
    if (!selectedClient) return;
    if (clientOverviewCustomFieldValidation.hasBlockingIssues) {
      setClientRailStatus("Custom field labels must be unique and cannot reuse built-in labels.");
      return;
    }
    setClientRailBusy("custom-fields");
    setClientRailStatus("Saving custom fields...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: options.tenantId, customFields: {
          ...(selectedClient.customFields ?? {}),
          ...customFieldDraftRowsToRecord(clientOverviewCustomFieldsDraft, CLIENT_CUSTOM_FIELD_RESERVED_LABELS)
        } })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setClientRailStatus(body.error ?? "Custom fields could not be saved.");
        return;
      }
      options.setClients((current) => current.map((client) => client.id === body.client?.id ? body.client : client));
      setClientOverviewCustomFieldsDraft(customFieldRecordToDraftRows(body.client.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_profile"));
      setClientOverviewCustomFieldsOpen(false);
      setClientRailStatus("Custom fields saved.");
    } catch {
      setClientRailStatus("Custom fields could not be saved.");
    } finally {
      setClientRailBusy("");
    }
  }

  useEffect(() => { void refreshClientRails(); }, [options.selectedClientId, options.tenantId]);

  const directClientMedia = clientFieldMedia.filter((media) => !media.jobId && !media.visitId);
  const workScopedClientMedia = clientFieldMedia.filter((media) => Boolean(media.jobId || media.visitId));
  return {
    selectedClient, clientPortalActivity, clientReviewSequences, clientFieldReports, clientSignedDocuments,
    orderedClientFieldMedia: [...directClientMedia, ...workScopedClientMedia], clientRailStatus, clientRailBusy,
    lastPortalLink, clientOverviewCustomFieldsDraft, setClientOverviewCustomFieldsDraft,
    clientOverviewCustomFieldsOpen, setClientOverviewCustomFieldsOpen, clientOverviewCustomFieldValidation,
    refreshClientRails, sendClientPortalLink, sendClientStatement, deleteClientRecord,
    saveClientMarketingConsent, saveClientOverviewCustomFields
  };
}
