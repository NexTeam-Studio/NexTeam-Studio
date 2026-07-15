import {
  communicationTemplateSchema,
  decisionRecordSchema,
  dominantActionStateSchema,
  lifecycleCommandContractSchema,
  type ClientScheduleRequestStatus,
  type CommunicationTemplate,
  type DecisionId,
  type DecisionRecord,
  type DominantActionState,
  type InvoiceBalanceStatus,
  type InvoiceDeliveryStatus,
  type InvoiceLifecycleStatus,
  type LifecycleCommandContract,
  type QuoteClientResponseStatus,
  type QuoteLifecycleStatus,
  type VisitLifecycleStatus,
  type VisitScheduleStatus,
  type VisitTravelStatus
} from "@nexteam/core";

export const PERMISSION_IDS = [
  "request.contact",
  "request.convert_to_quote",
  "request.convert_to_job",
  "request.merge",
  "quote.send",
  "quote.revise",
  "quote.decline",
  "quote.renew",
  "deposit.collect",
  "deposit.waive",
  "deposit.refund",
  "job.create",
  "job.schedule",
  "job.reschedule",
  "job.reassign",
  "job.cancel",
  "job.close",
  "job.reopen",
  "job.activate",
  "visit.start",
  "visit.complete",
  "visit.reschedule",
  "visit.cancel",
  "visit.report_edit",
  "invoice.create",
  "invoice.send",
  "invoice.void",
  "invoice.write_off",
  "payment.collect",
  "payment.refund",
  "payment.retry",
  "report.approve",
  "schedule_request.manage",
  "client.contact_view",
  "client.call",
  "client.message",
  "job.financials_view",
  "job.access_notes_view",
  "media.capture",
  "media.delete",
  "schedule.view_team"
] as const;

export const PORTAL_AUTHORIZATION_PROFILE_ID = "portal_customer_resource_access";

const DECISION_REGISTRY_RAW: DecisionRecord[] = [
  { decisionId: "D1", question: "Deposit fails after approval — does approval survive?", confirmedDecision: "Atomic. A failed deposit means the quote is not accepted, no QuoteAcceptance record exists, and the client must fully re-approve on retry." },
  { decisionId: "D2", question: "Who can waive a deposit?", confirmedDecision: "OWNER-only by default; OFFICE_ADMIN can only waive if explicitly granted deposit.waive." },
  { decisionId: "D3", question: "What happens when no card is available for a required deposit?", confirmedDecision: "Do not authorize the work package. The missing deposit remains a named blocker until collected or waived." },
  { decisionId: "D4", question: "Are deposits ever partial?", confirmedDecision: "No. Deposits are always collected in full." },
  { decisionId: "D5", question: "What happens to a deposit when a quote is revised?", confirmedDecision: "Deposits carry forward, percentage deposits recalculate, shortfalls block authorization and scheduling, and any excess becomes account credit instead of a silent refund." },
  { decisionId: "D6", question: "How should voids and deposit disposition work?", confirmedDecision: "Void and bad debt remain distinct paths, and deposit disposition on void stays a manual review step rather than an automatic release." },
  { decisionId: "D7", question: "Can customers choose reschedule windows directly?", confirmedDecision: "Customers can request changes, but staff remains the actor that accepts, declines, or counter-proposes schedule changes." },
  { decisionId: "D8", question: "How does report status affect closeout?", confirmedDecision: "Approved reports can bundle into closeout, but sending an invoice is never blocked by report approval." },
  { decisionId: "D9", question: "How is the dominant action determined?", confirmedDecision: "It is derived from orthogonal lifecycle dimensions and blockers, never stored as a flattened status label." },
  { decisionId: "D10", question: "Should follow-up work become a new job?", confirmedDecision: "Superseded by D18." },
  { decisionId: "D11", question: "Who approves and sends the final report?", confirmedDecision: "Technicians submit field docs, then OWNER or OFFICE_ADMIN approves and sends the final customer package." },
  { decisionId: "D12", question: "Do manual calls suppress reminders?", confirmedDecision: "No. Automated reminders always fire on schedule; staff only gets visibility into the next reminder time." },
  { decisionId: "D13", question: "How are unable-to-complete outcomes handled?", confirmedDecision: "Every named outcome is tracked explicitly and can add a fee line item, but never auto-charges a payment method." },
  { decisionId: "D14", question: "Can invoices go out before the report is approved?", confirmedDecision: "Yes. Invoice send is independent, but only approved documents may ever attach to outbound sends." },
  { decisionId: "D15", question: "Who can close billable work without an invoice?", confirmedDecision: "Any OFFICE_ADMIN can do it; a reason is still required and audited." },
  { decisionId: "D16", question: "What works offline?", confirmedDecision: "Technicians get offline access for their own day-of work; admins get team schedule and contact visibility; financial actions and final sends still require connection." },
  { decisionId: "D17", question: "How do portal reschedule and cancellation requests behave?", confirmedDecision: "The client can submit the request only. Nothing changes until staff acts." },
  { decisionId: "D18", question: "Where does follow-up work live?", confirmedDecision: "All follow-up work stays on the same job. Closed jobs reopen for follow-up rather than silently creating a new job." },
  { decisionId: "D19", question: "When are partial final payments allowed?", confirmedDecision: "Only when a payment schedule exists on the related work package; otherwise each payment attempt must cover the full remaining balance." }
];

export const DECISION_REGISTRY = decisionRecordSchema.array().parse(DECISION_REGISTRY_RAW);

const COMMUNICATION_TEMPLATES_RAW: CommunicationTemplate[] = [
  {
    templateId: "quote_sent",
    trigger: "quote.send",
    channels: ["email", "sms"],
    mode: "manual",
    recipientResolution: "Resolve to the quote's delivery selection, then fall back to the client correspondence contact.",
    previewRequired: true,
    suppressionRule: "Suppress only when the selected delivery target is missing or the contact has opted out of that channel.",
    idempotencyScope: "quote.send:{quoteId}:{deliveryMode}:{quoteVersion}",
    failureBehavior: "Leave quote sent state intact, create a delivery failure attention item, and expose retry.",
    auditEvent: "quote.sent",
    attachmentPolicy: "Attach the current immutable quote PDF only."
  },
  {
    templateId: "quote_approved",
    trigger: "portal.quote_approve",
    channels: ["email"],
    mode: "auto",
    recipientResolution: "Send to the approving customer email and copy the tenant reply-to address.",
    previewRequired: false,
    suppressionRule: "Skip only if the client has no deliverable email on file.",
    idempotencyScope: "quote.approved:{quoteId}:{quoteVersion}:{acceptanceId}",
    failureBehavior: "Leave acceptance intact, log failure, and queue an internal follow-up.",
    auditEvent: "quote.approval_confirmation_sent",
    attachmentPolicy: "Attach the approved quote PDF and any deposit receipt that exists."
  },
  {
    templateId: "deposit_failure",
    trigger: "portal.quote_approve_and_pay_deposit.failure",
    channels: ["email"],
    mode: "auto",
    recipientResolution: "Use the same email that attempted the portal approval.",
    previewRequired: false,
    suppressionRule: "Never suppress when the quote requires a deposit and the customer has an email address.",
    idempotencyScope: "quote.deposit_failure:{quoteId}:{attemptId}",
    failureBehavior: "Create an internal attention item if delivery also fails.",
    auditEvent: "quote.deposit_failure_notified",
    attachmentPolicy: "No attachments."
  },
  {
    templateId: "booking_confirmation",
    trigger: "job.schedule_visit",
    channels: ["email", "sms"],
    mode: "manual",
    recipientResolution: "Use the job contact delivery preferences for the scheduled visit.",
    previewRequired: true,
    suppressionRule: "Suppress a channel if that channel is disabled for reminders.",
    idempotencyScope: "visit.booking_confirmation:{visitId}:{revisionCount}",
    failureBehavior: "Keep the visit scheduled and create a delivery failure attention item.",
    auditEvent: "visit.booking_confirmation_sent",
    attachmentPolicy: "No attachments."
  },
  {
    templateId: "visit_rescheduled",
    trigger: "visit.reschedule",
    channels: ["email", "sms"],
    mode: "auto",
    recipientResolution: "Send to the visit's current client contact on every successful reschedule.",
    previewRequired: true,
    suppressionRule: "Skip a specific channel only if the client disabled that reminder channel first.",
    idempotencyScope: "visit.rescheduled:{visitId}:{revisionCount}",
    failureBehavior: "Record failure and keep the reschedule intact.",
    auditEvent: "visit.rescheduled_notified",
    attachmentPolicy: "No attachments."
  },
  {
    templateId: "visit_canceled",
    trigger: "visit.cancel",
    channels: ["email", "sms"],
    mode: "auto",
    recipientResolution: "Use the active visit contact record.",
    previewRequired: false,
    suppressionRule: "Suppress only when customer communications are disabled before cancelation is executed.",
    idempotencyScope: "visit.canceled:{visitId}:{cancellationId}",
    failureBehavior: "Keep the cancelation and create an internal delivery-failure task.",
    auditEvent: "visit.canceled_notified",
    attachmentPolicy: "No attachments."
  },
  {
    templateId: "invoice_sent",
    trigger: "invoice.send",
    channels: ["email", "sms"],
    mode: "manual",
    recipientResolution: "Use the invoice delivery defaults or the staff-selected send target.",
    previewRequired: true,
    suppressionRule: "Suppress only when the specific channel lacks a valid destination.",
    idempotencyScope: "invoice.send:{invoiceId}:{deliveryMode}:{invoiceVersion}",
    failureBehavior: "Do not roll back invoice status; create a delivery failure item and allow retry.",
    auditEvent: "invoice.sent",
    attachmentPolicy: "Attach the current invoice PDF and approved documents only."
  },
  {
    templateId: "payment_reminder",
    trigger: "overdue_scheduler",
    channels: ["email", "sms"],
    mode: "auto",
    recipientResolution: "Resolve against the invoice's billing contact.",
    previewRequired: false,
    suppressionRule: "Suppress only when the invoice is no longer open or already paid.",
    idempotencyScope: "invoice.payment_reminder:{invoiceId}:{dueBucket}:{scheduledAt}",
    failureBehavior: "Log failure and retry on the next scheduler pass.",
    auditEvent: "invoice.payment_reminder_sent",
    attachmentPolicy: "Attach the invoice only."
  },
  {
    templateId: "payment_receipt",
    trigger: "payment.collect",
    channels: ["email"],
    mode: "review_gated",
    recipientResolution: "Use the paying customer's email after receipt review is approved.",
    previewRequired: true,
    suppressionRule: "Never auto-send. Receipt review approval is mandatory every time.",
    idempotencyScope: "payment.receipt:{paymentId}:{receiptReviewId}",
    failureBehavior: "Keep the payment settled and leave the receipt review pending until staff resolves it.",
    auditEvent: "payment.receipt_sent",
    attachmentPolicy: "Attach the approved receipt and any selected closeout files."
  },
  {
    templateId: "customer_document_package",
    trigger: "closeout_normal_paid",
    channels: ["email"],
    mode: "review_gated",
    recipientResolution: "Use the package recipient chosen during closeout review.",
    previewRequired: true,
    suppressionRule: "Do not send until the package manifest is finalized.",
    idempotencyScope: "document_package.send:{packageId}:{packageVersion}",
    failureBehavior: "Create a delivery failure attention item; do not reopen field work.",
    auditEvent: "document_package.sent",
    attachmentPolicy: "Attach only approved report versions, invoice versions, and receipt versions in the immutable manifest."
  },
  {
    templateId: "delivery_failure",
    trigger: "any_send_command.failure",
    channels: ["internal"],
    mode: "auto",
    recipientResolution: "Route to owner and office-admin alert channels for the tenant.",
    previewRequired: false,
    suppressionRule: "Never suppress when customer delivery failed.",
    idempotencyScope: "delivery.failure:{entityType}:{entityId}:{attemptId}",
    failureBehavior: "Create a follow-up task and surface the failure in the Home needs-attention zone.",
    auditEvent: "delivery.failure_alerted",
    attachmentPolicy: "No customer attachments."
  },
  {
    templateId: "schedule_request_resolution",
    trigger: "client_schedule_request.resolve",
    channels: ["email", "sms"],
    mode: "auto",
    recipientResolution: "Use the client schedule request submitter contact.",
    previewRequired: false,
    suppressionRule: "Suppress only when the specific channel is unavailable.",
    idempotencyScope: "schedule_request.resolution:{scheduleRequestId}:{status}",
    failureBehavior: "Keep the staff decision and create an internal retry task.",
    auditEvent: "schedule_request.resolution_sent",
    attachmentPolicy: "No attachments."
  }
];

export const COMMUNICATION_TEMPLATES = communicationTemplateSchema.array().parse(COMMUNICATION_TEMPLATES_RAW);

const COMMAND_CONTRACTS_RAW: LifecycleCommandContract[] = [
  {
    commandId: "request.contact",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "request.contact",
    currentConditions: [{ code: "request_open", when: "request has not been closed or converted" }],
    dominantLabel: "Log contact attempt",
    secondaryActions: ["Schedule follow-up", "Convert to quote", "Flag for manager review"],
    requiredFields: ["channel", "outcome"],
    blockingConditions: [],
    transitionResult: "Creates ContactInteraction and may move request_status to contact_attempted or awaiting_customer_info.",
    createdEntities: ["ContactInteraction"],
    sideEffects: [{ kind: "audit", detail: "request.contact.logged" }],
    communicationTriggers: [],
    auditEvent: "request.contact.logged",
    confirmationTier: "none",
    offlineBehavior: { supported: false, behavior: "Office-only action; requires live data." },
    idempotencyScope: { keys: ["tenantId", "requestId", "clientOperationId"], description: "Avoid duplicate contact interactions from retries." },
    policyDependencies: []
  },
  {
    commandId: "request.convert_to_job",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "request.convert_to_job",
    currentConditions: [{ code: "path_a_ready", when: "pricing locked, in service area, intake complete, and no custom scope required" }],
    dominantLabel: "Create job",
    secondaryActions: ["Create quote", "Mark not serviceable"],
    requiredFields: ["clientId", "intakeSnapshot"],
    blockingConditions: [{ code: "missing_required_field", when: "intake is incomplete", blockerCopy: "Finish the intake details before creating a job." }],
    transitionResult: "Creates a linked draft job shell and moves the request toward qualified handling.",
    createdEntities: ["Job", "WorkPackage"],
    sideEffects: [{ kind: "entity_create", detail: "job.create_linked_shell" }, { kind: "audit", detail: "request.converted_to_job" }],
    communicationTriggers: [],
    auditEvent: "request.converted_to_job",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Requires live server validation." },
    idempotencyScope: { keys: ["tenantId", "requestId", "clientOperationId"], description: "Only one shell job should create from the same request action." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "request.convert_to_quote",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "request.convert_to_quote",
    currentConditions: [{ code: "custom_scope_needed", when: "pricing or scope needs staff composition" }],
    dominantLabel: "Create quote",
    secondaryActions: ["Create job", "Schedule follow-up"],
    requiredFields: ["clientId", "intakeSnapshot"],
    blockingConditions: [{ code: "missing_required_field", when: "intake is incomplete", blockerCopy: "Capture the required request details before composing a quote." }],
    transitionResult: "Creates a draft quote tied to the originating request.",
    createdEntities: ["Quote"],
    sideEffects: [{ kind: "entity_create", detail: "quote.create_draft" }, { kind: "audit", detail: "request.converted_to_quote" }],
    communicationTriggers: [],
    auditEvent: "request.converted_to_quote",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Requires live server validation." },
    idempotencyScope: { keys: ["tenantId", "requestId", "clientOperationId"], description: "Prevent duplicate draft quote creation from repeated submits." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "request.schedule_follow_up",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "request.contact",
    currentConditions: [{ code: "follow_up_needed", when: "request needs more customer info or deferred contact" }],
    dominantLabel: "Schedule follow-up",
    secondaryActions: ["Log contact attempt"],
    requiredFields: ["owner", "dueAt", "reason"],
    blockingConditions: [],
    transitionResult: "Creates FollowUpTask and moves request_status to follow_up_scheduled.",
    createdEntities: ["FollowUpTask"],
    sideEffects: [{ kind: "entity_create", detail: "follow_up_task.create" }, { kind: "audit", detail: "request.follow_up_scheduled" }],
    communicationTriggers: [],
    auditEvent: "request.follow_up_scheduled",
    confirmationTier: "none",
    offlineBehavior: { supported: false, behavior: "Requires live owner resolution." },
    idempotencyScope: { keys: ["tenantId", "requestId", "clientOperationId"], description: "Prevents duplicate follow-up tasks from refresh retries." },
    policyDependencies: []
  },
  {
    commandId: "request.merge_duplicate",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "request.merge",
    currentConditions: [{ code: "duplicate_candidate", when: "exact email or phone match has been confirmed" }],
    dominantLabel: "Merge duplicate",
    secondaryActions: ["Flag for manager review"],
    requiredFields: ["survivingRequestId", "mergedRequestIds"],
    blockingConditions: [{ code: "invalid_state", when: "any downstream record already differs", blockerCopy: "Resolve downstream records before merging these requests." }],
    transitionResult: "Consolidates duplicate requests until downstream entities make the merge irreversible.",
    createdEntities: [],
    sideEffects: [{ kind: "entity_update", detail: "request.merge" }, { kind: "audit", detail: "request.merged" }],
    communicationTriggers: [],
    auditEvent: "request.merged",
    confirmationTier: "high",
    offlineBehavior: { supported: false, behavior: "Needs live conflict checks before merging." },
    idempotencyScope: { keys: ["tenantId", "survivingRequestId", "clientOperationId"], description: "Prevents repeated merge application on refresh." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "quote.send",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "quote.send",
    currentConditions: [{ code: "quote_ready", when: "draft quote has at least one valid line item and delivery target" }],
    dominantLabel: "Send quote",
    secondaryActions: ["Save draft", "Preview PDF"],
    requiredFields: ["deliveryMode"],
    blockingConditions: [{ code: "missing_required_field", when: "delivery destination missing", blockerCopy: "Add an email or text destination before sending this quote." }],
    transitionResult: "Moves quote_status from draft to sent.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "quote_sent" }, { kind: "audit", detail: "quote.sent" }],
    communicationTriggers: [{ templateId: "quote_sent", mode: "manual" }],
    auditEvent: "quote.sent",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Sending is online only." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "Retry-safe send keyed to quote and chosen delivery." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "quote.revise",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "quote.revise",
    currentConditions: [{ code: "quote_editable", when: "quote is draft, sent, or change-requested but not accepted" }],
    dominantLabel: "Revise quote",
    secondaryActions: ["Renew quote", "Preview PDF"],
    requiredFields: ["lineItems"],
    blockingConditions: [{ code: "invalid_state", when: "quote already accepted", blockerCopy: "Accepted quotes stay immutable. Start follow-up work on the job instead." }],
    transitionResult: "Creates a new quote version, supersedes the prior version, and carries deposit math forward.",
    createdEntities: ["QuoteVersion"],
    sideEffects: [{ kind: "entity_create", detail: "quote.revision" }, { kind: "audit", detail: "quote.revised" }],
    communicationTriggers: [],
    auditEvent: "quote.revised",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Revision requires fresh totals and rule validation." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "One revision per client operation id." },
    policyDependencies: ["D5"]
  },
  {
    commandId: "quote.renew",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "quote.renew",
    currentConditions: [{ code: "quote_expired", when: "quote has expired but remains viewable" }],
    dominantLabel: "Renew quote",
    secondaryActions: ["Preview archived version"],
    requiredFields: ["newExpiryAt"],
    blockingConditions: [{ code: "invalid_state", when: "quote not expired", blockerCopy: "Only expired quotes can be renewed." }],
    transitionResult: "Resets expiry, rotates the approval token, keeps the same quote number, and archives the prior portal artifact.",
    createdEntities: ["QuoteVersionArchive"],
    sideEffects: [{ kind: "entity_update", detail: "quote.renew" }, { kind: "audit", detail: "quote.renewed" }],
    communicationTriggers: [],
    auditEvent: "quote.renewed",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Renewal is online only." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "Prevents duplicate renewals for the same request." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "portal.quote_view",
    type: "query",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "portal_granted", when: "tenant, customer, token, and resource grants all match" }],
    dominantLabel: "View quote",
    secondaryActions: ["Approve quote", "Request changes"],
    requiredFields: [],
    blockingConditions: [{ code: "authorization_missing", when: "portal token missing or expired", blockerCopy: "This quote link is no longer valid. Ask Aquatrace for a fresh one." }],
    transitionResult: "Returns the current quote portal payload without mutating state.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "portal.quote_viewed" }],
    communicationTriggers: [],
    auditEvent: "portal.quote_viewed",
    confirmationTier: "none",
    offlineBehavior: { supported: false, behavior: "Portal access requires a live token check." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "portalToken"], description: "Read-only portal view scope." },
    policyDependencies: []
  },
  {
    commandId: "portal.quote_approve",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "deposit_not_required", when: "quote signature rules are satisfied and no deposit is required" }],
    dominantLabel: "Approve quote",
    secondaryActions: ["Request changes", "Decline"],
    requiredFields: ["customerName", "signature"],
    blockingConditions: [
      { code: "invalid_state", when: "quote expired", blockerCopy: "This quote expired and must be renewed before approval." },
      { code: "missing_required_field", when: "required signature missing", blockerCopy: "Add the required signature before approving." }
    ],
    transitionResult: "Creates QuoteAcceptance and moves quote_status to accepted.",
    createdEntities: ["QuoteAcceptance"],
    sideEffects: [{ kind: "entity_create", detail: "quote_acceptance.create" }, { kind: "communication", detail: "quote_approved" }, { kind: "audit", detail: "quote.approved" }],
    communicationTriggers: [{ templateId: "quote_approved", mode: "auto" }],
    auditEvent: "quote.approved",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Client approval requires a live portal token." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "Only one acceptance record per client approval attempt." },
    policyDependencies: ["D1"]
  },
  {
    commandId: "portal.quote_approve_and_pay_deposit",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "deposit_required", when: "signature, deposit, and card-on-file rules all apply together" }],
    dominantLabel: "Approve and pay deposit",
    secondaryActions: ["Request changes", "Decline"],
    requiredFields: ["customerName", "signature", "paymentMethod"],
    blockingConditions: [
      { code: "invalid_state", when: "quote expired", blockerCopy: "This quote expired and must be renewed before approval." },
      { code: "missing_required_field", when: "deposit payment details missing", blockerCopy: "Add the required deposit payment details before approving." }
    ],
    transitionResult: "On success creates QuoteAcceptance plus a fully allocated deposit payment; on failure leaves quote_status as sent and records the failed attempt.",
    createdEntities: ["QuoteAcceptance", "Payment", "Allocation"],
    sideEffects: [
      { kind: "payment_attempt", detail: "deposit.collect_atomic" },
      { kind: "communication", detail: "quote_approved|deposit_failure" },
      { kind: "audit", detail: "quote.approval_attempted" }
    ],
    communicationTriggers: [{ templateId: "quote_approved", mode: "auto" }, { templateId: "deposit_failure", mode: "auto" }],
    auditEvent: "quote.approval_attempted",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Portal deposit collection is online only." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "Ties the atomic approval-plus-deposit attempt to one portal action." },
    policyDependencies: ["D1", "D4", "D5"]
  },
  {
    commandId: "portal.quote_decline",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "quote_sent", when: "customer is responding to a sent quote" }],
    dominantLabel: "Decline quote",
    secondaryActions: ["Request changes"],
    requiredFields: ["reason"],
    blockingConditions: [{ code: "invalid_state", when: "quote already accepted", blockerCopy: "This quote is already accepted and can no longer be declined." }],
    transitionResult: "Moves quote_status to declined and records the customer reason.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "quote.declined" }],
    communicationTriggers: [],
    auditEvent: "quote.declined",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Portal response requires live token validation." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "One decline decision per portal submit." },
    policyDependencies: []
  },
  {
    commandId: "portal.quote_request_changes",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "quote_sent", when: "customer wants changes without declining the quote outright" }],
    dominantLabel: "Request changes",
    secondaryActions: ["Decline quote"],
    requiredFields: ["message"],
    blockingConditions: [{ code: "invalid_state", when: "quote already accepted", blockerCopy: "Accepted quotes stay locked. New changes belong on the job." }],
    transitionResult: "Sets client_response_status to changes_requested while leaving quote_status unchanged.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "quote.change_requested" }],
    communicationTriggers: [],
    auditEvent: "quote.change_requested",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Portal response requires live token validation." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "One change request per portal submit." },
    policyDependencies: []
  },
  {
    commandId: "quote.internal_approve",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "quote.send",
    currentConditions: [{ code: "staff_manual_override", when: "internal staff is approving verbally or manually" }],
    dominantLabel: "Approve internally",
    secondaryActions: ["Send quote"],
    requiredFields: ["approverName", "approvalReason"],
    blockingConditions: [{ code: "invalid_state", when: "quote expired", blockerCopy: "Renew the quote before approving it internally." }],
    transitionResult: "Marks the quote accepted through the internal-manual path while keeping deposit collection as a separate later action if needed.",
    createdEntities: ["QuoteAcceptance"],
    sideEffects: [{ kind: "entity_create", detail: "quote_acceptance.create_internal" }, { kind: "audit", detail: "quote.approved_internal" }],
    communicationTriggers: [],
    auditEvent: "quote.approved_internal",
    confirmationTier: "high",
    offlineBehavior: { supported: false, behavior: "Approval must validate the current quote version online." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "Prevents duplicate internal approval writes." },
    policyDependencies: ["D1"]
  },
  {
    commandId: "quote.collect_deposit",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "deposit.collect",
    currentConditions: [{ code: "deposit_required", when: "quote approval path requires a deposit that is still unpaid" }],
    dominantLabel: "Collect deposit",
    secondaryActions: ["Waive deposit"],
    requiredFields: ["amount", "paymentMethod"],
    blockingConditions: [],
    transitionResult: "Collects the required deposit as a standalone office action and applies it to the quote authorization rail.",
    createdEntities: ["Payment", "Allocation"],
    sideEffects: [{ kind: "payment_attempt", detail: "deposit.collect" }, { kind: "audit", detail: "deposit.collected" }],
    communicationTriggers: [{ templateId: "payment_receipt", mode: "review_gated" }],
    auditEvent: "deposit.collected",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Deposit collection requires connection." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "One office-side deposit collection per submit." },
    policyDependencies: ["D2", "D3", "D4", "D5"]
  },
  {
    commandId: "quote.waive_deposit",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "deposit.waive",
    currentConditions: [{ code: "deposit_required", when: "deposit is configured but an authorized waiver is being granted" }],
    dominantLabel: "Waive deposit",
    secondaryActions: ["Collect deposit"],
    requiredFields: ["waiverReason"],
    blockingConditions: [],
    transitionResult: "Removes the deposit blocker from authorization while preserving an audited waiver trail.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "deposit.waived" }],
    communicationTriggers: [],
    auditEvent: "deposit.waived",
    confirmationTier: "high",
    offlineBehavior: { supported: false, behavior: "Waivers are online only." },
    idempotencyScope: { keys: ["tenantId", "quoteId", "clientOperationId"], description: "One waiver decision per submit." },
    policyDependencies: ["D2", "D3"]
  },
  {
    commandId: "job.create_linked_shell",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.create",
    currentConditions: [{ code: "upstream_request_or_quote_exists", when: "job shell is being seeded from a request or quote" }],
    dominantLabel: "Create linked shell",
    secondaryActions: ["Schedule visit"],
    requiredFields: ["clientId", "title"],
    blockingConditions: [],
    transitionResult: "Creates a draft job plus its first draft WorkPackage.",
    createdEntities: ["Job", "WorkPackage"],
    sideEffects: [{ kind: "entity_create", detail: "job.create_linked_shell" }, { kind: "audit", detail: "job.created" }],
    communicationTriggers: [],
    auditEvent: "job.created",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Job creation is online only." },
    idempotencyScope: { keys: ["tenantId", "sourceEntityId", "clientOperationId"], description: "Single shell job per upstream conversion action." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "job.activate",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.activate",
    currentConditions: [{ code: "customer_authorization_present", when: "job shell can move from draft to open once authorization exists" }],
    dominantLabel: "Activate job",
    secondaryActions: ["Schedule visit"],
    requiredFields: ["workPackageId"],
    blockingConditions: [{ code: "authorization_missing", when: "customer authorization missing", blockerCopy: "This job needs customer authorization before it can open." }],
    transitionResult: "Moves the job lifecycle into open and the linked WorkPackage into authorized.",
    createdEntities: [],
    sideEffects: [{ kind: "entity_update", detail: "job.activate" }, { kind: "audit", detail: "job.activated" }],
    communicationTriggers: [],
    auditEvent: "job.activated",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Activation is online only." },
    idempotencyScope: { keys: ["tenantId", "jobId", "clientOperationId"], description: "Activation applies once per client operation." },
    policyDependencies: ["D9"]
  },
  {
    commandId: "job.schedule_visit",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.schedule",
    currentConditions: [{ code: "job_open", when: "job is open and at least one work package is authorized" }],
    dominantLabel: "Schedule visit",
    secondaryActions: ["Create follow-up visit"],
    requiredFields: ["visitStart", "visitEnd", "assignedTo"],
    blockingConditions: [{ code: "capacity_conflict", when: "crew or arrival window capacity is exceeded", blockerCopy: "That window is full. Pick a different slot or rebalance the crew." }],
    transitionResult: "Creates or updates a scheduled visit and fires booking confirmation messaging.",
    createdEntities: ["Visit"],
    sideEffects: [{ kind: "communication", detail: "booking_confirmation" }, { kind: "audit", detail: "visit.scheduled" }],
    communicationTriggers: [{ templateId: "booking_confirmation", mode: "manual" }],
    auditEvent: "visit.scheduled",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Scheduling requires live availability checks." },
    idempotencyScope: { keys: ["tenantId", "jobId", "clientOperationId"], description: "Prevents duplicate visit scheduling from a double-submit." },
    policyDependencies: ["D9", "D12"]
  },
  {
    commandId: "visit.start_travel",
    type: "command",
    actorSurface: "field_mobile",
    requiredPermission: "visit.start",
    currentConditions: [{ code: "visit_scheduled", when: "crew is leaving for a scheduled visit" }],
    dominantLabel: "Start travel",
    secondaryActions: ["Call customer", "Directions"],
    requiredFields: [],
    blockingConditions: [{ code: "offline_restricted", when: "visit not present on the local device", blockerCopy: "Sync the latest visit details to this device before starting travel." }],
    transitionResult: "Moves visit travel status into traveling.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "visit.travel_started" }],
    communicationTriggers: [],
    auditEvent: "visit.travel_started",
    confirmationTier: "none",
    offlineBehavior: { supported: true, behavior: "Can be recorded locally and synced later for the technician's assigned work." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "Duplicate start-travel taps collapse into one transition." },
    policyDependencies: ["D16"]
  },
  {
    commandId: "visit.mark_arrived",
    type: "command",
    actorSurface: "field_mobile",
    requiredPermission: "visit.start",
    currentConditions: [{ code: "traveling", when: "crew has arrived on site" }],
    dominantLabel: "Mark arrived",
    secondaryActions: ["Call customer"],
    requiredFields: [],
    blockingConditions: [],
    transitionResult: "Moves visit travel status into arrived and visit status into in_progress.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "visit.arrived" }],
    communicationTriggers: [],
    auditEvent: "visit.arrived",
    confirmationTier: "none",
    offlineBehavior: { supported: true, behavior: "Can be recorded locally and synced later for the technician's assigned work." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "Duplicate arrival taps collapse into one transition." },
    policyDependencies: ["D16"]
  },
  {
    commandId: "visit.complete",
    type: "command",
    actorSurface: "field_mobile",
    requiredPermission: "visit.complete",
    currentConditions: [{ code: "visit_in_progress", when: "visit has started and required field docs are complete" }],
    dominantLabel: "Complete visit",
    secondaryActions: ["Pause visit", "Add media"],
    requiredFields: ["fieldDocumentationStatus"],
    blockingConditions: [{ code: "missing_required_field", when: "field docs incomplete", blockerCopy: "Finish the required field documentation before completing this visit." }],
    transitionResult: "Marks the visit completed locally first when needed and syncs admin closeout attention later.",
    createdEntities: [],
    sideEffects: [{ kind: "notification", detail: "create_admin_closeout_attention" }, { kind: "audit", detail: "visit.completed" }],
    communicationTriggers: [],
    auditEvent: "visit.completed",
    confirmationTier: "standard",
    offlineBehavior: { supported: true, behavior: "Technician can complete locally and sync on reconnect, with conflict checks on sync." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "Duplicate local complete actions collapse to one final completion event." },
    policyDependencies: ["D11", "D16"]
  },
  {
    commandId: "visit.unable_to_complete",
    type: "command",
    actorSurface: "field_mobile",
    requiredPermission: "visit.complete",
    currentConditions: [{ code: "visit_started_or_arrived", when: "crew needs to log an explicit unable-to-complete outcome" }],
    dominantLabel: "Log unable to complete",
    secondaryActions: ["Reschedule visit", "Call customer"],
    requiredFields: ["outcomeReason"],
    blockingConditions: [],
    transitionResult: "Moves visit_status to unable_to_complete and records the named outcome policy for later billing review.",
    createdEntities: ["OutcomeEvent"],
    sideEffects: [{ kind: "notification", detail: "create_admin_attention_from_outcome" }, { kind: "audit", detail: "visit.unable_to_complete" }],
    communicationTriggers: [],
    auditEvent: "visit.unable_to_complete",
    confirmationTier: "standard",
    offlineBehavior: { supported: true, behavior: "Can save locally and sync outcome details later." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "One outcome event per explicit submit." },
    policyDependencies: ["D13", "D16"]
  },
  {
    commandId: "visit.reschedule",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "visit.reschedule",
    currentConditions: [{ code: "visit_not_started", when: "visit is scheduled but not started" }],
    dominantLabel: "Reschedule visit",
    secondaryActions: ["Cancel visit", "Counter-propose"],
    requiredFields: ["visitStart", "visitEnd", "reason"],
    blockingConditions: [
      { code: "availability_conflict", when: "technician is unavailable", blockerCopy: "That technician is not available in this window." },
      { code: "capacity_conflict", when: "arrival window capacity is full", blockerCopy: "That arrival window is full. Pick a new one." }
    ],
    transitionResult: "Revises the visit schedule, preserves history, and sends a reschedule notice every time.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "visit_rescheduled" }, { kind: "audit", detail: "visit.rescheduled" }],
    communicationTriggers: [{ templateId: "visit_rescheduled", mode: "auto" }],
    auditEvent: "visit.rescheduled",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Reschedule is online only because it needs availability and capacity checks." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "Retry-safe by visit and revision request." },
    policyDependencies: ["D7", "D12"]
  },
  {
    commandId: "visit.cancel",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "visit.cancel",
    currentConditions: [{ code: "visit_exists", when: "a scheduled visit needs cancelation" }],
    dominantLabel: "Cancel visit",
    secondaryActions: ["Reschedule visit"],
    requiredFields: ["cancellationSource", "reason"],
    blockingConditions: [],
    transitionResult: "Cancels the visit, creates job attention follow-up, and keeps the next dominant action explicit rather than auto-selected.",
    createdEntities: ["FollowUpTask"],
    sideEffects: [{ kind: "communication", detail: "visit_canceled" }, { kind: "audit", detail: "visit.canceled" }],
    communicationTriggers: [{ templateId: "visit_canceled", mode: "auto" }],
    auditEvent: "visit.canceled",
    confirmationTier: "high",
    offlineBehavior: { supported: false, behavior: "Cancelation is online only." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "Prevents duplicate cancelation writes." },
    policyDependencies: ["D7", "D12"]
  },
  {
    commandId: "job.create_followup_visit",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.schedule",
    currentConditions: [{ code: "follow_up_needed", when: "more field work is needed on the same job" }],
    dominantLabel: "Create follow-up visit",
    secondaryActions: ["Reopen for follow-up"],
    requiredFields: ["workPackageId", "label"],
    blockingConditions: [],
    transitionResult: "Creates follow-up work on the same job rather than creating a new job.",
    createdEntities: ["Visit", "WorkPackage"],
    sideEffects: [{ kind: "entity_create", detail: "job.followup_visit_created" }, { kind: "audit", detail: "job.followup_visit_created" }],
    communicationTriggers: [],
    auditEvent: "job.followup_visit_created",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Follow-up scheduling is online only." },
    idempotencyScope: { keys: ["tenantId", "jobId", "clientOperationId"], description: "One follow-up creation per staff action." },
    policyDependencies: ["D18"]
  },
  {
    commandId: "job.reopen_for_followup",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.reopen",
    currentConditions: [{ code: "job_closed", when: "new work arrives after the job was closed" }],
    dominantLabel: "Reopen for follow-up",
    secondaryActions: ["Create follow-up visit"],
    requiredFields: ["reason", "newWorkpackageLabel"],
    blockingConditions: [],
    transitionResult: "Reopens the closed job on purpose and seeds the new work package on that same job record.",
    createdEntities: ["WorkPackage"],
    sideEffects: [{ kind: "entity_update", detail: "job.reopen_for_followup" }, { kind: "audit", detail: "job.reopened_for_followup" }],
    communicationTriggers: [],
    auditEvent: "job.reopened_for_followup",
    confirmationTier: "high",
    offlineBehavior: { supported: false, behavior: "Reopen is online only." },
    idempotencyScope: { keys: ["tenantId", "jobId", "clientOperationId"], description: "One reopen event per operator action." },
    policyDependencies: ["D18"]
  },
  {
    commandId: "job.close_and_invoice",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.close",
    currentConditions: [{ code: "report_approved_and_payment_settled", when: "approved report exists and payment is collected or confirmed" }],
    dominantLabel: "Close and send package",
    secondaryActions: ["Close without invoice", "Send invoice only"],
    requiredFields: ["packageRecipient"],
    blockingConditions: [
      { code: "document_not_approved", when: "report not approved", blockerCopy: "Approve the report before sending the final customer package." },
      { code: "financial_policy_block", when: "payment not settled", blockerCopy: "Collect or confirm payment before closing this paid path." }
    ],
    transitionResult: "Closes the job, creates CustomerDocumentPackage, and queues the review-gated delivery package.",
    createdEntities: ["CustomerDocumentPackage"],
    sideEffects: [{ kind: "communication", detail: "customer_document_package" }, { kind: "audit", detail: "job.closed_and_packaged" }],
    communicationTriggers: [{ templateId: "customer_document_package", mode: "review_gated" }],
    auditEvent: "job.closed_and_packaged",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Closeout requires live package assembly and delivery state." },
    idempotencyScope: { keys: ["tenantId", "jobId", "clientOperationId"], description: "Ensures one closeout package per operator action." },
    policyDependencies: ["D11", "D14"]
  },
  {
    commandId: "job.close_without_invoice",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "job.close",
    currentConditions: [{ code: "authorized_no_invoice", when: "warranty, no-charge, duplicate, included service, or other reason applies" }],
    dominantLabel: "Close without invoice",
    secondaryActions: ["Send invoice", "Create follow-up visit"],
    requiredFields: ["reason"],
    blockingConditions: [],
    transitionResult: "Closes the work without creating an invoice and records the audited reason.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "job.closed_without_invoice" }],
    communicationTriggers: [],
    auditEvent: "job.closed_without_invoice",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Closeout requires live authorization and audit logging." },
    idempotencyScope: { keys: ["tenantId", "jobId", "clientOperationId"], description: "One no-invoice closeout per action." },
    policyDependencies: ["D15"]
  },
  {
    commandId: "invoice.send",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "invoice.send",
    currentConditions: [{ code: "invoice_draft_or_open", when: "invoice exists and has a valid send target" }],
    dominantLabel: "Send invoice",
    secondaryActions: ["Collect payment", "Edit draft"],
    requiredFields: ["deliveryMode"],
    blockingConditions: [{ code: "missing_required_field", when: "delivery target missing", blockerCopy: "Add a delivery target before sending this invoice." }],
    transitionResult: "Sends the invoice without waiting for report approval, while still restricting attachments to approved docs only.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "invoice_sent" }, { kind: "audit", detail: "invoice.sent" }],
    communicationTriggers: [{ templateId: "invoice_sent", mode: "manual" }],
    auditEvent: "invoice.sent",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Invoice send is online only." },
    idempotencyScope: { keys: ["tenantId", "invoiceId", "clientOperationId"], description: "Prevents duplicate invoice sends from refresh retries." },
    policyDependencies: ["D14"]
  },
  {
    commandId: "portal.invoice_pay",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "invoice_open", when: "portal customer is paying an open invoice" }],
    dominantLabel: "Pay invoice",
    secondaryActions: ["View invoice"],
    requiredFields: ["paymentMethod", "amount"],
    blockingConditions: [
      { code: "amount_exceeds_balance", when: "payment amount is above the live balance", blockerCopy: "That amount is higher than the remaining balance." },
      { code: "amount_below_minimum", when: "partial payment is attempted without an active payment schedule", blockerCopy: "This invoice requires the full remaining balance right now." },
      { code: "payment_method_invalid", when: "selected payment method failed validation", blockerCopy: "Use a valid payment method to continue." }
    ],
    transitionResult: "Collects payment against the open invoice and refreshes the live balance before charging.",
    createdEntities: ["Payment", "Allocation", "ReceiptReview"],
    sideEffects: [{ kind: "payment_attempt", detail: "portal.invoice_pay" }, { kind: "audit", detail: "payment.collected" }],
    communicationTriggers: [{ templateId: "payment_receipt", mode: "review_gated" }],
    auditEvent: "payment.collected",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Portal payment is online only." },
    idempotencyScope: { keys: ["tenantId", "invoiceId", "clientOperationId"], description: "One payment attempt per client operation id." },
    policyDependencies: ["D19"]
  },
  {
    commandId: "payment.collect",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "payment.collect",
    currentConditions: [{ code: "invoice_open", when: "staff is collecting an invoice payment" }],
    dominantLabel: "Collect payment",
    secondaryActions: ["Retry payment", "View invoice"],
    requiredFields: ["amount", "method"],
    blockingConditions: [{ code: "amount_below_minimum", when: "partial payment is not allowed for this invoice", blockerCopy: "This invoice needs the full balance because no payment schedule is active." }],
    transitionResult: "Creates the payment and allocation records, then pauses at receipt review before anything customer-facing sends.",
    createdEntities: ["Payment", "Allocation", "ReceiptReview"],
    sideEffects: [{ kind: "payment_attempt", detail: "payment.collect" }, { kind: "audit", detail: "payment.collected" }],
    communicationTriggers: [{ templateId: "payment_receipt", mode: "review_gated" }],
    auditEvent: "payment.collected",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Money movement requires connection." },
    idempotencyScope: { keys: ["tenantId", "invoiceId", "clientOperationId"], description: "One payment collect action per operator submit." },
    policyDependencies: ["D19"]
  },
  {
    commandId: "payment.refund",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "payment.refund",
    currentConditions: [{ code: "payment_succeeded", when: "a succeeded payment exists that can be refunded" }],
    dominantLabel: "Refund payment",
    secondaryActions: ["View ledger"],
    requiredFields: ["amount", "reason"],
    blockingConditions: [],
    transitionResult: "Creates a refund transaction rather than a new allocation type and adjusts downstream balances.",
    createdEntities: ["Payment"],
    sideEffects: [{ kind: "payment_attempt", detail: "payment.refund" }, { kind: "audit", detail: "payment.refunded" }],
    communicationTriggers: [],
    auditEvent: "payment.refunded",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Refunds require live processor state." },
    idempotencyScope: { keys: ["tenantId", "paymentId", "clientOperationId"], description: "One refund attempt per submit." },
    policyDependencies: ["D6"]
  },
  {
    commandId: "payment.retry",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "payment.retry",
    currentConditions: [{ code: "payment_failed", when: "a failed attempt exists and recovery is allowed" }],
    dominantLabel: "Retry payment",
    secondaryActions: ["Collect payment", "Send pay link"],
    requiredFields: ["method"],
    blockingConditions: [],
    transitionResult: "Creates a new payment attempt against the same invoice or quote bridge context.",
    createdEntities: ["Payment"],
    sideEffects: [{ kind: "payment_attempt", detail: "payment.retry" }, { kind: "audit", detail: "payment.retried" }],
    communicationTriggers: [],
    auditEvent: "payment.retried",
    confirmationTier: "financial",
    offlineBehavior: { supported: false, behavior: "Retry requires live processor access." },
    idempotencyScope: { keys: ["tenantId", "paymentId", "clientOperationId"], description: "One retry attempt per submit." },
    policyDependencies: ["D19"]
  },
  {
    commandId: "invoice.void",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "invoice.void",
    currentConditions: [{ code: "invoice_voidable", when: "invoice is open or draft with no succeeded payment" }],
    dominantLabel: "Void invoice",
    secondaryActions: ["Write off invoice"],
    requiredFields: ["reason"],
    blockingConditions: [{ code: "financial_policy_block", when: "a succeeded payment already exists", blockerCopy: "This invoice already has collected money. Refund instead of voiding it." }],
    transitionResult: "Moves the invoice to void and sends deposit disposition into manual review rather than auto-release.",
    createdEntities: [],
    sideEffects: [{ kind: "audit", detail: "invoice.voided" }],
    communicationTriggers: [],
    auditEvent: "invoice.voided",
    confirmationTier: "high",
    offlineBehavior: { supported: false, behavior: "Void requires live ledger validation." },
    idempotencyScope: { keys: ["tenantId", "invoiceId", "clientOperationId"], description: "One void decision per submit." },
    policyDependencies: ["D6"]
  },
  {
    commandId: "report.submit_for_review",
    type: "command",
    actorSurface: "field_mobile",
    requiredPermission: "visit.report_edit",
    currentConditions: [{ code: "field_docs_ready", when: "technician has completed the required field documentation set" }],
    dominantLabel: "Submit for review",
    secondaryActions: ["Edit field docs"],
    requiredFields: ["reportDraftId"],
    blockingConditions: [{ code: "missing_required_field", when: "required field docs missing", blockerCopy: "Finish the required field documentation before submitting for review." }],
    transitionResult: "Moves the report draft into awaiting_review for owner or office-admin approval.",
    createdEntities: [],
    sideEffects: [{ kind: "notification", detail: "create_report_review_attention" }, { kind: "audit", detail: "report.submitted_for_review" }],
    communicationTriggers: [],
    auditEvent: "report.submitted_for_review",
    confirmationTier: "standard",
    offlineBehavior: { supported: true, behavior: "Technician can queue the submit locally and sync once connected." },
    idempotencyScope: { keys: ["tenantId", "reportId", "clientOperationId"], description: "One report submit action per draft version." },
    policyDependencies: ["D11", "D16"]
  },
  {
    commandId: "report.approve_and_send",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "report.approve",
    currentConditions: [{ code: "report_awaiting_review", when: "field documentation was submitted and a report draft is ready" }],
    dominantLabel: "Approve report",
    secondaryActions: ["Send invoice", "Request changes"],
    requiredFields: ["reportVersionId"],
    blockingConditions: [],
    transitionResult: "Approves the report version and makes it eligible for immutable package assembly.",
    createdEntities: [],
    sideEffects: [{ kind: "entity_update", detail: "report.approve" }, { kind: "audit", detail: "report.approved" }],
    communicationTriggers: [],
    auditEvent: "report.approved",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Report approval is online only." },
    idempotencyScope: { keys: ["tenantId", "reportId", "clientOperationId"], description: "Single approval decision per report version." },
    policyDependencies: ["D11", "D14"]
  },
  {
    commandId: "portal.request_reschedule",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "future_visit_exists", when: "customer is requesting a future appointment change" }],
    dominantLabel: "Request reschedule",
    secondaryActions: ["Request cancellation"],
    requiredFields: ["requestedWindow", "reason"],
    blockingConditions: [],
    transitionResult: "Creates ClientScheduleRequest while leaving the visit schedule unchanged.",
    createdEntities: ["ClientScheduleRequest"],
    sideEffects: [{ kind: "notification", detail: "create_schedule_request_attention" }, { kind: "audit", detail: "client_schedule_request.created" }],
    communicationTriggers: [],
    auditEvent: "client_schedule_request.created",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Portal requests require live token validation." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "One client schedule request per portal submit." },
    policyDependencies: ["D17"]
  },
  {
    commandId: "portal.request_cancellation",
    type: "command",
    actorSurface: "portal",
    authorizationProfileId: PORTAL_AUTHORIZATION_PROFILE_ID,
    currentConditions: [{ code: "future_visit_exists", when: "customer is requesting cancelation rather than reschedule" }],
    dominantLabel: "Request cancellation",
    secondaryActions: ["Request reschedule"],
    requiredFields: ["reason"],
    blockingConditions: [],
    transitionResult: "Creates ClientScheduleRequest while leaving the current visit schedule unchanged until staff acts.",
    createdEntities: ["ClientScheduleRequest"],
    sideEffects: [{ kind: "notification", detail: "create_schedule_request_attention" }, { kind: "audit", detail: "client_schedule_request.created" }],
    communicationTriggers: [],
    auditEvent: "client_schedule_request.created",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Portal requests require live token validation." },
    idempotencyScope: { keys: ["tenantId", "visitId", "clientOperationId"], description: "One client schedule request per portal submit." },
    policyDependencies: ["D17"]
  },
  {
    commandId: "client_schedule_request.accept_reschedule",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "visit.reschedule",
    currentConditions: [{ code: "request_pending", when: "staff is resolving a pending reschedule request" }],
    dominantLabel: "Accept reschedule",
    secondaryActions: ["Decline", "Counter-propose"],
    requiredFields: ["visitStart", "visitEnd"],
    blockingConditions: [{ code: "availability_conflict", when: "requested or proposed window is unavailable", blockerCopy: "That requested window is not available for the assigned crew." }],
    transitionResult: "Resolves the request as accepted and executes the actual visit.reschedule command.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "schedule_request_resolution" }, { kind: "audit", detail: "client_schedule_request.accepted" }],
    communicationTriggers: [{ templateId: "schedule_request_resolution", mode: "auto" }],
    auditEvent: "client_schedule_request.accepted",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Resolution is online only." },
    idempotencyScope: { keys: ["tenantId", "scheduleRequestId", "clientOperationId"], description: "One accept decision per request." },
    policyDependencies: ["D17"]
  },
  {
    commandId: "client_schedule_request.accept_cancellation",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "visit.cancel",
    currentConditions: [{ code: "request_pending", when: "staff is resolving a pending cancellation request" }],
    dominantLabel: "Accept cancellation",
    secondaryActions: ["Decline", "Counter-propose"],
    requiredFields: ["reason"],
    blockingConditions: [],
    transitionResult: "Resolves the request as accepted and executes visit.cancel without auto-applying before the staff decision.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "schedule_request_resolution" }, { kind: "audit", detail: "client_schedule_request.accepted" }],
    communicationTriggers: [{ templateId: "schedule_request_resolution", mode: "auto" }],
    auditEvent: "client_schedule_request.accepted",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Resolution is online only." },
    idempotencyScope: { keys: ["tenantId", "scheduleRequestId", "clientOperationId"], description: "One accept decision per request." },
    policyDependencies: ["D17"]
  },
  {
    commandId: "client_schedule_request.decline",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "schedule_request.manage",
    currentConditions: [{ code: "request_pending", when: "staff is declining the client's requested change" }],
    dominantLabel: "Decline request",
    secondaryActions: ["Accept request", "Counter-propose"],
    requiredFields: ["resolutionNote"],
    blockingConditions: [],
    transitionResult: "Resolves the schedule request as declined without changing the current visit schedule.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "schedule_request_resolution" }, { kind: "audit", detail: "client_schedule_request.declined" }],
    communicationTriggers: [{ templateId: "schedule_request_resolution", mode: "auto" }],
    auditEvent: "client_schedule_request.declined",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Resolution is online only." },
    idempotencyScope: { keys: ["tenantId", "scheduleRequestId", "clientOperationId"], description: "One decline decision per request." },
    policyDependencies: ["D17"]
  },
  {
    commandId: "client_schedule_request.counter_propose",
    type: "command",
    actorSurface: "office_web",
    requiredPermission: "schedule_request.manage",
    currentConditions: [{ code: "request_pending", when: "staff needs to offer a different window" }],
    dominantLabel: "Counter-propose",
    secondaryActions: ["Accept request", "Decline"],
    requiredFields: ["proposedWindow", "resolutionNote"],
    blockingConditions: [],
    transitionResult: "Resolves the schedule request as counter_proposed and notifies the customer without changing the schedule yet.",
    createdEntities: [],
    sideEffects: [{ kind: "communication", detail: "schedule_request_resolution" }, { kind: "audit", detail: "client_schedule_request.counter_proposed" }],
    communicationTriggers: [{ templateId: "schedule_request_resolution", mode: "auto" }],
    auditEvent: "client_schedule_request.counter_proposed",
    confirmationTier: "standard",
    offlineBehavior: { supported: false, behavior: "Resolution is online only." },
    idempotencyScope: { keys: ["tenantId", "scheduleRequestId", "clientOperationId"], description: "One counter-proposal per request resolution action." },
    policyDependencies: ["D17"]
  }
];

export const COMMAND_CONTRACTS = lifecycleCommandContractSchema.array().parse(COMMAND_CONTRACTS_RAW);
export const COMMANDS_BY_ID = new Map(COMMAND_CONTRACTS.map((command) => [command.commandId, command]));
export const COMMUNICATIONS_BY_ID = new Map(COMMUNICATION_TEMPLATES.map((template) => [template.templateId, template]));

export function traceCommandsByDecision(decisionId: DecisionId): LifecycleCommandContract[] {
  return COMMAND_CONTRACTS.filter((command) => command.policyDependencies.includes(decisionId));
}

export function commandsForPermission(permissionId: (typeof PERMISSION_IDS)[number]): LifecycleCommandContract[] {
  return COMMAND_CONTRACTS.filter((command) => command.requiredPermission === permissionId);
}

export function deriveQuoteDominantAction(input: {
  quoteStatus: QuoteLifecycleStatus;
  clientResponseStatus: QuoteClientResponseStatus;
  requireDeposit: boolean;
  expired: boolean;
  missingSignature?: boolean | undefined;
  missingDepositMethod?: boolean | undefined;
}): DominantActionState {
  if (input.expired || input.quoteStatus === "expired") {
    return dominantActionStateSchema.parse({
      label: "Renew quote",
      tone: "blocked",
      reason: "The quote is viewable but approval is hard-blocked until renewal.",
      blockedBy: "Quote expired",
      nextCommandId: "quote.renew"
    });
  }
  if (input.clientResponseStatus === "changes_requested") {
    return dominantActionStateSchema.parse({
      label: "Revise quote",
      tone: "dominant",
      reason: "The customer asked for changes, so the next move is a revision.",
      nextCommandId: "quote.revise"
    });
  }
  if (input.quoteStatus === "draft") {
    return dominantActionStateSchema.parse({
      label: "Send quote",
      tone: "dominant",
      reason: "Draft quotes are waiting to be sent.",
      nextCommandId: "quote.send"
    });
  }
  if (input.quoteStatus === "sent") {
    if (input.missingSignature) {
      return dominantActionStateSchema.parse({
        label: "Approve quote",
        tone: "blocked",
        reason: "The client has not signed yet.",
        blockedBy: "Signature required",
        nextCommandId: input.requireDeposit ? "portal.quote_approve_and_pay_deposit" : "portal.quote_approve"
      });
    }
    if (input.requireDeposit && input.missingDepositMethod) {
      return dominantActionStateSchema.parse({
        label: "Approve and pay deposit",
        tone: "blocked",
        reason: "A full deposit must clear before approval can stick.",
        blockedBy: "Deposit payment details missing",
        nextCommandId: "portal.quote_approve_and_pay_deposit"
      });
    }
    return dominantActionStateSchema.parse({
      label: input.requireDeposit ? "Approve and pay deposit" : "Approve quote",
      tone: "dominant",
      reason: "The quote is out with the customer and ready for portal approval.",
      nextCommandId: input.requireDeposit ? "portal.quote_approve_and_pay_deposit" : "portal.quote_approve"
    });
  }
  return dominantActionStateSchema.parse({
    label: "View approval",
    tone: "quiet",
    reason: "Accepted quotes are immutable and shift the next work into job operations."
  });
}

export function deriveVisitDominantAction(input: {
  scheduleStatus: VisitScheduleStatus;
  travelStatus: VisitTravelStatus;
  visitStatus: VisitLifecycleStatus;
  fieldDocumentationComplete: boolean;
  blockedByCapacity?: boolean | undefined;
}): DominantActionState {
  if (input.scheduleStatus === "unscheduled") {
    return dominantActionStateSchema.parse({
      label: "Schedule visit",
      tone: "dominant",
      reason: "Unscheduled work needs a booked time before field work can start.",
      nextCommandId: "job.schedule_visit"
    });
  }
  if (input.visitStatus === "not_started" && input.travelStatus === "not_started") {
    return dominantActionStateSchema.parse({
      label: "Start travel",
      tone: "dominant",
      reason: "The visit is scheduled and ready for the crew to head out.",
      nextCommandId: "visit.start_travel"
    });
  }
  if (input.visitStatus === "not_started" && input.travelStatus === "traveling") {
    return dominantActionStateSchema.parse({
      label: "Mark arrived",
      tone: "dominant",
      reason: "Travel has started and the next field state is arrival.",
      nextCommandId: "visit.mark_arrived"
    });
  }
  if (input.visitStatus === "in_progress" && !input.fieldDocumentationComplete) {
    return dominantActionStateSchema.parse({
      label: "Complete visit",
      tone: "blocked",
      reason: "The visit can finish once the required documentation is complete.",
      blockedBy: "Field documentation incomplete",
      nextCommandId: "visit.complete"
    });
  }
  if (input.visitStatus === "in_progress" || input.visitStatus === "paused") {
    return dominantActionStateSchema.parse({
      label: "Complete visit",
      tone: "dominant",
      reason: "Field work is underway and can be completed now.",
      nextCommandId: "visit.complete"
    });
  }
  if (input.blockedByCapacity) {
    return dominantActionStateSchema.parse({
      label: "Reschedule visit",
      tone: "blocked",
      reason: "The requested window is full.",
      blockedBy: "Capacity conflict",
      nextCommandId: "visit.reschedule"
    });
  }
  return dominantActionStateSchema.parse({
    label: "View visit",
    tone: "quiet",
    reason: "This visit is either completed or canceled."
  });
}

export function deriveInvoiceDominantAction(input: {
  lifecycle: InvoiceLifecycleStatus;
  deliveryStatus: InvoiceDeliveryStatus;
  balanceStatus: InvoiceBalanceStatus;
  paymentScheduleActive: boolean;
}): DominantActionState {
  if (input.lifecycle === "draft") {
    return dominantActionStateSchema.parse({
      label: "Send invoice",
      tone: "dominant",
      reason: "Draft invoices need delivery before payment can be requested.",
      nextCommandId: "invoice.send"
    });
  }
  if (input.lifecycle === "open" && input.balanceStatus !== "paid") {
    return dominantActionStateSchema.parse({
      label: input.paymentScheduleActive ? "Collect scheduled payment" : "Collect payment",
      tone: "dominant",
      reason: "The invoice is open with balance remaining.",
      nextCommandId: "payment.collect"
    });
  }
  if (input.deliveryStatus === "failed") {
    return dominantActionStateSchema.parse({
      label: "Retry send",
      tone: "danger",
      reason: "Customer delivery failed and needs staff attention.",
      nextCommandId: "invoice.send"
    });
  }
  return dominantActionStateSchema.parse({
    label: "View receipt",
    tone: "quiet",
    reason: "Paid or closed invoices no longer need a dominant financial action."
  });
}

export function deriveClientScheduleRequestDominantAction(status: ClientScheduleRequestStatus): DominantActionState {
  if (status === "pending") {
    return dominantActionStateSchema.parse({
      label: "Resolve request",
      tone: "dominant",
      reason: "Client schedule requests never auto-apply; staff has to act.",
      nextCommandId: "client_schedule_request.accept_reschedule"
    });
  }
  if (status === "counter_proposed") {
    return dominantActionStateSchema.parse({
      label: "Wait for customer",
      tone: "quiet",
      reason: "A counter-proposal is already out and the current state is passive."
    });
  }
  return dominantActionStateSchema.parse({
    label: "View resolution",
    tone: "quiet",
    reason: "This request already has a final staff decision."
  });
}
