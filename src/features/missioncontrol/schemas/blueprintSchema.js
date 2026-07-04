/**
 * Blueprint Schema â€” NexTeam-Studio schema-first definition
 * A blueprint is the template for a client's operational setup.
 * Instantiating a blueprint creates a client + onboarding flow.
 */

export const BLUEPRINT_STATES = {
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived"
};

export const BLUEPRINT_INDUSTRIES = [
  "water-services",
  "plumbing",
  "hvac",
  "electrical",
  "landscaping",
  "roofing",
  "cleaning",
  "general-contracting",
  "pest-control",
  "other"
];

/**
 * Create a blank blueprint with defaults.
 * @param {Partial<BlueprintRecord>} overrides
 * @returns {BlueprintRecord}
 */
export function createBlueprint(overrides = {}) {
  return {
    id: overrides.id || `blueprint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    trade: "water-services",
    industry: "field-service",
    description: "",
    state: BLUEPRINT_STATES.DRAFT,
    version: 1,
    linkedSOPs: [],
    agentRoster: [],
    onboardingTasks: [],
    requiredIntegrations: [],
    estimatedOnboardDays: 7,
    tags: [],
    createdBy: "system",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create a blueprint agent roster entry.
 */
export function createBlueprintAgent(overrides = {}) {
  return {
    agentId: "",
    agentName: "",
    role: "",
    purpose: "",
    ...overrides
  };
}

/**
 * Create a blueprint onboarding task (template task, not live instance).
 */
export function createBlueprintTask(overrides = {}) {
  return {
    taskId: overrides.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    description: "",
    sopId: null,
    assignedRole: "operator",
    estimatedMinutes: null,
    order: 1,
    ...overrides
  };
}

/**
 * Produce a human-readable preview of a blueprint.
 * @param {BlueprintRecord} blueprint
 * @returns {string}
 */
export function blueprintToPreviewText(blueprint) {
  const lines = [
    `Blueprint: ${blueprint.name || "(Untitled)"}`,
    `Trade: ${blueprint.trade} | State: ${blueprint.state} | Version: ${blueprint.version}`,
    ``,
    blueprint.description || "(No description.)",
    ``
  ];

  if (blueprint.agentRoster && blueprint.agentRoster.length > 0) {
    lines.push("Agent Roster:");
    blueprint.agentRoster.forEach((agent) => {
      lines.push(`  â€¢ ${agent.agentName} (${agent.role}) â€” ${agent.purpose}`);
    });
    lines.push("");
  }

  if (blueprint.onboardingTasks && blueprint.onboardingTasks.length > 0) {
    lines.push("Onboarding Tasks:");
    blueprint.onboardingTasks
      .sort((a, b) => a.order - b.order)
      .forEach((task, idx) => {
        lines.push(`  ${idx + 1}. ${task.title}`);
        if (task.description) lines.push(`     ${task.description}`);
      });
    lines.push("");
  }

  if (blueprint.requiredIntegrations && blueprint.requiredIntegrations.length > 0) {
    lines.push(`Required integrations: ${blueprint.requiredIntegrations.join(", ")}`);
  }

  lines.push(`Estimated onboard time: ${blueprint.estimatedOnboardDays} days`);
  return lines.join("\n");
}

/**
 * Validate a blueprint. Returns error strings (empty = valid).
 * @param {BlueprintRecord} blueprint
 * @returns {string[]}
 */
export function validateBlueprint(blueprint) {
  const errors = [];
  if (!blueprint.name || blueprint.name.trim().length < 3) errors.push("Name must be at least 3 characters.");
  if (!BLUEPRINT_INDUSTRIES.includes(blueprint.trade) && blueprint.trade !== "water-services") {
    // allow any trade string, but warn if not in known list
  }
  if (!Object.values(BLUEPRINT_STATES).includes(blueprint.state)) errors.push("Invalid blueprint state.");
  return errors;
}

