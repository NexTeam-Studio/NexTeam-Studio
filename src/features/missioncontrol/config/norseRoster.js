/**
 * Norse Subagent Roster — Routing Stubs
 *
 * These are the five route targets under Njord (host agent).
 * Each entry defines the agent identity and what kinds of intents
 * should be routed to it. Actual implementations are stubs —
 * expand each handler as the case-study needs grow.
 *
 * Hierarchy:
 *   Njord (host) → routes to → Heimdall | Thor | Mimir | Freyja | Bragi
 */

/**
 * @typedef {Object} NorseAgent
 * @property {string} id          - Unique slug
 * @property {string} name        - Agent display name
 * @property {string} role        - Short role label
 * @property {string} description - What this agent handles
 * @property {string[]} intents   - Intent tags this agent handles
 */

/** @type {NorseAgent[]} */
export const NORSE_ROSTER = [
  {
    id: "heimdall",
    name: "Heimdall",
    role: "Gatekeeper & Intake",
    description:
      "Watches all inbound. First-pass intake, contact validation, and session routing decisions.",
    intents: ["intake", "validation", "routing", "new-contact", "inbound-request"],
  },
  {
    id: "thor",
    name: "Thor",
    role: "Outreach & Campaign Execution",
    description:
      "Drives outbound campaigns. Owns email sequence execution, timing, and delivery tracking.",
    intents: ["campaign", "email-send", "outreach", "follow-up", "sequence"],
  },
  {
    id: "mimir",
    name: "Mimir",
    role: "Knowledge & Research",
    description:
      "Holds context. Answers questions, retrieves records, and surfaces relevant history.",
    intents: ["lookup", "research", "history", "record-fetch", "context"],
  },
  {
    id: "freyja",
    name: "Freyja",
    role: "Relationships & Engagement",
    description:
      "Manages relationship quality. Tracks sentiment, engagement scores, and warm outreach tone.",
    intents: ["relationship", "sentiment", "engagement", "nurture", "warm-outreach"],
  },
  {
    id: "bragi",
    name: "Bragi",
    role: "Content & Messaging",
    description:
      "Crafts the words. Generates email copy, templates, subject lines, and message variants.",
    intents: ["content", "copy", "template", "subject-line", "message-draft"],
  },
];

/**
 * Returns a Norse agent definition by id.
 * @param {string} id
 * @returns {NorseAgent|undefined}
 */
export function getNorseAgentById(id) {
  return NORSE_ROSTER.find((a) => a.id === id);
}

/**
 * Returns the agent(s) best suited for a given intent tag.
 * Falls back to Heimdall (gatekeeper) if no match is found.
 *
 * @param {string} intent
 * @returns {NorseAgent[]}
 */
export function getNorseAgentsForIntent(intent) {
  const matches = NORSE_ROSTER.filter((a) => a.intents.includes(intent));
  if (matches.length > 0) return matches;
  // Default fallback: Heimdall handles anything unclassified
  return NORSE_ROSTER.filter((a) => a.id === "heimdall");
}
