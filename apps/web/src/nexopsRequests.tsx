import React, { useEffect, useMemo, useState } from "react";

type RequestStatus = "new" | "archived" | "converted_to_quote" | "converted_to_job";
type RequestSource = "website_form" | "office_existing_client" | "office_new_client" | "legacy_lead_backfill";
type RequestSurface = "request" | "quote" | "job" | "visit" | "invoice";
type IntakeFieldType = "text" | "email" | "phone" | "textarea" | "select" | "boolean";
type IntakeFieldGroup = "contact" | "property" | "pool" | "safety" | "notes";

interface CrmAddress {
  street1: string;
  street2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

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
}

interface RequestFieldValue extends RequestFieldDefinition {
  value: string | number | boolean;
  visibility: RequestFieldVisibility;
}

interface IntakeSnapshot {
  narrative: string;
  fieldValues: RequestFieldValue[];
  fieldIndex: Record<string, string | number | boolean>;
}

interface RequestMatch {
  matchedClientId?: string;
  matchedPropertyId?: string;
  matchedBy: "none" | "exact_email" | "exact_phone" | "selected_existing_client" | "selected_existing_property";
  matchedValue?: string;
  reviewRequired: boolean;
}

interface RequestNotifications {
  adminApprovalId?: string;
  adminNotifiedAt?: string;
  clientApprovalId?: string;
  clientConfirmationAt?: string;
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
  notifications?: RequestNotifications;
  reviewedAt?: string;
  archivedAt?: string;
  reopenedAt?: string;
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
  availableFields?: RequestFieldDefinition[];
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
  created?: ServiceRequestRecord[];
  skipped?: string[];
  form?: RequestFormRecord;
  error?: string;
}

interface NexOpsRequestsPageProps {
  tenantId: string;
  clients: ClientOption[];
  properties: PropertyOption[];
  onCrmMutation?: () => void;
}

interface FormDraft {
  id?: string;
  title: string;
  slug: string;
  intro: string;
  active: boolean;
  fieldKeys: string[];
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

function formatAddress(address?: CrmAddress): string {
  if (!address) {
    return "";
  }
  return [
    address.street1,
    address.street2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

function requestStatusLabel(status: RequestStatus): string {
  return status.replaceAll("_", " ");
}

function requestSourceLabel(source: RequestSource): string {
  switch (source) {
    case "website_form":
      return "Website form";
    case "office_existing_client":
      return "Office existing client";
    case "office_new_client":
      return "Office new client";
    case "legacy_lead_backfill":
      return "Legacy lead backfill";
    default:
      return source;
  }
}

function requestFieldText(value: string | number | boolean): string {
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
      dominantLabel: "Reopen request"
    };
  }
  if (request.status === "converted_to_quote") {
    return {
      stage: "Quote created",
      detail: `Quote ${request.convertedQuoteId ?? "record"} now carries this intake forward. Keep the request as the read-only intake source.`,
      dominantAction: "none"
    };
  }
  if (request.status === "converted_to_job") {
    return {
      stage: "Job created",
      detail: `Job ${request.convertedJobId ?? "record"} now owns dispatch and reminder work. Keep the request as the original intake snapshot.`,
      dominantAction: "none"
    };
  }
  if (!request.reviewedAt) {
    return {
      stage: request.match.reviewRequired ? "Review required" : "Mark reviewed",
      detail: request.match.reviewRequired
        ? "Confirm the exact-match result first, then mark the intake reviewed before converting it downstream."
        : "This intake is ready for an office review pass. Mark it reviewed before you convert it to a quote or job.",
      dominantAction: "mark-reviewed",
      dominantLabel: "Mark reviewed"
    };
  }
  return {
    stage: "Ready to convert",
    detail: "Choose a quote when the office needs approval and money flow, or go straight to a job when the work can dispatch immediately.",
    dominantAction: "convert-to-quote",
    dominantLabel: "Convert to quote",
    secondaryAction: "convert-to-job",
    secondaryLabel: "Convert to job"
  };
}

function requestMatchLabel(match: RequestMatch, clients: ClientOption[], properties: PropertyOption[]): string {
  if (match.matchedBy === "none") {
    return "No exact email or phone match. Manual review stays required.";
  }
  if (match.matchedBy === "selected_existing_property") {
    const property = properties.find((candidate) => candidate.id === match.matchedPropertyId);
    return `Linked to existing property${property ? ` - ${property.siteName || property.label || property.address.street1}` : ""}.`;
  }
  if (match.matchedBy === "selected_existing_client") {
    const client = clients.find((candidate) => candidate.id === match.matchedClientId);
    return `Linked to existing client${client ? ` - ${clientDisplayName(client)}` : ""}.`;
  }
  return `Exact ${match.matchedBy.replace("exact_", "").replaceAll("_", " ")} match${match.matchedValue ? ` on ${match.matchedValue}` : ""}. Manual review is still required.`;
}

function absoluteShareUrl(form: RequestFormRecord): string {
  if (form.sharePath?.startsWith("http")) {
    return form.sharePath;
  }
  return `${window.location.origin}${form.sharePath ?? `/request-forms/${encodeURIComponent(form.tenantId)}/${encodeURIComponent(form.slug)}`}`;
}

function initialFormDraft(form?: RequestFormRecord): FormDraft {
  return {
    ...(form?.id ? { id: form.id } : {}),
    title: form?.title ?? "",
    slug: form?.slug ?? "",
    intro: form?.intro ?? "",
    active: form?.active ?? true,
    fieldKeys: form?.fieldDefinitions.map((field) => field.key) ?? []
  };
}

function formatTimestamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function prominentFieldValues(request: ServiceRequestRecord): RequestFieldValue[] {
  return request.intake.fieldValues.filter((field) => field.prominent || field.group === "safety");
}

export function NexOpsRequestsPage(props: NexOpsRequestsPageProps): React.ReactElement {
  const [requests, setRequests] = useState<ServiceRequestRecord[]>([]);
  const [forms, setForms] = useState<RequestFormRecord[]>([]);
  const [availableFields, setAvailableFields] = useState<RequestFieldDefinition[]>([]);
  const [statusMessage, setStatusMessage] = useState("Loading requests...");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestFilter, setRequestFilter] = useState<"all" | RequestStatus>("all");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("");
  const [officeMode, setOfficeMode] = useState<"new_client" | "existing_client">("new_client");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [propertyMode, setPropertyMode] = useState<"existing_property" | "new_property">("existing_property");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [fieldDraft, setFieldDraft] = useState<Record<string, string | boolean>>({});
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, RequestFieldVisibility>>({});
  const [formDraft, setFormDraft] = useState<FormDraft>(() => initialFormDraft());
  const [formStatus, setFormStatus] = useState("One library, multiple forms, each with its own share link and embed code.");
  const [actionBusy, setActionBusy] = useState("");

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) ?? forms[0] ?? null,
    [forms, selectedFormId]
  );

  const selectedClient = useMemo(
    () => props.clients.find((client) => client.id === selectedClientId) ?? null,
    [props.clients, selectedClientId]
  );

  const existingProperties = useMemo(
    () => props.properties.filter((property) => property.clientId === selectedClientId),
    [props.properties, selectedClientId]
  );

  const selectedProperty = useMemo(
    () => existingProperties.find((property) => property.id === selectedPropertyId) ?? null,
    [existingProperties, selectedPropertyId]
  );

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
    () => requests.find((request) => request.id === selectedRequestId) ?? filteredRequests[0] ?? null,
    [filteredRequests, requests, selectedRequestId]
  );
  const queueSummary = useMemo(() => summarizeRequestQueue(requests), [requests]);
  const selectedRequestAction = selectedRequest ? requestDominantAction(selectedRequest) : null;

  const fieldGroups = useMemo(() => {
    const groups = new Map<IntakeFieldGroup, RequestFieldDefinition[]>();
    for (const field of availableFields) {
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return groups;
  }, [availableFields]);

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  useEffect(() => {
    if (!forms.length) {
      setSelectedFormId("");
      setFormDraft(initialFormDraft());
      return;
    }
    setSelectedFormId((current) => current && forms.some((form) => form.id === current) ? current : forms[0]!.id);
    setFormDraft((current) => current.id && forms.some((form) => form.id === current.id) ? current : initialFormDraft(forms[0]));
  }, [forms]);

  useEffect(() => {
    if (!selectedForm) {
      return;
    }
    setFieldVisibility((current) => {
      const next = { ...current };
      for (const field of selectedForm.fieldDefinitions) {
        next[field.key] = next[field.key] ?? DEFAULT_VISIBILITY;
      }
      return next;
    });
  }, [selectedForm]);

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

  async function refresh(): Promise<void> {
    setStatusMessage("Loading requests...");
    try {
      const [requestsBody, formsBody] = await Promise.all([
        fetch(`/api/crm/requests?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<RequestsResponse>),
        fetch(`/api/crm/request-forms?tenantId=${encodeURIComponent(props.tenantId)}`).then((response) => response.json() as Promise<RequestFormResponse>)
      ]);
      if (!requestsBody.ok) {
        throw new Error(requestsBody.error ?? "Requests are unavailable.");
      }
      if (!formsBody.ok) {
        throw new Error(formsBody.error ?? "Request forms are unavailable.");
      }
      const nextRequests = requestsBody.requests ?? [];
      const nextForms = formsBody.forms ?? [];
      setRequests(nextRequests);
      setForms(nextForms);
      setAvailableFields(formsBody.availableFields ?? []);
      setSelectedRequestId((current) => current && nextRequests.some((request) => request.id === current) ? current : nextRequests[0]?.id ?? "");
      setStatusMessage(nextRequests.length ? `${nextRequests.length} request${nextRequests.length === 1 ? "" : "s"} loaded.` : "No requests yet. First intake is on you.");
    } catch (error) {
      setRequests([]);
      setForms([]);
      setAvailableFields([]);
      setSelectedRequestId("");
      setStatusMessage(error instanceof Error ? error.message : "Requests are unavailable.");
    }
  }

  function defaultFieldValue(key: string): string | boolean {
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
    return false;
  }

  function currentFieldValue(field: RequestFieldDefinition): string | boolean {
    const stored = fieldDraft[field.key];
    if (stored !== undefined) {
      return stored;
    }
    const fallback = defaultFieldValue(field.key);
    return field.type === "boolean" ? Boolean(fallback) : (typeof fallback === "string" ? fallback : "");
  }

  function updateFieldValue(fieldKey: string, value: string | boolean): void {
    setFieldDraft((current) => ({ ...current, [fieldKey]: value }));
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
      const visibility = fieldVisibility[field.key] ?? DEFAULT_VISIBILITY;
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
      setStatusMessage(`Request ${body.request.id} created for ${body.request.clientName}.`);
      await refresh();
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Request create failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionBusy("save-form");
    setFormStatus(formDraft.id ? "Updating form..." : "Saving form...");
    try {
      const body = await fetch(formDraft.id ? `/api/crm/request-forms/${encodeURIComponent(formDraft.id)}` : "/api/crm/request-forms", {
        method: formDraft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          title: formDraft.title,
          slug: formDraft.slug,
          intro: formDraft.intro,
          active: formDraft.active,
          fieldKeys: formDraft.fieldKeys
        })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok || !body.form) {
        setFormStatus(body.error ?? "Request form could not be saved.");
        return;
      }
      setFormStatus(`Saved ${body.form.title}.`);
      setFormDraft(initialFormDraft());
      await refresh();
      setSelectedFormId(body.form.id);
    } catch {
      setFormStatus("Request form save failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function updateRequestFieldVisibility(requestId: string, field: RequestFieldValue, surface: RequestSurface, checked: boolean): Promise<void> {
    setActionBusy(`visibility-${requestId}-${field.key}-${surface}`);
    try {
      const body = await fetch(`/api/crm/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          fieldPatches: [{
            key: field.key,
            visibility: { [surface]: checked }
          }]
        })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok || !body.request) {
        setStatusMessage(body.error ?? "Field visibility could not be updated.");
        return;
      }
      setRequests((current) => current.map((request) => request.id === body.request?.id ? body.request : request));
      setStatusMessage(`Updated ${field.label} visibility for ${surface}.`);
    } catch {
      setStatusMessage("Field visibility update failed.");
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

  async function runRequestAction(requestId: string, action: "archive" | "reopen" | "convert-to-quote" | "convert-to-job"): Promise<void> {
    setActionBusy(`${action}-${requestId}`);
    setStatusMessage(action === "archive"
      ? "Archiving request..."
      : action === "reopen"
        ? "Reopening request..."
        : action === "convert-to-quote"
          ? "Converting request to quote..."
          : "Converting request to job...");
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
        setStatusMessage(`Request converted to job ${body.job.id}.`);
      } else {
        setStatusMessage(action === "archive" ? "Request archived." : "Request reopened.");
      }
    } catch {
      setStatusMessage("Request action failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function backfillLeads(): Promise<void> {
    setActionBusy("backfill");
    setStatusMessage("Backfilling legacy leads into requests...");
    try {
      const body = await fetch("/api/crm/requests/backfill-leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<RequestMutationResponse>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Lead backfill failed.");
        return;
      }
      await refresh();
      props.onCrmMutation?.();
      const createdCount = body.created?.length ?? 0;
      const skippedCount = body.skipped?.length ?? 0;
      setStatusMessage(`Backfill finished. ${createdCount} request${createdCount === 1 ? "" : "s"} created, ${skippedCount} skipped.`);
    } catch {
      setStatusMessage("Lead backfill failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function copyText(value: string, successLabel: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setFormStatus(successLabel);
    } catch {
      setFormStatus("Clipboard blocked here. Copy it manually.");
    }
  }

  return (
    <section className="nexops-module-page">
      <div className="nexops-page-heading">
        <div>
          <h1>Requests</h1>
          <p>Real request objects, office intake, website forms, and downstream field carry-forward all live here now.</p>
        </div>
        <div className="nexops-inline-actions">
          <button type="button" onClick={() => void refresh()} disabled={Boolean(actionBusy)}>Refresh</button>
          <button type="button" onClick={() => void backfillLeads()} disabled={Boolean(actionBusy)}>
            {actionBusy === "backfill" ? "Backfilling..." : "Backfill legacy leads"}
          </button>
        </div>
      </div>

      <div className="nexops-module-grid nexops-module-grid-wide">
        <article className="nexops-module-card nexops-request-builder-card">
          <p className="eyebrow">Office intake</p>
          <h2>Create a request</h2>
          <p>Choose a saved intake form, decide whether this is a new or existing client, and let the field-level visibility travel downstream by default.</p>
          <form className="nexops-request-builder" onSubmit={(event) => void createRequest(event)}>
            <div className="nexops-request-toggle-row">
              <button className={officeMode === "new_client" ? "active" : ""} type="button" onClick={() => setOfficeMode("new_client")}>New client</button>
              <button className={officeMode === "existing_client" ? "active" : ""} type="button" onClick={() => setOfficeMode("existing_client")}>Existing client</button>
            </div>
            <div className="nexops-request-builder-grid">
              <label className="nexops-field">
                <span>Request form</span>
                <select value={selectedForm?.id ?? ""} onChange={(event) => setSelectedFormId(event.target.value)}>
                  {forms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}
                </select>
              </label>
              {officeMode === "existing_client" ? (
                <>
                  <label className="nexops-field">
                    <span>Existing client</span>
                    <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                      <option value="">Select client</option>
                      {props.clients.map((client) => <option value={client.id} key={client.id}>{clientDisplayName(client)}</option>)}
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Property handling</span>
                    <select value={propertyMode} onChange={(event) => setPropertyMode(event.target.value as "existing_property" | "new_property")}>
                      <option value="existing_property">Use existing property</option>
                      <option value="new_property">Capture new property</option>
                    </select>
                  </label>
                  {propertyMode === "existing_property" ? (
                    <label className="nexops-field">
                      <span>Existing property</span>
                      <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>
                        <option value="">Select property</option>
                        {existingProperties.map((property) => <option value={property.id} key={property.id}>{property.siteName || property.label || property.address.street1}</option>)}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>

            {selectedForm ? (
              <div className="nexops-request-form-fields">
                {selectedForm.fieldDefinitions.map((field) => (
                  <label className={`nexops-field ${field.prominent ? "nexops-request-prominent" : ""}`} key={field.key}>
                    <span>{field.label}</span>
                    {field.type === "textarea" ? (
                      <textarea
                        rows={4}
                        value={String(currentFieldValue(field))}
                        onChange={(event) => updateFieldValue(field.key, event.target.value)}
                      />
                    ) : field.type === "select" ? (
                      <select value={String(currentFieldValue(field))} onChange={(event) => updateFieldValue(field.key, event.target.value)}>
                        <option value="">Select</option>
                        {field.options?.map((option) => <option value={option} key={option}>{option.replaceAll("_", " ")}</option>)}
                      </select>
                    ) : field.type === "boolean" ? (
                      <div className="nexops-check-field inline">
                        <input
                          checked={Boolean(currentFieldValue(field))}
                          type="checkbox"
                          onChange={(event) => updateFieldValue(field.key, event.target.checked)}
                        />
                        <span>{Boolean(currentFieldValue(field)) ? "Flagged" : "Not flagged"}</span>
                      </div>
                    ) : (
                      <input
                        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                        value={String(currentFieldValue(field))}
                        onChange={(event) => updateFieldValue(field.key, event.target.value)}
                      />
                    )}
                    {field.helpText ? <small>{field.helpText}</small> : null}
                    <div className="nexops-request-visibility-row">
                      {(["request", "quote", "job", "visit", "invoice"] as RequestSurface[]).map((surface) => (
                        <label key={`${field.key}-${surface}`}>
                          <input
                            checked={(fieldVisibility[field.key] ?? DEFAULT_VISIBILITY)[surface]}
                            type="checkbox"
                            onChange={(event) => setFieldVisibility((current) => ({
                              ...current,
                              [field.key]: {
                                ...(current[field.key] ?? DEFAULT_VISIBILITY),
                                [surface]: event.target.checked
                              }
                            }))}
                          />
                          <span>{surface}</span>
                        </label>
                      ))}
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p>Create a form in the library first so the office and website can use the same intake definitions.</p>
            )}
            <div className="nexops-inline-actions">
              <button type="submit" disabled={Boolean(actionBusy) || !selectedForm}>
                {actionBusy === "create-request" ? "Saving..." : "Create request"}
              </button>
              <small>{statusMessage}</small>
            </div>
          </form>
        </article>

        <article className="nexops-module-card nexops-request-library-card">
          <p className="eyebrow">Multi-form library</p>
          <h2>Website intake forms</h2>
          <p>{formStatus}</p>
          <div className="nexops-request-library-list">
            {forms.map((form) => (
              <div className="nexops-request-library-item" key={form.id}>
                <div>
                  <strong>{form.title}</strong>
                  <small>{form.active ? "Active" : "Inactive"} - {form.fieldDefinitions.length} fields</small>
                </div>
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => setFormDraft(initialFormDraft(form))}>Edit</button>
                  <button type="button" onClick={() => void copyText(absoluteShareUrl(form), `Copied share link for ${form.title}.`)}>Copy link</button>
                  <button type="button" onClick={() => void copyText(form.embedCode ?? `<iframe src="${absoluteShareUrl(form)}" loading="lazy"></iframe>`, `Copied embed code for ${form.title}.`)}>Copy embed</button>
                </div>
                <a href={absoluteShareUrl(form)} rel="noreferrer" target="_blank">{absoluteShareUrl(form)}</a>
              </div>
            ))}
          </div>

          <form className="nexops-request-library-editor" onSubmit={(event) => void saveForm(event)}>
            <div className="nexops-request-library-editor-head">
              <h3>{formDraft.id ? "Edit form" : "New form"}</h3>
              {formDraft.id ? <button type="button" onClick={() => setFormDraft(initialFormDraft())}>Clear</button> : null}
            </div>
            <div className="nexops-request-builder-grid">
              <label className="nexops-field"><span>Title</span><input value={formDraft.title} onChange={(event) => setFormDraft({ ...formDraft, title: event.target.value })} /></label>
              <label className="nexops-field"><span>Slug</span><input value={formDraft.slug} onChange={(event) => setFormDraft({ ...formDraft, slug: event.target.value })} /></label>
            </div>
            <label className="nexops-field"><span>Intro</span><textarea rows={3} value={formDraft.intro} onChange={(event) => setFormDraft({ ...formDraft, intro: event.target.value })} /></label>
            <label className="nexops-check-field"><input checked={formDraft.active} type="checkbox" onChange={(event) => setFormDraft({ ...formDraft, active: event.target.checked })} /> Form is active</label>
            <div className="nexops-request-library-field-groups">
              {[...fieldGroups.entries()].map(([group, fields]) => (
                <section key={group}>
                  <h4>{group}</h4>
                  <div className="nexops-request-library-field-list">
                    {fields.map((field) => (
                      <label className="nexops-check-field" key={field.key}>
                        <input
                          checked={formDraft.fieldKeys.includes(field.key)}
                          type="checkbox"
                          onChange={(event) => setFormDraft((current) => ({
                            ...current,
                            fieldKeys: event.target.checked
                              ? [...current.fieldKeys, field.key]
                              : current.fieldKeys.filter((key) => key !== field.key)
                          }))}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="nexops-inline-actions">
              <button type="submit" disabled={Boolean(actionBusy)}>{actionBusy === "save-form" ? "Saving..." : formDraft.id ? "Save form" : "Create form"}</button>
            </div>
          </form>
        </article>
      </div>

      <div className="nexops-two-column">
        <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Request queue</p>
              <h2>{filteredRequests.length} visible</h2>
            </div>
            <div className="nexops-inline-actions">
              <input placeholder="Search requests" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} />
              <select value={requestFilter} onChange={(event) => setRequestFilter(event.target.value as "all" | RequestStatus)}>
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="archived">Archived</option>
                <option value="converted_to_quote">Converted to quote</option>
                <option value="converted_to_job">Converted to job</option>
              </select>
            </div>
          </div>
          <div className="nexops-request-summary-grid">
            <article>
              <h3>Unreviewed</h3>
              <p>{queueSummary.unreviewed}</p>
              <small>Needs the office review pass first.</small>
            </article>
            <article>
              <h3>Ready to convert</h3>
              <p>{queueSummary.readyToConvert}</p>
              <small>Reviewed intakes ready for quote or job creation.</small>
            </article>
            <article>
              <h3>Converted</h3>
              <p>{queueSummary.converted}</p>
              <small>Already pushed downstream to the live rail.</small>
            </article>
            <article>
              <h3>Archived</h3>
              <p>{queueSummary.archived}</p>
              <small>Held off the active queue until reopened.</small>
            </article>
          </div>
          <ul className="nexops-record-list">
            {filteredRequests.map((request) => (
              <li className={request.id === selectedRequest?.id ? "selected" : ""} key={request.id}>
                <button className="nexops-request-row-button" type="button" onClick={() => setSelectedRequestId(request.id)}>
                  <span>
                    <strong>{request.clientName}</strong>
                    <small>{request.subject}</small>
                    <small>{formatAddress(request.propertyAddress) || request.email || request.phone || requestSourceLabel(request.source)}</small>
                  </span>
                  <mark>{requestStatusLabel(request.status)}</mark>
                  <b>{requestSourceLabel(request.source)}</b>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="nexops-module-card">
          {selectedRequest ? (
            <div className="nexops-request-detail">
              <div className="nexops-page-heading">
                <div>
                  <p className="eyebrow">Request detail</p>
                  <h2>{selectedRequest.clientName}</h2>
                  <p>{selectedRequest.subject}</p>
                </div>
                <div className="nexops-inline-actions">
                  {selectedRequest.status === "archived" ? (
                    <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "reopen")}>Reopen</button>
                  ) : (
                    <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "archive")}>Archive</button>
                  )}
                  <button type="button" disabled={Boolean(actionBusy) || selectedRequest.status !== "new"} onClick={() => void runRequestAction(selectedRequest.id, "convert-to-quote")}>Convert to quote</button>
                  <button type="button" disabled={Boolean(actionBusy) || selectedRequest.status !== "new"} onClick={() => void runRequestAction(selectedRequest.id, "convert-to-job")}>Convert to job</button>
                </div>
              </div>

              {selectedRequestAction ? (
                <section className="nexops-quote-panel">
                  <div className="nexops-quote-section-head">
                    <h3>Next office move</h3>
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
                      <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runRequestAction(selectedRequest.id, "convert-to-job")}>
                        {selectedRequestAction.secondaryLabel}
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <div className="nexops-request-summary-grid">
                <article>
                  <h3>Review</h3>
                  <p>{requestMatchLabel(selectedRequest.match, props.clients, props.properties)}</p>
                  <small>Reviewed: {formatTimestamp(selectedRequest.reviewedAt)}</small>
                  {!selectedRequest.reviewedAt ? <button type="button" disabled={Boolean(actionBusy)} onClick={() => void markReviewed(selectedRequest.id)}>Mark reviewed</button> : null}
                </article>
                <article>
                  <h3>Notifications</h3>
                  <p>Admins: {formatTimestamp(selectedRequest.notifications?.adminNotifiedAt)}</p>
                  <small>Client confirmation: {formatTimestamp(selectedRequest.notifications?.clientConfirmationAt)}</small>
                </article>
                <article>
                  <h3>Links</h3>
                  <p>{selectedRequest.convertedQuoteId ? `Quote ${selectedRequest.convertedQuoteId}` : "No quote yet"}</p>
                  <small>{selectedRequest.convertedJobId ? `Job ${selectedRequest.convertedJobId}` : "No job yet"}</small>
                </article>
                <article>
                  <h3>Service address</h3>
                  <p>{formatAddress(selectedRequest.propertyAddress) || "Property comes from existing client/property link."}</p>
                  <small>{selectedRequest.email ?? "No email"} · {selectedRequest.phone ?? "No phone"}</small>
                </article>
              </div>

              {prominentFieldValues(selectedRequest).length ? (
                <div className="nexops-request-alert-strip">
                  {prominentFieldValues(selectedRequest).map((field) => (
                    <span key={`${selectedRequest.id}-${field.key}`}>{field.label}: {requestFieldText(field.value)}</span>
                  ))}
                </div>
              ) : null}

              <div className="nexops-request-propagation-table" role="table" aria-label="Request propagation">
                <div className="nexops-request-propagation-head" role="row">
                  <span>Field</span>
                  <span>Value</span>
                  <span>Request</span>
                  <span>Quote</span>
                  <span>Job</span>
                  <span>Visit</span>
                  <span>Invoice</span>
                </div>
                {selectedRequest.intake.fieldValues.map((field) => (
                  <div className="nexops-request-propagation-row" role="row" key={`${selectedRequest.id}-${field.key}`}>
                    <strong>{field.label}</strong>
                    <span>{requestFieldText(field.value)}</span>
                    {(["request", "quote", "job", "visit", "invoice"] as RequestSurface[]).map((surface) => (
                      <label key={`${field.key}-${surface}`}>
                        <input
                          checked={field.visibility[surface]}
                          disabled={Boolean(actionBusy)}
                          type="checkbox"
                          onChange={(event) => void updateRequestFieldVisibility(selectedRequest.id, field, surface, event.target.checked)}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="nexops-client-empty">
              <h2>No request selected</h2>
              <p>Pick a request to review the exact-match rule, confirmation timestamps, and field-by-field downstream visibility.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
