import { randomUUID } from "node:crypto";
import { addressFromIntakeFields, addressStorageKey, RailError, type Address, type ApprovalQueueService, type Client, type IntakeFieldDefinition, type IntakeFieldValue, type IntakeSnapshot, type Property, type Quote, type RequestForm, type ServiceRequest, type ServiceRequestMatch, type TenantUser } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../../../../../comms/gmailRegistry.js";
import type { PlatformRepository } from "../../../../../../../platform/repository.js";
import type { SiteLead } from "../../../../../../../sites/schemas.js";
import { requestTemplateVariables, resolveTemplateMessage } from "../../../../settings/components/tenantConfig/server/communicationTemplates.js";
import { materializeQuoteRecord } from "../../../../quotes/components/quoteEngine/domain/quoteFoundation.js";

export interface RequestAutomationDeps {
  approvalQueue?: ApprovalQueueService | undefined;
  commsRail?: CommsRail | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
  crmRepository?: Pick<NativeCrmRepository, "getCrmSettings"> | undefined;
}

export interface RequestFieldPatch {
  key: string;
  value?: string | number | boolean | string[] | undefined;
  visibility?: Partial<IntakeFieldValue["visibility"]> | undefined;
}

export interface RequestBuildInput {
  tenantId: string;
  source: ServiceRequest["source"];
  formId?: string | undefined;
  formSlug?: string | undefined;
  subject?: string | undefined;
  narrative?: string | undefined;
  selectedClientId?: string | undefined;
  selectedPropertyId?: string | undefined;
  consent?: { email?: boolean | undefined; sms?: boolean | undefined; marketing?: boolean | undefined } | undefined;
  allowIncomplete?: boolean | undefined;
  customFields?: Record<string, string | number | boolean> | undefined;
  fieldValues: Array<{
    key: string;
    value: string | number | boolean | string[];
    visibility?: Partial<IntakeFieldValue["visibility"]> | undefined;
  }>;
  sourceLeadId?: string | undefined;
}

const FULL_VISIBILITY: IntakeFieldValue["visibility"] = {
  request: true,
  quote: true,
  job: true,
  visit: true,
  invoice: true
};

export const REQUEST_FIELD_CATALOG: IntakeFieldDefinition[] = [
  { key: "client_name", label: "Client name", type: "text", group: "contact", required: true },
  { key: "email", label: "Email", type: "email", group: "contact" },
  { key: "phone", label: "Phone", type: "phone", group: "contact" },
  {
    key: "preferred_contact_method",
    label: "Preferred contact method",
    type: "select",
    group: "contact",
    options: ["email", "phone", "text"],
    helpText: "Lets the office reply the way the client expects."
  },
  {
    key: "marketing_consent",
    label: "Okay to use this job in marketing",
    type: "boolean",
    group: "contact",
    helpText: "Leave this off unless the client explicitly says their job photos and results can appear in public marketing."
  },
  { key: "property_street1", label: "Street address", type: "text", group: "property", required: true },
  { key: "property_street2", label: "Address line 2", type: "text", group: "property" },
  { key: "property_city", label: "City", type: "text", group: "property", required: true },
  { key: "property_province", label: "State", type: "text", group: "property", required: true },
  { key: "property_postal_code", label: "ZIP code", type: "text", group: "property", required: true },
  { key: "site_contact_name", label: "Site contact name", type: "text", group: "property", helpText: "Use this when the on-site contact differs from the billing client." },
  { key: "site_contact_phone", label: "Site contact phone", type: "phone", group: "property" },
  { key: "site_contact_email", label: "Site contact email", type: "email", group: "property" },
  {
    key: "pool_installation_type",
    label: "Pool style",
    type: "select",
    group: "pool",
    options: ["inground", "above_ground"]
  },
  {
    key: "pool_type",
    label: "Pool use",
    type: "select",
    group: "pool",
    options: ["residential", "commercial"],
    helpText: "Commercial examples: Community Pool, Public Pool, HOA, Apartment, Condo, Hotel."
  },
  {
    key: "pool_commercial_subtype",
    label: "Commercial subtype",
    type: "select",
    group: "pool",
    options: ["community_pool", "public_pool", "hoa", "apartment", "condo", "hotel", "other"]
  },
  {
    key: "pool_configuration",
    label: "Spa integration",
    type: "select",
    group: "pool",
    required: true,
    options: ["pool_only", "pool_and_spa", "spa_only"]
  },
  {
    key: "pool_construction_type",
    label: "Pool construction type",
    type: "select",
    group: "pool",
    options: ["vinyl_liner", "gunite", "fiberglass", "concrete", "plaster", "pebble", "tile", "other"]
  },
  {
    key: "water_loss_rate",
    label: "Approximate daily water loss",
    type: "select",
    group: "pool",
    options: ["less_than_1_inch", "1_to_2_inches", "2_to_4_inches", "more_than_4_inches", "unknown"],
    helpText: "Store the customer's estimate as a structured field from first intake."
  },
  {
    key: "gate_code",
    label: "Gate code",
    type: "text",
    group: "safety",
    helpText: "Field crews need this before arrival."
  },
  {
    key: "pet_present",
    label: "Pets on property",
    type: "boolean",
    group: "safety",
    prominent: true,
    helpText: "Prominent safety flag for field access."
  },
  {
    key: "pet_name",
    label: "Pet name",
    type: "text",
    group: "safety",
    prominent: true
  },
  {
    key: "job_title",
    label: "Job title",
    type: "text",
    group: "service",
    helpText: "Defaults to a practical service name such as Swimming Pool Leak Detection."
  },
  {
    key: "salesperson_user_id",
    label: "Salesperson / rep",
    type: "text",
    group: "service",
    helpText: "Office attribution only. The quote view can switch this to an internal-user picker."
  },
  {
    key: "referral_source",
    label: "How did you hear about us?",
    type: "text",
    group: "service",
    helpText: "This is the same underlying value later surfaced as Referred By on the quote rail."
  },
  {
    key: "promo_code",
    label: "Promo code",
    type: "text",
    group: "service"
  },
  {
    key: "issue_summary",
    label: "Primary issue",
    type: "textarea",
    group: "notes",
    required: true,
    helpText: "Original request narrative travels forward to quote, job, visit, and invoice."
  },
  {
    key: "additional_information",
    label: "Additional information",
    type: "textarea",
    group: "notes",
    helpText: "Long-form diagnostic notes stay intact instead of being squeezed into a short summary field."
  },
  {
    key: "request_images",
    label: "Request images",
    type: "multi_image",
    group: "notes",
    maxItems: 10,
    helpText: "Upload up to 10 intake photos so the office sees the same evidence before the first callback."
  }
];

const REQUEST_FIELD_MAP = new Map(REQUEST_FIELD_CATALOG.map((field) => [field.key, field]));

function now(): string {
  return new Date().toISOString();
}



export function requestFormSharePath(form: Pick<RequestForm, "tenantId" | "slug">): string {
  return `/request-forms/${encodeURIComponent(form.tenantId)}/${encodeURIComponent(form.slug)}`;
}

export function requestFormSubmitPath(form: Pick<RequestForm, "tenantId" | "slug">): string {
  return `/api/request-forms/${encodeURIComponent(form.tenantId)}/${encodeURIComponent(form.slug)}/submit`;
}

export function requestFormEmbedCode(form: Pick<RequestForm, "tenantId" | "slug">, origin: string): string {
  const src = `${origin}${requestFormSharePath(form)}`;
  return `<iframe src="${src}" title="NexOps request form" width="100%" height="980" style="border:0;border-radius:24px;overflow:hidden"></iframe>`;
}

export function defaultRequestForms(tenantId: string): RequestForm[] {
  const createdAt = now();
  return [
    {
      id: `request_form_${tenantId}_service_request`,
      tenantId,
      slug: "service-request",
      title: "Service request",
      intro: "Tell the office what the pool is doing, where the property sits, and any access or safety details the crew needs before arrival.",
      active: true,
      fieldDefinitions: selectRequestFields([
        "client_name",
        "email",
        "phone",
        "preferred_contact_method",
        "marketing_consent",
        "property_street1",
        "property_street2",
        "property_city",
        "property_province",
        "property_postal_code",
        "site_contact_name",
        "site_contact_phone",
        "site_contact_email",
        "pool_installation_type",
        "pool_type",
        "pool_commercial_subtype",
        "pool_configuration",
        "pool_construction_type",
        "water_loss_rate",
        "gate_code",
        "pet_present",
        "pet_name",
        "job_title",
        "referral_source",
        "promo_code",
        "issue_summary",
        "additional_information",
        "request_images"
      ]),
      createdAt,
      updatedAt: createdAt
    }
  ];
}

export async function ensureRequestForms(repository: NativeCrmRepository, tenantId: string): Promise<RequestForm[]> {
  const existing = await repository.listRequestForms(tenantId);
  if (existing.length) {
    return existing;
  }
  const seeded = defaultRequestForms(tenantId);
  for (const form of seeded) {
    await repository.upsertRequestForm(form);
  }
  return seeded;
}

export function selectRequestFields(fieldKeys: string[]): IntakeFieldDefinition[] {
  return fieldKeys.flatMap((key) => {
    const field = REQUEST_FIELD_MAP.get(key);
    return field ? [{ ...field }] : [];
  });
}

export function availableRequestFields(): IntakeFieldDefinition[] {
  return REQUEST_FIELD_CATALOG.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }));
}

function normalizeEmail(value?: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value?: string | undefined): string {
  return value?.replace(/\D+/g, "") ?? "";
}

function displayValue(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
}

function fieldVisibility(patch?: Partial<IntakeFieldValue["visibility"]> | undefined): IntakeFieldValue["visibility"] {
  return { ...FULL_VISIBILITY, ...(patch ?? {}) };
}

function coerceValue(field: IntakeFieldDefinition, raw: unknown): string | number | boolean | string[] | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (field.type === "multi_image") {
    const values = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (() => {
          const trimmed = raw.trim();
          if (!trimmed) {
            return [];
          }
          if (trimmed.startsWith("[")) {
            try {
              const parsed = JSON.parse(trimmed) as unknown;
              return Array.isArray(parsed) ? parsed : [trimmed];
            } catch {
              return [trimmed];
            }
          }
          return [trimmed];
        })()
        : [raw];
    const normalized = values
      .map((value) => String(value).trim())
      .filter(Boolean)
      .slice(0, field.maxItems ?? 10);
    return normalized.length ? normalized : null;
  }
  if (field.type === "boolean") {
    if (typeof raw === "boolean") {
      return raw;
    }
    const text = String(raw).trim().toLowerCase();
    return text === "true" || text === "on" || text === "yes" || text === "1";
  }
  if (field.type === "number") {
    const numeric = Number(String(raw).replace(/,/g, "").trim());
    return Number.isFinite(numeric) ? numeric : null;
  }
  const text = String(raw).trim();
  return text ? text : null;
}

function buildFieldIndex(fieldValues: IntakeFieldValue[]): IntakeSnapshot["fieldIndex"] {
  return Object.fromEntries(fieldValues.map((field) => [field.key, field.value]));
}

function valueAsString(fieldIndex: IntakeSnapshot["fieldIndex"], key: string): string {
  const value = fieldIndex[key];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function valueAsBoolean(fieldIndex: IntakeSnapshot["fieldIndex"], key: string): boolean {
  return fieldIndex[key] === true;
}

function valueAsStringArray(fieldIndex: IntakeSnapshot["fieldIndex"], key: string): string[] {
  const value = fieldIndex[key];
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
}

function propertyAddressFromFields(fieldIndex: IntakeSnapshot["fieldIndex"]): Address | undefined {
  return addressFromIntakeFields(fieldIndex);
}

function requestSubject(input: RequestBuildInput, fieldIndex: IntakeSnapshot["fieldIndex"]): string {
  const explicit = input.subject?.trim();
  if (explicit) {
    return explicit;
  }
  const jobTitle = valueAsString(fieldIndex, "job_title");
  if (jobTitle) {
    return jobTitle;
  }
  const clientName = valueAsString(fieldIndex, "client_name");
  const pool = valueAsString(fieldIndex, "pool_configuration");
  return clientName && pool ? `${clientName} - ${pool.replaceAll("_", " ")}` : clientName ? `${clientName} request` : "Service request";
}

function requestNarrative(input: RequestBuildInput, fieldIndex: IntakeSnapshot["fieldIndex"]): string {
  const explicit = input.narrative?.trim();
  if (explicit) {
    return explicit;
  }
  return [
    valueAsString(fieldIndex, "issue_summary"),
    valueAsString(fieldIndex, "additional_information")
  ].filter(Boolean).join("\n\n");
}

function clientSearchValues(client: Client): { emails: string[]; phones: string[] } {
  return {
    emails: [
      ...client.emails,
      ...(client.contacts ?? []).flatMap((contact) => contact.emails.map((email) => email.value))
    ].map(normalizeEmail).filter(Boolean),
    phones: [
      ...client.phones,
      ...(client.contacts ?? []).flatMap((contact) => contact.phones.map((phone) => phone.value))
    ].map(normalizePhone).filter(Boolean)
  };
}

function uniqueExactMatch<T extends { id: string }>(matches: T[]): T | null {
  if (matches.length !== 1) {
    return null;
  }
  return matches[0] ?? null;
}

export async function matchRequestToClient(repository: NativeCrmRepository, tenantId: string, email?: string, phone?: string): Promise<ServiceRequestMatch> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const clients = await repository.listClients(tenantId);
  if (normalizedEmail) {
    const emailMatches = clients.filter((client) => clientSearchValues(client).emails.includes(normalizedEmail));
    const emailMatch = uniqueExactMatch(emailMatches);
    if (emailMatch) {
      return {
        matchedClientId: emailMatch.id,
        matchedBy: "exact_email",
        matchedValue: normalizedEmail,
        reviewRequired: true
      };
    }
  }
  if (normalizedPhone) {
    const phoneMatches = clients.filter((client) => clientSearchValues(client).phones.includes(normalizedPhone));
    const phoneMatch = uniqueExactMatch(phoneMatches);
    if (phoneMatch) {
      return {
        matchedClientId: phoneMatch.id,
        matchedBy: "exact_phone",
        matchedValue: normalizedPhone,
        reviewRequired: true
      };
    }
  }
  return {
    matchedBy: "none",
    reviewRequired: true
  };
}

export function requestFieldValuesFromInput(input: RequestBuildInput): IntakeFieldValue[] {
  const built: IntakeFieldValue[] = [];
  for (const entry of input.fieldValues) {
    const field = REQUEST_FIELD_MAP.get(entry.key);
    if (!field) {
      continue;
    }
    const value = coerceValue(field, entry.value);
    if (value === null) {
      if (field.type === "boolean" && entry.value === false) {
        built.push({ ...field, value: false, visibility: fieldVisibility(entry.visibility) });
      }
      continue;
    }
    built.push({
      ...field,
      value,
      visibility: fieldVisibility(entry.visibility)
    });
  }
  return built;
}

function requestValidationMessage(input: RequestBuildInput, fieldIndex: IntakeSnapshot["fieldIndex"]): string | null {
  const clientName = valueAsString(fieldIndex, "client_name");
  const email = valueAsString(fieldIndex, "email");
  const phone = valueAsString(fieldIndex, "phone");
  const propertyStreet1 = valueAsString(fieldIndex, "property_street1");
  const propertyCity = valueAsString(fieldIndex, "property_city");
  const propertyProvince = valueAsString(fieldIndex, "property_province");
  const propertyPostalCode = valueAsString(fieldIndex, "property_postal_code");
  const narrative = requestNarrative(input, fieldIndex);
  if (!clientName) {
    return "Client name is required before saving the request.";
  }
  if (!narrative) {
    return "Issue summary is required before saving the request.";
  }
  if (!email && !phone && !input.selectedClientId) {
    return "Add an exact email or phone before saving, or link the request to an existing client.";
  }
  if (!input.selectedPropertyId && !input.allowIncomplete && (!propertyStreet1 || !propertyCity || !propertyProvince || !propertyPostalCode)) {
    return "I still need the full service address before I save this request.";
  }
  const poolConfiguration = valueAsString(fieldIndex, "pool_configuration");
  if (!poolConfiguration && !input.allowIncomplete) {
    return "I still need to know whether this is pool-only, pool plus spa, or spa-only before I save it.";
  }
  return null;
}

export async function buildServiceRequest(repository: NativeCrmRepository, input: RequestBuildInput): Promise<ServiceRequest> {
  const fieldValues = requestFieldValuesFromInput(input);
  const fieldIndex = buildFieldIndex(fieldValues);
  const validationError = requestValidationMessage(input, fieldIndex);
  if (validationError) {
    throw new RailError(validationError, { provider: "native", op: "buildRequest", status: 400 });
  }
  const match: ServiceRequestMatch = input.selectedClientId
    ? {
      matchedClientId: input.selectedClientId,
      ...(input.selectedPropertyId ? { matchedPropertyId: input.selectedPropertyId, matchedBy: "selected_existing_property" as const } : { matchedBy: "selected_existing_client" as const }),
      reviewRequired: false
    }
    : await matchRequestToClient(repository, input.tenantId, valueAsString(fieldIndex, "email"), valueAsString(fieldIndex, "phone"));
  const timestamp = now();
  const narrative = requestNarrative(input, fieldIndex);
  return {
    id: `request_${randomUUID()}`,
    tenantId: input.tenantId,
    number: await repository.reserveDocumentNumber(input.tenantId, "request"),
    ...(input.formId ? { formId: input.formId } : {}),
    ...(input.formSlug ? { formSlug: input.formSlug } : {}),
    source: input.source,
    status: "new",
    subject: requestSubject(input, fieldIndex),
    clientName: valueAsString(fieldIndex, "client_name"),
    ...(valueAsString(fieldIndex, "email") ? { email: valueAsString(fieldIndex, "email") } : {}),
    ...(valueAsString(fieldIndex, "phone") ? { phone: valueAsString(fieldIndex, "phone") } : {}),
    ...(propertyAddressFromFields(fieldIndex) ? { propertyAddress: propertyAddressFromFields(fieldIndex) } : {}),
    narrative,
    consent: {
      email: input.consent?.email ?? true,
      sms: input.consent?.sms ?? false,
      marketing: input.consent?.marketing ?? valueAsBoolean(fieldIndex, "marketing_consent")
    },
    intake: {
      narrative,
      fieldValues,
      fieldIndex
    },
    ...(input.customFields ? { customFields: input.customFields } : {}),
    match,
    ...(input.selectedClientId ? { selectedClientId: input.selectedClientId } : {}),
    ...(input.selectedPropertyId ? { selectedPropertyId: input.selectedPropertyId } : {}),
    ...(input.sourceLeadId ? { sourceLeadId: input.sourceLeadId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function mergeFieldValues(existing: IntakeFieldValue[], patches: RequestFieldPatch[]): IntakeFieldValue[] {
  const byKey = new Map(existing.map((field) => [field.key, field]));
  for (const patch of patches) {
    const current = byKey.get(patch.key);
    if (!current) {
      continue;
    }
    byKey.set(patch.key, {
      ...current,
      ...(patch.value !== undefined ? { value: patch.value } : {}),
      visibility: patch.visibility ? { ...current.visibility, ...patch.visibility } : current.visibility
    });
  }
  return [...byKey.values()];
}

function mergeUniqueStringValues(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...existing, ...incoming]
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      merged.push(value);
    });
  return merged;
}

function upsertRequestImageFieldValues(request: ServiceRequest, mediaIds: string[]): ServiceRequest {
  if (!mediaIds.length) {
    return request;
  }
  const mergedIds = mergeUniqueStringValues(valueAsStringArray(request.intake.fieldIndex, "request_images"), mediaIds);
  const fieldDefinition = REQUEST_FIELD_MAP.get("request_images");
  if (!fieldDefinition) {
    return request;
  }
  const existingField = request.intake.fieldValues.find((field) => field.key === "request_images");
  const fieldValues = existingField
    ? request.intake.fieldValues.map((field) => field.key === "request_images" ? { ...field, value: mergedIds } : field)
    : [
        ...request.intake.fieldValues,
        {
          ...fieldDefinition,
          value: mergedIds,
          visibility: FULL_VISIBILITY
        }
      ];
  const fieldIndex = buildFieldIndex(fieldValues);
  const narrative = valueAsString(fieldIndex, "issue_summary") || request.narrative;
  return {
    ...request,
    intake: {
      narrative,
      fieldValues,
      fieldIndex
    },
    narrative,
    updatedAt: now()
  };
}

export function updateServiceRequestShape(
  request: ServiceRequest,
  patch: {
    subject?: string | undefined;
    narrative?: string | undefined;
    selectedClientId?: string | undefined;
    selectedPropertyId?: string | undefined;
    reviewedAt?: string | undefined;
    fieldPatches?: RequestFieldPatch[] | undefined;
    customFields?: Record<string, string | number | boolean> | undefined;
  }
): ServiceRequest {
  const fieldValues = patch.fieldPatches ? mergeFieldValues(request.intake.fieldValues, patch.fieldPatches) : request.intake.fieldValues;
  const fieldIndex = buildFieldIndex(fieldValues);
  const narrative = patch.narrative?.trim() || valueAsString(fieldIndex, "issue_summary") || request.narrative;
  return {
    ...request,
    ...(patch.subject?.trim() ? { subject: patch.subject.trim() } : {}),
    narrative,
    ...(fieldValues.length ? { intake: { narrative, fieldValues, fieldIndex } } : {}),
    clientName: valueAsString(fieldIndex, "client_name") || request.clientName,
    email: valueAsString(fieldIndex, "email") || request.email,
    phone: valueAsString(fieldIndex, "phone") || request.phone,
    propertyAddress: propertyAddressFromFields(fieldIndex) ?? request.propertyAddress,
    ...(patch.selectedClientId !== undefined ? { selectedClientId: patch.selectedClientId || undefined } : {}),
    ...(patch.selectedPropertyId !== undefined ? { selectedPropertyId: patch.selectedPropertyId || undefined } : {}),
    ...(patch.reviewedAt ? { reviewedAt: patch.reviewedAt } : {}),
    ...(patch.customFields !== undefined ? { customFields: patch.customFields } : {}),
    match: {
      ...request.match,
      ...(patch.reviewedAt ? { reviewRequired: false } : {})
    },
    updatedAt: now()
  };
}

function propertyAddressKey(address: Address): string {
  return addressStorageKey(address);
}

async function resolveExistingClient(repository: NativeCrmRepository, request: ServiceRequest): Promise<Client | null> {
  const clientId = request.selectedClientId ?? request.match.matchedClientId;
  if (!clientId) {
    return null;
  }
  return (await repository.listClients(request.tenantId)).find((client) => client.id === clientId) ?? null;
}

async function resolveExistingProperty(repository: NativeCrmRepository, request: ServiceRequest, clientId: string): Promise<Property | null> {
  if (request.selectedPropertyId) {
    return (await repository.listProperties(request.tenantId)).find((property) => property.id === request.selectedPropertyId && property.clientId === clientId) ?? null;
  }
  if (!request.propertyAddress) {
    return null;
  }
  const properties = await repository.listProperties(request.tenantId);
  const key = propertyAddressKey(request.propertyAddress);
  return properties.find((property) => property.clientId === clientId && propertyAddressKey(property.address) === key) ?? null;
}

function propertyCustomFieldIndex(request: ServiceRequest): Record<string, string | number | boolean> {
  const ignored = new Set([
    "client_name",
    "email",
    "phone",
    "preferred_contact_method",
    "property_street1",
    "property_street2",
    "property_city",
    "property_province",
    "property_postal_code",
    "site_contact_name",
    "site_contact_phone",
    "site_contact_email",
    "job_title",
    "salesperson_user_id",
    "referral_source",
    "promo_code",
    "request_images",
    "issue_summary",
    "additional_information"
  ]);
  return Object.fromEntries(
    Object.entries(request.intake.fieldIndex)
      .filter(([key, value]) => !ignored.has(key) && !Array.isArray(value))
      .map(([key, value]) => [key, value as string | number | boolean])
  );
}

function clientCustomFieldIndex(request: ServiceRequest): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = {
    requestSource: request.source
  };
  const referralSource = valueAsString(request.intake.fieldIndex, "referral_source");
  const promoCode = valueAsString(request.intake.fieldIndex, "promo_code");
  if (referralSource) {
    next.referralSource = referralSource;
  }
  if (promoCode) {
    next.promoCode = promoCode;
  }
  return next;
}

function propertyContactsFromRequest(
  request: ServiceRequest,
  options: { mirrorPrimaryIfBlank: boolean }
): NonNullable<Property["contacts"]> | undefined {
  const name = valueAsString(request.intake.fieldIndex, "site_contact_name");
  const phone = valueAsString(request.intake.fieldIndex, "site_contact_phone");
  const email = valueAsString(request.intake.fieldIndex, "site_contact_email");
  const fallbackName = options.mirrorPrimaryIfBlank ? valueAsString(request.intake.fieldIndex, "client_name") : "";
  const fallbackPhone = options.mirrorPrimaryIfBlank ? valueAsString(request.intake.fieldIndex, "phone") : "";
  const fallbackEmail = options.mirrorPrimaryIfBlank ? valueAsString(request.intake.fieldIndex, "email") : "";
  const finalName = name || fallbackName;
  const finalPhone = phone || fallbackPhone;
  const finalEmail = email || fallbackEmail;
  if (!finalName && !finalPhone && !finalEmail) {
    return undefined;
  }
  const [firstName, ...lastNameParts] = finalName.split(/\s+/).filter(Boolean);
  return [{
    id: `property_contact_${randomUUID()}`,
    personName: finalName ? {
      ...(firstName ? { firstName } : {}),
      ...(lastNameParts.length ? { lastName: lastNameParts.join(" ") } : {})
    } : undefined,
    role: "Site contact",
    billingContact: false,
    correspondenceContact: false,
    phones: finalPhone ? [{
      value: finalPhone,
      label: "Main",
      primary: true,
      receivesMessages: false,
      smsCapability: "unknown",
      smsMode: "one_way"
    }] : [],
    emails: finalEmail ? [{ value: finalEmail, label: "Main", primary: true }] : [],
    channelPreference: finalPhone && finalEmail ? "both" : finalPhone ? "sms" : "email"
  }];
}

async function materializeRequestClient(repository: NativeCrmRepository, request: ServiceRequest): Promise<{ client: Client; property?: Property | undefined }> {
  const existingClient = await resolveExistingClient(repository, request);
  if (existingClient) {
    const existingProperty = await resolveExistingProperty(repository, request, existingClient.id);
    if (existingProperty) {
      const contacts = propertyContactsFromRequest(request, { mirrorPrimaryIfBlank: false });
      const gateCode = valueAsString(request.intake.fieldIndex, "gate_code");
      const nextProperty = contacts || gateCode || Object.keys(propertyCustomFieldIndex(request)).length
        ? await repository.upsertProperty({
          ...existingProperty,
          access: gateCode
            ? { ...(existingProperty.access ?? {}), gateCode }
            : existingProperty.access,
          contacts: contacts ?? existingProperty.contacts,
          customFields: {
            ...(existingProperty.customFields ?? {}),
            ...propertyCustomFieldIndex(request)
          }
        })
        : existingProperty;
      return { client: existingClient, property: nextProperty };
    }
    if (request.propertyAddress) {
      const property = await repository.upsertProperty({
        id: `property_${randomUUID()}`,
        tenantId: request.tenantId,
        clientId: existingClient.id,
        address: request.propertyAddress,
        access: valueAsString(request.intake.fieldIndex, "gate_code")
          ? { gateCode: valueAsString(request.intake.fieldIndex, "gate_code") }
          : undefined,
        contacts: propertyContactsFromRequest(request, { mirrorPrimaryIfBlank: false }),
        assets: [],
        customFields: propertyCustomFieldIndex(request)
      });
      return { client: existingClient, property };
    }
    return { client: existingClient };
  }

  const client = await repository.createClient({
    id: `client_${randomUUID()}`,
    tenantId: request.tenantId,
    name: request.clientName,
    emails: request.email ? [request.email] : [],
    phones: request.phone ? [request.phone] : [],
    tags: ["request"],
    consent: request.consent,
    customFields: clientCustomFieldIndex(request)
  });

  if (!request.propertyAddress) {
    return { client };
  }

  const property = await repository.upsertProperty({
    id: `property_${randomUUID()}`,
    tenantId: request.tenantId,
    clientId: client.id,
    address: request.propertyAddress,
    access: valueAsString(request.intake.fieldIndex, "gate_code")
      ? { gateCode: valueAsString(request.intake.fieldIndex, "gate_code") }
      : undefined,
    contacts: propertyContactsFromRequest(request, { mirrorPrimaryIfBlank: true }),
    assets: [],
    customFields: propertyCustomFieldIndex(request)
  });
  return { client, property };
}

export async function materializeRequestCaptureContext(
  repository: NativeCrmRepository,
  request: ServiceRequest,
  mediaIds: string[]
): Promise<{ request: ServiceRequest; client: Client; property?: Property | undefined }> {
  const requestWithMedia = upsertRequestImageFieldValues(request, mediaIds);
  const materialized = await materializeRequestClient(repository, requestWithMedia);
  const persisted = await repository.updateRequest(request.id, {
    tenantId: request.tenantId,
    intake: requestWithMedia.intake,
    narrative: requestWithMedia.narrative,
    clientName: requestWithMedia.clientName,
    email: requestWithMedia.email,
    phone: requestWithMedia.phone,
    propertyAddress: requestWithMedia.propertyAddress,
    selectedClientId: materialized.client.id,
    selectedPropertyId: materialized.property?.id,
    updatedAt: now()
  });
  return {
    request: persisted,
    client: materialized.client,
    property: materialized.property
  };
}

export async function convertRequestToQuote(repository: NativeCrmRepository, request: ServiceRequest): Promise<{ quote: Quote; request: ServiceRequest; property?: Property | undefined }> {
  const materialized = await materializeRequestClient(repository, request);
  const jobTitle = valueAsString(request.intake.fieldIndex, "job_title") || request.subject;
  const salespersonUserId = valueAsString(request.intake.fieldIndex, "salesperson_user_id") || undefined;
  const draft = await materializeQuoteRecord(repository, {
    tenantId: request.tenantId,
    clientId: materialized.client.id,
    requestId: request.id,
    title: jobTitle,
    ...(salespersonUserId ? { salespersonUserId } : {}),
    items: [],
    intake: request.intake
  });
  const quote = await repository.createQuote(draft);
  const updatedRequest = await repository.updateRequest(request.id, {
    tenantId: request.tenantId,
    status: "converted_to_quote",
    convertedQuoteId: quote.id,
    selectedClientId: materialized.client.id,
    selectedPropertyId: materialized.property?.id,
    updatedAt: now()
  });
  return { quote, request: updatedRequest, property: materialized.property };
}

export async function convertRequestToJob(repository: NativeCrmRepository, request: ServiceRequest): Promise<{ job: NonNullable<Awaited<ReturnType<NativeCrmRepository["upsertJob"]>>>; request: ServiceRequest; property?: Property | undefined }> {
  const materialized = await materializeRequestClient(repository, request);
  const timestamp = now();
  const jobTitle = valueAsString(request.intake.fieldIndex, "job_title") || request.subject;
  const job = await repository.upsertJob({
    id: `job_${randomUUID()}`,
    tenantId: request.tenantId,
    number: await repository.reserveDocumentNumber(request.tenantId, "job"),
    clientId: materialized.client.id,
    ...(materialized.property ? { propertyId: materialized.property.id } : {}),
    requestId: request.id,
    status: "Unscheduled",
    title: jobTitle,
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 },
    intake: request.intake,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  const updatedRequest = await repository.updateRequest(request.id, {
    tenantId: request.tenantId,
    status: "converted_to_job",
    convertedJobId: job.id,
    selectedClientId: materialized.client.id,
    selectedPropertyId: materialized.property?.id,
    updatedAt: now()
  });
  return { job, request: updatedRequest, property: materialized.property };
}

function notificationRecipients(users: TenantUser[], operatorEmail?: string | undefined): string[] {
  return [...new Set(
    users
      .filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN"))
      .flatMap((user) => user.email ? [user.email] : [])
      .concat(operatorEmail ? [operatorEmail] : [])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}

async function queueEmail(input: {
  tenantId: string;
  to: string[];
  subject: string;
  bodyText: string;
  approvalQueue?: ApprovalQueueService | undefined;
  commsRail?: CommsRail | undefined;
}): Promise<{ approvalId?: string | undefined; sentAt?: string | undefined }> {
  if (!input.approvalQueue || !input.to.length || !input.commsRail?.sendAdapter) {
    return {};
  }
  const created = await input.approvalQueue.create({
    tenantId: input.tenantId,
    kind: "email",
    preview: {
      title: input.subject,
      body: input.bodyText
    },
    execute: {
      service: "comms",
      op: "sendEmail",
      args: {
        mailbox: input.commsRail.sendAdapter.mailbox,
        outbound: {
          tenantId: input.tenantId,
          mailbox: input.commsRail.sendAdapter.mailbox,
          to: input.to,
          subject: input.subject,
          bodyText: input.bodyText
        }
      }
    },
    createdBy: "system"
  });
  await input.approvalQueue.approve(input.tenantId, created.id);
  await input.approvalQueue.executeApproved(input.tenantId, created.id);
  return { approvalId: created.id, sentAt: now() };
}

export async function notifyRequestCreated(
  request: ServiceRequest,
  automation: RequestAutomationDeps
): Promise<ServiceRequest> {
  const settings = automation.crmRepository ? await automation.crmRepository.getCrmSettings(request.tenantId) : undefined;
  const requestVariables = requestTemplateVariables(request);
  const users = automation.platformRepository ? await automation.platformRepository.listTenantUsers(request.tenantId) : [];
  const adminRecipients = notificationRecipients(users, automation.commsRail?.operatorEmail);
  const matchLabel = request.match.matchedBy === "none"
    ? "No exact email or phone match found. Manual review is required."
    : `Exact match hit on ${request.match.matchedBy.replace("exact_", "").replaceAll("_", " ")}. Manual review is still required before downstream action.`;
  const adminSend = await queueEmail({
    tenantId: request.tenantId,
    to: adminRecipients,
    subject: `New request: ${request.clientName}`,
    bodyText: [
      `Client: ${request.clientName}`,
      request.email ? `Email: ${request.email}` : "",
      request.phone ? `Phone: ${request.phone}` : "",
      request.propertyAddress ? `Address: ${request.propertyAddress.street1}, ${request.propertyAddress.city}, ${request.propertyAddress.province} ${request.propertyAddress.postalCode}` : "",
      `Request: ${request.narrative}`,
      matchLabel
    ].filter(Boolean).join("\n")
  });
  const requestConfirmation = resolveTemplateMessage({
    settings,
    category: "request_confirmation",
    channel: "email",
    fallbackSubject: "We received your request",
    fallbackBodyText: [
      "We received your request and the office is reviewing it now.",
      "",
      `Request for: ${request.clientName}`,
      `Summary: ${request.narrative || "Service request received."}`
    ].join("\n"),
    variables: requestVariables
  });
  const clientSend = request.email
    ? requestConfirmation.enabled
      ? await queueEmail({
        tenantId: request.tenantId,
        to: [request.email],
        subject: requestConfirmation.subject,
        bodyText: requestConfirmation.bodyText
      })
      : {}
    : {};
  if (!adminSend.sentAt && !clientSend.sentAt) {
    return request;
  }
  return {
    ...request,
    notifications: {
      ...(request.notifications ?? {}),
      ...(adminSend.sentAt ? { adminNotifiedAt: adminSend.sentAt } : {}),
      ...(clientSend.sentAt ? { clientConfirmationAt: clientSend.sentAt } : {})
    }
  };
}

export function createRequestFromLead(repository: NativeCrmRepository, lead: SiteLead): Promise<ServiceRequest> {
  return buildServiceRequest(repository, {
    tenantId: lead.tenantId,
    source: "legacy_lead_backfill",
    formSlug: lead.slug,
    subject: `${lead.name} request`,
    narrative: lead.message,
    consent: lead.consent,
    sourceLeadId: lead.id,
    allowIncomplete: true,
    fieldValues: [
      { key: "client_name", value: lead.name },
      ...(lead.email ? [{ key: "email", value: lead.email }] : []),
      ...(lead.phone ? [{ key: "phone", value: lead.phone }] : []),
      ...(lead.city ? [{ key: "property_city", value: lead.city }] : []),
      { key: "issue_summary", value: lead.message }
    ]
  });
}

export async function backfillLegacyLeads(input: {
  repository: NativeCrmRepository;
  leads: SiteLead[];
  automation: RequestAutomationDeps;
}): Promise<{ created: ServiceRequest[]; skippedLeadIds: string[] }> {
  const tenantId = input.leads[0]?.tenantId;
  if (!tenantId) {
    return { created: [], skippedLeadIds: [] };
  }
  const existing = await input.repository.listRequests(tenantId);
  const existingLeadIds = new Set(existing.map((request) => request.sourceLeadId).filter(Boolean));
  const created: ServiceRequest[] = [];
  const skippedLeadIds: string[] = [];
  for (const lead of input.leads) {
    if (existingLeadIds.has(lead.id)) {
      skippedLeadIds.push(lead.id);
      continue;
    }
    const built = await createRequestFromLead(input.repository, lead);
    const saved = await input.repository.createRequest(built);
    const notified = await notifyRequestCreated(saved, input.automation);
    if (notified !== saved) {
      await input.repository.updateRequest(saved.id, { tenantId: saved.tenantId, notifications: notified.notifications, updatedAt: notified.updatedAt });
    }
    created.push(notified);
  }
  return { created, skippedLeadIds };
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldInput(field: IntakeFieldDefinition): string {
  const name = htmlEscape(field.key);
  const label = htmlEscape(field.label);
  const help = field.helpText ? `<small>${htmlEscape(field.helpText)}</small>` : "";
  if (field.type === "textarea") {
    return `<label class="request-form-field"><span>${label}${field.required ? " *" : ""}</span><textarea name="${name}" rows="4"${field.required ? " required" : ""}></textarea>${help}</label>`;
  }
  if (field.type === "select") {
    const options = (field.options ?? []).map((option) => `<option value="${htmlEscape(option)}">${htmlEscape(option.replaceAll("_", " "))}</option>`).join("");
    return `<label class="request-form-field"><span>${label}${field.required ? " *" : ""}</span><select name="${name}"${field.required ? " required" : ""}><option value="">Select one</option>${options}</select>${help}</label>`;
  }
  if (field.type === "boolean") {
    return `<label class="request-form-check${field.prominent ? " prominent" : ""}"><input type="checkbox" name="${name}" value="true" /><span>${label}</span>${help}</label>`;
  }
  if (field.type === "multi_image") {
    const maxItems = field.maxItems ?? 10;
    return `<label class="request-form-field request-form-upload${field.prominent ? " prominent" : ""}" data-upload-field="${name}" data-max-items="${maxItems}"><span>${label}${field.required ? " *" : ""}</span><input type="file" accept="image/*" multiple data-upload-input /><input type="hidden" name="${name}" value="[]" /><small data-upload-status>0 of ${maxItems} uploaded</small><div class="request-form-upload-list" data-upload-list></div>${help}</label>`;
  }
  const type = field.type === "email" || field.type === "number" ? field.type : "text";
  return `<label class="request-form-field${field.prominent ? " prominent" : ""}"><span>${label}${field.required ? " *" : ""}</span><input type="${type}" name="${name}"${field.required ? " required" : ""} />${help}</label>`;
}

export function renderPublicRequestForm(form: RequestForm): string {
  const inputs = form.fieldDefinitions.map(fieldInput).join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(form.title)}</title>
    <style>
      :root { color-scheme: light; font-family: Montserrat, Arial, sans-serif; }
      body { margin: 0; background: linear-gradient(180deg, #f5f7f1, #ffffff); color: #0c1118; }
      main { max-width: 760px; margin: 0 auto; padding: 32px 16px 48px; }
      .card { border: 1px solid rgba(12, 17, 24, 0.12); border-radius: 28px; background: #ffffff; box-shadow: 0 24px 70px rgba(12, 17, 24, 0.08); padding: 24px; }
      h1 { margin: 0; font-size: clamp(2rem, 7vw, 3rem); }
      p { line-height: 1.5; }
      form { display: grid; gap: 14px; margin-top: 20px; }
      .request-form-field, .request-form-check { display: grid; gap: 8px; }
      .request-form-field span, .request-form-check span { font-weight: 700; }
      .request-form-field input, .request-form-field select, .request-form-field textarea {
        border: 1px solid rgba(12, 17, 24, 0.16);
        border-radius: 16px;
        padding: 13px 14px;
        font: inherit;
      }
      .request-form-field.prominent, .request-form-check.prominent {
        border: 1px solid rgba(37, 210, 56, 0.35);
        border-radius: 18px;
        padding: 14px;
        background: rgba(37, 210, 56, 0.08);
      }
      .request-form-check { grid-template-columns: auto 1fr; align-items: start; }
      .request-form-check small { grid-column: 2; }
      .request-form-upload-list { display: grid; gap: 6px; }
      .request-form-upload-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: rgba(12, 17, 24, 0.06); font-size: 0.92rem; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 14px 18px;
        font: inherit;
        font-weight: 800;
        background: linear-gradient(135deg, #d4ff20 0%, #25d238 100%);
        color: #0c1118;
        cursor: pointer;
      }
      small { color: rgba(12, 17, 24, 0.68); }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <p>Request intake</p>
        <h1>${htmlEscape(form.title)}</h1>
        <p>${htmlEscape(form.intro ?? "Send the office the job details the first time so nothing gets dropped on transfer.")}</p>
        <form method="post" action="${requestFormSubmitPath(form)}" data-tenant-id="${htmlEscape(form.tenantId)}">
          ${inputs}
          <button type="submit">Send request</button>
        </form>
      </section>
    </main>
    <script>
      const form = document.querySelector("form[data-tenant-id]");
      if (form) {
        const toBase64 = (file) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || "");
            const parts = result.split(",", 2);
            resolve(parts.length === 2 ? parts[1] : result);
          };
          reader.onerror = () => reject(reader.error || new Error("File read failed."));
          reader.readAsDataURL(file);
        });
        const updateUploadList = (field, count) => {
          const status = field.querySelector("[data-upload-status]");
          if (status) {
            status.textContent = count + " of " + field.dataset.maxItems + " uploaded";
          }
          const list = field.querySelector("[data-upload-list]");
          if (!list) {
            return;
          }
          list.innerHTML = "";
          for (let index = 0; index < count; index += 1) {
            const pill = document.createElement("div");
            pill.className = "request-form-upload-pill";
            pill.textContent = "Image " + (index + 1) + " queued";
            list.appendChild(pill);
          }
        };
        form.querySelectorAll("[data-upload-field]").forEach((field) => {
          const input = field.querySelector("[data-upload-input]");
          const hidden = field.querySelector('input[type="hidden"]');
          if (!input || !hidden) {
            return;
          }
          updateUploadList(field, 0);
          input.addEventListener("change", async () => {
            const files = Array.from(input.files || []);
            const maxItems = Number(field.dataset.maxItems || 10);
            let uploaded = [];
            try {
              uploaded = JSON.parse(hidden.value || "[]");
            } catch {
              uploaded = [];
            }
            const remaining = Math.max(0, maxItems - uploaded.length);
            const nextFiles = files.slice(0, remaining);
            for (const file of nextFiles) {
              const status = field.querySelector("[data-upload-status]");
              if (status) {
                status.textContent = "Uploading " + (uploaded.length + 1) + " of " + maxItems + "...";
              }
              const fileBase64 = await toBase64(file);
              const response = await fetch("/api/fielddocs/uploads", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  tenantId: form.dataset.tenantId,
                  filename: file.name,
                  mime: file.type || "image/jpeg",
                  fileBase64,
                  tags: ["request-intake"]
                })
              });
              const body = await response.json();
              if (!body.ok || !body.media || !body.media.id) {
                throw new Error(body.error || "Image upload failed.");
              }
              uploaded.push(body.media.id);
              hidden.value = JSON.stringify(uploaded);
              updateUploadList(field, uploaded.length);
            }
            input.value = "";
          });
        });
      }
    </script>
  </body>
</html>`;
}

export function publicFormSubmissionValues(form: RequestForm, body: Record<string, unknown>): RequestBuildInput["fieldValues"] {
  return form.fieldDefinitions.flatMap((field) => {
    const value = coerceValue(field, body[field.key]);
    if (value === null) {
      if (field.type === "boolean") {
        return [{ key: field.key, value: false }];
      }
      return [];
    }
    return [{ key: field.key, value }];
  });
}

export function summarizeRequestField(field: IntakeFieldValue): string {
  return `${field.label}: ${displayValue(field.value)}`;
}
