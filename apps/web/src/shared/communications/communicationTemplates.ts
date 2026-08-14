import { formatAddress, type AddressLike } from "@nexteam/shared";

export interface CommunicationTemplateRecord {
  id: string;
  tenantId: string;
  category: string;
  label: string;
  description?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailSubject?: string;
  emailBody?: string;
  smsBody?: string;
  createdAt: string;
  updatedAt: string;
}

export type CommunicationDeliveryChannel = "email" | "sms";

export interface CommunicationDeliveryAvailabilityInput {
  channel: CommunicationDeliveryChannel;
  email?: string | undefined;
  phone?: string | undefined;
  templateEnabled?: boolean | undefined;
  smsProviderConfigured?: boolean | undefined;
  smsConsent?: boolean | undefined;
}

export interface CommunicationDeliveryAvailability {
  channel: CommunicationDeliveryChannel;
  available: boolean;
  reason?: string | undefined;
  recipient: string;
}

export interface CommunicationSendPreview {
  channel: CommunicationDeliveryChannel;
  available: boolean;
  unavailableReason?: string | undefined;
  recipient: string;
  subject: string;
  bodyText: string;
}

interface ClientLike {
  id: string;
  name: string;
  emails?: string[];
  phones?: string[];
  billingAddress?: AddressLike;
}

interface QuoteLike {
  id: string;
  tenantId: string;
  number?: string;
  title: string;
  totals: { total: number };
  approvedAt?: string;
  deposit?: { amount: number } | undefined;
  intake?: {
    fieldIndex: Record<string, string | number | boolean | string[]>;
  } | undefined;
}

interface InvoiceLike {
  id: string;
  tenantId: string;
  number?: string;
  clientId: string;
  title: string;
  totals: { total: number };
  ledger?: { balanceDue: number } | undefined;
  intake?: {
    fieldIndex: Record<string, string | number | boolean | string[]>;
  } | undefined;
}

interface JobLike {
  id: string;
  tenantId: string;
  title: string;
  number?: string;
  intake?: {
    fieldIndex: Record<string, string | number | boolean | string[]>;
  } | undefined;
}

interface VisitLike {
  id: string;
  start: string;
  end: string;
}

function clean(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

/**
 * Resolves whether a channel may be offered to an operator. This is deliberately
 * a client-safe availability contract, not a send authorization: a later action
 * must still perform server-side tenant, approval, and provider checks.
 */
export function resolveCommunicationDeliveryAvailability(
  input: CommunicationDeliveryAvailabilityInput
): CommunicationDeliveryAvailability {
  const email = clean(input.email);
  const phone = clean(input.phone);
  const recipient = input.channel === "email" ? email : phone;

  if (input.templateEnabled === false) {
    return {
      channel: input.channel,
      available: false,
      recipient,
      reason: `${input.channel === "email" ? "Email" : "SMS"} is disabled for this message type.`
    };
  }

  if (!recipient) {
    return {
      channel: input.channel,
      available: false,
      recipient,
      reason: input.channel === "email" ? "This client does not have an email address." : "This client does not have a mobile number."
    };
  }

  if (input.channel === "sms") {
    // SMS is deliberately future-only in this phase. Client-side capability,
    // consent, and provider flags can inform a later server-authorized rail,
    // but they must never enable an operator send affordance by themselves.
    return {
      channel: input.channel,
      available: false,
      recipient,
      reason: "SMS delivery is not available for this tenant yet."
    };
  }

  return { channel: input.channel, available: true, recipient };
}

/**
 * Produces the exact operator-facing preview model without dispatching a
 * communication. UI surfaces can use this for the confirmation step before a
 * separately authorized server-side send.
 */
export function buildCommunicationSendPreview(input: {
  channel: CommunicationDeliveryChannel;
  subject?: string | undefined;
  bodyText: string;
  availability: CommunicationDeliveryAvailability;
}): CommunicationSendPreview {
  const channelMatchesAvailability = input.channel === input.availability.channel;
  return {
    channel: input.channel,
    available: channelMatchesAvailability && input.availability.available,
    unavailableReason: channelMatchesAvailability
      ? input.availability.reason
      : "The selected delivery channel does not match this preview.",
    recipient: input.availability.recipient,
    subject: input.channel === "email" ? clean(input.subject) : "",
    bodyText: input.bodyText
  };
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function titleCaseTenant(tenantId: string): string {
  return tenantId
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function intakeAddress(snapshot?: { fieldIndex: Record<string, string | number | boolean | string[]> } | undefined): string {
  const street = typeof snapshot?.fieldIndex.property_street1 === "string" ? snapshot.fieldIndex.property_street1 : "";
  const city = typeof snapshot?.fieldIndex.property_city === "string" ? snapshot.fieldIndex.property_city : "";
  const province = typeof snapshot?.fieldIndex.property_province === "string" ? snapshot.fieldIndex.property_province : "";
  const postal = typeof snapshot?.fieldIndex.property_postal_code === "string" ? snapshot.fieldIndex.property_postal_code : "";
  return [street, [city, province, postal].filter(Boolean).join(", ")].filter(Boolean).join(", ");
}

function addressLine(address?: AddressLike | undefined): string {
  return formatAddress(address);
}

function visitWindowLabel(visit: VisitLike): string {
  const start = new Date(visit.start);
  const end = new Date(visit.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${visit.start} - ${visit.end}`;
  }
  return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function dateLabel(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function renderTemplateText(template: string | undefined, variables: Record<string, string>): string {
  return (template ?? "").replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, rawKey: string) => variables[rawKey] ?? "");
}

export function communicationTemplateFor(templates: CommunicationTemplateRecord[], category: string): CommunicationTemplateRecord | undefined {
  return templates.find((template) => template.category === category);
}

export function resolveTemplateDraft(input: {
  templates: CommunicationTemplateRecord[];
  category: string;
  channel: "email" | "sms";
  fallbackSubject: string;
  fallbackBodyText: string;
  variables: Record<string, string>;
}): { enabled: boolean; subject: string; bodyText: string } {
  const template = communicationTemplateFor(input.templates, input.category);
  const enabled = input.channel === "email" ? (template?.emailEnabled ?? true) : (template?.smsEnabled ?? true);
  const subjectSource = input.channel === "email"
    ? clean(template?.emailSubject) || input.fallbackSubject
    : input.fallbackSubject;
  const bodySource = input.channel === "email"
    ? clean(template?.emailBody) || input.fallbackBodyText
    : clean(template?.smsBody) || input.fallbackBodyText;
  return {
    enabled,
    subject: renderTemplateText(subjectSource, input.variables),
    bodyText: renderTemplateText(bodySource, input.variables)
  };
}

export function quoteTemplateVariables(input: {
  quote: QuoteLike;
  client?: ClientLike | undefined;
  portalUrl?: string | undefined;
}): Record<string, string> {
  return {
    TENANT_NAME: titleCaseTenant(input.quote.tenantId),
    CLIENT_NAME: input.client?.name ?? input.quote.id,
    CLIENT_EMAIL: clean(input.client?.emails?.[0]),
    CLIENT_PHONE: clean(input.client?.phones?.[0]),
    QUOTE_NUMBER: input.quote.number ?? input.quote.id,
    QUOTE_TITLE: input.quote.title,
    QUOTE_TOTAL: money(input.quote.totals.total),
    PORTAL_URL: clean(input.portalUrl),
    QUOTE_URL: clean(input.portalUrl),
    SERVICE_ADDRESS: intakeAddress(input.quote.intake) || addressLine(input.client?.billingAddress),
    APPROVED_AT: dateLabel(input.quote.approvedAt),
    DEPOSIT_AMOUNT: money(input.quote.deposit?.amount ?? 0)
  };
}

export function invoiceTemplateVariables(input: {
  invoice: InvoiceLike;
  client?: ClientLike | undefined;
  portalUrl?: string | undefined;
  paymentAmount?: number | undefined;
}): Record<string, string> {
  return {
    TENANT_NAME: titleCaseTenant(input.invoice.tenantId),
    CLIENT_NAME: input.client?.name ?? input.invoice.clientId,
    CLIENT_EMAIL: clean(input.client?.emails?.[0]),
    CLIENT_PHONE: clean(input.client?.phones?.[0]),
    INVOICE_NUMBER: input.invoice.number ?? input.invoice.id,
    INVOICE_TITLE: input.invoice.title,
    BALANCE_DUE: money(input.invoice.ledger?.balanceDue ?? input.invoice.totals.total),
    PAYMENT_AMOUNT: money(input.paymentAmount ?? 0),
    PAY_LINK: clean(input.portalUrl),
    PORTAL_URL: clean(input.portalUrl),
    SERVICE_ADDRESS: intakeAddress(input.invoice.intake) || addressLine(input.client?.billingAddress)
  };
}

export function bookingTemplateVariables(input: {
  job: JobLike;
  visit: VisitLike;
  client?: ClientLike | undefined;
  propertyAddress?: string | undefined;
  technicianLabel: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
}): Record<string, string> {
  const gateCode = typeof input.job.intake?.fieldIndex.gate_code === "string" ? input.job.intake.fieldIndex.gate_code : "";
  const petPresent = input.job.intake?.fieldIndex.pet_present === true;
  const petName = typeof input.job.intake?.fieldIndex.pet_name === "string" ? input.job.intake.fieldIndex.pet_name : "";
  const accessNote = [gateCode ? `Gate code: ${gateCode}` : "", petPresent ? (petName ? `Pets on property (${petName})` : "Pets on property") : ""].filter(Boolean).join(" | ");
  return {
    TENANT_NAME: titleCaseTenant(input.job.tenantId),
    CLIENT_NAME: input.client?.name ?? input.job.id,
    CLIENT_EMAIL: clean(input.client?.emails?.[0]),
    CLIENT_PHONE: clean(input.client?.phones?.[0]),
    JOB_TITLE: input.job.title,
    JOB_NUMBER: input.job.number ?? input.job.id,
    JOB_DATE: dateLabel(input.visit.start),
    VISIT_WINDOW: visitWindowLabel(input.visit),
    SERVICE_ADDRESS: clean(input.propertyAddress),
    ARRIVAL_WINDOW: visitWindowLabel(input.visit),
    TECHNICIAN_NAME: input.technicianLabel,
    GATE_CODE: gateCode,
    ACCESS_NOTE: accessNote,
    GOOGLE_CALENDAR_URL: input.googleCalendarUrl,
    OUTLOOK_CALENDAR_URL: input.outlookCalendarUrl
  };
}
