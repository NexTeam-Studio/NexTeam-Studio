import React from "react";
import { formatAddress } from "@nexteam/shared";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  PROPERTY_CUSTOM_FIELD_RESERVED_LABELS,
  customFieldRecordToDraftRows,
  draftNameFieldsFromClientRecord,
  type CustomFieldDraftRow
} from "../clients/components/contact/domain/clientProfile";
import type { NexOpsModule } from "./domain/nexopsNavigation";
import type { Source, SmsCapability, CrmPhone, CrmEmail, ClientPhoneDraft, ClientEmailDraft, CrmContact, CrmIntakeSnapshot, CrmClient, CrmProperty } from "./contracts/workspaceContracts";

export function mediaUrl(source: Source, tenantId?: string): string {
  const base = `/api/media/${encodeURIComponent(source.ref)}`;
  return source.rail === "native" && tenantId ? `${base}?tenantId=${encodeURIComponent(tenantId)}` : base;
}



export function sourceIsPhoto(source: Source): boolean {
  const label = source.label.toLowerCase();
  if (/\b(pdf|document|report)\b/.test(label)) {
    return false;
  }
  return source.rail === "native" && /\b(photo|media|before|after|upload)/.test(label);
}

export function formatPhoneActionLabel(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `Call (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `Call (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `Call ${phone}`;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}







export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const encoded = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}







export function personDisplayName(person?: { firstName?: string; lastName?: string }): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
}

export function clientDisplayName(client: CrmClient): string {
  const personName = personDisplayName(client.personName);
  if (client.company && client.displayNamePreference !== "person") {
    return client.company;
  }
  return personName || client.name;
}

export function clientContactDisplayName(client: CrmClient, primaryContact?: CrmContact): string {
  const companyDisplay = Boolean(client.company && client.displayNamePreference !== "person");
  if (!companyDisplay) {
    return "";
  }
  const primaryPerson = personDisplayName(primaryContact?.personName);
  const clientPerson = personDisplayName(client.personName);
  const fallback = primaryPerson || clientPerson || primaryContact?.company || "";
  if (!fallback) {
    return "";
  }
  return fallback.trim().toLowerCase() === clientDisplayName(client).trim().toLowerCase() ? "" : fallback;
}

export function clientPrimaryAddress(client: CrmClient): string {
  const billingAddress = formatAddress(client.billingAddress);
  if (billingAddress) {
    return billingAddress;
  }
  return client.billingSameAsPrimaryProperty === false ? "Separate billing address" : "No address on native record yet";
}

export function clientStatusLabel(client: CrmClient): string {
  return client.tags?.some((tag) => tag.toLowerCase() === "lead") ? "Lead" : "Active";
}

export function intakeSurfaceSummary(intake: CrmIntakeSnapshot | undefined, surface: "quote" | "job" | "invoice"): string {
  if (!intake) {
    return "";
  }
  const summary = intake.fieldValues
    .filter((field) => field.visibility[surface] && (field.prominent || ["pool_configuration", "pool_type", "gate_code", "water_loss_rate", "pet_name", "pet_present"].includes(field.key)))
    .slice(0, 3)
    .map((field) => `${field.label}: ${typeof field.value === "boolean" ? (field.value ? "Yes" : "No") : String(field.value).replaceAll("_", " ")}`);
  return summary.join(" · ");
}





export function contactSummary(client: CrmClient): string {
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  const name = personDisplayName(primaryContact?.personName) || primaryContact?.company || personDisplayName(client.personName);
  const email = primaryContact?.emails?.find((entry) => entry.primary)?.value ?? primaryContact?.emails?.[0]?.value ?? client.emails[0];
  const phone = primaryContact?.phones?.find((entry) => entry.primary)?.value ?? primaryContact?.phones?.[0]?.value ?? client.phones[0];
  return [name, email, phone].filter(Boolean).join(" / ") || "No contact details yet";
}

export function clientHasTextReadyContact(client: CrmClient): boolean {
  const contact = client.contacts?.find((entry) => entry.correspondenceContact) ?? client.contacts?.[0];
  const phone = contact?.phones?.find((entry) => entry.receivesMessages) ?? contact?.phones?.[0];
  return Boolean(phone?.receivesMessages && phone.smsCapability === "mobile");
}



export function NexOpsNavGlyph(props: { module: NexOpsModule }): React.ReactElement {
  switch (props.module) {
    case "home":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M3.5 8.2 10 3.5l6.5 4.7v7.3a1 1 0 0 1-1 1h-3.7v-4.5H8.2v4.5H4.5a1 1 0 0 1-1-1V8.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "clients":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6.3 9.2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM13.8 10.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6ZM2.8 16.2c.5-2.2 2.3-3.5 4.8-3.5 2.5 0 4.3 1.3 4.8 3.5M11.3 16.2c.4-1.5 1.6-2.5 3.5-2.5 1 0 1.8.2 2.4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "requests":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6 4.5h8.4a1.1 1.1 0 0 1 1.1 1.1v9.5a1.1 1.1 0 0 1-1.1 1.1H5.6a1.1 1.1 0 0 1-1.1-1.1V5.6A1.1 1.1 0 0 1 5.6 4.5H6Zm0 0V3.3m4 1.2V3.3m-3.8 4h7.4M6.2 10h7.6M6.2 12.8H11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "quotes":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.4 3.8h6.8l3 3v9.4a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12.2 3.8v3h3M6.8 10.3h6.4M6.8 13h4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "schedule":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M4.8 5.1h10.4a1.2 1.2 0 0 1 1.2 1.2v8.5a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2V6.3a1.2 1.2 0 0 1 1.2-1.2Zm0 0V3.4m10.4 1.7V3.4m-11.6 5h12.8M7 11.2h2.2v2.2H7z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "jobs":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="m7.3 5.2 2.8 2.8-5.4 5.4H2v-2.7l5.3-5.5Zm0 0 1.9-1.9a1.4 1.4 0 0 1 2 0l1.4 1.4a1.4 1.4 0 0 1 0 2l-1.9 1.9M11.7 12.5h4.9M10.5 15.8h6.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "invoices":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5 3.6h10a1 1 0 0 1 1 1v11.1l-2-1-2 1-2-1-2 1-2-1-2 1V4.6a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7 7.3h6M7 10.1h6M7 12.9h3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "payments":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <rect x="2.8" y="5.2" width="14.4" height="9.6" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M2.8 8.2h14.4M6.2 11.8h2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "imports":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6.2 6.4h8.3m0 0-2-2m2 2-2 2M13.8 13.6H5.5m0 0 2 2m-2-2 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3.2" y="3.2" width="13.6" height="13.6" rx="2.3" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        </svg>
      );
    case "approvals":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 3.5 15.5 6v4.2c0 3-2 5.8-5.5 7.2-3.5-1.4-5.5-4.2-5.5-7.2V6L10 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="m7.5 10.2 1.6 1.6 3.4-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 5.9a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 0V3.5m0 13v-2.4m4.1-6.5 1.7-1.7m-11.6 11.6 1.7-1.7m0-8.2L4.2 5.9m11.6 11.6-1.7-1.7M16.5 10h-2.4m-8.2 0H3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "capture":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M4.4 6.2h2l1-1.4h5.2l1 1.4h2a1.4 1.4 0 0 1 1.4 1.4v6.2a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 13.8V7.6a1.4 1.4 0 0 1 1.4-1.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="10" cy="10.7" r="2.7" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "patterns":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}

export function MobileClientSummaryGlyph(props: { kind: "phone" | "email" | "directions" }): React.ReactElement {
  switch (props.kind) {
    case "phone":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.4 3.9h2.4l1.1 2.8-1.5 1.5a11.8 11.8 0 0 0 4.4 4.4l1.5-1.5 2.8 1.1v2.4a1.6 1.6 0 0 1-1.6 1.6A10.6 10.6 0 0 1 3.8 5.5 1.6 1.6 0 0 1 5.4 3.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "email":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <rect x="3.2" y="4.6" width="13.6" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="m4.6 6.2 5.4 4.3 5.4-4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "directions":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 16.8s4.7-4.7 4.7-8.1A4.7 4.7 0 1 0 5.3 8.7c0 3.4 4.7 8.1 4.7 8.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="10" cy="8.7" r="1.8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function MobileClientEditGlyph(): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="m5.2 14.8 1-3.3 6.5-6.5a1.7 1.7 0 0 1 2.4 0l.9.9a1.7 1.7 0 0 1 0 2.4l-6.5 6.5-3.3 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m10.8 6.8 2.4 2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function parseCsvPreview(text: string): { rows: number; columns: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0] ?? "";
  return {
    rows: Math.max(0, lines.length - 1),
    columns: header ? header.split(",").map((column) => column.trim()).filter(Boolean) : []
  };
}

export function blankNewClientDraft() {
  return {
    title: "No title",
    firstName: "",
    lastName: "",
    company: "",
    role: "",
    displayNamePreference: "person" as "person" | "company",
    phone: "",
    phoneLabel: "Main" as CrmPhone["label"],
    phoneReceivesMessages: false,
    smsCapability: "unknown" as SmsCapability,
    additionalPhones: [] as ClientPhoneDraft[],
    email: "",
    emailLabel: "Main" as CrmEmail["label"],
    additionalEmails: [] as ClientEmailDraft[],
    paymentTerms: "",
    askForReview: true,
    referredBy: "",
    promoCode: "",
    clientCustomFieldName: "",
    clientCustomFieldValue: "",
    clientCustomFieldsDraft: [] as CustomFieldDraftRow[],
    additionalContactName: "",
    additionalContactRole: "",
    additionalContactPhone: "",
    additionalContactEmail: "",
    siteName: "",
    street1: "",
    street2: "",
    city: "",
    province: "",
    postalCode: "",
    country: "US",
    propertyGeoLat: undefined as number | undefined,
    propertyGeoLng: undefined as number | undefined,
    billingSameAsPrimaryProperty: true,
    billingStreet1: "",
    billingStreet2: "",
    billingCity: "",
    billingProvince: "",
    billingPostalCode: "",
    leadSource: "",
    propertyGatedEntry: false,
    propertyGateCodes: "",
    propertyClientName: "",
    propertyClientPhone: "",
    propertyClientEmail: "",
    propertyAccessNotes: "",
    propertyCustomFieldName: "",
    propertyCustomFieldValue: "",
    propertyCustomFieldsDraft: [] as CustomFieldDraftRow[]
  };
}

export type NexOpsClientDraft = ReturnType<typeof blankNewClientDraft>;

export function draftPhoneFromRecord(phone: CrmPhone, index: number): ClientPhoneDraft {
  return {
    id: `phone_edit_${index}_${Math.random().toString(36).slice(2, 8)}`,
    label: phone.label ?? "Other",
    value: phone.value,
    receivesMessages: phone.receivesMessages === true,
    smsCapability: phone.smsCapability ?? "unknown"
  };
}

export function draftEmailFromRecord(email: CrmEmail, index: number): ClientEmailDraft {
  return {
    id: `email_edit_${index}_${Math.random().toString(36).slice(2, 8)}`,
    label: email.label ?? "Other",
    value: email.value
  };
}

export function normalizeDraftCountry(country?: string): string {
  if (!country) {
    return "US";
  }
  return country.toUpperCase() === "USA" ? "US" : country;
}

export function draftFromExistingClient(client: CrmClient, property: CrmProperty | null): ReturnType<typeof blankNewClientDraft> {
  const draft = blankNewClientDraft();
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  const draftPersonName = draftNameFieldsFromClientRecord({
    clientName: client.name,
    company: client.company,
    displayNamePreference: client.displayNamePreference,
    personFirstName: client.personName?.firstName,
    personLastName: client.personName?.lastName,
    contactFirstName: primaryContact?.personName?.firstName,
    contactLastName: primaryContact?.personName?.lastName
  });
  const otherContacts = (client.contacts ?? []).filter((contact) => contact !== primaryContact);
  const primaryPhones = primaryContact?.phones?.length ? primaryContact.phones : client.phones.map((value) => ({
    label: "Main" as CrmPhone["label"],
    value,
    primary: false,
    receivesMessages: false,
    smsCapability: "unknown" as SmsCapability
  }));
  const mainPhone = primaryPhones.find((phone) => phone.primary) ?? primaryPhones[0];
  const extraPhones = primaryPhones.filter((phone) => phone !== mainPhone);
  const primaryEmails = primaryContact?.emails?.length ? primaryContact.emails : client.emails.map((value) => ({
    label: "Main" as CrmEmail["label"],
    value,
    primary: false
  }));
  const mainEmail = primaryEmails.find((email) => email.primary) ?? primaryEmails[0];
  const extraEmails = primaryEmails.filter((email) => email !== mainEmail);
  const additionalContact = otherContacts[0];
  const propertyContact = property?.contacts?.[0];
  const billingAddress = client.billingAddress;
  const propertyAddress = property?.address;

  return {
    ...draft,
    title: client.personName?.title ?? "No title",
    firstName: draftPersonName.firstName,
    lastName: draftPersonName.lastName,
    company: client.company ?? "",
    role: primaryContact?.role ?? "",
    displayNamePreference: client.displayNamePreference ?? (client.company ? "company" : "person"),
    phone: mainPhone?.value ?? "",
    phoneLabel: mainPhone?.label ?? "Main",
    phoneReceivesMessages: mainPhone?.receivesMessages === true,
    smsCapability: mainPhone?.smsCapability ?? "unknown",
    additionalPhones: extraPhones.map(draftPhoneFromRecord),
    email: mainEmail?.value ?? "",
    emailLabel: mainEmail?.label ?? "Main",
    additionalEmails: extraEmails.map(draftEmailFromRecord),
    paymentTerms: typeof client.customFields?.paymentTerms === "string" ? client.customFields.paymentTerms : "",
    askForReview: client.customFields?.askForReview === false ? false : true,
    referredBy: typeof client.customFields?.referredBy === "string" ? client.customFields.referredBy : "",
    promoCode: typeof client.customFields?.promoCode === "string" ? client.customFields.promoCode : "",
    clientCustomFieldsDraft: customFieldRecordToDraftRows(client.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_edit"),
    additionalContactName: personDisplayName(additionalContact?.personName) || additionalContact?.company || "",
    additionalContactRole: additionalContact?.role ?? "",
    additionalContactPhone: additionalContact?.phones?.[0]?.value ?? "",
    additionalContactEmail: additionalContact?.emails?.[0]?.value ?? "",
    siteName: property?.siteName ?? property?.label ?? "",
    street1: propertyAddress?.street1 ?? billingAddress?.street1 ?? "",
    street2: propertyAddress?.street2 ?? billingAddress?.street2 ?? "",
    city: propertyAddress?.city ?? billingAddress?.city ?? "",
    province: propertyAddress?.province ?? billingAddress?.province ?? "",
    postalCode: propertyAddress?.postalCode ?? billingAddress?.postalCode ?? "",
    country: normalizeDraftCountry(propertyAddress?.country ?? billingAddress?.country),
    billingSameAsPrimaryProperty: client.billingSameAsPrimaryProperty !== false,
    billingStreet1: client.billingSameAsPrimaryProperty === false ? (billingAddress?.street1 ?? "") : "",
    billingStreet2: client.billingSameAsPrimaryProperty === false ? (billingAddress?.street2 ?? "") : "",
    billingCity: client.billingSameAsPrimaryProperty === false ? (billingAddress?.city ?? "") : "",
    billingProvince: client.billingSameAsPrimaryProperty === false ? (billingAddress?.province ?? "") : "",
    billingPostalCode: client.billingSameAsPrimaryProperty === false ? (billingAddress?.postalCode ?? "") : "",
    leadSource: typeof client.customFields?.leadSource === "string" ? client.customFields.leadSource : "",
    propertyGatedEntry: property?.customFields?.gatedEntry === true,
    propertyGateCodes: property?.access?.gateCode ?? "",
    propertyClientName: String(property?.customFields?.propertyClientName ?? propertyContact?.company ?? personDisplayName(propertyContact?.personName) ?? ""),
    propertyClientPhone: String(property?.customFields?.propertyClientPhone ?? propertyContact?.phones?.[0]?.value ?? ""),
    propertyClientEmail: String(property?.customFields?.propertyClientEmail ?? propertyContact?.emails?.[0]?.value ?? ""),
    propertyAccessNotes: property?.access?.accessNotes ?? "",
    propertyCustomFieldsDraft: customFieldRecordToDraftRows(property?.customFields, PROPERTY_CUSTOM_FIELD_RESERVED_LABELS, "property_edit")
  };
}

export const MOBILE_CLIENT_VIEWPORT_MAX = 860;

