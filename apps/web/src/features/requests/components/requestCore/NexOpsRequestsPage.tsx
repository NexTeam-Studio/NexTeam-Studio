import { formatAddress, type Address as CrmAddress } from "@nexteam/shared";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NexOpsCreationTemplate, NexOpsDetailTemplate, NexOpsRosterSurface, NexOpsRosterTemplate } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";

type RequestStatus = "new" | "archived" | "converted_to_quote" | "converted_to_job";
const REQUEST_FILTERS: Array<{ value: "all" | RequestStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "archived", label: "Archived" },
  { value: "converted_to_quote", label: "To Quote" },
  { value: "converted_to_job", label: "To Job" }
];
type RequestSource = "website_form" | "office_existing_client" | "office_new_client" | "legacy_lead_backfill";
type IntakeFieldType = "text" | "email" | "phone" | "textarea" | "select" | "boolean" | "multi_image";
type IntakeFieldGroup = "contact" | "property" | "pool" | "safety" | "service" | "notes";
type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

interface ClientOption {
  id: string;
  name: string;
  company?: string;
  personName?: { title?: string; firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  emails: string[];
  phones: string[];
}

interface PropertyOption {
  id: string;
  clientId: string;
  siteName?: string;
  label?: string;
  address: CrmAddress;
  access?: { gateCode?: string; accessNotes?: string };
}

interface TenantUserRecord {
  id: string;
  email?: string;
  displayName: string;
  role: TenantRole;
  active: boolean;
}

interface RequestFieldVisibility {
  request: boolean;
  quote: boolean;
  job: boolean;
  visit: boolean;
  invoice: boolean;
}

interface RequestFieldDefinition {
  key: string;
  label: string;
  type: IntakeFieldType;
  group: IntakeFieldGroup;
  required?: boolean;
  prominent?: boolean;
  helpText?: string;
  options?: string[];
  maxItems?: number;
}

interface RequestFieldValue extends RequestFieldDefinition {
  value: string | number | boolean | string[];
  visibility: RequestFieldVisibility;
}

interface IntakeSnapshot {
  narrative: string;
  fieldValues: RequestFieldValue[];
  fieldIndex: Record<string, string | number | boolean | string[]>;
}

interface RequestMatch {
  matchedClientId?: string;
  matchedPropertyId?: string;
  matchedBy: "none" | "exact_email" | "exact_phone" | "selected_existing_client" | "selected_existing_property";
  matchedValue?: string;
  reviewRequired: boolean;
}

interface ServiceRequestRecord {
  id: string;
  tenantId: string;
  formId?: string;
  formSlug?: string;
  source: RequestSource;
  status: RequestStatus;
  subject: string;
  clientName: string;
  email?: string;
  phone?: string;
  propertyAddress?: CrmAddress;
  narrative: string;
  consent: { email: boolean; sms: boolean };
  intake: IntakeSnapshot;
  match: RequestMatch;
  selectedClientId?: string;
  selectedPropertyId?: string;
  sourceLeadId?: string;
  convertedQuoteId?: string;
  convertedJobId?: string;
  reviewedAt?: string;
  archivedAt?: string;
  reopenedAt?: string;
  deletedAt?: string;
  notes?: Array<{ id: string; body: string; visibility: "internal" | "client"; authorId: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

interface RequestFormRecord {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  intro?: string;
  active: boolean;
  fieldDefinitions: RequestFieldDefinition[];
  sharePath?: string;
  embedCode?: string;
  createdAt: string;
  updatedAt: string;
}

interface RequestFormResponse {
  ok: boolean;
  forms?: RequestFormRecord[];
  error?: string;
}

interface RequestsResponse {
  ok: boolean;
  requests?: ServiceRequestRecord[];
  error?: string;
}

interface RequestMutationResponse {
  ok: boolean;
  request?: ServiceRequestRecord;
  quote?: { id: string };
  job?: { id: string };
  deletedRequestId?: string;
  preservedClientId?: string | null;
  error?: string;
}

interface NexOpsRequestsPageProps {
  tenantId: string;
  clients: ClientOption[];
  properties: PropertyOption[];
  tenantUsers: TenantUserRecord[];
  onCrmMutation?: () => void;
  focusedRequestId?: string;
  onOpenRequest?: (requestId: string) => void;
  onReturnToRequestRoster?: () => void;
  onScheduleAssessment?: (jobId: string) => void;
  initialClientId?: string;
  initialFilter?: "all" | RequestStatus;
  captureIntent?: { batchId: string; mediaIds: string[] } | null;
  onCaptureRequestCreated?: (request: { id: string; clientName: string; selectedClientId?: string }) => Promise<void> | void;
}

const DEFAULT_VISIBILITY: RequestFieldVisibility = {
  request: true,
  quote: true,
  job: true,
  visit: true,
  invoice: true
};

function personDisplayName(person?: { firstName?: string; lastName?: string }): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
}

function clientDisplayName(client: ClientOption): string {
  const person = personDisplayName(client.personName);
  if (client.company && client.displayNamePreference !== "person") {
    return client.company;
  }
  return person || client.name;
}

export function mergeClientChoices(
  rosterClients: ClientOption[],
  searchResults: ClientOption[]
): ClientOption[] {
  const unique = new Map<string, ClientOption>();
  for (const client of [...rosterClients, ...searchResults]) unique.set(client.id, client);
  return [...unique.values()];
}

export function requestClientFieldDefaults(
  fields: RequestFieldDefinition[],
  client: ClientOption
): Record<string, string> {
  const person = client.personName;
  const defaults: Record<string, string> = {};
  for (const field of fields) {
    const key = field.key.trim().toLowerCase();
    if (field.type === "email" || key.includes("email")) {
      defaults[field.key] = client.emails[0] ?? "";
    } else if (field.type === "phone" || key.includes("phone")) {
      defaults[field.key] = client.phones[0] ?? "";
    } else if (key === "first_name" || key === "firstname") {
      defaults[field.key] = person?.firstName ?? "";
    } else if (key === "last_name" || key === "lastname") {
      defaults[field.key] = person?.lastName ?? "";
    } else if (key === "company_name" || key === "company") {
      defaults[field.key] = client.company ?? "";
    } else if (key === "client_name" || key === "customer_name" || key === "name") {
      defaults[field.key] = clientDisplayName(client);
    }
  }
  return defaults;
}

export async function fetchClientForRequestSelection(
  tenantId: string,
  clientId: string,
  request: typeof fetch = fetch
): Promise<ClientOption | null> {
  const response = await request(`/api/crm/clients/${encodeURIComponent(clientId)}?tenantId=${encodeURIComponent(tenantId)}`);
  const body = await response.json() as { ok: boolean; client?: ClientOption };
  return body.ok && body.client ? body.client : null;
}

function requestStatusLabel(status: RequestStatus): string {
  switch (status) {
    case "converted_to_quote":
      return "Converted to Quote";
    case "converted_to_job":
      return "Converted to Job";
    default:
      return status[0].toUpperCase() + status.slice(1);
  }
}

const TITLE_CASE_SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "onto", "or", "over", "so", "the", "to", "with", "yet"]);

function titleCaseUiLabel(value: string): string {
  const words = value.replaceAll("_", " ").trim().split(/\s+/);
  return words.map((word, index) => {
    const normalized = word.toLowerCase();
    if (index > 0 && index < words.length - 1 && TITLE_CASE_SMALL_WORDS.has(normalized)) {
      return normalized;
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }).join(" ");
}

function requestSourceLabel(source: RequestSource): string {
  switch (source) {
    case "website_form":
      return "Website Form";
    case "office_existing_client":
      return "Office Existing Client";
    case "office_new_client":
      return "Office New Client";
    case "legacy_lead_backfill":
      return "Legacy Lead Backfill";
    default:
      return source;
  }
}

function requestFieldText(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) {
    return value.length ? `${value.length} file${value.length === 1 ? "" : "s"} attached` : "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string") {
    return value.replaceAll("_", " ");
  }
  return String(value);
}

export function requestNeedsReview(request: ServiceRequestRecord): boolean {
  return request.status === "new" && !request.reviewedAt;
}

export function requestReadyToConvert(request: ServiceRequestRecord): boolean {
  return request.status === "new" && Boolean(request.reviewedAt);
}

export function summarizeRequestQueue(requests: ServiceRequestRecord[]): {
  unreviewed: number;
  readyToConvert: number;
  converted: number;
  archived: number;
} {
  return {
    unreviewed: requests.filter((request) => requestNeedsReview(request)).length,
    readyToConvert: requests.filter((request) => requestReadyToConvert(request)).length,
    converted: requests.filter((request) => request.status === "converted_to_quote" || request.status === "converted_to_job").length,
    archived: requests.filter((request) => request.status === "archived").length
  };
}

export function requestDominantAction(request: ServiceRequestRecord): {
  stage: string;
  detail: string;
  dominantAction: "mark-reviewed" | "convert-to-quote" | "reopen" | "none";
  dominantLabel?: string;
  secondaryAction?: "convert-to-job";
  secondaryLabel?: string;
} {
  if (request.status === "archived") {
    return {
      stage: "Archived",
      detail: "This intake is off the active queue. Reopen it if the office needs to bring it back into circulation.",
      dominantAction: "reopen",
      dominantLabel: "Reopen Request"
    };
  }
  if (request.status === "converted_to_quote") {
    return {
      stage: "Quote Created",
      detail: `Quote ${request.convertedQuoteId ?? "record"} now carries this intake forward. Keep the request as the read-only intake source.`,
      dominantAction: "none"
    };
  }
  if (request.status === "converted_to_job") {
    return {
      stage: "Job Created",
      detail: `Job ${request.convertedJobId ?? "record"} now owns dispatch and reminder work. Keep the request as the original intake snapshot.`,
      dominantAction: "none"
    };
  }
  if (!request.reviewedAt) {
    return {
      stage: request.match.reviewRequired ? "Review Required" : "Mark Reviewed",
      detail: request.match.reviewRequired
        ? "Confirm the exact-match result first, then mark the intake reviewed before converting it downstream."
        : "This intake is ready for an office review pass. Mark it reviewed before you convert it to a quote or job.",
      dominantAction: "mark-reviewed",
      dominantLabel: "Mark Reviewed"
    };
  }
  return {
    stage: "Ready to Convert",
    detail: "Choose a quote when the office needs approval and money flow, or go straight to a job when the work can dispatch immediately.",
    dominantAction: "convert-to-quote",
    dominantLabel: "Convert to Quote",
    secondaryAction: "convert-to-job",
    secondaryLabel: "Convert to Job"
  };
}

function prominentFieldValues(request: ServiceRequestRecord): RequestFieldValue[] {
  return request.intake.fieldValues.filter((field) => field.prominent || field.group === "safety");
}

export function NexOpsRequestsPage(props: NexOpsRequestsPageProps): React.ReactElement {
  const [requests, setRequests] = useState<ServiceRequestRecord[]>([]);
  const [forms, setForms] = useState<RequestFormRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState("Loading requests...");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestFilter, setRequestFilter] = useState<"all" | RequestStatus>("new");
  const [requestFilterOpen, setRequestFilterOpen] = useState(false);
  const [requestCreationOpen, setRequestCreationOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const requestRosterAnchorRef = useRef<HTMLDivElement | null>(null);
  const requestDetailAnchorRef = useRef<HTMLDivElement | null>(null);
  const [selectedFormId, setSelectedFormId] = useState("");
  const initialClientId = props.initialClientId && props.clients.some((client) => client.id === props.initialClientId) ? props.initialClientId : "";
  const [officeMode, setOfficeMode] = useState<"new_client" | "existing_client">(initialClientId ? "existing_client" : "new_client");
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<ClientOption[]>([]);
  const [propertyMode, setPropertyMode] = useState<"existing_property" | "new_property">("existing_property");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [fieldDraft, setFieldDraft] = useState<Record<string, string | boolean | string[]>>({});
  const [actionBusy, setActionBusy] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) ?? forms[0] ?? null,
    [forms, selectedFormId]
  );

  const selectedClient = useMemo(
    () => clientSearchResults.find((client) => client.id === selectedClientId) ?? props.clients.find((client) => client.id === selectedClientId) ?? null,
    [clientSearchResults, props.clients, selectedClientId]
  );

  const clientChoices = useMemo(() => {
    return mergeClientChoices(props.clients, clientSearchResults);
  }, [clientSearchResults, props.clients]);

  const existingProperties = useMemo(
    () => props.properties.filter((property) => property.clientId === selectedClientId),
    [props.properties, selectedClientId]
  );

  const selectedProperty = useMemo(
    () => existingProperties.find((property) => property.id === selectedPropertyId) ?? null,
    [existingProperties, selectedPropertyId]
  );

  useEffect(() => {
    if (!props.captureIntent?.mediaIds.length || !selectedForm?.fieldDefinitions.some((field) => field.key === "request_images")) {
      return;
    }
    setFieldDraft((current) => {
      const existing = Array.isArray(current.request_images) ? current.request_images as string[] : [];
      const next = [...new Set([...existing, ...props.captureIntent.mediaIds])];
      if (next.length === existing.length && next.every((value, index) => value === existing[index])) {
        return current;
      }
      return { ...current, request_images: next };
    });
    setStatusMessage(`${props.captureIntent.mediaIds.length} captured image${props.captureIntent.mediaIds.length === 1 ? "" : "s"} will attach when this request is submitted.`);
  }, [props.captureIntent, selectedForm]);

  const filteredRequests = useMemo(() => {
    const needle = requestSearch.trim().toLowerCase();
    return requests.filter((request) => {
      if (requestFilter !== "all" && request.status !== requestFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [
        request.clientName,
        request.subject,
        request.email,
        request.phone,
        request.narrative,
        formatAddress(request.propertyAddress),
        ...request.intake.fieldValues.map((field) => `${field.label} ${requestFieldText(field.value)}`)
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [requestFilter, requestSearch, requests]);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId]
  );
  const requestCounts = useMemo(() => ({
    all: requests.length,
    new: requests.filter((request) => request.status === "new").length,
    archived: requests.filter((request) => request.status === "archived").length,
    converted_to_quote: requests.filter((request) => request.status === "converted_to_quote").length,
    converted_to_job: requests.filter((request) => request.status === "converted_to_job").length
  }), [requests]);
  const selectedRequestAction = selectedRequest ? requestDominantAction(selectedRequest) : null;

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  useEffect(() => {
    if (props.initialFilter) {
      setRequestFilter(props.initialFilter);
    }
  }, [props.initialFilter]);

  useEffect(() => {
    if (!forms.length) {
      setSelectedFormId("");
      return;
    }
    setSelectedFormId((current) => current && forms.some((form) => form.id === current) ? current : forms[0]!.id);
  }, [forms]);

  useEffect(() => {
    if (officeMode !== "existing_client" || clientSearch.trim().length < 2) {
      setClientSearchResults([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/crm/clients?tenantId=${encodeURIComponent(props.tenantId)}&q=${encodeURIComponent(clientSearch.trim())}`)
      .then((response) => response.json() as Promise<{ ok: boolean; clients?: ClientOption[] }>)
      .then((body) => {
        if (!cancelled) setClientSearchResults(body.ok ? body.clients ?? [] : []);
      })
      .catch(() => {
        if (!cancelled) setClientSearchResults([]);
      });
    return () => { cancelled = true; };
  }, [clientSearch, officeMode, props.tenantId]);

  useEffect(() => {
    if (!selectedClient || officeMode !== "existing_client") {
      return;
    }
    if (!selectedClientId) {
      setPropertyMode("existing_property");
      setSelectedPropertyId("");
      return;
    }
    setSelectedPropertyId((current) => current && existingProperties.some((property) => property.id === current) ? current : existingProperties[0]?.id ?? "");
  }, [existingProperties, officeMode, selectedClient, selectedClientId]);

  useEffect(() => {
    if (!props.focusedRequestId) {
      return;
    }
    if (props.focusedRequestId === selectedRequestId) {
      return;
    }
    if (requests.some((request) => request.id === props.focusedRequestId)) {
      setSelectedRequestId(props.focusedRequestId);
    }
  }, [props.focusedRequestId, requests, selectedRequestId]);

  function openRequestDetail(requestId: string): void {
    if (props.onOpenRequest) {
      props.onOpenRequest(requestId);
      return;
    }
    setSelectedRequestId(requestId);
    requestAnimationFrame(() => requestDetailAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function returnToRequestRoster(): void {
    setSelectedRequestId("");
    if (props.onReturnToRequestRoster) {
      props.onReturnToRequestRoster();
      return;
    }
    requestAnimationFrame(() => requestRosterAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function refresh(): Promise<void> {
    setStatusMessage("Loading requests...");
    try {
      const requestsBody = await fetch(`/api/crm/requests?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<RequestsResponse>);
      if (!requestsBody.ok) {
        throw new Error(requestsBody.error ?? "Requests are unavailable.");
      }
      const nextRequests = requestsBody.requests ?? [];
      setRequests(nextRequests);
      setSelectedRequestId((current) => current && nextRequests.some((request) => request.id === current) ? current : "");
      setStatusMessage(nextRequests.length ? `${nextRequests.length} request${nextRequests.length === 1 ? "" : "s"} loaded.` : "No requests yet. First intake is on you.");
    } catch (error) {
      setRequests([]);
      setSelectedRequestId("");
      setStatusMessage(error instanceof Error ? error.message : "Requests are unavailable.");
      return;
    }

    try {
      const formsBody = await fetch(`/api/crm/request-forms?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<RequestFormResponse>);
      if (!formsBody.ok) {
        throw new Error(formsBody.error ?? "Request forms are unavailable.");
      }
      setForms(formsBody.forms ?? []);
    } catch (error) {
      setForms([]);
      setStatusMessage((current) => `${current} Request form setup is unavailable.`);
    }
  }

  const activeTenantUsers = useMemo(
    () => props.tenantUsers.filter((user) => user.active),
    [props.tenantUsers]
  );

  function defaultFieldValue(key: string): string | boolean | string[] {
    if (officeMode === "existing_client" && selectedClient) {
      if (key === "client_name") return clientDisplayName(selectedClient);
      if (key === "email") return selectedClient.emails[0] ?? "";
      if (key === "phone") return selectedClient.phones[0] ?? "";
    }
    if (officeMode === "existing_client" && propertyMode === "existing_property" && selectedProperty) {
      if (key === "property_street1") return selectedProperty.address.street1;
      if (key === "property_street2") return selectedProperty.address.street2 ?? "";
      if (key === "property_city") return selectedProperty.address.city;
      if (key === "property_province") return selectedProperty.address.province;
      if (key === "property_postal_code") return selectedProperty.address.postalCode;
      if (key === "gate_code") return selectedProperty.access?.gateCode ?? "";
    }
    if (key === "job_title") {
      return "Swimming Pool Leak Detection";
    }
    if (key === "request_images") {
      return [];
    }
    return false;
  }

  function currentFieldValue(field: RequestFieldDefinition): string | boolean | string[] {
    const stored = fieldDraft[field.key];
    if (["first_name", "company_name", "email", "phone"].includes(field.key)) console.info(`[request-client-contact-debug] render ${JSON.stringify({ key: field.key, stored })}`);
    if (stored !== undefined) {
      return stored;
    }
    const fallback = defaultFieldValue(field.key);
    if (field.type === "multi_image") {
      return Array.isArray(fallback) ? fallback : [];
    }
    return field.type === "boolean" ? Boolean(fallback) : (typeof fallback === "string" ? fallback : "");
  }

  function updateFieldValue(fieldKey: string, value: string | boolean | string[]): void {
    setFieldDraft((current) => ({ ...current, [fieldKey]: value }));
  }

  async function selectExistingClient(clientId: string): Promise<void> {
    setSelectedClientId(clientId);
    const applyClientDefaults = (client: ClientOption, source: "listed" | "canonical"): void => {
      if (!selectedForm) return;
      const defaults = requestClientFieldDefaults(selectedForm.fieldDefinitions, client);
      if (client.id === "client_ac0203c3-ac8b-415c-9495-f1cf1b6cf6f9") {
        console.info(`[request-client-contact-debug] writing defaults ${JSON.stringify({ source, clientId: client.id, defaults })}`);
      }
      setFieldDraft((current) => ({ ...current, ...defaults }));
    };
    const listedClient = clientChoices.find((candidate) => candidate.id === clientId);
    if (listedClient) applyClientDefaults(listedClient, "listed");
    try {
      const canonicalClient = await fetchClientForRequestSelection(props.tenantId, clientId);
      if (clientId === "client_ac0203c3-ac8b-415c-9495-f1cf1b6cf6f9") {
        console.info(`[request-client-contact-debug] canonical client resolved ${JSON.stringify({ clientId, emails: canonicalClient?.emails, phones: canonicalClient?.phones })}`);
      }
      if (canonicalClient) applyClientDefaults(canonicalClient, "canonical");
    } catch {
      if (clientId === "client_ac0203c3-ac8b-415c-9495-f1cf1b6cf6f9") {
        console.warn(`[request-client-contact-debug] canonical client lookup failed ${JSON.stringify({ clientId })}`);
      }
      // The roster result remains usable if the canonical contact read is unavailable.
    }
  }

  async function createRequest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedForm) {
      setStatusMessage("Create or pick a request form first.");
      return;
    }
    if (officeMode === "existing_client" && !selectedClientId) {
      setStatusMessage("Pick an existing client before creating this request.");
      return;
    }
    setActionBusy("create-request");
    setStatusMessage("Saving request...");
    const fieldValues = selectedForm.fieldDefinitions.flatMap((field) => {
      const value = currentFieldValue(field);
      const visibility = DEFAULT_VISIBILITY;
      if (field.type === "multi_image") {
        if (!Array.isArray(value) || !value.length) {
          return [];
        }
        return [{ key: field.key, value, visibility }];
      }
      if (field.type === "boolean") {
        return [{ key: field.key, value: Boolean(value), visibility }];
      }
      if (typeof value !== "string" || !value.trim()) {
        return [];
      }
      return [{ key: field.key, value: value.trim(), visibility }];
    });
    try {
      const body = await fetch("/api/crm/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          source: officeMode === "existing_client" ? "office_existing_client" : "office_new_client",
          formId: selectedForm.id,
          formSlug: selectedForm.slug,
          ...(officeMode === "existing_client" ? { selectedClientId } : {}),
          ...(officeMode === "existing_client" && propertyMode === "existing_property" && selectedPropertyId ? { selectedPropertyId } : {}),
          fieldValues
        })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok || !body.request) {
        setStatusMessage(body.error ?? "Request could not be saved.");
        return;
      }
      setSelectedRequestId(body.request.id);
      setFieldDraft({});
      if (props.captureIntent?.batchId) {
        setStatusMessage(`Request ${body.request.id} created for ${body.request.clientName}. Returning to capture mode...`);
        await props.onCaptureRequestCreated?.({
          id: body.request.id,
          clientName: body.request.clientName,
          ...(body.request.selectedClientId ? { selectedClientId: body.request.selectedClientId } : {})
        });
      } else {
        setStatusMessage(`Request ${body.request.id} created for ${body.request.clientName}.`);
      }
      await refresh();
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Request create failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function markReviewed(requestId: string): Promise<void> {
    setActionBusy(`review-${requestId}`);
    try {
      const body = await fetch(`/api/crm/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          reviewedAt: new Date().toISOString()
        })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok || !body.request) {
        setStatusMessage(body.error ?? "Review state could not be saved.");
        return;
      }
      setRequests((current) => current.map((request) => request.id === body.request?.id ? body.request : request));
      setStatusMessage("Review locked in.");
    } catch {
      setStatusMessage("Review state update failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function runRequestAction(requestId: string, action: "archive" | "reopen" | "convert-to-quote" | "convert-to-job", scheduleAfterJob = false): Promise<void> {
    setActionBusy(`${action}-${requestId}`);
    setStatusMessage(action === "archive"
      ? "Archiving request..."
      : action === "reopen"
        ? "Reopening request..."
        : action === "convert-to-quote"
          ? "Converting request to quote..."
        : scheduleAfterJob ? "Preparing assessment scheduling..." : "Converting request to job...");
    try {
      const body = await fetch(`/api/crm/requests/${encodeURIComponent(requestId)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Request action failed.");
        return;
      }
      await refresh();
      props.onCrmMutation?.();
      if (body.quote?.id) {
        setStatusMessage(`Request converted to quote ${body.quote.id}.`);
      } else if (body.job?.id) {
        setStatusMessage(`Assessment job ${body.job.id} is ready to place on the schedule.`);
        if (scheduleAfterJob) {
          props.onScheduleAssessment?.(body.job.id);
        }
      } else {
        setStatusMessage(action === "archive" ? "Request archived." : "Request reopened.");
      }
    } catch {
      setStatusMessage("Request action failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function deleteRequest(requestId: string): Promise<void> {
    if (!window.confirm("Permanently delete this Request? Its linked Client, contact details, and property will remain unchanged.")) {
      return;
    }
    setActionBusy(`delete-${requestId}`);
    setStatusMessage("Deleting request only. The linked client will be kept.");
    try {
      const body = await fetch(`/api/crm/requests/${encodeURIComponent(requestId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok || body.deletedRequestId !== requestId) {
        setStatusMessage(body.error ?? "Request could not be deleted.");
        return;
      }
      setRequests((current) => current.filter((request) => request.id !== requestId));
      setSelectedRequestId("");
      props.onCrmMutation?.();
      setStatusMessage("Request deleted. The linked client and property remain saved.");
      props.onReturnToRequestRoster?.();
    } catch {
      setStatusMessage("Request deletion failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function saveRequestNote(requestId: string): Promise<void> {
    const body = noteDraft.trim();
    if (!body) return;
    const answer = window.prompt("Note visibility: type Internal or Client-facing", "Internal");
    if (answer === null) return;
    const visibility = answer.trim().toLowerCase().replace(/[-\s]+/g, "") === "clientfacing" ? "client" : answer.trim().toLowerCase() === "internal" ? "internal" : "";
    if (!visibility) {
      setStatusMessage("Choose Internal or Client-facing before saving the note.");
      return;
    }
    setActionBusy(`note-${requestId}`);
    try {
      const response = await fetch(`/api/crm/requests/${encodeURIComponent(requestId)}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, body, visibility })
      });
      const result = await response.json() as RequestMutationResponse;
      if (!result.ok || !result.request) {
        setStatusMessage(result.error ?? "Request note could not be saved.");
        return;
      }
      setRequests((current) => current.map((request) => request.id === result.request?.id ? result.request : request));
      setNoteDraft("");
      setStatusMessage(`${visibility === "client" ? "Client-facing" : "Internal"} note saved.`);
    } catch {
      setStatusMessage("Request note could not be saved.");
    } finally {
      setActionBusy("");
    }
  }

  if (requestCreationOpen) {
    return <NexOpsCreationTemplate
      title="Create Request"
      detail="Capture the client, service location, and intake details without losing downstream context."
      icon={<NexOpsNavGlyph module="requests" />}
      heroClassName="module-hero-card--quote"
      backAction={<button className="nexops-hero-primary-button nexops-quote-back-to-roster" type="button" onClick={() => setRequestCreationOpen(false)}>← Requests</button>}
    >
      <article className="nexops-module-card nexops-quote-composer-card">
        <form className="nexops-request-builder" onSubmit={(event) => void createRequest(event)}>
          <section className="nexops-quote-panel">
            <div className="nexops-quote-setup-body">
              <section className="nexops-quote-client-hero" aria-label="Client selection">
                <h3>Select Client</h3>
                <div className="nexops-quote-choice-tabs" role="tablist" aria-label="Client selection">
                  <button className={officeMode === "new_client" ? "active" : ""} type="button" onClick={() => setOfficeMode("new_client")}>Add New</button>
                  <button className={officeMode === "existing_client" ? "active" : ""} type="button" onClick={() => setOfficeMode("existing_client")}>Existing</button>
                </div>
              </section>
              <label className="nexops-field"><span>Request Form</span><select value={selectedForm?.id ?? ""} onChange={(event) => setSelectedFormId(event.target.value)}>{forms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}</select></label>
              {officeMode === "existing_client" ? <>
                <label className="nexops-field"><span>Find Existing Client</span><input value={clientSearch} placeholder="Search name or email" onChange={(event) => setClientSearch(event.target.value)} /></label>
                <label className="nexops-field"><span>Existing Client</span><select value={selectedClientId} onChange={(event) => void selectExistingClient(event.target.value)}><option value="">Select Client</option>{clientChoices.map((client) => <option value={client.id} key={client.id}>{clientDisplayName(client)}</option>)}</select></label>
                <label className="nexops-field"><span>Property Handling</span><select value={propertyMode} onChange={(event) => setPropertyMode(event.target.value as "existing_property" | "new_property")}><option value="existing_property">Use Existing Property</option><option value="new_property">Capture New Property</option></select></label>
                {propertyMode === "existing_property" ? <label className="nexops-field"><span>Existing Property</span><select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}><option value="">Select Property</option>{existingProperties.map((property) => <option value={property.id} key={property.id}>{property.siteName || property.label || property.address.street1}</option>)}</select></label> : null}
              </> : null}
            </div>
          </section>
          {selectedForm ? <section className="nexops-quote-panel"><div className="nexops-quote-simple-heading nexops-quote-details-banner"><h3>Request Details</h3><span>Complete the selected intake form before saving the request.</span></div><div className="nexops-quote-setup-body">{selectedForm.fieldDefinitions.map((field) => <label className={`nexops-field ${field.prominent ? "nexops-request-prominent" : ""}`} key={field.key}><span>{field.label}</span>{field.type === "textarea" ? <textarea rows={4} value={String(currentFieldValue(field))} onChange={(event) => updateFieldValue(field.key, event.target.value)} /> : field.type === "select" || field.key === "salesperson_user_id" ? <select value={String(currentFieldValue(field))} onChange={(event) => updateFieldValue(field.key, event.target.value)}><option value="">Select</option>{field.key === "salesperson_user_id" ? activeTenantUsers.map((user) => <option value={user.id} key={user.id}>{user.displayName}</option>) : field.options?.map((option) => <option value={option} key={option}>{titleCaseUiLabel(option)}</option>)}</select> : field.type === "boolean" ? <span className="nexops-check-field inline"><input checked={Boolean(currentFieldValue(field))} type="checkbox" onChange={(event) => updateFieldValue(field.key, event.target.checked)} />{Boolean(currentFieldValue(field)) ? "Flagged" : "Not flagged"}</span> : <input type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"} value={String(currentFieldValue(field))} onChange={(event) => updateFieldValue(field.key, event.target.value)} />}{field.helpText ? <small>{field.helpText}</small> : null}</label>)}</div></section> : <p className="nexops-empty-copy">Create a form in the library first so the office and website can use the same intake definitions.</p>}
          <section className="nexops-quote-final-action"><button className="nexops-hero-primary-button" type="submit" disabled={Boolean(actionBusy) || !selectedForm}>{actionBusy === "create-request" ? "Saving..." : "Create Request"}</button><small>{statusMessage}</small></section>
        </form>
      </article>
    </NexOpsCreationTemplate>;
  }

  return (
      <NexOpsRosterTemplate
        title="Requests"
        detail="Capture, review, and move verified service requests into quotes or jobs without losing their client and property context."
        icon={<NexOpsNavGlyph module="requests" />}
        heroClassName="module-hero-card--quote"
      primaryAction={<button className="nexops-hero-primary-button" type="button" onClick={() => setRequestCreationOpen(true)}>+ New Request</button>}
      metrics={undefined}
    >
      {!props.focusedRequestId ? <>
      <div className="nexops-roster-workflow-stack" ref={requestRosterAnchorRef}>
        <NexOpsRosterSurface ariaLabel="Search and filter requests" searchTitle="Search Requests" resultNoun="Request" resultCount={filteredRequests.length} search={<label className="nexops-quote-roster-search"><span className="sr-only">Search Requests</span><input placeholder="Search Requests" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} /></label>} filter={<button className="nexops-jobs-filter-pill nexops-quote-filter-trigger" type="button" aria-expanded={requestFilterOpen} onClick={() => setRequestFilterOpen((current) => !current)}><span className="nexops-quote-filter-icon" aria-hidden="true">☷</span><span className="nexops-quote-filter-label">Filter</span></button>} filterOptions={requestFilterOpen ? <div className="nexops-quote-filter-options" aria-label="Request status filters">{REQUEST_FILTERS.filter((filter) => filter.value !== "all").map((filter) => <button key={filter.value} type="button" role="radio" aria-checked={requestFilter === filter.value} className={`nexops-jobs-filter-pill${requestFilter === filter.value ? " active" : ""}`} onClick={() => setRequestFilter(filter.value)}><span>{filter.label}</span><small>{requestCounts[filter.value]}</small></button>)}</div> : undefined} empty={!filteredRequests.length ? <div className="nexops-quote-filtered-empty"><h2>No Requests Match This View</h2><p>Change the search or status filter to see requests.</p></div> : undefined}>{filteredRequests.map((request) => { const expanded = request.id === selectedRequest?.id; return <article className={`nexops-quote-filtered-row${expanded ? " expanded" : ""}`} key={request.id}><button className="nexops-quote-filtered-identity-banner" type="button" aria-expanded={expanded} onClick={() => setSelectedRequestId(expanded ? "" : request.id)}><span className="nexops-quote-filtered-identity"><strong>{request.clientName}</strong><small>{request.subject}</small></span></button>{expanded ? <div className="nexops-quote-filtered-details"><span className="nexops-quote-filtered-title" data-label="Request">{request.subject}</span><span className="nexops-quote-filtered-updated" data-label="Service Location">{formatAddress(request.propertyAddress) || request.email || request.phone || requestSourceLabel(request.source)}</span><span className="nexops-quote-filtered-status" data-label="Status"><mark>{requestStatusLabel(request.status)}</mark></span><span className="nexops-quote-filtered-activity" data-label="Request Record"><small>{requestSourceLabel(request.source)}</small><button className="nexops-quote-filtered-open" type="button" onClick={() => openRequestDetail(request.id)}>Open Request <span aria-hidden="true">→</span></button></span></div> : null}</article>; })}</NexOpsRosterSurface>
      </div>
      </> : null}

        <div ref={requestDetailAnchorRef}>
        {selectedRequest ? (
          <NexOpsDetailTemplate
            back={<button type="button" onClick={returnToRequestRoster}>Back to Request Roster</button>}
            eyebrow="Request Detail"
            title={selectedRequest.clientName}
            detail={selectedRequest.subject}
            status={<mark>{requestStatusLabel(selectedRequest.status)}</mark>}
            actions={<>
              {selectedRequest.status === "archived" ? (
                <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "reopen")}>Reopen</button>
              ) : (
                <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "archive")}>Archive</button>
              )}
              <button type="button" disabled={Boolean(actionBusy)} onClick={() => void deleteRequest(selectedRequest.id)}>Delete Request</button>
            </>}
            navigation={<div className="nexops-jobs-filter-row" aria-label="Request detail filters">
                {REQUEST_FILTERS.map((filter) => (
                  <button
                    key={`detail-${filter.value}`}
                    type="button"
                    className={`nexops-jobs-filter-pill${requestFilter === filter.value ? " active" : ""}`}
                    onClick={() => setRequestFilter(filter.value)}
                  >
                    <span>{filter.label}</span>
                    <small>{requestCounts[filter.value]}</small>
                  </button>
                ))}
              </div>}
          >
            <div className="nexops-request-detail">

{selectedRequestAction ? (
                <section className="nexops-quote-panel">
                  <div className="nexops-quote-section-head">
                    <h3>Next Office Move</h3>
                    <span>{selectedRequestAction.stage}</span>
                  </div>
                  <p>{selectedRequestAction.detail}</p>
                  <div className="nexops-inline-actions">
                    {selectedRequestAction.dominantAction === "mark-reviewed" ? (
                      <button type="button" disabled={Boolean(actionBusy)} onClick={() => void markReviewed(selectedRequest.id)}>
                        {selectedRequestAction.dominantLabel}
                      </button>
                    ) : null}
                    {selectedRequestAction.dominantAction === "convert-to-quote" ? (
                      <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "convert-to-quote")}>
                        {selectedRequestAction.dominantLabel}
                      </button>
                    ) : null}
                    {selectedRequestAction.dominantAction === "reopen" ? (
                      <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "reopen")}>
                        {selectedRequestAction.dominantLabel}
                      </button>
                    ) : null}
                    {selectedRequestAction.secondaryAction === "convert-to-job" ? (
                      <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "convert-to-job", true)}>
                        Schedule Assessment
                      </button>
                    ) : null}
                    {selectedRequestAction.secondaryAction === "convert-to-job" ? (
                      <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "convert-to-job")}>
                        Convert to Job
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="nexops-quote-panel" aria-label="Submitted request details">
                <div className="nexops-quote-section-head">
                  <h3>Submitted Form Details</h3>
                  <span>{selectedRequest.intake.fieldValues.length} response{selectedRequest.intake.fieldValues.length === 1 ? "" : "s"}</span>
                </div>
                <div className="nexops-request-submitted-fields">
                  {selectedRequest.intake.fieldValues.map((field) => (
                    <div key={`${selectedRequest.id}-submitted-${field.key}`}>
                      <strong>{field.label}</strong>
                      <span>{requestFieldText(field.value)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="nexops-quote-panel" aria-label="Request notes">
                <div className="nexops-quote-section-head"><h3>Notes</h3><span>Choose visibility for every note</span></div>
                {(selectedRequest.notes ?? []).length ? <div className="nexops-request-submitted-fields">{selectedRequest.notes?.map((note) => <div key={note.id}><strong>{note.visibility === "client" ? "Client-facing" : "Internal"}</strong><span>{note.body}</span></div>)}</div> : <p className="nexops-empty-copy">No notes yet.</p>}
                <label className="nexops-field"><span>Add note</span><textarea rows={3} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /></label>
                <button type="button" disabled={Boolean(actionBusy) || !noteDraft.trim()} onClick={() => void saveRequestNote(selectedRequest.id)}>Save Note</button>
              </section>

              {prominentFieldValues(selectedRequest).length ? (
                <div className="nexops-request-alert-strip">
                  {prominentFieldValues(selectedRequest).map((field) => (
                    <span key={`${selectedRequest.id}-${field.key}`}>{field.label}: {requestFieldText(field.value)}</span>
                  ))}
                </div>
              ) : null}

            </div>
          </NexOpsDetailTemplate>
          ) : null}
        </div>
    </NexOpsRosterTemplate>
  );
}
