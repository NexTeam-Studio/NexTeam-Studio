import type { SelfRepairSafeRepair } from "./schemas.js";

export interface SelfRepairPolicyDecision {
  allowed: boolean;
  reason: string;
}

/**
 * The repair worker's locked toolbox. New repair types must be explicitly
 * added here before they can run automatically. This is deliberately
 * separate from AI classification: an AI answer can suggest a finding, but
 * it cannot expand the set of actions Nexi is allowed to take.
 */
const AUTO_REPAIR_TYPES = new Set<SelfRepairSafeRepair["type"]>([
  "failure_log_reclassification",
  "wall_entry_candidate",
  "transient_health_retry",
  "gap_label_correction"
]);

const HIGH_RISK_LANGUAGE = /\b(?:delete|remove|send|email|text|sms|payment|invoice|charge|refund|stripe|permission|role|user|import|bulk|publish|deploy|credential|secret|schema|soul)\b/i;

export function decideSelfRepair(repair: SelfRepairSafeRepair): SelfRepairPolicyDecision {
  if (!AUTO_REPAIR_TYPES.has(repair.type)) {
    return { allowed: false, reason: "This repair type is not in Nexi's approved automatic toolbox." };
  }
  if (!repair.applied) {
    return { allowed: false, reason: "The analyzer marked this item as requiring a product repair." };
  }
  // A repair receipt may safely quote a user request, but it must never turn
  // that request into an action. These types are metadata-only by design.
  if (repair.type !== "wall_entry_candidate" && HIGH_RISK_LANGUAGE.test(`${repair.summary} ${repair.before ?? ""} ${repair.after ?? ""}`)) {
    return { allowed: false, reason: "This repair mentions a protected action and requires explicit approval." };
  }
  return { allowed: true, reason: "Approved metadata-only repair from Nexi's locked automatic toolbox." };
}

export const selfRepairPolicy = {
  autoRepairTypes: [...AUTO_REPAIR_TYPES]
} as const;
