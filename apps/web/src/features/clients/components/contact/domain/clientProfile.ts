import type { ClientProfileTab } from "../../../../nexopsShell/domain/nexopsNavigation";

export type ClientProfileMobileBucket = "client" | "work" | "notes" | "files";

export interface CustomFieldDraftRow {
  id: string;
  label: string;
  value: string;
}

export interface VisibleCustomField {
  key: string;
  label: string;
  value: string;
}

export const DEFAULT_LEAD_SOURCE_OPTIONS = [
  "Google",
  "Facebook",
  "Instagram",
  "Referral",
  "Existing Client",
  "Flyer / Door Hanger",
  "Vehicle Wrap / Yard Sign",
  "Website",
  "Advertisement / Campaign",
  "Other"
];

export const LEAD_SOURCE_ADD_NEW_OPTION = "+ Add New";

export const CLIENT_CUSTOM_FIELD_RESERVED_LABELS = [
  "leadSource",
  "paymentTerms",
  "askForReview",
  "referredBy",
  "promoCode"
];

/**
 * A source-neutral classification for records brought forward from an older
 * system. It is metadata, not a workflow status: imported clients remain
 * usable for new NexOps work.
 */
export const IMPORTED_HISTORY_CLASSIFICATION = "imported_history";

export function isImportedHistoryRecord(input: {
  customFields?: Record<string, string | number | boolean>;
}): boolean {
  return input.customFields?.recordClassification === IMPORTED_HISTORY_CLASSIFICATION;
}

export const PROPERTY_CUSTOM_FIELD_RESERVED_LABELS = [
  "gatedEntry",
  "propertyClientName",
  "propertyClientPhone",
  "propertyClientEmail",
  "gateCode",
  "accessNotes",
  "companycamProject"
];

export const CLIENT_PROFILE_MOBILE_BUCKET_LABELS: Record<ClientProfileMobileBucket, string> = {
  client: "Client",
  work: "Work",
  notes: "Notes",
  files: "Files"
};

export function createCustomFieldDraftRow(prefix = "cf"): CustomFieldDraftRow {
  return {
    id: `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
    label: "",
    value: ""
  };
}

function normalizeCustomFieldLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateCustomFieldDraftRows(rows: CustomFieldDraftRow[], reservedLabels: string[] = []): {
  duplicateLabels: string[];
  reservedConflicts: string[];
  hasBlockingIssues: boolean;
} {
  const seen = new Set<string>();
  const duplicateLabels = new Set<string>();
  const reserved = new Set(reservedLabels.map(normalizeCustomFieldLabel));
  const reservedConflicts = new Set<string>();
  for (const row of rows) {
    const normalized = normalizeCustomFieldLabel(row.label);
    if (!normalized) {
      continue;
    }
    if (reserved.has(normalized)) {
      reservedConflicts.add(row.label.trim());
    }
    if (seen.has(normalized)) {
      duplicateLabels.add(row.label.trim());
      continue;
    }
    seen.add(normalized);
  }
  return {
    duplicateLabels: [...duplicateLabels],
    reservedConflicts: [...reservedConflicts],
    hasBlockingIssues: duplicateLabels.size > 0 || reservedConflicts.size > 0
  };
}

export function customFieldDraftRowsToRecord(rows: CustomFieldDraftRow[], reservedLabels: string[] = []): Record<string, string> {
  const record: Record<string, string> = {};
  const reserved = new Set(reservedLabels.map(normalizeCustomFieldLabel));
  for (const row of rows) {
    const normalized = normalizeCustomFieldLabel(row.label);
    const value = row.value.trim();
    if (!normalized || !value || reserved.has(normalized) || record[normalized]) {
      continue;
    }
    record[row.label.trim()] = value;
  }
  return record;
}

export function buildLeadSourceOptions(_clients: Array<{ customFields?: Record<string, string | number | boolean> }> = []): string[] {
  return [...DEFAULT_LEAD_SOURCE_OPTIONS];
}

export function draftNameFieldsFromClientRecord(input: {
  clientName?: string;
  company?: string;
  displayNamePreference?: "person" | "company";
  personFirstName?: string;
  personLastName?: string;
  contactFirstName?: string;
  contactLastName?: string;
}): { firstName: string; lastName: string } {
  const firstName = input.personFirstName?.trim() || input.contactFirstName?.trim() || "";
  const lastName = input.personLastName?.trim() || input.contactLastName?.trim() || "";
  if (firstName || lastName) {
    return { firstName, lastName };
  }
  const clientName = input.clientName?.trim() || "";
  if (!clientName) {
    return { firstName: "", lastName: "" };
  }
  const company = input.company?.trim() || "";
  if (
    company
    && input.displayNamePreference !== "person"
    && company.toLowerCase() === clientName.toLowerCase()
  ) {
    return { firstName: "", lastName: "" };
  }
  const [derivedFirstName = "", ...derivedLastName] = clientName.split(/\s+/);
  return {
    firstName: derivedFirstName,
    lastName: derivedLastName.join(" ")
  };
}

export function primaryClientPhoneValue(input: {
  contactPhones?: Array<{ value: string; primary?: boolean }>;
  clientPhones?: string[];
}): string {
  return input.contactPhones?.find((phone) => phone.primary)?.value
    ?? input.contactPhones?.[0]?.value
    ?? input.clientPhones?.[0]
    ?? "";
}

export function mobileBucketForClientTab(tab: ClientProfileTab | null | undefined): ClientProfileMobileBucket {
  switch (tab) {
    case "requests":
    case "quotes":
    case "jobs":
    case "invoices":
    case "payments":
      return "work";
    case "notes":
    case "nexreach":
    case "portal":
      return "notes";
    case "nexdocs":
    case "nexcam":
      return "files";
    case "overview":
    case "properties":
    case "contacts":
    default:
      return "client";
  }
}

export function mobileTabsForBucket(bucket: ClientProfileMobileBucket): ClientProfileTab[] {
  switch (bucket) {
    case "work":
      return ["requests", "quotes", "jobs", "invoices", "payments"];
    case "notes":
      return ["notes", "nexreach", "portal"];
    case "files":
      return ["nexdocs", "nexcam"];
    case "client":
    default:
      return ["overview", "properties", "contacts"];
  }
}

export function humanizeCustomFieldLabel(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function visibleCustomFields(
  fields: Record<string, string | number | boolean> | undefined,
  reservedLabels: string[] = []
): VisibleCustomField[] {
  if (!fields) {
    return [];
  }
  const reserved = new Set(reservedLabels.map(normalizeCustomFieldLabel));
  return Object.entries(fields)
    .filter(([key, value]) => {
      if (reserved.has(normalizeCustomFieldLabel(key))) {
        return false;
      }
      if (key.toLowerCase().includes("companycam")) {
        return false;
      }
      if (value === "" || value === null || value === undefined) {
        return false;
      }
      return true;
    })
    .map(([key, value]) => ({
      key,
      label: humanizeCustomFieldLabel(key),
      value: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
    }));
}

export function customFieldRecordToDraftRows(
  fields: Record<string, string | number | boolean> | undefined,
  reservedLabels: string[] = [],
  prefix = "cf"
): CustomFieldDraftRow[] {
  if (!fields) {
    return [];
  }
  const reserved = new Set(reservedLabels.map(normalizeCustomFieldLabel));
  return Object.entries(fields)
    .filter(([key, value]) => {
      if (reserved.has(normalizeCustomFieldLabel(key))) {
        return false;
      }
      if (key.toLowerCase().includes("companycam")) {
        return false;
      }
      if (value === "" || value === null || value === undefined) {
        return false;
      }
      return true;
    })
    .map(([key, value], index) => ({
      id: `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      label: key,
      value: String(value)
    }));
}
