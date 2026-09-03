import type {
  Client,
  CrmSettings,
  Invoice,
  Job,
  Property,
  Quote,
  ServiceRequest
} from "@nexteam/core";
import { defaultCommunicationTemplates } from "@nexteam/providers";
import type { ScheduledVisit } from "../../../../../../../scheduling/schedulingEngine.js";

export type CommunicationCategory =
  | "request_confirmation"
  | "new_request_internal_alert"
  | "quote_send"
  | "quote_approval_confirmation"
  | "deposit_paid_confirmation"
  | "booking_confirmation"
  | "invoice_send"
  | "invoice_reminder"
  | "payment_receipt"
  | "statement_send"
  | "customer_document_package"
  | "declining_work"
  | "assessment_reminder"
  | "checklist_copy"
  | "job_booking_confirmation"
  | "visit_rescheduled"
  | "visit_reminder"
  | "job_checklist_copy"
  | "job_follow_up"
  | "payment_method_request"
  | "signed_document_copy"
  | "review_request_initial"
  | "review_request_nudge";

export type CommunicationChannel = "email" | "sms";

/**
 * Clients created from current NexOps intake store the person's name in the
 * structured `personName` value. Older records may only have `name`, so all
 * customer-facing templates must resolve both representations.
 */
export function clientDisplayName(client: Client | undefined, fallback = ""): string {
  if (!client) return fallback;
  const person = [client.personName?.firstName, client.personName?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return person || client.name || fallback;
}

interface TemplateRecord {
  category: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailSubject?: string | undefined;
  emailBody?: string | undefined;
  smsBody?: string | undefined;
}

export const COMMUNICATION_TEMPLATE_CATEGORIES: readonly CommunicationCategory[] = [
  "request_confirmation", "new_request_internal_alert", "booking_confirmation", "declining_work", "assessment_reminder", "checklist_copy",
  "quote_send", "quote_approval_confirmation", "job_booking_confirmation", "visit_rescheduled", "visit_reminder",
  "job_checklist_copy", "job_follow_up", "invoice_send", "invoice_reminder", "payment_receipt",
  "deposit_paid_confirmation", "statement_send", "payment_method_request", "signed_document_copy",
  "review_request_initial", "review_request_nudge", "customer_document_package"
] as const;

type StoredTemplate = CrmSettings["communicationTemplates"][number];

function templateContent(template: TemplateRecord): Pick<TemplateRecord, "emailEnabled" | "smsEnabled" | "emailSubject" | "emailBody" | "smsBody"> {
  return {
    emailEnabled: template.emailEnabled,
    smsEnabled: template.smsEnabled,
    ...(template.emailSubject ? { emailSubject: template.emailSubject } : {}),
    ...(template.emailBody ? { emailBody: template.emailBody } : {}),
    ...(template.smsBody ? { smsBody: template.smsBody } : {})
  };
}

/**
 * Keeps the tenant's customized copy but makes the complete first-class
 * template catalog available to every tenant. Seed-time records are replaced
 * wholesale so newly added channels and bodies become defaults; later edits
 * retain the tenant's deliberate channel and copy choices.
 */
export function normalizeCommunicationTemplates(settings: Pick<CrmSettings, "tenantId" | "communicationTemplates">): StoredTemplate[] {
  const defaults = defaultCommunicationTemplates(settings.tenantId) as StoredTemplate[];
  const byCategory = new Map(settings.communicationTemplates.map((template) => [template.category, template]));
  return defaults.map((fallback) => {
    const existing = byCategory.get(fallback.category);
    if (!existing || existing.updatedAt === "2026-07-12T00:00:00.000Z") return fallback;
    return {
      ...fallback,
      ...existing,
      ...templateContent(existing),
      emailSubject: existing.emailSubject?.trim() || fallback.emailSubject,
      emailBody: existing.emailBody?.trim() || fallback.emailBody,
      smsBody: existing.smsBody?.trim() || fallback.smsBody
    };
  });
}

export function defaultCommunicationTemplate(tenantId: string, category: string): StoredTemplate | undefined {
  return (defaultCommunicationTemplates(tenantId) as StoredTemplate[]).find((template) => template.category === category);
}

export function communicationTemplateMatchesDefault(template: TemplateRecord, fallback: TemplateRecord | undefined): boolean {
  if (!fallback) return false;
  const current = templateContent(template);
  const baseline = templateContent(fallback);
  return current.emailEnabled === baseline.emailEnabled
    && current.smsEnabled === baseline.smsEnabled
    && current.emailSubject === baseline.emailSubject
    && current.emailBody === baseline.emailBody
    && current.smsBody === baseline.smsBody;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function clean(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

function titleCaseTenant(tenantId: string): string {
  return tenantId
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function addressFromRequest(request?: ServiceRequest | undefined): string {
  const address = request?.propertyAddress;
  if (!address) {
    return "";
  }
  return [
    address.street1,
    address.street2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

function addressFromProperty(property?: Property | undefined): string {
  const address = property?.address;
  if (!address) {
    return "";
  }
  return [
    property?.siteName || property?.label || "",
    address.street1,
    address.street2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

function addressFromQuote(quote: Quote, client?: Client | undefined): string {
  const intakeAddress = quote.intake?.fieldIndex?.property_street1;
  const intakeCity = quote.intake?.fieldIndex?.property_city;
  const intakeProvince = quote.intake?.fieldIndex?.property_province;
  const intakePostal = quote.intake?.fieldIndex?.property_postal_code;
  const street = typeof intakeAddress === "string" ? intakeAddress : "";
  const city = typeof intakeCity === "string" ? intakeCity : "";
  const province = typeof intakeProvince === "string" ? intakeProvince : "";
  const postal = typeof intakePostal === "string" ? intakePostal : "";
  const address = [street, [city, province, postal].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  if (address) {
    return address;
  }
  const billing = client?.billingAddress;
  if (!billing) {
    return "";
  }
  return [
    billing.street1,
    billing.street2,
    [billing.city, billing.province, billing.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

function addressFromInvoice(invoice: Invoice, client?: Client | undefined): string {
  const intakeAddress = invoice.intake?.fieldIndex?.property_street1;
  const intakeCity = invoice.intake?.fieldIndex?.property_city;
  const intakeProvince = invoice.intake?.fieldIndex?.property_province;
  const intakePostal = invoice.intake?.fieldIndex?.property_postal_code;
  const street = typeof intakeAddress === "string" ? intakeAddress : "";
  const city = typeof intakeCity === "string" ? intakeCity : "";
  const province = typeof intakeProvince === "string" ? intakeProvince : "";
  const postal = typeof intakePostal === "string" ? intakePostal : "";
  const address = [street, [city, province, postal].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  if (address) {
    return address;
  }
  const billing = client?.billingAddress;
  if (!billing) {
    return "";
  }
  return [
    billing.street1,
    billing.street2,
    [billing.city, billing.province, billing.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

function visitWindowLabel(visit: ScheduledVisit): string {
  const start = new Date(visit.start);
  const end = new Date(visit.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${visit.start} - ${visit.end}`;
  }
  return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function dateLabel(value?: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function renderTemplateText(template: string | undefined, variables: Record<string, string>): string {
  return (template ?? "").replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, rawKey: string) => variables[rawKey] ?? "");
}

export function communicationTemplateFor(
  settings: Pick<CrmSettings, "communicationTemplates"> | undefined,
  category: CommunicationCategory
): TemplateRecord | undefined {
  return settings?.communicationTemplates.find((template) => template.category === category);
}

export function communicationChannelEnabled(
  settings: Pick<CrmSettings, "communicationTemplates"> | undefined,
  category: CommunicationCategory,
  channel: CommunicationChannel
): boolean {
  const template = communicationTemplateFor(settings, category);
  if (!template) {
    return true;
  }
  return channel === "email" ? template.emailEnabled : template.smsEnabled;
}

export function resolveTemplateMessage(input: {
  settings?: Pick<CrmSettings, "communicationTemplates"> | undefined;
  category: CommunicationCategory;
  channel: CommunicationChannel;
  fallbackSubject: string;
  fallbackBodyText: string;
  variables: Record<string, string>;
}): { enabled: boolean; subject: string; bodyText: string } {
  const template = communicationTemplateFor(input.settings, input.category);
  const enabled = channelEnabledFromTemplate(template, input.channel);
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

function channelEnabledFromTemplate(template: TemplateRecord | undefined, channel: CommunicationChannel): boolean {
  if (!template) {
    return true;
  }
  return channel === "email" ? template.emailEnabled : template.smsEnabled;
}

export function requestTemplateVariables(request: ServiceRequest): Record<string, string> {
  const matchStatus = request.match.matchedBy === "none"
    ? "New client profile created — no existing client match found. Review this request before taking action."
    : "Existing client record matched. Review this request before taking action.";
  return {
    TENANT_NAME: titleCaseTenant(request.tenantId),
    CLIENT_NAME: request.clientName,
    SERVICE_ADDRESS: addressFromRequest(request),
    REQUEST_SUMMARY: request.narrative || request.subject,
    REQUEST_SUBJECT: request.subject,
    CLIENT_EMAIL: clean(request.email),
    CLIENT_PHONE: clean(request.phone),
    MATCH_STATUS: matchStatus
  };
}

export function quoteTemplateVariables(input: {
  quote: Quote;
  client?: Client | undefined;
  portalUrl?: string | undefined;
}): Record<string, string> {
  const quoteNumber = input.quote.number ?? input.quote.id;
  return {
    TENANT_NAME: titleCaseTenant(input.quote.tenantId),
    CLIENT_NAME: clientDisplayName(input.client, input.quote.clientId),
    CLIENT_EMAIL: clean(input.client?.emails?.[0]),
    CLIENT_PHONE: clean(input.client?.phones?.[0]),
    QUOTE_NUMBER: quoteNumber,
    QUOTE_TITLE: input.quote.title,
    QUOTE_TOTAL: money(input.quote.totals.total),
    QUOTE_URL: clean(input.portalUrl),
    PORTAL_URL: clean(input.portalUrl),
    SERVICE_ADDRESS: addressFromQuote(input.quote, input.client),
    APPROVED_AT: dateLabel(input.quote.approvedAt),
    DEPOSIT_AMOUNT: money(input.quote.deposit?.amount ?? 0)
  };
}

export function bookingTemplateVariables(input: {
  job: Job;
  visit: ScheduledVisit;
  client?: Client | undefined;
  property?: Property | undefined;
  technicianLabel: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
}): Record<string, string> {
  const access = typeof input.job.intake?.fieldIndex?.gate_code === "string" ? input.job.intake.fieldIndex.gate_code : "";
  const pet = input.job.intake?.fieldIndex?.pet_present === true
    ? typeof input.job.intake?.fieldIndex?.pet_name === "string" && input.job.intake.fieldIndex.pet_name.trim()
      ? `Pets on property (${input.job.intake.fieldIndex.pet_name.trim()})`
      : "Pets on property"
    : "";
  return {
    TENANT_NAME: titleCaseTenant(input.job.tenantId),
    CLIENT_NAME: input.client?.name ?? input.job.clientId,
    CLIENT_EMAIL: clean(input.client?.emails?.[0]),
    CLIENT_PHONE: clean(input.client?.phones?.[0]),
    JOB_TITLE: input.job.title,
    JOB_NUMBER: input.job.number ?? input.job.id,
    JOB_DATE: dateLabel(input.visit.start),
    VISIT_WINDOW: visitWindowLabel(input.visit),
    SERVICE_ADDRESS: addressFromProperty(input.property),
    ARRIVAL_WINDOW: visitWindowLabel(input.visit),
    TECHNICIAN_NAME: input.technicianLabel,
    GATE_CODE: access,
    ACCESS_NOTE: [access ? `Gate code: ${access}` : "", pet].filter(Boolean).join(" | "),
    GOOGLE_CALENDAR_URL: input.googleCalendarUrl,
    OUTLOOK_CALENDAR_URL: input.outlookCalendarUrl
  };
}

export function invoiceTemplateVariables(input: {
  invoice: Invoice;
  client?: Client | undefined;
  portalUrl?: string | undefined;
  paymentAmount?: number | undefined;
  includePayLink?: boolean | undefined;
  includeHostedLink?: boolean | undefined;
  includeSummaryLine?: boolean | undefined;
}): Record<string, string> {
  const invoiceNumber = input.invoice.number ?? input.invoice.id;
  const payLink = clean(input.portalUrl);
  const hostedLink = payLink ? `${payLink}#receipt` : "";
  return {
    TENANT_NAME: titleCaseTenant(input.invoice.tenantId),
    CLIENT_NAME: input.client?.name ?? input.invoice.clientId,
    CLIENT_EMAIL: clean(input.client?.emails?.[0]),
    CLIENT_PHONE: clean(input.client?.phones?.[0]),
    INVOICE_NUMBER: invoiceNumber,
    INVOICE_TITLE: input.invoice.title,
    BALANCE_DUE: money(input.invoice.ledger?.balanceDue ?? input.invoice.totals.total),
    PAYMENT_AMOUNT: money(input.paymentAmount ?? 0),
    PAY_LINK: payLink,
    PAY_LINK_LABEL: input.includePayLink === false || !payLink ? "" : `Pay here: ${payLink}`,
    HOSTED_LINK_LABEL: input.includeHostedLink === false || !hostedLink ? "" : `Receipt and files: ${hostedLink}`,
    SUMMARY_LINE: input.includeSummaryLine ? `Summary total: ${money(input.invoice.totals.total)}` : "",
    PORTAL_URL: payLink,
    SERVICE_ADDRESS: addressFromInvoice(input.invoice, input.client)
  };
}

export function statementTemplateVariables(input: {
  tenantId: string;
  client: Client;
  statementLink: string;
  from?: string | undefined;
  to?: string | undefined;
  runningBalance: number;
}): Record<string, string> {
  return {
    TENANT_NAME: titleCaseTenant(input.tenantId),
    CLIENT_NAME: input.client.name,
    CLIENT_EMAIL: clean(input.client.emails?.[0]),
    CLIENT_PHONE: clean(input.client.phones?.[0]),
    STATEMENT_LINK: clean(input.statementLink),
    STATEMENT_FROM: clean(input.from),
    STATEMENT_TO: clean(input.to),
    RUNNING_BALANCE: money(input.runningBalance)
  };
}

export function reviewTemplateVariables(input: {
  tenantId: string;
  client: Client;
  reviewUrl: string;
  optOutUrl: string;
  job?: Job | undefined;
  property?: Property | undefined;
}): Record<string, string> {
  return {
    TENANT_NAME: titleCaseTenant(input.tenantId),
    CLIENT_NAME: input.client.name,
    CLIENT_EMAIL: clean(input.client.emails?.[0]),
    CLIENT_PHONE: clean(input.client.phones?.[0]),
    REVIEW_URL: clean(input.reviewUrl),
    REVIEW_OPTOUT_URL: clean(input.optOutUrl),
    JOB_TITLE: clean(input.job?.title),
    JOB_NUMBER: clean(input.job?.number ?? input.job?.id),
    SERVICE_ADDRESS: addressFromProperty(input.property)
  };
}
