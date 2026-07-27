import { communicationTemplateSchema, lifecycleCommandContractSchema, type DecisionId, type LifecycleCommandContract } from "@nexteam/core";
import { PERMISSION_IDS } from "./lifecyclePolicy.js";
import { REQUEST_CORE_COMMANDS, REQUEST_CORE_COMMUNICATIONS } from "../modules/nexops/areas/requests/components/requestCore/server/lifecycleContracts.js";
import { QUOTE_ENGINE_COMMANDS, QUOTE_ENGINE_COMMUNICATIONS } from "../modules/nexops/areas/quotes/components/quoteEngine/server/lifecycleContracts.js";
import { JOB_CORE_COMMANDS, JOB_CORE_COMMUNICATIONS } from "../modules/nexops/areas/jobs/components/jobCore/server/lifecycleContracts.js";
import { VISIT_CORE_COMMANDS, VISIT_CORE_COMMUNICATIONS } from "../modules/nexops/areas/visits/components/visitCore/server/lifecycleContracts.js";
import { INVOICE_STRUCTURE_COMMANDS, INVOICE_STRUCTURE_COMMUNICATIONS } from "../modules/nexops/areas/invoices/components/invoiceStructure/server/lifecycleContracts.js";
import { PAYMENT_RAILS_COMMANDS, PAYMENT_RAILS_COMMUNICATIONS } from "../modules/nexops/areas/invoices/components/paymentRails/server/lifecycleContracts.js";
import { DOCUMENT_RENDERING_COMMANDS, DOCUMENT_RENDERING_COMMUNICATIONS } from "../shared/documentRendering/lifecycleContracts.js";
import { PORTAL_CORE_COMMANDS, PORTAL_CORE_COMMUNICATIONS } from "../modules/nexportal/components/portalCore/server/lifecycleContracts.js";

export { DECISION_REGISTRY, PERMISSION_IDS, PORTAL_AUTHORIZATION_PROFILE_ID } from "./lifecyclePolicy.js";
export * from "../modules/nexops/areas/quotes/components/quoteEngine/domain/dominantAction.js";
export * from "../modules/nexops/areas/visits/components/visitCore/domain/dominantAction.js";
export * from "../modules/nexops/areas/invoices/components/invoiceStructure/domain/dominantAction.js";
export * from "../modules/nexportal/components/portalCore/domain/dominantAction.js";

export const COMMUNICATION_TEMPLATES = communicationTemplateSchema.array().parse([
  ...REQUEST_CORE_COMMUNICATIONS,
  ...QUOTE_ENGINE_COMMUNICATIONS,
  ...JOB_CORE_COMMUNICATIONS,
  ...VISIT_CORE_COMMUNICATIONS,
  ...INVOICE_STRUCTURE_COMMUNICATIONS,
  ...PAYMENT_RAILS_COMMUNICATIONS,
  ...DOCUMENT_RENDERING_COMMUNICATIONS,
  ...PORTAL_CORE_COMMUNICATIONS,
]);

export const COMMAND_CONTRACTS = lifecycleCommandContractSchema.array().parse([
  ...REQUEST_CORE_COMMANDS,
  ...QUOTE_ENGINE_COMMANDS,
  ...JOB_CORE_COMMANDS,
  ...VISIT_CORE_COMMANDS,
  ...INVOICE_STRUCTURE_COMMANDS,
  ...PAYMENT_RAILS_COMMANDS,
  ...DOCUMENT_RENDERING_COMMANDS,
  ...PORTAL_CORE_COMMANDS,
]);

export const COMMANDS_BY_ID = new Map(COMMAND_CONTRACTS.map((command) => [command.commandId, command]));
export const COMMUNICATIONS_BY_ID = new Map(COMMUNICATION_TEMPLATES.map((template) => [template.templateId, template]));

export function traceCommandsByDecision(decisionId: DecisionId): LifecycleCommandContract[] {
  return COMMAND_CONTRACTS.filter((command) => command.policyDependencies.includes(decisionId));
}

export function commandsForPermission(permissionId: (typeof PERMISSION_IDS)[number]): LifecycleCommandContract[] {
  return COMMAND_CONTRACTS.filter((command) => command.requiredPermission === permissionId);
}
