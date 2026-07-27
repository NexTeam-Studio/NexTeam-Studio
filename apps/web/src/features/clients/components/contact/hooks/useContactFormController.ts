import { useState, type FormEvent } from "react";
import {
  buildLeadSourceOptions,
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  customFieldDraftRowsToRecord,
  PROPERTY_CUSTOM_FIELD_RESERVED_LABELS,
  validateCustomFieldDraftRows
} from "../domain/clientProfile";
import type {
  ClientEmailDraft,
  ClientFormMode,
  ClientPhoneDraft,
  CrmClient,
  CrmClientCreateResponse,
  CrmContact,
  CrmProperty
} from "../../../../nexopsShell/contracts/workspaceContracts";
import {
  blankNewClientDraft,
  clientDisplayName,
  draftFromExistingClient,
  personDisplayName
} from "../../../../nexopsShell/workspaceSupport";

export type ContactFormSurface = "client" | "contact" | "property";

export function useContactFormController(options: {
  tenantId: string;
  clients: CrmClient[];
  selectedClientId: string;
  selectedClient?: CrmClient;
  selectedProperty?: CrmProperty | null;
  onRefresh: () => Promise<void>;
  onSaved: (clientId: string) => void;
}) {
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [clientFormMode, setClientFormMode] = useState<ClientFormMode>("create");
  const [createClientSurface, setCreateClientSurface] = useState<ContactFormSurface>("client");
  const [createStatus, setCreateStatus] = useState("");
  const [newClient, setNewClient] = useState(() => blankNewClientDraft());

  const draftDisplayName = [newClient.firstName.trim(), newClient.lastName.trim()].filter(Boolean).join(" ") || newClient.company.trim();
  const clientCustomFieldValidation = validateCustomFieldDraftRows(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
  const propertyCustomFieldValidation = validateCustomFieldDraftRows(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS);
  const createClientMissingFields = [
    ...(draftDisplayName ? [] : ["name"]),
    ...([newClient.street1.trim(), newClient.city.trim(), newClient.province.trim()].every(Boolean) ? [] : ["address"]),
    ...(newClient.phone.trim() ? [] : ["telephone"])
  ];
  const createClientCanSave = createClientMissingFields.length === 0
    && !clientCustomFieldValidation.hasBlockingIssues
    && !propertyCustomFieldValidation.hasBlockingIssues;
  const leadSourceOptions = buildLeadSourceOptions(options.clients);

  function resetForm(): void {
    setClientFormMode("create");
    setCreateStatus("");
    setNewClient(blankNewClientDraft());
  }

  function openCreate(surface: ContactFormSurface = "client", drawer = false): void {
    setCreateClientSurface(surface);
    resetForm();
    setShowCreateClient(drawer);
  }

  function openEdit(): boolean {
    if (!options.selectedClient) {
      return false;
    }
    setShowCreateClient(false);
    setClientFormMode("edit");
    setCreateStatus("");
    setNewClient(draftFromExistingClient(options.selectedClient, options.selectedProperty ?? null));
    return true;
  }

  function closeDrawer(): void {
    setShowCreateClient(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!createClientCanSave) {
      if (clientCustomFieldValidation.hasBlockingIssues) {
        setCreateStatus("Resolve duplicate or reserved client custom field labels before saving.");
        return;
      }
      if (propertyCustomFieldValidation.hasBlockingIssues) {
        setCreateStatus("Resolve duplicate or reserved property custom field labels before saving.");
        return;
      }
      setCreateStatus(`Add ${createClientMissingFields.join(", ")} before this client can be saved. Email is recommended, but it is optional.`);
      return;
    }
    const editing = clientFormMode === "edit";
    if (editing && !options.selectedClientId) {
      setCreateStatus("Open a saved client record before trying to edit it.");
      return;
    }
    setCreateStatus(editing ? "Saving client changes..." : "Creating client...");
    const personName = {
      ...(newClient.title && newClient.title !== "No title" ? { title: newClient.title } : {}),
      firstName: newClient.firstName.trim(),
      lastName: newClient.lastName.trim()
    };
    const company = newClient.company.trim();
    const displayName = company && newClient.displayNamePreference === "company"
      ? company
      : personDisplayName(personName) || company;
    if (!displayName) {
      setCreateStatus("Add a client name or company name first.");
      return;
    }
    const phoneValue = newClient.phone.trim();
    const emailValue = newClient.email.trim();
    const additionalPhones = (newClient.additionalPhones ?? [])
      .filter((entry: ClientPhoneDraft) => entry.value.trim())
      .map((entry: ClientPhoneDraft) => ({
        label: entry.label,
        value: entry.value.trim(),
        primary: false,
        receivesMessages: entry.receivesMessages,
        smsCapability: entry.smsCapability,
        smsMode: "one_way" as const
      }));
    const additionalEmails = (newClient.additionalEmails ?? [])
      .filter((entry: ClientEmailDraft) => entry.value.trim())
      .map((entry: ClientEmailDraft) => ({ label: entry.label, value: entry.value.trim(), primary: false }));
    const allContactPhones = [
      ...(phoneValue ? [{
        label: newClient.phoneLabel,
        value: phoneValue,
        primary: true,
        receivesMessages: newClient.phoneReceivesMessages,
        smsCapability: newClient.smsCapability,
        smsMode: "one_way" as const
      }] : []),
      ...additionalPhones
    ];
    const allContactEmails = [
      ...(emailValue ? [{ label: newClient.emailLabel, value: emailValue, primary: true }] : []),
      ...additionalEmails
    ];
    const contact: CrmContact = {
      personName,
      ...(company ? { company } : {}),
      ...(newClient.role.trim() ? { role: newClient.role.trim() } : {}),
      correspondenceContact: true,
      billingContact: true,
      phones: allContactPhones,
      emails: allContactEmails,
      channelPreference: allContactEmails.length && newClient.phoneReceivesMessages ? "both" : newClient.phoneReceivesMessages ? "sms" : "email"
    };
    const propertyAddress = newClient.street1.trim() ? {
      street1: newClient.street1.trim(),
      ...(newClient.street2.trim() ? { street2: newClient.street2.trim() } : {}),
      city: newClient.city.trim(),
      province: newClient.province.trim(),
      postalCode: newClient.postalCode.trim(),
      country: "USA"
    } : undefined;
    const separateBillingAddress = newClient.billingStreet1.trim() ? {
      street1: newClient.billingStreet1.trim(),
      ...(newClient.billingStreet2.trim() ? { street2: newClient.billingStreet2.trim() } : {}),
      city: newClient.billingCity.trim(),
      province: newClient.billingProvince.trim(),
      postalCode: newClient.billingPostalCode.trim(),
      country: "USA"
    } : undefined;
    const billingAddress = newClient.billingSameAsPrimaryProperty ? propertyAddress : separateBillingAddress;
    const additionalContacts: CrmContact[] = [];
    if (newClient.additionalContactName.trim() || newClient.additionalContactPhone.trim() || newClient.additionalContactEmail.trim()) {
      additionalContacts.push({
        ...(newClient.additionalContactName.trim() ? { company: newClient.additionalContactName.trim() } : {}),
        role: newClient.additionalContactRole.trim() || "Additional contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.additionalContactPhone.trim() ? [{
          label: "Other", value: newClient.additionalContactPhone.trim(), primary: false,
          receivesMessages: false, smsCapability: "unknown", smsMode: "one_way"
        }] : [],
        emails: newClient.additionalContactEmail.trim() ? [{ label: "Other", value: newClient.additionalContactEmail.trim(), primary: false }] : [],
        channelPreference: "none"
      });
    }
    const clientCustomFields: Record<string, string | number | boolean> = {};
    if (newClient.leadSource.trim()) clientCustomFields.leadSource = newClient.leadSource.trim();
    if (newClient.paymentTerms.trim()) clientCustomFields.paymentTerms = newClient.paymentTerms.trim();
    if (newClient.referredBy.trim()) clientCustomFields.referredBy = newClient.referredBy.trim();
    if (newClient.promoCode.trim()) clientCustomFields.promoCode = newClient.promoCode.trim();
    clientCustomFields.askForReview = newClient.askForReview;
    Object.assign(clientCustomFields, customFieldDraftRowsToRecord(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS));
    const propertyCustomFields: Record<string, string | number | boolean> = {
      gatedEntry: newClient.propertyGatedEntry
    };
    if (newClient.propertyClientName.trim()) propertyCustomFields.propertyClientName = newClient.propertyClientName.trim();
    if (newClient.propertyClientPhone.trim()) propertyCustomFields.propertyClientPhone = newClient.propertyClientPhone.trim();
    if (newClient.propertyClientEmail.trim()) propertyCustomFields.propertyClientEmail = newClient.propertyClientEmail.trim();
    Object.assign(propertyCustomFields, customFieldDraftRowsToRecord(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS));
    const propertyContacts: CrmContact[] = [];
    if (newClient.propertyClientName.trim() || newClient.propertyClientPhone.trim() || newClient.propertyClientEmail.trim()) {
      propertyContacts.push({
        ...(newClient.propertyClientName.trim() ? { company: newClient.propertyClientName.trim() } : {}),
        role: "Property contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.propertyClientPhone.trim() ? [{
          label: "Other", value: newClient.propertyClientPhone.trim(), primary: true,
          receivesMessages: false, smsCapability: "unknown", smsMode: "one_way"
        }] : [],
        emails: newClient.propertyClientEmail.trim() ? [{ label: "Other", value: newClient.propertyClientEmail.trim(), primary: true }] : [],
        channelPreference: "none"
      });
    }
    try {
      const payload = {
        tenantId: options.tenantId,
        name: displayName,
        ...(company ? { company } : editing ? { company: null } : {}),
        personName,
        displayNamePreference: company ? newClient.displayNamePreference : "person",
        ...(billingAddress ? { billingAddress } : editing ? { billingAddress: null } : {}),
        billingSameAsPrimaryProperty: newClient.billingSameAsPrimaryProperty,
        contacts: [contact, ...additionalContacts],
        communicationSettings: {
          quotesAndInvoices: contact.channelPreference,
          jobReminders: contact.channelPreference,
          jobClosureFollowUps: "email" as const,
          reviewRequests: contact.channelPreference,
          smsDefaultMode: "one_way" as const
        },
        emails: allContactEmails.map((entry) => entry.value),
        phones: allContactPhones.map((entry) => entry.value),
        consent: {
          email: Boolean(emailValue),
          sms: newClient.phoneReceivesMessages,
          marketing: options.selectedClient?.consent.marketing ?? false
        },
        customFields: clientCustomFields,
        ...(propertyAddress ? {
          primaryProperty: {
            siteName: newClient.siteName.trim() || undefined,
            label: newClient.siteName.trim() || propertyAddress.street1,
            address: propertyAddress,
            ...(typeof newClient.propertyGeoLat === "number" && typeof newClient.propertyGeoLng === "number"
              ? { geo: { lat: newClient.propertyGeoLat, lng: newClient.propertyGeoLng } }
              : {}),
            billingAddressSameAsClient: newClient.billingSameAsPrimaryProperty,
            access: {
              gateCode: newClient.propertyGateCodes.trim() || undefined,
              accessNotes: newClient.propertyAccessNotes.trim() || (newClient.propertyGatedEntry ? "Gated entry enabled" : undefined)
            },
            contacts: propertyContacts,
            customFields: propertyCustomFields
          }
        } : {})
      };
      const body = await fetch(editing ? `/api/crm/clients/${encodeURIComponent(options.selectedClientId)}` : "/api/crm/clients", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setCreateStatus(body.error ?? (editing ? "Client could not be updated." : "Client could not be created."));
        return;
      }
      setCreateStatus(`${editing ? "Saved" : "Created"} ${clientDisplayName(body.client)}.`);
      setShowCreateClient(false);
      resetForm();
      await options.onRefresh();
      options.onSaved(body.client.id);
    } catch {
      setCreateStatus(editing ? "Client update request failed." : "Client create request failed.");
    }
  }

  return {
    showCreateClient,
    clientFormMode,
    createClientSurface,
    createStatus,
    newClient,
    setNewClient,
    createClientCanSave,
    createClientMissingFields,
    leadSourceOptions,
    openCreate,
    openEdit,
    closeDrawer,
    resetForm,
    submit
  };
}
