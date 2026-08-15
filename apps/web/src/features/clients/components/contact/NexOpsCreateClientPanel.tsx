import React, { useEffect, useState } from "react";
import type { AddressSuggestion as CrmAddressSuggestion } from "@nexteam/shared";
import { ProductLogo } from "../../../../shared/branding/ProductBranding";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  createCustomFieldDraftRow,
  LEAD_SOURCE_ADD_NEW_OPTION,
  PROPERTY_CUSTOM_FIELD_RESERVED_LABELS,
  validateCustomFieldDraftRows,
  type CustomFieldDraftRow
} from "./domain/clientProfile";
import type { NexOpsClientDraft } from "../../../nexopsShell/NexOpsWorkspace";

type CreateClientPhoneLabel = "Main" | "Work" | "Mobile" | "Home" | "Fax" | "Other";
type CreateClientEmailLabel = "Main" | "Work" | "Personal" | "Other";

interface ClientPhoneDraft {
  id: string;
  label: CreateClientPhoneLabel;
  value: string;
  receivesMessages: boolean;
  smsCapability: "mobile" | "landline" | "fax" | "invalid" | "unknown";
}

interface ClientEmailDraft {
  id: string;
  label: CreateClientEmailLabel;
  value: string;
}

interface NexOpsCreateClientPanelProps {
  tenantId: string;
  newClient: NexOpsClientDraft;
  setNewClient: React.Dispatch<React.SetStateAction<NexOpsClientDraft>>;
  createStatus: string;
  createClientCanSave: boolean;
  createClientMissingFields: string[];
  leadSourceOptions?: string[];
  mode?: "create" | "edit";
  layout?: "drawer" | "page";
  surface?: "client" | "contact" | "property";
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> | void;
}

export function NexOpsCreateClientPanel(props: NexOpsCreateClientPanelProps): React.ReactElement {
  const {
    tenantId,
    newClient,
    setNewClient,
    createStatus,
    createClientCanSave,
    createClientMissingFields,
    leadSourceOptions = [],
    mode = "create",
    layout = "drawer",
    surface = "client",
    onClose,
    onSubmit
  } = props;
  const [addressSuggestions, setAddressSuggestions] = useState<CrmAddressSuggestion[]>([]);
  const [addressLookupBusy, setAddressLookupBusy] = useState(false);
  const pageLayout = layout === "page";
  const editing = mode === "edit";
  const smsPrompt = newClient.phoneReceivesMessages && newClient.smsCapability !== "mobile"
    ? "This number has not been confirmed as mobile. NexOps will treat texts as one-way and should prompt before sending."
    : "Texts stay one-way unless an upgraded two-way SMS tier is enabled.";
  const surfaceHeading = surface === "property"
    ? "New Property Contact Rail"
    : surface === "contact"
      ? "New Contact"
      : editing ? "Edit Client" : "New Client";
  const surfaceBody = surface === "property"
    ? "Start with the client relationship, then capture the service address and access rules without losing the full CRM context."
    : surface === "contact"
      ? "Capture the core contact details first, then expand into billing, communication, and property context only if needed."
      : editing
        ? "Update the core client details in the same mobile intake workspace used for new records, without losing the parent, contact, or property structure."
        : "Capture the parent relationship first, then add service sites, local property contacts, and communication rules without mixing billing or field access.";

  useEffect(() => {
    if (surface === "contact") {
      setAddressSuggestions([]);
      return undefined;
    }
    const query = [newClient.street1, newClient.city, newClient.province, newClient.postalCode].filter(Boolean).join(", ").trim();
    if (newClient.street1.trim().length < 4) {
      setAddressSuggestions([]);
      setAddressLookupBusy(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAddressLookupBusy(true);
      try {
        const response = await fetch(`/api/crm/address-suggestions?tenantId=${encodeURIComponent(tenantId)}&query=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const body = await response.json() as { ok: boolean; suggestions?: CrmAddressSuggestion[] };
        if (!body.ok) {
          setAddressSuggestions([]);
          return;
        }
        setAddressSuggestions(body.suggestions ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAddressSuggestions([]);
        }
      } finally {
        setAddressLookupBusy(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tenantId, newClient.street1, newClient.city, newClient.province, newClient.postalCode, surface]);

  function applyAddressSuggestion(suggestion: CrmAddressSuggestion): void {
    setNewClient({
      ...newClient,
      street1: suggestion.street1,
      city: suggestion.city,
      province: suggestion.province,
      postalCode: suggestion.postalCode,
      country: suggestion.country,
      propertyGeoLat: suggestion.lat,
      propertyGeoLng: suggestion.lng
    });
    setAddressSuggestions([]);
  }

  const [leadSourcePickerOpen, setLeadSourcePickerOpen] = useState(false);
  const [leadSourceQuery, setLeadSourceQuery] = useState("");
  const [leadSourceAddNewOpen, setLeadSourceAddNewOpen] = useState(false);
  const [leadSourceAddNewValue, setLeadSourceAddNewValue] = useState("");
  const [companyExpanded, setCompanyExpanded] = useState(Boolean(newClient.company?.trim()));
  const [emailExpanded, setEmailExpanded] = useState(Boolean(newClient.email?.trim() || (newClient.additionalEmails ?? []).length));
  const [additionalInfoExpanded, setAdditionalInfoExpanded] = useState(Boolean(
    newClient.referredBy?.trim()
    || newClient.promoCode?.trim()
    || newClient.leadSource?.trim()
    || (newClient.clientCustomFieldsDraft ?? []).length
  ));
  const [propertyInfoExpanded, setPropertyInfoExpanded] = useState(Boolean(
    newClient.propertyGatedEntry
    || newClient.propertyGateCodes?.trim()
    || newClient.propertyClientName?.trim()
    || newClient.propertyClientPhone?.trim()
    || newClient.propertyClientEmail?.trim()
    || newClient.propertyAccessNotes?.trim()
    || (newClient.propertyCustomFieldsDraft ?? []).length
  ));
  const clientCustomFieldValidation = validateCustomFieldDraftRows(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
  const propertyCustomFieldValidation = validateCustomFieldDraftRows(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS);
  const filteredLeadSourceOptions = leadSourceOptions.filter((option) => option.toLowerCase().includes(leadSourceQuery.trim().toLowerCase()));
  const trimmedLeadSource = newClient.leadSource.trim();
  const showReferralField = trimmedLeadSource === "Referral";
  const phoneLabelOptions: CreateClientPhoneLabel[] = ["Main", "Work", "Mobile", "Home", "Fax", "Other"];
  const emailLabelOptions: CreateClientEmailLabel[] = ["Main", "Work", "Personal", "Other"];

  useEffect(() => {
    if (!leadSourcePickerOpen) {
      setLeadSourceAddNewOpen(false);
      setLeadSourceAddNewValue("");
      setLeadSourceQuery("");
    }
  }, [leadSourcePickerOpen]);

  function patchClientDraft(patch: Record<string, unknown>): void {
    setNewClient({ ...newClient, ...patch });
  }

  function addPhoneDraft(): void {
    patchClientDraft({
      additionalPhones: [
        ...(newClient.additionalPhones ?? []),
        {
          id: `phone_${Math.random().toString(36).slice(2, 10)}`,
          label: "Other",
          value: "",
          receivesMessages: false,
          smsCapability: "unknown"
        }
      ]
    });
  }

  function updatePhoneDraft(id: string, patch: Record<string, unknown>): void {
    patchClientDraft({
      additionalPhones: (newClient.additionalPhones ?? []).map((entry: Record<string, unknown>) => entry.id === id ? { ...entry, ...patch } : entry)
    });
  }

  function removePhoneDraft(id: string): void {
    patchClientDraft({
      additionalPhones: (newClient.additionalPhones ?? []).filter((entry: Record<string, unknown>) => entry.id !== id)
    });
  }

  function addEmailDraft(): void {
    patchClientDraft({
      additionalEmails: [
        ...(newClient.additionalEmails ?? []),
        {
          id: `email_${Math.random().toString(36).slice(2, 10)}`,
          label: "Other",
          value: ""
        }
      ]
    });
  }

  function updateEmailDraft(id: string, patch: Record<string, unknown>): void {
    patchClientDraft({
      additionalEmails: (newClient.additionalEmails ?? []).map((entry: Record<string, unknown>) => entry.id === id ? { ...entry, ...patch } : entry)
    });
  }

  function removeEmailDraft(id: string): void {
    patchClientDraft({
      additionalEmails: (newClient.additionalEmails ?? []).filter((entry: Record<string, unknown>) => entry.id !== id)
    });
  }

  function addCustomFieldDraft(scope: "client" | "property"): void {
    const key = scope === "client" ? "clientCustomFieldsDraft" : "propertyCustomFieldsDraft";
    patchClientDraft({
      [key]: [...(newClient[key] ?? []), createCustomFieldDraftRow(scope)]
    });
  }

  function updateCustomFieldDraft(scope: "client" | "property", id: string, patch: Partial<CustomFieldDraftRow>): void {
    const key = scope === "client" ? "clientCustomFieldsDraft" : "propertyCustomFieldsDraft";
    patchClientDraft({
      [key]: (newClient[key] ?? []).map((entry: CustomFieldDraftRow) => entry.id === id ? { ...entry, ...patch } : entry)
    });
  }

  function removeCustomFieldDraft(scope: "client" | "property", id: string): void {
    const key = scope === "client" ? "clientCustomFieldsDraft" : "propertyCustomFieldsDraft";
    patchClientDraft({
      [key]: (newClient[key] ?? []).filter((entry: CustomFieldDraftRow) => entry.id !== id)
    });
  }

  function selectLeadSource(value: string): void {
    patchClientDraft({
      leadSource: value,
      ...(value === "Referral" ? {} : { referredBy: "" })
    });
    setLeadSourcePickerOpen(false);
    setLeadSourceQuery("");
    setLeadSourceAddNewOpen(false);
    setLeadSourceAddNewValue("");
    setAdditionalInfoExpanded(true);
  }

  function saveOneOffLeadSource(): void {
    const value = leadSourceAddNewValue.trim();
    if (!value) {
      return;
    }
    selectLeadSource(value);
  }

  function renderCustomFieldRows(scope: "client" | "property"): React.ReactElement {
    const rows: CustomFieldDraftRow[] = scope === "client"
      ? (newClient.clientCustomFieldsDraft ?? [])
      : (newClient.propertyCustomFieldsDraft ?? []);
    return (
      <div className="nexops-mobile-custom-field-list">
        {rows.map((row) => (
          <div className="nexops-mobile-custom-field-row" key={row.id}>
            <label className="nexops-mobile-client-field">
              <span>Label</span>
              <input value={row.label} onChange={(event) => updateCustomFieldDraft(scope, row.id, { label: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>Value</span>
              <input value={row.value} onChange={(event) => updateCustomFieldDraft(scope, row.id, { value: event.target.value })} />
            </label>
            <button className="nexops-mobile-inline-link danger" type="button" onClick={() => removeCustomFieldDraft(scope, row.id)}>Remove</button>
          </div>
        ))}
      </div>
    );
  }

  function renderDesktopCustomFieldRows(scope: "client" | "property"): React.ReactElement | null {
    const rows: CustomFieldDraftRow[] = scope === "client"
      ? (newClient.clientCustomFieldsDraft ?? [])
      : (newClient.propertyCustomFieldsDraft ?? []);
    if (!rows.length) {
      return null;
    }
    return (
      <div className="nexops-custom-field-list">
        {rows.map((row) => (
          <div className="nexops-custom-field-row" key={row.id}>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>Custom Field Name</span><input value={row.label} onChange={(event) => updateCustomFieldDraft(scope, row.id, { label: event.target.value })} /></label>
              <label className="nexops-field"><span>Custom Field Value</span><input value={row.value} onChange={(event) => updateCustomFieldDraft(scope, row.id, { value: event.target.value })} /></label>
            </div>
            <button className="nexops-link-button danger" type="button" onClick={() => removeCustomFieldDraft(scope, row.id)}>Remove Custom Field</button>
          </div>
        ))}
      </div>
    );
  }

  if (pageLayout) {
    const helperCopy = clientCustomFieldValidation.hasBlockingIssues
      ? "Client custom field labels must be unique and cannot reuse built-in fields."
      : propertyCustomFieldValidation.hasBlockingIssues
        ? "Property custom field labels must be unique and cannot reuse built-in fields."
        : createStatus || (createClientCanSave ? (editing ? "Ready to save changes." : "Ready to save.") : "Name, phone, and address needed to save");

    if (leadSourcePickerOpen) {
      return (
        <section className="nexops-mobile-client-screen nexops-mobile-client-screen-sheet">
          <header className="nexops-mobile-client-head">
            <button type="button" onClick={() => setLeadSourcePickerOpen(false)} aria-label="Back">←</button>
            <h1>How They Found Us</h1>
            <span />
          </header>
          <div className="nexops-mobile-client-body">
            <label className="nexops-mobile-client-field">
              <span>Search Lead Sources</span>
              <input
                value={leadSourceQuery}
                placeholder="Search Lead Sources"
                onChange={(event) => setLeadSourceQuery(event.target.value)}
              />
            </label>
            <button className="nexops-mobile-client-row-action add" type="button" onClick={() => setLeadSourceAddNewOpen((current) => !current)}>
              {LEAD_SOURCE_ADD_NEW_OPTION}
            </button>
            {leadSourceAddNewOpen ? (
              <div className="nexops-mobile-inline-panel">
                <label className="nexops-mobile-client-field">
                  <span>One-Time Lead Source</span>
                  <input
                    value={leadSourceAddNewValue}
                    placeholder="Enter a source for this client only"
                    onChange={(event) => setLeadSourceAddNewValue(event.target.value)}
                  />
                </label>
                <div className="nexops-inline-actions wrap">
                  <button className="nexops-mobile-inline-link" type="button" onClick={saveOneOffLeadSource}>Save This Source</button>
                  <button
                    className="nexops-mobile-inline-link danger"
                    type="button"
                    onClick={() => {
                      setLeadSourceAddNewOpen(false);
                      setLeadSourceAddNewValue("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            <div className="nexops-mobile-client-list">
              {filteredLeadSourceOptions.map((option) => (
                <button
                  className={`nexops-mobile-client-list-row${newClient.leadSource === option ? " active" : ""}`}
                  key={option}
                  type="button"
                  onClick={() => selectLeadSource(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    return (
      <form className="nexops-mobile-client-screen" onSubmit={(event) => void onSubmit(event)}>
        <header className="nexops-mobile-client-head">
          <button type="button" onClick={onClose} aria-label="Close">×</button>
          <h1>{surfaceHeading}</h1>
          <span />
        </header>
        <div className="nexops-mobile-client-body">
          <p className="nexops-mobile-validation-note">Importing an existing contact is not available in this intake. Enter the contact details below to save them with this client.</p>
          <label className="nexops-mobile-client-field">
            <span>First Name</span>
            <input value={newClient.firstName} placeholder="First Name" onChange={(event) => patchClientDraft({ firstName: event.target.value })} />
          </label>
          <label className="nexops-mobile-client-field">
            <span>Last Name</span>
            <input value={newClient.lastName} placeholder="Last Name" onChange={(event) => patchClientDraft({ lastName: event.target.value })} />
          </label>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setCompanyExpanded((current) => !current)}>
            {companyExpanded || newClient.company.trim() ? "Company Name" : "Add Company Name"}
          </button>
          {companyExpanded ? (
            <div className="nexops-mobile-inline-panel">
              <label className="nexops-mobile-client-field">
                <span>Company Name</span>
                <input
                  value={newClient.company}
                  placeholder="Company Name"
                  onChange={(event) => patchClientDraft({
                    company: event.target.value,
                    displayNamePreference: event.target.value ? newClient.displayNamePreference : "person"
                  })}
                />
              </label>
              <label className="nexops-mobile-toggle-row">
                <span>Commercial Client: Use Company Name as Client Name</span>
                <input
                  type="checkbox"
                  checked={newClient.displayNamePreference === "company"}
                  onChange={(event) => patchClientDraft({ displayNamePreference: event.target.checked ? "company" : "person" })}
                />
              </label>
            </div>
          ) : null}

          <div className="nexops-mobile-inline-panel">
            <label className="nexops-mobile-client-field">
              <span>Phone Number</span>
              <input value={newClient.phone} placeholder="Phone Number" onChange={(event) => patchClientDraft({ phone: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>Label</span>
              <select value={newClient.phoneLabel} onChange={(event) => patchClientDraft({ phoneLabel: event.target.value })}>
                {phoneLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            <label className="nexops-mobile-toggle-row">
              <span>Receives Text Messages</span>
              <input type="checkbox" checked={newClient.phoneReceivesMessages} onChange={(event) => patchClientDraft({ phoneReceivesMessages: event.target.checked })} />
            </label>
            {(newClient.additionalPhones ?? []).map((entry: ClientPhoneDraft) => (
              <div className="nexops-mobile-inline-panel nested" key={entry.id}>
                <label className="nexops-mobile-client-field">
                  <span>Additional Phone</span>
                  <input value={entry.value} placeholder="Phone Number" onChange={(event) => updatePhoneDraft(entry.id, { value: event.target.value })} />
                </label>
                <label className="nexops-mobile-client-field">
                  <span>Label</span>
                  <select value={entry.label} onChange={(event) => updatePhoneDraft(entry.id, { label: event.target.value })}>
                    {phoneLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </label>
                <label className="nexops-mobile-toggle-row">
                  <span>Receives Text Messages</span>
                  <input type="checkbox" checked={entry.receivesMessages} onChange={(event) => updatePhoneDraft(entry.id, { receivesMessages: event.target.checked })} />
                </label>
                <button className="nexops-mobile-inline-link danger" type="button" onClick={() => removePhoneDraft(entry.id)}>Remove Phone</button>
              </div>
            ))}
            <button className="nexops-mobile-inline-link" type="button" onClick={addPhoneDraft}>Add Another Phone Number</button>
          </div>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setEmailExpanded((current) => !current)}>
            {emailExpanded || newClient.email.trim() ? "Email" : "Add Email"}
          </button>
          {emailExpanded ? (
            <div className="nexops-mobile-inline-panel">
              <label className="nexops-mobile-client-field">
                <span>Email Address</span>
                <input type="email" value={newClient.email} placeholder="Email Address" onChange={(event) => patchClientDraft({ email: event.target.value })} />
              </label>
              <label className="nexops-mobile-client-field">
                <span>Label</span>
                <select value={newClient.emailLabel} onChange={(event) => patchClientDraft({ emailLabel: event.target.value })}>
                  {emailLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                </select>
              </label>
              {(newClient.additionalEmails ?? []).map((entry: ClientEmailDraft) => (
                <div className="nexops-mobile-inline-panel nested" key={entry.id}>
                  <label className="nexops-mobile-client-field">
                    <span>Additional Email</span>
                    <input type="email" value={entry.value} placeholder="Email Address" onChange={(event) => updateEmailDraft(entry.id, { value: event.target.value })} />
                  </label>
                  <label className="nexops-mobile-client-field">
                    <span>Label</span>
                    <select value={entry.label} onChange={(event) => updateEmailDraft(entry.id, { label: event.target.value })}>
                      {emailLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                    </select>
                  </label>
                  <button className="nexops-mobile-inline-link danger" type="button" onClick={() => removeEmailDraft(entry.id)}>Remove Email</button>
                </div>
              ))}
              <button className="nexops-mobile-inline-link" type="button" onClick={addEmailDraft}>Add Another Email</button>
            </div>
          ) : null}

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setLeadSourcePickerOpen(true)}>
            {trimmedLeadSource ? `How They Found Us: ${trimmedLeadSource}` : "How They Found Us"}
          </button>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setAdditionalInfoExpanded((current) => !current)}>
            Add Additional Info
          </button>
          {additionalInfoExpanded ? (
            <div className="nexops-mobile-inline-panel">
              {showReferralField ? (
                <label className="nexops-mobile-client-field">
                  <span>Referred By</span>
                  <input value={newClient.referredBy} placeholder="Referred By" onChange={(event) => patchClientDraft({ referredBy: event.target.value })} />
                </label>
              ) : null}
              <label className="nexops-mobile-client-field">
                <span>Promo Code</span>
                <input value={newClient.promoCode} placeholder="Promo Code" onChange={(event) => patchClientDraft({ promoCode: event.target.value })} />
              </label>
              {renderCustomFieldRows("client")}
              <button className="nexops-mobile-inline-link" type="button" onClick={() => addCustomFieldDraft("client")}>Add Custom Field</button>
              {clientCustomFieldValidation.hasBlockingIssues ? <p className="nexops-mobile-validation-note">Client custom field labels must be unique and cannot match built-in fields.</p> : null}
            </div>
          ) : null}

          <label className="nexops-mobile-client-field">
            <span>Property Address</span>
            <input
              value={newClient.street1}
              placeholder="Property Address"
              onChange={(event) => patchClientDraft({ street1: event.target.value })}
            />
          </label>
          {addressLookupBusy ? <p className="nexops-mobile-helper-note">Looking up matching addresses…</p> : null}
          {addressSuggestions.length ? (
            <div className="nexops-mobile-client-list">
              {addressSuggestions.map((suggestion) => (
                <button className="nexops-mobile-client-list-row" type="button" key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`} onClick={() => applyAddressSuggestion(suggestion)}>
                  <strong>{suggestion.street1}</strong>
                  <small>{suggestion.city}, {suggestion.province} {suggestion.postalCode}</small>
                </button>
              ))}
            </div>
          ) : null}
          <div className="nexops-mobile-two-up">
            <label className="nexops-mobile-client-field">
              <span>City</span>
              <input value={newClient.city} placeholder="City" onChange={(event) => patchClientDraft({ city: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>State</span>
              <input value={newClient.province} placeholder="State" onChange={(event) => patchClientDraft({ province: event.target.value })} />
            </label>
          </div>
          <div className="nexops-mobile-two-up">
            <label className="nexops-mobile-client-field">
              <span>ZIP Code</span>
              <input value={newClient.postalCode} placeholder="ZIP Code" onChange={(event) => patchClientDraft({ postalCode: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>Street 2</span>
              <input value={newClient.street2} placeholder="Apartment, suite, etc." onChange={(event) => patchClientDraft({ street2: event.target.value })} />
            </label>
          </div>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setPropertyInfoExpanded((current) => !current)}>
            Add Additional Property Info
          </button>
          {propertyInfoExpanded ? (
            <div className="nexops-mobile-inline-panel">
              <label className="nexops-mobile-toggle-row">
                <span>Gated Entry</span>
                <input type="checkbox" checked={newClient.propertyGatedEntry} onChange={(event) => patchClientDraft({ propertyGatedEntry: event.target.checked })} />
              </label>
              {newClient.propertyGatedEntry ? (
                <>
                  <label className="nexops-mobile-client-field">
                    <span>Gate Entry Code(s)</span>
                    <input value={newClient.propertyGateCodes} placeholder="Gate Entry Code(s)" onChange={(event) => patchClientDraft({ propertyGateCodes: event.target.value })} />
                  </label>
                  <label className="nexops-mobile-client-field">
                    <span>Access Note</span>
                    <input value={newClient.propertyAccessNotes} placeholder="Access Note" onChange={(event) => patchClientDraft({ propertyAccessNotes: event.target.value })} />
                  </label>
                </>
              ) : null}
              <label className="nexops-mobile-client-field">
                <span>Property Client Name</span>
                <input value={newClient.propertyClientName} placeholder="Property Client Name" onChange={(event) => patchClientDraft({ propertyClientName: event.target.value })} />
              </label>
              <label className="nexops-mobile-client-field">
                <span>Property Client Telephone Number</span>
                <input value={newClient.propertyClientPhone} placeholder="Property Client Telephone Number" onChange={(event) => patchClientDraft({ propertyClientPhone: event.target.value })} />
              </label>
              <label className="nexops-mobile-client-field">
                <span>Property Client Email Address</span>
                <input type="email" value={newClient.propertyClientEmail} placeholder="Property Client Email Address" onChange={(event) => patchClientDraft({ propertyClientEmail: event.target.value })} />
              </label>
              {renderCustomFieldRows("property")}
              <button className="nexops-mobile-inline-link" type="button" onClick={() => addCustomFieldDraft("property")}>Add Custom Field</button>
              {propertyCustomFieldValidation.hasBlockingIssues ? <p className="nexops-mobile-validation-note">Property custom field labels must be unique and cannot match built-in fields.</p> : null}
            </div>
          ) : null}
        </div>
        <footer className="nexops-mobile-client-footer">
          <p>{helperCopy}</p>
          <button type="submit" disabled={!createClientCanSave}>{editing ? "Save Changes" : "Save"}</button>
        </footer>
      </form>
    );
  }

  const form = (
    <form className={pageLayout ? "nexops-client-profile-panel nexops-client-form nexops-client-form-page" : "nexops-drawer nexops-client-form"} onSubmit={(event) => void onSubmit(event)}>
      {pageLayout ? (
        <div className="nexops-client-form-page-head">
          <div>
            <p className="eyebrow">New Record</p>
            <h2>{surfaceHeading}</h2>
            <p>{surfaceBody}</p>
          </div>
          <div className="nexops-inline-actions wrap">
            <span className="nexops-client-form-page-note">Save the parent client first, then add extra contacts, properties, and billing details from the full workspace.</span>
            <button className="nexops-link-button" type="button" onClick={onClose}>Back to Clients</button>
          </div>
        </div>
      ) : (
        <div className="nexops-drawer-heading nexops-client-form-hero">
          <div className="nexops-client-form-hero-copy">
            <ProductLogo product="nexops" className="nexops-client-form-brand" alt="NexOps" />
            <p className="eyebrow">NexOps CRM</p>
            <h2>{surfaceHeading}</h2>
            <p>{surfaceBody}</p>
          </div>
          <div className="nexops-client-form-hero-actions">
            <span>Proof Screen: Final NexTeam Design System</span>
            <button type="button" onClick={onClose}>Close</button>
          </div>
          <ul className="nexops-form-principles" aria-label="Client Setup Rules">
            <li>Parent client owns billing</li>
            <li>Company display is optional</li>
            <li>Texts stay one-way unless upgraded</li>
          </ul>
        </div>
      )}
        <section className="nexops-form-section">
          <div className="nexops-section-copy">
            <h3>Primary Contact Details</h3>
            <p>Start with the essentials only: name, best phone, best email, and the primary service address.</p>
          </div>
          <div className="nexops-section-fields">
            <div className="nexops-field-row">
              <label className="nexops-field"><span>First Name</span><input value={newClient.firstName} onChange={(event) => setNewClient({ ...newClient, firstName: event.target.value })} /></label>
              <label className="nexops-field"><span>Last Name</span><input value={newClient.lastName} onChange={(event) => setNewClient({ ...newClient, lastName: event.target.value })} /></label>
            </div>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>Company Name (Optional)</span><input value={newClient.company} onChange={(event) => setNewClient({ ...newClient, company: event.target.value, displayNamePreference: event.target.value ? "company" : "person" })} /></label>
              <label className="nexops-field"><span>Display As</span><select value={newClient.displayNamePreference} onChange={(event) => setNewClient({ ...newClient, displayNamePreference: event.target.value as "person" | "company" })}>
                <option value="person">First Name Last Name</option>
                <option value="company" disabled={!newClient.company}>Company Name</option>
              </select></label>
            </div>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>Phone Number</span><input value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} /></label>
              <label className="nexops-field"><span>Email (recommended)</span><input type="email" value={newClient.email} onChange={(event) => setNewClient({ ...newClient, email: event.target.value })} /></label>
            </div>
            <label className="nexops-check-field"><input type="checkbox" checked={newClient.phoneReceivesMessages} onChange={(event) => setNewClient({ ...newClient, phoneReceivesMessages: event.target.checked })} /> Allow One-Way Texts to This Number</label>
            {newClient.phoneReceivesMessages ? (
              <label className="nexops-field"><span>SMS Check</span><select value={newClient.smsCapability} onChange={(event) => setNewClient({ ...newClient, smsCapability: event.target.value })}>
                <option value="unknown">Unknown - prompt before sending</option>
                <option value="mobile">Mobile - can receive texts</option>
                <option value="landline">Landline - prompt</option>
                <option value="fax">Fax - text off unless changed</option>
                <option value="invalid">Invalid - text off</option>
              </select></label>
            ) : null}
            <p className="nexops-form-note">{smsPrompt}</p>
            <p className="nexops-form-note">Email is recommended so quotes, invoices, and follow-ups have a reliable destination, but it is not required to save the client.</p>
            <details className="nexops-extra-panel">
              <summary>Communication and Lead Settings</summary>
              <div className="nexops-extra-panel-body">
                <div className="nexops-field-row">
                  <label className="nexops-field compact"><span>Phone Label</span><select value={newClient.phoneLabel} onChange={(event) => setNewClient({ ...newClient, phoneLabel: event.target.value })}>
                    {["Main", "Work", "Mobile", "Home", "Fax", "Other"].map((label) => <option key={label}>{label}</option>)}
                  </select></label>
                  <label className="nexops-field compact"><span>Email Label</span><select value={newClient.emailLabel} onChange={(event) => setNewClient({ ...newClient, emailLabel: event.target.value })}>
                    {["Main", "Work", "Personal", "Other"].map((label) => <option key={label}>{label}</option>)}
                  </select></label>
                </div>
                <label className="nexops-field"><span>Role</span><input value={newClient.role} onChange={(event) => setNewClient({ ...newClient, role: event.target.value })} /></label>
                <label className="nexops-field"><span>Lead Source</span><input value={newClient.leadSource} onChange={(event) => setNewClient({ ...newClient, leadSource: event.target.value })} /></label>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Payment Terms</span><input value={newClient.paymentTerms} onChange={(event) => setNewClient({ ...newClient, paymentTerms: event.target.value })} /></label>
                  <label className="nexops-check-field inline"><input type="checkbox" checked={newClient.askForReview} onChange={(event) => setNewClient({ ...newClient, askForReview: event.target.checked })} /> Ask for a Review</label>
                </div>
              </div>
            </details>
            <details className="nexops-extra-panel">
              <summary>Additional Client Details</summary>
              <div className="nexops-extra-panel-body">
                <p>Create custom fields to track additional client-level details.</p>
                {renderDesktopCustomFieldRows("client")}
                <button type="button" onClick={() => addCustomFieldDraft("client")}>Add Custom Field</button>
                {clientCustomFieldValidation.hasBlockingIssues ? <p className="nexops-form-note danger">Custom field labels must be unique and cannot match built-in client fields.</p> : null}
              </div>
            </details>
            <details className="nexops-extra-panel">
              <summary>Additional Contacts</summary>
              <div className="nexops-extra-panel-body">
                <p>For contacts with access to all properties, like spouse/family for residential or property managers for commercial.</p>
                <p className="nexops-form-note">This intake saves one additional client contact. Add more contacts after the client is created.</p>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Contact Name</span><input value={newClient.additionalContactName} onChange={(event) => setNewClient({ ...newClient, additionalContactName: event.target.value })} /></label>
                  <label className="nexops-field"><span>Role</span><input value={newClient.additionalContactRole} onChange={(event) => setNewClient({ ...newClient, additionalContactRole: event.target.value })} /></label>
                </div>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Phone</span><input value={newClient.additionalContactPhone} onChange={(event) => setNewClient({ ...newClient, additionalContactPhone: event.target.value })} /></label>
                  <label className="nexops-field"><span>Email</span><input type="email" value={newClient.additionalContactEmail} onChange={(event) => setNewClient({ ...newClient, additionalContactEmail: event.target.value })} /></label>
                </div>
              </div>
            </details>
          </div>
        </section>
        <section className="nexops-form-section">
          <div className="nexops-section-copy">
            <h3>Property Address</h3>
            <p>Start with the main service address. Optional billing and property details stay tucked away until you actually need them.</p>
          </div>
          <div className="nexops-section-fields">
            <label className="nexops-field"><span>Site Name</span><input value={newClient.siteName} onChange={(event) => setNewClient({ ...newClient, siteName: event.target.value })} placeholder="Optional, e.g. Mulberry Farms" /></label>
            <label className="nexops-field">
              <span>Primary Address</span>
              <input value={newClient.street1} onChange={(event) => setNewClient({ ...newClient, street1: event.target.value })} placeholder="Start typing the street address" />
            </label>
            {addressLookupBusy ? <p className="nexops-form-note">Looking up matching addresses...</p> : null}
            {addressSuggestions.length ? (
              <div className="nexops-mini-list">
                {addressSuggestions.map((suggestion) => (
                  <button className="nexops-list-select" type="button" key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`} onClick={() => applyAddressSuggestion(suggestion)}>
                    <strong>{suggestion.street1}</strong>
                    <small>{suggestion.city}, {suggestion.province} {suggestion.postalCode}</small>
                  </button>
                ))}
              </div>
            ) : null}
            <label className="nexops-field"><span>Street 2</span><input value={newClient.street2} onChange={(event) => setNewClient({ ...newClient, street2: event.target.value })} /></label>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>City</span><input value={newClient.city} onChange={(event) => setNewClient({ ...newClient, city: event.target.value })} /></label>
              <label className="nexops-field compact"><span>State</span><input value={newClient.province} onChange={(event) => setNewClient({ ...newClient, province: event.target.value })} /></label>
            </div>
            <div className="nexops-field-row">
              <label className="nexops-field compact"><span>ZIP code</span><input value={newClient.postalCode} onChange={(event) => setNewClient({ ...newClient, postalCode: event.target.value })} /></label>
              <label className="nexops-field"><span>Country</span><select value={newClient.country} onChange={(event) => setNewClient({ ...newClient, country: event.target.value })}><option value="US">United States</option><option value="CA">Canada</option></select></label>
            </div>
            {newClient.propertyGeoLat && newClient.propertyGeoLng ? <p className="nexops-form-note">Drive-time coordinates captured for scheduling. You can still overwrite the address manually.</p> : <p className="nexops-form-note">Manual addresses still save even if nothing is recognized. Suggestions only speed up the entry.</p>}
            <p className="nexops-form-note">Tax rates are not configured in client intake and are not saved with this property.</p>
            <label className="nexops-check-field"><input type="checkbox" checked={newClient.billingSameAsPrimaryProperty} onChange={(event) => setNewClient({ ...newClient, billingSameAsPrimaryProperty: event.target.checked })} /> Billing Address Is the Same as Property Address</label>
            {!newClient.billingSameAsPrimaryProperty ? (
              <div className="nexops-subsection">
                <h4>Billing Address</h4>
                <label className="nexops-field"><span>Billing Street 1</span><input value={newClient.billingStreet1} onChange={(event) => setNewClient({ ...newClient, billingStreet1: event.target.value })} /></label>
                <label className="nexops-field"><span>Billing Street 2</span><input value={newClient.billingStreet2} onChange={(event) => setNewClient({ ...newClient, billingStreet2: event.target.value })} /></label>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Billing City</span><input value={newClient.billingCity} onChange={(event) => setNewClient({ ...newClient, billingCity: event.target.value })} /></label>
                  <label className="nexops-field compact"><span>Billing State</span><input value={newClient.billingProvince} onChange={(event) => setNewClient({ ...newClient, billingProvince: event.target.value })} /></label>
                </div>
                <label className="nexops-field compact"><span>Billing ZIP</span><input value={newClient.billingPostalCode} onChange={(event) => setNewClient({ ...newClient, billingPostalCode: event.target.value })} /></label>
              </div>
            ) : null}
            <details className="nexops-extra-panel">
              <summary>Property Details</summary>
              <div className="nexops-extra-panel-body">
                <p>Create custom fields to track additional property details.</p>
                {renderDesktopCustomFieldRows("property")}
                <button type="button" onClick={() => addCustomFieldDraft("property")}>Add Custom Field</button>
                {propertyCustomFieldValidation.hasBlockingIssues ? <p className="nexops-form-note danger">Custom field labels must be unique and cannot match built-in property fields.</p> : null}
                <label className="nexops-check-field inline"><input type="checkbox" checked={newClient.propertyGatedEntry} onChange={(event) => setNewClient({ ...newClient, propertyGatedEntry: event.target.checked })} /> Gated Entry</label>
                <label className="nexops-field"><span>Gate Entry Code(s)</span><input value={newClient.propertyGateCodes} onChange={(event) => setNewClient({ ...newClient, propertyGateCodes: event.target.value })} /></label>
                <label className="nexops-field"><span>Property Client Name</span><input value={newClient.propertyClientName} onChange={(event) => setNewClient({ ...newClient, propertyClientName: event.target.value })} /></label>
                <label className="nexops-field"><span>Property Client Telephone Number</span><input value={newClient.propertyClientPhone} onChange={(event) => setNewClient({ ...newClient, propertyClientPhone: event.target.value })} /></label>
                <label className="nexops-field"><span>Property Client Email Address</span><input type="email" value={newClient.propertyClientEmail} onChange={(event) => setNewClient({ ...newClient, propertyClientEmail: event.target.value })} /></label>
              </div>
            </details>
            <details className="nexops-extra-panel">
              <summary>Property Contacts</summary>
              <div className="nexops-extra-panel-body single-row">
                <p>Property contacts are captured above with the property details and do not receive parent-client correspondence by default. Additional property contacts can be added after the property is created.</p>
              </div>
            </details>
          </div>
        </section>
        <div className={`nexops-drawer-actions${pageLayout ? " nexops-client-form-page-actions" : ""}`}>
          <span>{createStatus || (createClientCanSave ? "Name, address, and telephone are present. Email is optional." : `Add ${createClientMissingFields.join(", ")} before Save becomes available.`)}</span>
          <button type="button" onClick={onClose}>{pageLayout ? "Back to Clients" : "Cancel"}</button>
          <button type="submit" disabled={!createClientCanSave}>Save Client</button>
        </div>
    </form>
  );

  if (pageLayout) {
    return form;
  }

  return (
    <div className="nexops-drawer-backdrop" role="presentation">
      {form}
    </div>
  );
}

