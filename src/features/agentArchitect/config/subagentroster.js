/**
 * NexTeam-Studio Subagent Roster
 *
 * This file defines the subagent framework that backs each client's Nexi instance.
 * Subagents are internal workers — customers do not see these names unless
 * explicitly configured.
 *
 * Naming convention: TMNT character roster (internal only).
 * Public-facing name: always "Nexi" unless the client customizes their avatar name.
 *
 * Tier limits:
 *   starter:    up to 3 active subagents
 *   growth:     up to 5 active subagents
 *   pro:        up to 8 active subagents
 *   enterprise: 10+ active subagents
 *
 * Recommended default starting 5:
 *   Leonardo, April, Karai, Rocksteady, Krang
 */

/**
 * @typedef {Object} SubagentDefinition
 * @property {string} id          - Unique slug (used in config and Firestore)
 * @property {string} name        - TMNT internal name
 * @property {string} role        - Short role label
 * @property {string} description - What this subagent handles
 * @property {string[]} bestFor   - Tags describing ideal use cases
 * @property {boolean} recommended - Part of the default starting 5?
 */

/** @type {SubagentDefinition[]} */
export const SUBAGENT_ROSTER = [
  {
    id: "leonardo",
    name: "Leonardo",
    role: "Lead Coordinator",
    description: "Master coordinator. Owns orchestration across other subagents and lead operations.",
    bestFor: ["coordination", "orchestration", "operations", "decision-routing"],
    recommended: true
  },
  {
    id: "donatello",
    name: "Donatello",
    role: "Systems & Integrations",
    description: "Systems, technical setup, and integrations. Handles implementation logic and tooling.",
    bestFor: ["integrations", "technical-setup", "api-connections", "automation-config"],
    recommended: false
  },
  {
    id: "raphael",
    name: "Raphael",
    role: "Escalations & Exceptions",
    description: "Escalations, urgent issues, and exception handling. Handles breakdowns and blockers.",
    bestFor: ["escalations", "urgent-issues", "error-handling", "edge-cases"],
    recommended: false
  },
  {
    id: "michelangelo",
    name: "Michelangelo",
    role: "Customer Engagement",
    description: "Customer engagement, content, tone, and follow-up. Warm outreach and brand voice.",
    bestFor: ["customer-comms", "follow-up", "brand-voice", "outreach", "retention"],
    recommended: false
  },
  {
    id: "splinter",
    name: "Splinter",
    role: "Policy & Quality Control",
    description: "Policy, oversight, quality control, and approval logic. Standards and governance.",
    bestFor: ["quality-control", "compliance", "approval-flows", "policy-enforcement"],
    recommended: false
  },
  {
    id: "april",
    name: "April",
    role: "Intake & Discovery",
    description: "Intake, forms, and customer information gathering. Project discovery and detail capture.",
    bestFor: ["intake", "lead-capture", "customer-info", "discovery", "onboarding"],
    recommended: true
  },
  {
    id: "casey",
    name: "Casey",
    role: "Field Dispatch & Routing",
    description: "Field dispatch, assignment, and routing. Sends work to the right person at the right time.",
    bestFor: ["dispatch", "routing", "field-assignment", "crew-management"],
    recommended: false
  },
  {
    id: "karai",
    name: "Karai",
    role: "Scheduling Strategy",
    description: "Scheduling strategy and calendar optimization. Appointment flow and schedule balancing.",
    bestFor: ["scheduling", "calendar", "appointments", "booking", "availability"],
    recommended: true
  },
  {
    id: "metalhead",
    name: "Metalhead",
    role: "Automation Pipelines",
    description: "Automation execution and repetitive task running. Background task pipelines.",
    bestFor: ["automation", "background-tasks", "recurring-jobs", "process-execution"],
    recommended: false
  },
  {
    id: "leatherhead",
    name: "Leatherhead",
    role: "Inventory & Materials",
    description: "Inventory, parts, and materials tracking. Stock, materials, and supply awareness.",
    bestFor: ["inventory", "parts-tracking", "materials", "supply", "stock"],
    recommended: false
  },
  {
    id: "slash",
    name: "Slash",
    role: "Collections & Reminders",
    description: "Collections, overdue follow-up, and hard reminders. Unresolved account follow-up.",
    bestFor: ["collections", "overdue", "reminders", "accounts-receivable", "follow-up"],
    recommended: false
  },
  {
    id: "bebop",
    name: "Bebop",
    role: "Lead Capture & Marketing",
    description: "Lead capture, marketing operations, and campaign intake. Prospect flow and demand capture.",
    bestFor: ["lead-capture", "marketing", "campaigns", "prospect-intake", "demand-gen"],
    recommended: false
  },
  {
    id: "rocksteady",
    name: "Rocksteady",
    role: "Work Orders & Job Records",
    description: "Work orders, service tickets, and job records. Job tracking and structured execution.",
    bestFor: ["work-orders", "service-tickets", "job-tracking", "field-records"],
    recommended: true
  },
  {
    id: "krang",
    name: "Krang",
    role: "Analytics & Reporting",
    description: "Analytics, reporting, dashboards, and business insights. Metrics and operator visibility.",
    bestFor: ["analytics", "reporting", "dashboards", "metrics", "business-intelligence"],
    recommended: true
  },
  {
    id: "shredder",
    name: "Shredder",
    role: "Risk & Competitive Intel",
    description: "Competitive monitoring, adversarial review, and risk spotting. Threat checks.",
    bestFor: ["risk-monitoring", "competitive-intel", "quality-audits", "pressure-testing"],
    recommended: false
  }
];

/**
 * Returns the recommended default starting 5 subagents.
 * @returns {SubagentDefinition[]}
 */
export function getDefaultSubagents() {
  return SUBAGENT_ROSTER.filter((s) => s.recommended);
}

/**
 * Returns a subagent definition by id.
 * @param {string} id
 * @returns {SubagentDefinition|undefined}
 */
export function getSubagentById(id) {
  return SUBAGENT_ROSTER.find((s) => s.id === id);
}

/**
 * Returns subagents appropriate for a given tier.
 * Starter gets the default 5; others get up to their cap from the full roster.
 *
 * @param {'starter'|'growth'|'pro'|'enterprise'} tier
 * @returns {SubagentDefinition[]}
 */
export function getSubagentsForTier(tier) {
  const caps = { starter: 3, growth: 5, pro: 8, enterprise: SUBAGENT_ROSTER.length };
  const cap = caps[tier] ?? 5;
  // Always start with recommended ones, then fill to cap
  const recommended = SUBAGENT_ROSTER.filter((s) => s.recommended);
  const rest = SUBAGENT_ROSTER.filter((s) => !s.recommended);
  return [...recommended, ...rest].slice(0, cap);
}
