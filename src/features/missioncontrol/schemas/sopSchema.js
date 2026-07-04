/**
 * SOP Object Model â€” NexTeam-Studio schema-first definition
 * Human-readable preview: use sopToPreviewText()
 */

export const SOP_STATES = {
  DRAFT: "draft",
  REVIEW: "review",
  APPROVED: "approved",
  ARCHIVED: "archived"
};

export const SOP_CATEGORIES = [
  "intake",
  "follow-up",
  "campaign",
  "quality-check",
  "onboarding",
  "reporting",
  "escalation",
  "maintenance"
];

/**
 * Create a blank SOP object with defaults.
 * @param {Partial<SOPRecord>} overrides
 * @returns {SOPRecord}
 */
export function createSOP(overrides = {}) {
  return {
    id: overrides.id || `sop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    description: "",
    category: "intake",
    state: SOP_STATES.DRAFT,
    version: 1,
    revisionHistory: [],
    steps: [],
    tags: [],
    linkedBlueprints: [],
    linkedOnboardingTasks: [],
    createdBy: "system",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    approvedBy: null,
    aiDraftPath: false,
    humanReadablePreview: null,
    ...overrides
  };
}

/**
 * Create a single SOP step.
 * @param {Partial<SOPStep>} overrides
 * @returns {SOPStep}
 */
export function createSOPStep(overrides = {}) {
  return {
    stepNumber: 1,
    title: "",
    description: "",
    assignedAgent: null,
    estimatedMinutes: null,
    gatingCondition: null,
    ...overrides
  };
}

/**
 * Produce a human-readable text preview of an SOP.
 * @param {SOPRecord} sop
 * @returns {string}
 */
export function sopToPreviewText(sop) {
  const lines = [
    `SOP: ${sop.title || "(Untitled)"}`,
    `Category: ${sop.category} | State: ${sop.state} | Version: ${sop.version}`,
    ``,
    sop.description || "(No description provided.)",
    ``
  ];

  if (sop.steps && sop.steps.length > 0) {
    lines.push("Steps:");
    sop.steps.forEach((step, idx) => {
      lines.push(`  ${idx + 1}. ${step.title || "(Untitled step)"}`);
      if (step.description) lines.push(`     ${step.description}`);
      if (step.assignedAgent) lines.push(`     Agent: ${step.assignedAgent}`);
      if (step.estimatedMinutes) lines.push(`     Est. time: ${step.estimatedMinutes} min`);
    });
    lines.push("");
  }

  if (sop.tags && sop.tags.length > 0) {
    lines.push(`Tags: ${sop.tags.join(", ")}`);
  }

  if (sop.linkedBlueprints && sop.linkedBlueprints.length > 0) {
    lines.push(`Linked blueprints: ${sop.linkedBlueprints.join(", ")}`);
  }

  lines.push(`Last updated: ${sop.updatedAt ? new Date(sop.updatedAt).toLocaleString() : "Unknown"}`);

  return lines.join("\n");
}

/**
 * Validate an SOP record. Returns array of error strings (empty = valid).
 * @param {SOPRecord} sop
 * @returns {string[]}
 */
export function validateSOP(sop) {
  const errors = [];
  if (!sop.title || sop.title.trim().length < 3) errors.push("Title must be at least 3 characters.");
  if (!SOP_CATEGORIES.includes(sop.category)) errors.push(`Category must be one of: ${SOP_CATEGORIES.join(", ")}.`);
  if (!Object.values(SOP_STATES).includes(sop.state)) errors.push("Invalid SOP state.");
  if (!Array.isArray(sop.steps)) errors.push("Steps must be an array.");
  return errors;
}

/**
 * Advance SOP state via valid transitions.
 * @param {string} currentState
 * @param {string} action - "submit" | "approve" | "archive" | "revert"
 * @returns {string|null} new state or null if transition is invalid
 */
export function transitionSOPState(currentState, action) {
  const transitions = {
    draft: { submit: SOP_STATES.REVIEW },
    review: { approve: SOP_STATES.APPROVED, revert: SOP_STATES.DRAFT },
    approved: { archive: SOP_STATES.ARCHIVED },
    archived: { revert: SOP_STATES.DRAFT }
  };
  return transitions[currentState]?.[action] || null;
}

