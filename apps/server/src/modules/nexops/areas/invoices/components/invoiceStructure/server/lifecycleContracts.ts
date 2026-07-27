import type { CommunicationTemplate, LifecycleCommandContract } from "@nexteam/core";
import { PORTAL_AUTHORIZATION_PROFILE_ID } from "../../../../../../../crm/lifecyclePolicy.js";

export const INVOICE_STRUCTURE_COMMANDS: LifecycleCommandContract[] = [
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
  }
];

export const INVOICE_STRUCTURE_COMMUNICATIONS: CommunicationTemplate[] = [
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
  }
];
