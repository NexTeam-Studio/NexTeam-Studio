import { randomUUID } from "node:crypto";
import {
  type CrmSettings,
  RailError,
  type Client,
  type CRMProvider,
  type DocumentSequenceKind,
  type Invoice,
  type Job,
  type JobDetail,
  type JobStatus,
  type NewClient,
  type Property,
  type Quote,
  type QuoteDraft,
  type QuoteTemplate,
  type RequestForm,
  type ServiceRequest,
  DEFAULT_FIRESTORE_READ_LIMIT,
  defaultSecureOnboardingTasks,
  defaultWorkspaceSettings,
  jobSchema
} from "@nexteam/core";
import { VGB_LINE_ITEM_CATALOG } from "@nexteam/industry-packs";
import { advanceDocumentNumber } from "@nexteam/shared";

export type TenantOwnedPatch<T extends { tenantId: string }> = Partial<T> & Pick<T, "tenantId">;

export interface NativeListPage<T> {
  records: T[];
  nextCursor?: string | undefined;
}

export interface NativeCrmRepository {
  listClients(tenantId: string): Promise<Client[]>;
  listClientsPage?(tenantId: string, input?: { limit?: number | undefined; cursor?: string | undefined }): Promise<NativeListPage<Client>>;
  listProperties(tenantId: string): Promise<Property[]>;
  deleteClient(tenantId: string, clientId: string): Promise<void>;
  deletePropertiesForClient(tenantId: string, clientId: string): Promise<string[]>;
  listRequests(tenantId: string): Promise<ServiceRequest[]>;
  getRequest(tenantId: string, id: string): Promise<ServiceRequest | null>;
  createRequest(request: ServiceRequest): Promise<ServiceRequest>;
  deleteRequest(tenantId: string, requestId: string): Promise<void>;
  updateRequest(id: string, patch: TenantOwnedPatch<ServiceRequest>): Promise<ServiceRequest>;
  listRequestForms(tenantId: string): Promise<RequestForm[]>;
  getRequestForm(tenantId: string, id: string): Promise<RequestForm | null>;
  getRequestFormBySlug(tenantId: string, slug: string): Promise<RequestForm | null>;
  upsertRequestForm(form: RequestForm): Promise<RequestForm>;
  getCrmSettings(tenantId: string): Promise<CrmSettings>;
  saveCrmSettings(settings: CrmSettings): Promise<CrmSettings>;
  listQuoteTemplates(tenantId: string): Promise<QuoteTemplate[]>;
  getQuoteTemplate(tenantId: string, id: string): Promise<QuoteTemplate | null>;
  upsertQuoteTemplate(template: QuoteTemplate): Promise<QuoteTemplate>;
  listJobs(tenantId: string): Promise<Job[]>;
  listQuotes(tenantId: string): Promise<Quote[]>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
  getQuote(tenantId: string, id: string): Promise<Quote | null>;
  createClient(client: Client): Promise<Client>;
  upsertClient(client: Client): Promise<Client>;
  upsertProperty(property: Property): Promise<Property>;
  upsertJob(job: Job): Promise<Job>;
  createJobIfAbsent(job: Job): Promise<{ job: Job; created: boolean }>;
  createQuote(quote: Quote): Promise<Quote>;
  createInvoice(invoice: Invoice): Promise<Invoice>;
  claimQuoteJobConversion(tenantId: string, quoteId: string, jobId: string): Promise<{ quote: Quote; claimed: boolean }>;
  updateQuote(id: string, patch: TenantOwnedPatch<Quote>): Promise<Quote>;
  updateInvoice(id: string, patch: TenantOwnedPatch<Invoice>): Promise<Invoice>;
  updateJob(id: string, patch: TenantOwnedPatch<Job>): Promise<Job>;
  reserveDocumentNumber(tenantId: string, kind: DocumentSequenceKind): Promise<string>;
}

export interface NativeCrmRecords {
  clients?: Client[];
  properties?: Property[];
  requests?: ServiceRequest[];
  requestForms?: RequestForm[];
  crmSettings?: CrmSettings[];
  quoteTemplates?: QuoteTemplate[];
  jobs?: Job[];
  quotes?: Quote[];
  invoices?: Invoice[];
}

function matchesQuery(values: Array<string | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || values.filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function assertOwnedByTenant(record: { tenantId: string }, tenantId: string, label: string): void {
  if (record.tenantId !== tenantId) {
    throw new RailError(`${label} belongs to another tenant.`, { provider: "native", op: "tenantOwnedWrite", status: 409 });
  }
}

function clientSearchValues(client: Client): Array<string | undefined> {
  const contactValues = (client.contacts ?? []).flatMap((contact) => [
    contact.personName?.firstName,
    contact.personName?.lastName,
    contact.company,
    contact.role,
    ...contact.emails.map((email) => email.value),
    ...contact.phones.map((phone) => phone.value)
  ]);
  return [
    client.name,
    client.company,
    client.personName?.firstName,
    client.personName?.lastName,
    ...client.emails,
    ...client.phones,
    ...contactValues
  ];
}

function sameNativeRecord<T extends { id: string; externalIds?: { jobber?: string | undefined } | undefined }>(left: T, right: T): boolean {
  return left.id === right.id || Boolean(left.externalIds?.jobber && left.externalIds.jobber === right.externalIds?.jobber);
}

function defaultCrmSettingsTimestamp(): string {
  return "2026-07-12T00:00:00.000Z";
}

export function defaultCatalogItems(tenantId: string) {
  // Aquatrace's imported service data must never become another tenant's
  // starter catalog. New tenants begin with an intentionally empty catalog.
  if (tenantId !== "aquatrace") return [];
  const timestamp = defaultCrmSettingsTimestamp();
  const seedItems = [
    {
      id: `catalog_seed_leak_detection_${tenantId}`,
      tenantId,
      code: "AQ-LEAK-DETECT",
      name: "Swimming Pool Leak Detection",
      description: "Core leak-detection visit. Price intentionally left at 0 until tenant pricing is confirmed.",
      price: 0,
      category: "service" as const,
      tag: "Service",
      taxable: true,
      visible: true,
      source: "seed" as const,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `catalog_seed_general_repair_${tenantId}`,
      tenantId,
      code: "AQ-GENERAL-REPAIR",
      name: "General Pool Repair",
      description: "General repair service shell. Pricing remains tenant-managed and intentionally unset here.",
      price: 0,
      category: "service" as const,
      tag: "Service",
      taxable: true,
      visible: true,
      source: "seed" as const,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `catalog_seed_commercial_docs_${tenantId}`,
      tenantId,
      code: "AQ-COMMERCIAL-DOCS",
      name: "Commercial / VGB Documentation",
      description: "Commercial documentation shell that can be paired with the seeded VGB line library below.",
      price: 0,
      category: "service" as const,
      tag: "Service",
      taxable: true,
      visible: true,
      source: "seed" as const,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];
  const vgbItems = VGB_LINE_ITEM_CATALOG.map((item) => ({
    id: `catalog_${tenantId}_${item.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    tenantId,
    code: item.code,
    name: item.name,
    description: item.description,
    price: Number((item.unitPriceCents / 100).toFixed(2)),
    category: "service" as const,
    tag: item.category || "Service",
    taxable: item.taxable,
    visible: item.visible,
    source: "seed" as const,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  return [...seedItems, ...vgbItems];
}

export function defaultCommunicationTemplates(tenantId: string) {
  const timestamp = defaultCrmSettingsTimestamp();
  return [
    {
      id: `comms_request_confirmation_${tenantId}`,
      tenantId,
      category: "request_confirmation",
      label: "Request confirmation",
      description: "Automatic confirmation after a request is submitted.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "We received your request",
      emailBody: "Hi {{CLIENT_NAME}},\n\nWe received your request for {{SERVICE_ADDRESS}} and the office is reviewing it now.\n\nSummary: {{REQUEST_SUMMARY}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} received your request for {{SERVICE_ADDRESS}}. We are reviewing it now.",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_new_request_internal_alert_${tenantId}`,
      tenantId,
      category: "new_request_internal_alert",
      label: "New request — internal alert",
      description: "Staff notification when a new service request is received.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "New request from {{CLIENT_NAME}}",
      emailBody: "A new request has been submitted.\n\nClient: {{CLIENT_NAME}}\nEmail: {{CLIENT_EMAIL}}\nPhone: {{CLIENT_PHONE}}\nService address: {{SERVICE_ADDRESS}}\n\nRequest details:\n{{REQUEST_SUMMARY}}\n\n{{MATCH_STATUS}}",
      smsBody: "New request from {{CLIENT_NAME}} at {{SERVICE_ADDRESS}}. {{MATCH_STATUS}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_quote_send_${tenantId}`,
      tenantId,
      category: "quote_send",
      label: "Quote send / resend",
      description: "Used when the office sends or resends a quote.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Your quote from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour quote {{QUOTE_NUMBER}} is ready to review.\n\n{{PORTAL_URL}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your quote {{QUOTE_NUMBER}} is ready to review. {{PORTAL_URL}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_quote_approved_${tenantId}`,
      tenantId,
      category: "quote_approval_confirmation",
      label: "Quote approval confirmation",
      description: "Client-facing approval confirmation after acceptance succeeds.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Quote approved",
      emailBody: "Hi {{CLIENT_NAME}},\n\nWe recorded approval for quote {{QUOTE_NUMBER}} on {{APPROVED_AT}}.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} recorded approval for quote {{QUOTE_NUMBER}}. Thank you.",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_deposit_paid_${tenantId}`,
      tenantId,
      category: "deposit_paid_confirmation",
      label: "Deposit paid confirmation",
      description: "Staff-facing alert when a deposit is captured.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Deposit paid for {{QUOTE_NUMBER}}",
      emailBody: "Deposit received.\n\nQuote: {{QUOTE_NUMBER}}\nAmount: {{DEPOSIT_AMOUNT}}\nAddress: {{SERVICE_ADDRESS}}\nContact: {{CLIENT_NAME}} {{CLIENT_PHONE}} {{CLIENT_EMAIL}}\n\n{{QUOTE_URL}}",
      smsBody: "{{TENANT_NAME}} received your deposit of {{DEPOSIT_AMOUNT}} for quote {{QUOTE_NUMBER}}. {{QUOTE_URL}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_booking_confirmation_${tenantId}`,
      tenantId,
      category: "booking_confirmation",
      label: "Booking confirmation",
      description: "Client-facing booking confirmation for scheduled work.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Your job is booked",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour visit for {{JOB_TITLE}} is booked for {{VISIT_WINDOW}} at {{SERVICE_ADDRESS}}.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: {{JOB_TITLE}} is booked for {{VISIT_WINDOW}} at {{SERVICE_ADDRESS}}.",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_invoice_send_${tenantId}`,
      tenantId,
      category: "invoice_send",
      label: "Invoice send",
      description: "Client-facing invoice send template.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Invoice {{INVOICE_NUMBER}} from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nInvoice {{INVOICE_NUMBER}} is ready.\n\nBalance due: {{BALANCE_DUE}}\n{{PAY_LINK_LABEL}}\n{{HOSTED_LINK_LABEL}}\n{{SUMMARY_LINE}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} invoice {{INVOICE_NUMBER}} is ready. Balance due {{BALANCE_DUE}}. {{PAY_LINK_LABEL}} {{HOSTED_LINK_LABEL}} {{SUMMARY_LINE}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_invoice_reminder_${tenantId}`,
      tenantId,
      category: "invoice_reminder",
      label: "Invoice reminder / past due",
      description: "Reminder or past-due notice for unpaid invoices.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Payment reminder for invoice {{INVOICE_NUMBER}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nInvoice {{INVOICE_NUMBER}} still shows {{BALANCE_DUE}} due.\n\n{{PAY_LINK_LABEL}}\n{{SUMMARY_LINE}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} reminder: invoice {{INVOICE_NUMBER}} still shows {{BALANCE_DUE}} due. {{PAY_LINK_LABEL}} {{SUMMARY_LINE}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_payment_receipt_${tenantId}`,
      tenantId,
      category: "payment_receipt",
      label: "Receipt / payment confirmation",
      description: "Customer receipt after payment review is sent.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Payment received",
      emailBody: "Hi {{CLIENT_NAME}},\n\nWe recorded payment for invoice {{INVOICE_NUMBER}}.\n\nReceipt total: {{PAYMENT_AMOUNT}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} received {{PAYMENT_AMOUNT}} for invoice {{INVOICE_NUMBER}}. Thank you.",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_statement_send_${tenantId}`,
      tenantId,
      category: "statement_send",
      label: "Statement send",
      description: "Client-facing statement delivery from the billing history rail.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Your statement from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour statement is ready.\n\n{{STATEMENT_LINK}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} statement ready: {{STATEMENT_LINK}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_customer_document_package_${tenantId}`,
      tenantId,
      category: "customer_document_package",
      label: "Closeout package delivery",
      description: "Client-facing closeout package review delivery.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Your closeout package from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour closeout package for {{JOB_TITLE}} is ready for review.\n\n{{PACKAGE_ARTIFACTS}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your closeout package for {{JOB_TITLE}} is ready. {{PACKAGE_ARTIFACTS}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_review_initial_${tenantId}`,
      tenantId,
      category: "review_request_initial",
      label: "Review request - initial",
      description: "First post-closeout review request.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "How did we do?",
      emailBody: "Hi {{CLIENT_NAME}},\n\nThanks again for trusting {{TENANT_NAME}}. If the work solved the issue, would you mind leaving a quick review?\n\n{{REVIEW_URL}}\n\nReview-only opt out: {{REVIEW_OPTOUT_URL}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} thanks you for the opportunity. Leave a quick review here: {{REVIEW_URL}} Reply STOP-REVIEWS or tap {{REVIEW_OPTOUT_URL}} to stop review follow-ups.",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_review_nudge_${tenantId}`,
      tenantId,
      category: "review_request_nudge",
      label: "Review request - nudge",
      description: "Follow-up reminder when no review has been marked yet.",
      emailEnabled: true,
      smsEnabled: true,
      emailSubject: "Quick follow-up from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nJust checking back in. If you still have a minute to leave a review, here is the link again:\n\n{{REVIEW_URL}}\n\nReview-only opt out: {{REVIEW_OPTOUT_URL}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} follow-up: if you can leave a quick review, use {{REVIEW_URL}}. Stop review follow-ups here: {{REVIEW_OPTOUT_URL}}",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `comms_declining_work_${tenantId}`,
      tenantId, category: "declining_work", label: "Declining work", description: "Respectful notice when the office cannot take the requested work.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Regarding your request from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nThank you for contacting {{TENANT_NAME}} about {{REQUEST_SUMMARY}}. We are unable to take this work at this time.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: thank you for your request. We are unable to take this work at this time.", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_assessment_reminder_${tenantId}`,
      tenantId, category: "assessment_reminder", label: "Assessment reminder", description: "Reminder before a scheduled assessment.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Assessment reminder from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nThis is a reminder about your assessment for {{SERVICE_ADDRESS}} on {{JOB_DATE}}.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} reminder: your assessment for {{SERVICE_ADDRESS}} is {{JOB_DATE}}.", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_checklist_copy_${tenantId}`,
      tenantId, category: "checklist_copy", label: "Checklist copy", description: "Client copy of a request or assessment checklist.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Your checklist from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nHere is your checklist for {{SERVICE_ADDRESS}}.\n\n{{PACKAGE_ARTIFACTS}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your checklist is ready. {{PACKAGE_ARTIFACTS}}", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_job_booking_confirmation_${tenantId}`,
      tenantId, category: "job_booking_confirmation", label: "Job booking confirmation", description: "Confirmation when a job booking is finalized.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Your {{JOB_TITLE}} booking is confirmed",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour {{JOB_TITLE}} booking is confirmed for {{VISIT_WINDOW}} at {{SERVICE_ADDRESS}}.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your {{JOB_TITLE}} booking is confirmed for {{VISIT_WINDOW}}.", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_visit_rescheduled_${tenantId}`,
      tenantId, category: "visit_rescheduled", label: "Visit rescheduling", description: "Updated visit timing after a reschedule.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Your visit has been rescheduled",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour {{JOB_TITLE}} visit is now scheduled for {{VISIT_WINDOW}} at {{SERVICE_ADDRESS}}.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your visit is now scheduled for {{VISIT_WINDOW}}.", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_visit_reminder_${tenantId}`,
      tenantId, category: "visit_reminder", label: "Visit reminder", description: "Reminder shortly before a scheduled visit.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Reminder: {{JOB_TITLE}} visit",
      emailBody: "Hi {{CLIENT_NAME}},\n\nReminder: {{JOB_TITLE}} is scheduled for {{VISIT_WINDOW}} at {{SERVICE_ADDRESS}}.\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}} reminder: {{JOB_TITLE}} is scheduled for {{VISIT_WINDOW}}.", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_job_checklist_copy_${tenantId}`,
      tenantId, category: "job_checklist_copy", label: "Job checklist copy", description: "Client copy of a completed job checklist.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Your completed checklist from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nYour completed checklist for {{JOB_TITLE}} is ready.\n\n{{PACKAGE_ARTIFACTS}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your completed checklist is ready. {{PACKAGE_ARTIFACTS}}", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_job_follow_up_${tenantId}`,
      tenantId, category: "job_follow_up", label: "Job follow-up / feedback request", description: "Follow-up after a completed job.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "How did {{JOB_TITLE}} go?",
      emailBody: "Hi {{CLIENT_NAME}},\n\nThank you for working with {{TENANT_NAME}}. We would appreciate your feedback about {{JOB_TITLE}}.\n\n{{REVIEW_URL}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: thank you for the opportunity. Share feedback here: {{REVIEW_URL}}", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_payment_method_request_${tenantId}`,
      tenantId, category: "payment_method_request", label: "Payment-method request", description: "Request for a payment method before collection.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Payment method needed for {{INVOICE_NUMBER}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nPlease add a payment method for invoice {{INVOICE_NUMBER}}.\n\n{{PAY_LINK}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: add a payment method for invoice {{INVOICE_NUMBER}}: {{PAY_LINK}}", createdAt: timestamp, updatedAt: timestamp
    },
    {
      id: `comms_signed_document_copy_${tenantId}`,
      tenantId, category: "signed_document_copy", label: "Signed-document copy", description: "Copy of an approved or signed customer document.",
      emailEnabled: true, smsEnabled: true,
      emailSubject: "Your signed document from {{TENANT_NAME}}",
      emailBody: "Hi {{CLIENT_NAME}},\n\nA signed copy of {{QUOTE_TITLE}} is available here:\n\n{{QUOTE_URL}}\n\n{{TENANT_NAME}}",
      smsBody: "{{TENANT_NAME}}: your signed document is available here: {{QUOTE_URL}}", createdAt: timestamp, updatedAt: timestamp
    }
  ];
}

export function defaultCrmSettings(tenantId: string): CrmSettings {
  const timestamp = defaultCrmSettingsTimestamp();
  return {
    tenantId,
    operatingProfile: {
      company: { timezone: "America/New_York" },
      locations: [],
      businessHours: [
        { day: "monday", open: "09:00", close: "17:00", closed: false },
        { day: "tuesday", open: "09:00", close: "17:00", closed: false },
        { day: "wednesday", open: "09:00", close: "17:00", closed: false },
        { day: "thursday", open: "09:00", close: "17:00", closed: false },
        { day: "friday", open: "09:00", close: "17:00", closed: false },
        { day: "saturday", closed: true },
        { day: "sunday", closed: true }
      ],
      tax: { enabled: false, defaultRate: 0 },
      communicationIdentity: {},
      securityAudit: { auditEventsEnabled: true, requireApprovalForExternalSend: true },
      onboarding: {
        completedSteps: [],
        selectedModules: [],
        checklist: { tasks: defaultSecureOnboardingTasks.map((task) => ({ ...task })), auditHistory: [] }
      }
    },
    documentNumbering: {
      request: { prefix: "REQ", separator: "-", padWidth: 4, nextValue: 1 },
      quote: { prefix: "Q", separator: "-", padWidth: 4, nextValue: 1 },
      job: { prefix: "JOB", separator: "-", padWidth: 4, nextValue: 1 },
      invoice: { prefix: "INV", separator: "-", padWidth: 4, nextValue: 1 },
      receipt: { prefix: "RCT", separator: "-", padWidth: 4, nextValue: 1 }
    },
    quoteDefaults: {
      expiryDays: 30,
      autoSaveCardOnDeposit: true,
      approvalRules: {
        requireSignature: true,
        requireDeposit: true,
        requireCardOnFile: true,
        depositKind: "percent",
        depositValue: 50
      },
      terms: "Pricing stays valid through the expiry date shown on this quote. Scheduling begins after approval and any required deposit steps are complete."
    },
    invoiceDefaults: {
      dueDays: 0,
      terms: "Payment is due as scheduled on the invoice. Reach out to the office before the due date if anything needs to be reviewed.",
      delivery: {
        emailIncludePdf: true,
        emailIncludeSummary: true,
        emailIncludePayLink: true,
        smsIncludeSummary: true,
        smsIncludePayLink: true,
        smsIncludeHostedLink: true
      },
      tippingEnabled: false
    },
    portalDefaults: {
      keepBusinessAddressPrivate: false,
      hubSessionReverifyDays: 14
    },
    reviewDefaults: {
      enabled: true,
      steps: [
        {
          id: "review_initial",
          label: "Initial review request",
          offsetDays: 1,
          channels: "both",
          templateCategory: "review_request_initial"
        },
        {
          id: "review_nudge_1",
          label: "Review nudge",
          offsetDays: 4,
          channels: "both",
          templateCategory: "review_request_nudge"
        },
        {
          id: "review_nudge_2",
          label: "Final review nudge",
          offsetDays: 10,
          channels: "both",
          templateCategory: "review_request_nudge"
        }
      ]
    },
    documentDesign: { quote: { referToAsEstimate: false, showQuantity: true, showUnitPrice: true, showLineTotal: true, showTotalsAndTax: true, showSignatureLine: true, disclaimer: "This quote is valid for the next 30 days, after which values may be subject to change.", depositLanguage: "A deposit of {{DEPOSIT_AMOUNT}} will be required to begin." }, job: { showSignatureLine: true, disclaimer: "We can be called for touch-ups and small changes for the next 3 days. After that all work is final." }, invoice: { showQuantity: true, showUnitPrice: true, showLineTotal: true, showReturnPaymentStub: false, showLateStamp: true, showAccountBalance: true, showPaidDate: true, disclaimer: "Thank you for your business. Please contact us with any questions regarding this invoice." }, style: { headerLayout: "basic", headerStyle: "modern", logoSize: 1, themeColor: "default", footerFontSize: 8, showCompanyName: true, showCompanyPhone: true, showCompanyEmail: true, showCompanyWebsite: true, showClientPhone: false } },
    completionRequirements: { checklistRequired: false, photosRequired: false, reportRequired: false, signatureRequired: false },
    workspaceSettings: {
      ...structuredClone(defaultWorkspaceSettings),
      requestsBooking: {
        ...structuredClone(defaultWorkspaceSettings).requestsBooking,
        ...(tenantId === "aquatrace" ? { internalNotificationRecipient: "service@aquatraceleak.com" } : {})
      }
    },
    propertyAssetDefinitions: [],
    catalogItems: defaultCatalogItems(tenantId),
    communicationTemplates: defaultCommunicationTemplates(tenantId),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function defaultQuoteTemplates(tenantId: string): QuoteTemplate[] {
  const settings = defaultCrmSettings(tenantId);
  const timestamp = defaultCrmSettingsTimestamp();
  return [
    {
      id: `quote_template_standard_${tenantId}`,
      tenantId,
      name: "Standard leak detection",
      description: "Starter template for standard leak-detection quoting. Pricing stays editable until tenant confirmation.",
      titlePrefix: "Leak Detection Quote",
      defaultLineItems: [
        {
          id: "line_template_leak_detection_1",
          code: "AQ-LEAK-DETECT",
          name: "Swimming Pool Leak Detection",
          description: "Default service shell. Price intentionally left at 0 until tenant pricing is confirmed.",
          quantity: 1,
          unitPrice: 0,
          total: 0,
          source: "catalog",
          catalogCode: "AQ-LEAK-DETECT",
          clientSelectable: false,
          defaultSelected: true
        }
      ],
      defaultApprovalRules: settings.quoteDefaults.approvalRules,
      expiryDays: settings.quoteDefaults.expiryDays,
      terms: settings.quoteDefaults.terms,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `quote_template_repair_${tenantId}`,
      tenantId,
      name: "General repair",
      description: "Starter template for repair proposals with tenant-managed pricing.",
      titlePrefix: "Repair Quote",
      defaultLineItems: [
        {
          id: "line_template_repair_1",
          code: "AQ-GENERAL-REPAIR",
          name: "General Pool Repair",
          description: "Starter repair line. Price intentionally left at 0 until tenant pricing is confirmed.",
          quantity: 1,
          unitPrice: 0,
          total: 0,
          source: "catalog",
          catalogCode: "AQ-GENERAL-REPAIR",
          clientSelectable: false,
          defaultSelected: true
        }
      ],
      defaultApprovalRules: settings.quoteDefaults.approvalRules,
      expiryDays: settings.quoteDefaults.expiryDays,
      terms: settings.quoteDefaults.terms,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: `quote_template_commercial_${tenantId}`,
      tenantId,
      name: "Commercial / VGB documentation",
      description: "Starter commercial documentation template using the seeded VGB catalog.",
      titlePrefix: "Commercial Documentation Quote",
      defaultLineItems: [
        {
          id: "line_template_commercial_1",
          code: "VGB-001",
          name: "VGB-001 - Main Drain Cover Field Documentation — Zone 1",
          description: "Seeded from the tenant catalog so the office can swap zones or add-ons before send.",
          quantity: 1,
          unitPrice: 950,
          total: 950,
          source: "catalog",
          catalogCode: "VGB-001",
          clientSelectable: false,
          defaultSelected: true
        }
      ],
      defaultApprovalRules: settings.quoteDefaults.approvalRules,
      expiryDays: settings.quoteDefaults.expiryDays,
      terms: settings.quoteDefaults.terms,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];
}

function normalizeJobRecord(job: Job): Job {
  return jobSchema.parse(job) as Job;
}

export class MemoryNativeCrmRepository implements NativeCrmRepository {
  private readonly records: Required<NativeCrmRecords>;
  private readonly numberingQueues = new Map<string, Promise<void>>();

  constructor(records: NativeCrmRecords = {}) {
    this.records = {
      clients: [...(records.clients ?? [])],
      properties: [...(records.properties ?? [])],
      requests: [...(records.requests ?? [])],
      requestForms: [...(records.requestForms ?? [])],
      crmSettings: [...(records.crmSettings ?? [])],
      quoteTemplates: [...(records.quoteTemplates ?? [])],
      jobs: (records.jobs ?? []).map((job) => normalizeJobRecord(job)),
      quotes: [...(records.quotes ?? [])],
      invoices: [...(records.invoices ?? [])]
    };
  }

  async listClients(tenantId: string): Promise<Client[]> {
    return (this.records.clients ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listClientsPage(tenantId: string, input: { limit?: number | undefined; cursor?: string | undefined } = {}): Promise<NativeListPage<Client>> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_FIRESTORE_READ_LIMIT, 1), DEFAULT_FIRESTORE_READ_LIMIT);
    const clients = (await this.listClients(tenantId)).sort((left, right) => left.id.localeCompare(right.id));
    const start = input.cursor ? clients.findIndex((client) => client.id === input.cursor) + 1 : 0;
    const records = clients.slice(Math.max(start, 0), Math.max(start, 0) + limit);
    return {
      records,
      nextCursor: records.length === limit ? records.at(-1)?.id : undefined
    };
  }

  async listProperties(tenantId: string): Promise<Property[]> {
    return (this.records.properties ?? []).filter((record) => record.tenantId === tenantId);
  }

  async deleteClient(tenantId: string, clientId: string): Promise<void> {
    this.records.clients = this.records.clients.filter((record) => !(record.tenantId === tenantId && record.id === clientId));
  }

  async deletePropertiesForClient(tenantId: string, clientId: string): Promise<string[]> {
    const deletedIds = this.records.properties
      .filter((record) => record.tenantId === tenantId && record.clientId === clientId)
      .map((record) => record.id);
    this.records.properties = this.records.properties.filter((record) => !(record.tenantId === tenantId && record.clientId === clientId));
    return deletedIds;
  }

  async listRequests(tenantId: string): Promise<ServiceRequest[]> {
    return (this.records.requests ?? [])
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRequest(tenantId: string, id: string): Promise<ServiceRequest | null> {
    return this.records.requests.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async createRequest(request: ServiceRequest): Promise<ServiceRequest> {
    this.records.requests.push(request);
    return request;
  }

  async deleteRequest(tenantId: string, requestId: string): Promise<void> {
    const exists = this.records.requests.some((request) => request.tenantId === tenantId && request.id === requestId);
    if (!exists) {
      throw new RailError(`Native request ${requestId} was not found.`, { provider: "native", op: "deleteRequest", status: 404 });
    }
    this.records.requests = this.records.requests.filter((request) => !(request.tenantId === tenantId && request.id === requestId));
  }

  async updateRequest(id: string, patch: TenantOwnedPatch<ServiceRequest>): Promise<ServiceRequest> {
    const index = this.records.requests.findIndex((request) => request.id === id);
    if (index === -1) {
      throw new RailError(`Native request ${id} was not found.`, { provider: "native", op: "updateRequest", status: 404 });
    }
    const existing = this.records.requests[index];
    if (!existing) {
      throw new RailError(`Native request ${id} was not found.`, { provider: "native", op: "updateRequest", status: 404 });
    }
    const next: ServiceRequest = { ...existing, ...patch };
    this.records.requests[index] = next;
    return next;
  }

  async listRequestForms(tenantId: string): Promise<RequestForm[]> {
    return (this.records.requestForms ?? [])
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async getRequestForm(tenantId: string, id: string): Promise<RequestForm | null> {
    return this.records.requestForms.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async getRequestFormBySlug(tenantId: string, slug: string): Promise<RequestForm | null> {
    return this.records.requestForms.find((record) => record.tenantId === tenantId && record.slug === slug) ?? null;
  }

  async upsertRequestForm(form: RequestForm): Promise<RequestForm> {
    const index = this.records.requestForms.findIndex((record) => record.id === form.id || (record.tenantId === form.tenantId && record.slug === form.slug));
    if (index === -1) {
      this.records.requestForms.push(form);
      return form;
    }
    const existing = this.records.requestForms[index];
    const next = { ...existing, ...form };
    this.records.requestForms[index] = next;
    return next;
  }

  async getCrmSettings(tenantId: string): Promise<CrmSettings> {
    return this.records.crmSettings.find((record) => record.tenantId === tenantId) ?? defaultCrmSettings(tenantId);
  }

  async saveCrmSettings(settings: CrmSettings): Promise<CrmSettings> {
    const index = this.records.crmSettings.findIndex((record) => record.tenantId === settings.tenantId);
    if (index === -1) {
      this.records.crmSettings.push(settings);
      return settings;
    }
    const existing = this.records.crmSettings[index];
    const next = { ...existing, ...settings };
    this.records.crmSettings[index] = next;
    return next;
  }

  async listQuoteTemplates(tenantId: string): Promise<QuoteTemplate[]> {
    const templates = this.records.quoteTemplates.filter((record) => record.tenantId === tenantId);
    return templates.length ? templates : defaultQuoteTemplates(tenantId);
  }

  async getQuoteTemplate(tenantId: string, id: string): Promise<QuoteTemplate | null> {
    return this.records.quoteTemplates.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async upsertQuoteTemplate(template: QuoteTemplate): Promise<QuoteTemplate> {
    const index = this.records.quoteTemplates.findIndex((record) => record.id === template.id);
    if (index === -1) {
      this.records.quoteTemplates.push(template);
      return template;
    }
    const existing = this.records.quoteTemplates[index];
    const next = { ...existing, ...template };
    this.records.quoteTemplates[index] = next;
    return next;
  }

  async listJobs(tenantId: string): Promise<Job[]> {
    return (this.records.jobs ?? [])
      .filter((record) => record.tenantId === tenantId)
      .map((record) => normalizeJobRecord(record));
  }

  async listQuotes(tenantId: string): Promise<Quote[]> {
    return (this.records.quotes ?? []).filter((record) => record.tenantId === tenantId);
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return this.records.invoices.filter((record) => record.tenantId === tenantId);
  }

  async getQuote(tenantId: string, id: string): Promise<Quote | null> {
    return this.records.quotes.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async createClient(client: Client): Promise<Client> {
    this.records.clients.push(client);
    return client;
  }

  async upsertClient(client: Client): Promise<Client> {
    const index = this.records.clients.findIndex((record) => sameNativeRecord(record, client));
    if (index === -1) {
      this.records.clients.push(client);
      return client;
    }
    this.records.clients[index] = client;
    return client;
  }

  async upsertProperty(property: Property): Promise<Property> {
    const index = this.records.properties.findIndex((record) => sameNativeRecord(record, property));
    if (index === -1) {
      this.records.properties.push(property);
      return property;
    }
    this.records.properties[index] = property;
    return property;
  }

  async upsertJob(job: Job): Promise<Job> {
    const normalized = normalizeJobRecord(job);
    const index = this.records.jobs.findIndex((record) => sameNativeRecord(record, normalized));
    if (index === -1) {
      this.records.jobs.push(normalized);
      return normalized;
    }
    const existing = this.records.jobs[index];
    const next = normalizeJobRecord({ ...existing, ...normalized });
    this.records.jobs[index] = next;
    return next;
  }

  async createJobIfAbsent(job: Job): Promise<{ job: Job; created: boolean }> {
    const normalized = normalizeJobRecord(job);
    const existing = this.records.jobs.find((record) => record.id === normalized.id);
    if (existing) {
      assertOwnedByTenant(existing, normalized.tenantId, `Native job ${normalized.id}`);
      return { job: existing, created: false };
    }
    this.records.jobs.push(normalized);
    return { job: normalized, created: true };
  }

  async createQuote(quote: Quote): Promise<Quote> {
    this.records.quotes.push(quote);
    return quote;
  }

  async claimQuoteJobConversion(tenantId: string, quoteId: string, jobId: string): Promise<{ quote: Quote; claimed: boolean }> {
    const index = this.records.quotes.findIndex((quote) => quote.id === quoteId);
    if (index === -1) {
      throw new RailError(`Native quote ${quoteId} was not found.`, { provider: "native", op: "claimQuoteJobConversion", status: 404 });
    }
    const existing = this.records.quotes[index];
    if (!existing) {
      throw new RailError(`Native quote ${quoteId} was not found.`, { provider: "native", op: "claimQuoteJobConversion", status: 404 });
    }
    assertOwnedByTenant(existing, tenantId, `Native quote ${quoteId}`);
    if (existing.convertedJobId) {
      return { quote: existing, claimed: false };
    }
    const quote: Quote = { ...existing, convertedJobId: jobId, jobId, updatedAt: new Date().toISOString() };
    this.records.quotes[index] = quote;
    return { quote, claimed: true };
  }

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    this.records.invoices.push(invoice);
    return invoice;
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    const index = this.records.quotes.findIndex((quote) => quote.id === id);
    if (index === -1) {
      throw new RailError(`Native quote ${id} was not found.`, { provider: "native", op: "updateQuote", status: 404 });
    }
    const existing = this.records.quotes[index];
    if (!existing) {
      throw new RailError(`Native quote ${id} was not found.`, { provider: "native", op: "updateQuote", status: 404 });
    }
    const next: Quote = { ...existing, ...patch };
    this.records.quotes[index] = next;
    return next;
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const index = this.records.invoices.findIndex((invoice) => invoice.id === id);
    if (index === -1) {
      throw new RailError(`Native invoice ${id} was not found.`, { provider: "native", op: "updateInvoice", status: 404 });
    }
    const existing = this.records.invoices[index];
    if (!existing) {
      throw new RailError(`Native invoice ${id} was not found.`, { provider: "native", op: "updateInvoice", status: 404 });
    }
    const next: Invoice = { ...existing, ...patch };
    this.records.invoices[index] = next;
    return next;
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
    const index = this.records.jobs.findIndex((job) => job.id === id);
    if (index === -1) {
      throw new RailError(`Native job ${id} was not found.`, { provider: "native", op: "updateJob", status: 404 });
    }
    const existing = this.records.jobs[index];
    if (!existing) {
      throw new RailError(`Native job ${id} was not found.`, { provider: "native", op: "updateJob", status: 404 });
    }
    const next = normalizeJobRecord({ ...existing, ...patch } as Job);
    this.records.jobs[index] = next;
    return next;
  }

  async reserveDocumentNumber(tenantId: string, kind: DocumentSequenceKind): Promise<string> {
    const key = tenantId;
    const previous = this.numberingQueues.get(key) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const settings = await this.getCrmSettings(tenantId);
      const rule = settings.documentNumbering[kind];
      const reservation = advanceDocumentNumber(rule);
      await this.saveCrmSettings({
        ...settings,
        documentNumbering: { ...settings.documentNumbering, [kind]: reservation.nextRule },
        updatedAt: new Date().toISOString()
      });
      return reservation.number;
    });
    const settled = operation.then(() => undefined, () => undefined);
    this.numberingQueues.set(key, settled);
    try {
      return await operation;
    } finally {
      if (this.numberingQueues.get(key) === settled) {
        this.numberingQueues.delete(key);
      }
    }
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function totals(lineItems: QuoteDraft["lineItems"]): Quote["totals"] {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  return { subtotal, tax: 0, total: subtotal };
}

export class NativeAdapter implements CRMProvider {
  constructor(
    private readonly repository: NativeCrmRepository,
    private readonly tenantId: string
  ) {}

  static fromRecords(tenantId: string, records: NativeCrmRecords): NativeAdapter {
    return new NativeAdapter(new MemoryNativeCrmRepository(records), tenantId);
  }

  async getClients(q: string): Promise<Client[]> {
    const clients = await this.repository.listClients(this.tenantId);
    return clients.filter((client) => matchesQuery(clientSearchValues(client), q));
  }

  async getJobs(_range: { from: string; to: string }): Promise<Job[]> {
    return this.repository.listJobs(this.tenantId);
  }

  async getJobDetail(ref: { id?: string; nameQuery?: string }): Promise<JobDetail> {
    const [jobs, clients, properties] = await Promise.all([
      this.repository.listJobs(this.tenantId),
      this.repository.listClients(this.tenantId),
      this.repository.listProperties(this.tenantId)
    ]);
    const query = ref.nameQuery?.trim().toLowerCase() ?? "";
    const job = jobs.find((candidate) => candidate.id === ref.id || candidate.externalIds?.jobber === ref.id)
      ?? jobs.find((candidate) => matchesQuery([candidate.title, candidate.status], query));
    if (!job) {
      throw new RailError("No matching native job was found.", { provider: "native", op: "getJobDetail", status: 404 });
    }
    return {
      ...job,
      client: clients.find((client) => client.id === job.clientId),
      property: job.propertyId ? properties.find((property) => property.id === job.propertyId) : undefined
    };
  }

  async getQuotes(): Promise<Quote[]> {
    return this.repository.listQuotes(this.tenantId);
  }

  async createQuote(quote: Quote): Promise<Quote> {
    if (quote.tenantId !== this.tenantId) {
      throw new RailError("Native quote tenant mismatch.", { provider: "native", op: "createQuote", status: 403 });
    }
    return this.repository.createQuote(quote);
  }

  async getInvoices(): Promise<Invoice[]> {
    return this.repository.listInvoices(this.tenantId);
  }

  async createClient(d: NewClient): Promise<Client> {
    if (d.tenantId !== this.tenantId) {
      throw new RailError("Native client tenant mismatch.", { provider: "native", op: "createClient", status: 403 });
    }
    const client: Client = {
      id: makeId("client"),
      tenantId: d.tenantId,
      name: d.name,
      company: d.company,
      personName: d.personName,
      displayNamePreference: d.displayNamePreference,
      billingAddress: d.billingAddress,
      billingSameAsPrimaryProperty: d.billingSameAsPrimaryProperty,
      contacts: d.contacts,
      communicationSettings: d.communicationSettings,
      emails: d.emails,
      phones: d.phones,
      tags: [],
      consent: d.consent,
      customFields: d.customFields
    };
    return this.repository.createClient(client);
  }

  async updateClient(id: string, patch: Partial<Client>): Promise<Client> {
    await this.requireOwnedRecord(this.repository.listClients(this.tenantId), id, "client", "updateClient");
    this.assertTenantPatch(patch, "client", "updateClient");
    const existing = (await this.repository.listClients(this.tenantId)).find((client) => client.id === id);
    if (!existing) {
      throw new RailError("Native client was not found.", { provider: "native", op: "updateClient", status: 404 });
    }
    return this.repository.upsertClient({ ...existing, ...patch, id, tenantId: this.tenantId });
  }

  async deleteClient(id: string): Promise<void> {
    const existing = (await this.repository.listClients(this.tenantId)).find((client) => client.id === id);
    if (!existing) {
      throw new RailError("No matching native client was found.", { provider: "native", op: "deleteClient", status: 404 });
    }
    await this.repository.deletePropertiesForClient(this.tenantId, existing.id);
    await this.repository.deleteClient(this.tenantId, existing.id);
  }

  async upsertProperty(property: Property): Promise<Property> {
    if (property.tenantId !== this.tenantId) {
      throw new RailError("Native property tenant mismatch.", { provider: "native", op: "upsertProperty", status: 403 });
    }
    return this.repository.upsertProperty(property);
  }

  async createJob(job: Job): Promise<Job> {
    if (job.tenantId !== this.tenantId) {
      throw new RailError("Native job tenant mismatch.", { provider: "native", op: "createJob", status: 403 });
    }
    return this.repository.upsertJob(job);
  }

  async draftQuote(d: QuoteDraft): Promise<Quote> {
    if (d.tenantId !== this.tenantId) {
      throw new RailError("Native quote tenant mismatch.", { provider: "native", op: "draftQuote", status: 403 });
    }
    const timestamp = new Date().toISOString();
    const quote: Quote = {
      id: makeId("quote"),
      tenantId: d.tenantId,
      number: await this.repository.reserveDocumentNumber(d.tenantId, "quote"),
      clientId: d.clientId,
      jobId: d.jobId,
      ...(d.requestId ? { requestId: d.requestId } : {}),
      ...(d.templateId ? { templateId: d.templateId } : {}),
      version: 1,
      status: "draft",
      title: d.title,
      lineItems: d.lineItems,
      totals: totals(d.lineItems),
      approvalRules: d.approvalRules,
      ...(d.discount ? { discount: d.discount } : {}),
      ...(d.expiresAt ? { expiresAt: d.expiresAt } : {}),
      ...(d.terms ? { terms: d.terms } : {}),
      portal: {},
      delivery: [],
      changeRequests: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      pdfRef: `native://quotes/${d.tenantId}/pending/${makeId("pdf")}.pdf`
    };
    return this.repository.createQuote(quote);
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    await this.requireOwnedRecord(this.repository.listQuotes(this.tenantId), id, "quote", "updateQuote");
    this.assertTenantPatch(patch, "quote", "updateQuote");
    return this.repository.updateQuote(id, { ...patch, tenantId: this.tenantId });
  }

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    if (invoice.tenantId !== this.tenantId) {
      throw new RailError("Native invoice tenant mismatch.", { provider: "native", op: "createInvoice", status: 403 });
    }
    return this.repository.createInvoice(invoice);
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    await this.requireOwnedRecord(this.repository.listInvoices(this.tenantId), id, "invoice", "updateInvoice");
    this.assertTenantPatch(patch, "invoice", "updateInvoice");
    return this.repository.updateInvoice(id, { ...patch, tenantId: this.tenantId });
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
    await this.requireOwnedRecord(this.repository.listJobs(this.tenantId), id, "job", "updateJob");
    this.assertTenantPatch(patch, "job", "updateJob");
    return this.repository.updateJob(id, { ...patch, tenantId: this.tenantId });
  }

  async updateJobStatus(id: string, s: JobStatus): Promise<Job> {
    await this.requireOwnedRecord(this.repository.listJobs(this.tenantId), id, "job", "updateJobStatus");
    return this.repository.updateJob(id, { status: s, tenantId: this.tenantId });
  }

  private async requireOwnedRecord<T extends { id: string }>(
    records: Promise<T[]>,
    id: string,
    kind: string,
    op: string
  ): Promise<void> {
    const record = (await records).find((candidate) => candidate.id === id);
    if (!record) {
      // Do not reveal whether another tenant owns the requested record.
      throw new RailError(`Native ${kind} ${id} was not found.`, { provider: "native", op, status: 404 });
    }
  }

  private assertTenantPatch<T extends { tenantId: string }>(patch: Partial<T>, kind: string, op: string): void {
    if (patch.tenantId !== undefined && patch.tenantId !== this.tenantId) {
      throw new RailError(`Native ${kind} tenant mismatch.`, { provider: "native", op, status: 403 });
    }
  }
}
