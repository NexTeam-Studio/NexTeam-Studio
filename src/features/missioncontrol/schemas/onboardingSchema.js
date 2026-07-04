/**
 * Onboarding Task/State Schema â€” NexTeam-Studio schema-first definition
 * Live onboarding instance tied to a client + blueprint.
 */

export const ONBOARDING_TASK_STATES = {
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  BLOCKED: "blocked",
  COMPLETE: "complete",
  SKIPPED: "skipped"
};

export const ONBOARDING_SESSION_STATES = {
  PENDING: "pending",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETE: "complete",
  CANCELLED: "cancelled"
};

/**
 * Create a live onboarding session for a client instantiated from a blueprint.
 * @param {Partial<OnboardingSession>} overrides
 * @returns {OnboardingSession}
 */
export function createOnboardingSession(overrides = {}) {
  return {
    id: overrides.id || `onboard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clientId: "",
    clientName: "",
    blueprintId: "",
    blueprintName: "",
    state: ONBOARDING_SESSION_STATES.PENDING,
    tasks: [],
    startedAt: null,
    completedAt: null,
    assignedTo: "operator",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create a live onboarding task instance from a blueprint task template.
 * @param {Partial<OnboardingTask>} overrides
 * @returns {OnboardingTask}
 */
export function createOnboardingTask(overrides = {}) {
  return {
    taskId: overrides.taskId || `otask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    description: "",
    sopId: null,
    sopTitle: null,
    state: ONBOARDING_TASK_STATES.NOT_STARTED,
    assignedTo: null,
    estimatedMinutes: null,
    order: 1,
    completedAt: null,
    completedBy: null,
    notes: "",
    blockedReason: "",
    ...overrides
  };
}

/**
 * Instantiate a live onboarding session from a blueprint.
 * @param {BlueprintRecord} blueprint
 * @param {{ clientId: string, clientName: string, assignedTo?: string }} clientInfo
 * @returns {OnboardingSession}
 */
export function instantiateOnboardingFromBlueprint(blueprint, clientInfo = {}) {
  const tasks = (blueprint.onboardingTasks || [])
    .sort((a, b) => a.order - b.order)
    .map((template, idx) =>
      createOnboardingTask({
        taskId: `otask-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
        title: template.title,
        description: template.description,
        sopId: template.sopId || null,
        sopTitle: template.sopTitle || null,
        order: template.order || idx + 1,
        estimatedMinutes: template.estimatedMinutes || null,
        assignedTo: clientInfo.assignedTo || "operator"
      })
    );

  return createOnboardingSession({
    clientId: clientInfo.clientId || "",
    clientName: clientInfo.clientName || "",
    blueprintId: blueprint.id,
    blueprintName: blueprint.name,
    tasks,
    assignedTo: clientInfo.assignedTo || "operator"
  });
}

/**
 * Compute overall onboarding progress as a percentage (0â€“100).
 * @param {OnboardingSession} session
 * @returns {number}
 */
export function computeOnboardingProgress(session) {
  const tasks = session.tasks || [];
  if (tasks.length === 0) return 0;
  const done = tasks.filter(
    (task) => task.state === ONBOARDING_TASK_STATES.COMPLETE || task.state === ONBOARDING_TASK_STATES.SKIPPED
  ).length;
  return Math.round((done / tasks.length) * 100);
}

/**
 * Human-readable summary of an onboarding session.
 * @param {OnboardingSession} session
 * @returns {string}
 */
export function onboardingSessionToPreviewText(session) {
  const progress = computeOnboardingProgress(session);
  const lines = [
    `Onboarding: ${session.clientName || session.clientId || "(Unknown client)"}`,
    `Blueprint: ${session.blueprintName || session.blueprintId}`,
    `State: ${session.state} | Progress: ${progress}%`,
    ``
  ];

  (session.tasks || []).forEach((task) => {
    const stateIcon =
      task.state === ONBOARDING_TASK_STATES.COMPLETE
        ? "âœ“"
        : task.state === ONBOARDING_TASK_STATES.SKIPPED
        ? "-"
        : task.state === ONBOARDING_TASK_STATES.BLOCKED
        ? "!"
        : task.state === ONBOARDING_TASK_STATES.IN_PROGRESS
        ? "â†’"
        : " ";
    lines.push(`  [${stateIcon}] ${task.title}`);
    if (task.sopTitle) lines.push(`     SOP: ${task.sopTitle}`);
    if (task.blockedReason) lines.push(`     Blocked: ${task.blockedReason}`);
  });

  return lines.join("\n");
}

