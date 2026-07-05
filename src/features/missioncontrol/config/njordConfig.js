import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

/**
 * Njord Host Agent — Configuration
 *
 * Njord is the host agent for the Aquatrace case-study Mission Control.
 * "Aquatrace" here is NexTeam-Studio case-study client #1 — a demo/showcase
 * tenant used to demonstrate the Njord agent layer. No connection to any
 * external Aquatrace systems, repos, or credentials.
 *
 * CASE-STUDY MODE RULES:
 *   - Full-list email/campaign sends are ALWAYS sandbox/log-only.
 *   - Test email must be sent and confirmed before any broader send is unlocked.
 *   - Two-confirmation approval is required before any campaign action.
 *   - These rules cannot be overridden via UI in case-study mode.
 */

export const NJORD_TENANT_ID = "aquatrace-case-study";

export const NJORD_CONFIG = {
  tenantId: NJORD_TENANT_ID,
  agentName: "Njord",
  brandName: "Aquatrace",
  industry: "water-services",
  accentColor: "#0EA5E9",

  /** Case-study mode is always true for this tenant. */
  caseStudyMode: true,

  /**
   * In case-study mode, full-list sends are disabled.
   * Any attempt is intercepted and logged/sandboxed only.
   */
  fullListSendEnabled: false,

  /**
   * Test email address for campaign dry-runs.
   * Must be confirmed before broader sends are considered.
   */
  testEmailAddress: getRuntimeConfigValue("VITE_NJORD_TEST_EMAIL", ""),

  /**
   * Firestore collection for Njord session logs.
   * Isolated from the main agentSessions collection.
   */
  sessionCollection: "njordSessions",

  /**
   * Firestore collection for campaign action logs.
   */
  campaignLogCollection: "njordCampaignLogs",
};

/**
 * Returns true if the tenant is in case-study (sandbox) mode.
 * @returns {boolean}
 */
export function isCaseStudyMode() {
  return NJORD_CONFIG.caseStudyMode === true;
}
