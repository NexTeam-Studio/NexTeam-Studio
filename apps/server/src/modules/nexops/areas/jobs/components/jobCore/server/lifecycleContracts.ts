import type { CommunicationTemplate, LifecycleCommandContract } from "@nexteam/core";
import { PORTAL_AUTHORIZATION_PROFILE_ID } from "../../../../../../../crm/lifecyclePolicy.js";

export const JOB_CORE_COMMANDS: LifecycleCommandContract[] = [
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
  }
];

export const JOB_CORE_COMMUNICATIONS: CommunicationTemplate[] = [

];
