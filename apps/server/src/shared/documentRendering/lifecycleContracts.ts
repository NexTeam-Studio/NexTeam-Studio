import type { CommunicationTemplate, LifecycleCommandContract } from "@nexteam/core";


export const DOCUMENT_RENDERING_COMMANDS: LifecycleCommandContract[] = [
  {
    commandId: "report.submit_for_review",
    type: "command",
    actorSurface: "field_mobile",
    requiredPermission: "visit.report_edit",
    currentConditions: [{ code: "field_docs_ready", when: "technician has completed the required field documentation set" }],
    dominantLabel: "Submit for review",
    secondaryActions: ["Edit field documentation"],
    requiredFields: ["reportDraftId"],
    blockingConditions: [{ code: "missing_required_field", when: "required field documentation missing", blockerCopy: "Finish the required field documentation before submitting for review." }],
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
  }
];

export const DOCUMENT_RENDERING_COMMUNICATIONS: CommunicationTemplate[] = [
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
  }
];
