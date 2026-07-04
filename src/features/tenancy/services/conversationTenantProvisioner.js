import { createBlueprint, createBlueprintAgent, createBlueprintTask, BLUEPRINT_STATES } from "../../missioncontrol/schemas/blueprintSchema.js";
import { instantiateOnboardingFromBlueprint, ONBOARDING_SESSION_STATES } from "../../missioncontrol/schemas/onboardingSchema.js";
import { createRawIntakePacket } from "../schemas/clientIntakePacketSchema.js";
import { normalizeClientConfigFromIntakePacket } from "../schemas/clientConfigSchema.js";
import { buildTenantRuntimeSummaryFromConfig } from "../schemas/runtimeSummarySchema.js";
import { sanitizeTenantId } from "./tenantPathUtils.js";
import { getDefaultSubagents, getSubagentById } from "../../agentArchitect/config/subagentroster.js";

const REQUIRED_COMPLETED_SESSION_FIELDS = ["businessName", "trade", "priorityAgent"];
const STARTER_SUBAGENT_TARGET = 5;
const DEFAULT_PUBLIC_AGENT_NAME = "Nexi";
const DEFAULT_ACCENT_COLOR = "#4F46E5";
const DEFAULT_TARGET_CUSTOMERS = ["Current customers", "New leads"];
const DEFAULT_DOS = ["Keep the first workflow focused on one clear business outcome."];
const DEFAULT_DONTS = ["Do not hardcode client details outside tenant config."];
const PROVISIONING_STATUS_PROVISIONED = "provisioned";
const RECOMMENDED_AGENT_TO_SUBAGENTS = {
  scheduling: ["karai", "leonardo"],
  route_optimization: ["casey", "karai", "leonardo"],
  work_order: ["rocksteady", "leonardo"],
  crm: ["april", "michelangelo", "leonardo"],
  onboarding: ["april", "leonardo"],
  google_social: ["bebop", "michelangelo", "krang", "leonardo"],
};

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeAgentSessionForProvisioning(session = {}) {
  return {
    sessionId: String(session.sessionId || session.id || "").trim(),
    tenantId: String(session.tenantId || "").trim(),
    status: String(session.status || "").trim().toLowerCase(),
    businessName: String(session.businessName || session.business_name || "").trim(),
    trade: String(session.trade || "").trim(),
    crewSize: session.crewSize ?? session.crew_size ?? null,
    jobVolume: String(session.jobVolume || session.job_volume || "").trim(),
    serviceArea: String(session.serviceArea || session.service_area || "").trim(),
    biggestPain: String(session.biggestPain || session.biggest_pain || "").trim(),
    existingTools: uniqueStrings(session.existingTools || session.existing_tools || []),
    recommendedAgents: uniqueStrings(session.recommendedAgents || session.recommended_agents || []),
    priorityAgent: String(session.priorityAgent || session.priority_agent || "").trim(),
    agentName: String(session.agentName || session.agent_name || "").trim(),
    agentMission: String(session.agentMission || session.agent_mission || "").trim(),
    missingFields: uniqueStrings(session.missingFields || session.missing_fields || []),
    provisioning: session.provisioning && typeof session.provisioning === "object" ? { ...session.provisioning } : null,
  };
}

export function assertProvisionableCompletedSession(session) {
  if (!session.sessionId) {
    throw new Error("Cannot provision a tenant from an agent session without a sessionId.");
  }

  if (session.status !== "completed") {
    throw new Error(
      `Cannot provision tenant from session "${session.sessionId}" because status is "${session.status || "unknown"}", not "completed".`
    );
  }

  const missingFields = new Set(session.missingFields || []);
  for (const fieldName of REQUIRED_COMPLETED_SESSION_FIELDS) {
    const value = session[fieldName];
    if (!String(value || "").trim() || missingFields.has(fieldName)) {
      throw new Error(
        `Cannot provision tenant from session "${session.sessionId}" because required completed-session field "${fieldName}" is still missing.`
      );
    }
  }
}

function parseServiceArea(serviceArea = "") {
  const territories = uniqueStrings(
    String(serviceArea || "")
      .split(/[;|]/g)
      .flatMap((segment) => segment.split(","))
      .map((segment) => segment.trim())
      .filter(Boolean)
  );

  const firstTerritory = territories[0] || "";
  const match = firstTerritory.match(/^(.*?)(?:\s+|,\s*)([A-Za-z]{2})$/);

  return {
    hqCity: match ? match[1].trim() : "",
    hqState: match ? match[2].toUpperCase() : "",
    territories,
  };
}

function deriveEmailProvider(existingTools = []) {
  const joined = existingTools.join(" ").toLowerCase();
  if (joined.includes("gmail") || joined.includes("google workspace") || joined.includes("g suite")) {
    return "gmail";
  }
  if (joined.includes("outlook") || joined.includes("office 365") || joined.includes("microsoft")) {
    return "outlook";
  }
  return "pending-confirmation";
}

function deriveAccountsToConnect({ existingTools = [], recommendedAgents = [], priorityAgent = "" }) {
  const tools = existingTools.join(" ").toLowerCase();
  const accounts = new Set();

  if (tools.includes("wordpress")) accounts.add("wordpress");
  if (tools.includes("companycam")) accounts.add("companycam");
  if (tools.includes("jobber")) accounts.add("jobber");
  if (tools.includes("gmail") || tools.includes("outlook") || tools.includes("email")) accounts.add("email");

  const recommendationSet = new Set(uniqueStrings([...recommendedAgents, priorityAgent]).map((value) => value.toLowerCase()));
  if (recommendationSet.has("google_social")) {
    accounts.add("wordpress");
    accounts.add("gbp");
    accounts.add("email");
  }
  if (recommendationSet.has("crm")) {
    accounts.add("jobber");
    accounts.add("email");
  }
  if (recommendationSet.has("onboarding")) {
    accounts.add("email");
  }

  return [...accounts];
}

function deriveLaunchSequence(priorityAgent, accountsToConnect = []) {
  return uniqueStrings([
    "tenant_shell",
    priorityAgent ? `priority:${priorityAgent}` : "",
    accountsToConnect.includes("wordpress") ? "wordpress_articles" : "",
    accountsToConnect.includes("gbp") ? "gbp_posts" : "",
    accountsToConnect.includes("jobber") ? "crm_sync" : "",
  ]);
}

function buildOnboardingNeeds(session, accountsToConnect = []) {
  const needs = [
    {
      key: "confirm-brand-contact",
      title: "Confirm brand + operator details",
      description:
        "Review the business name, preferred public agent name, and operator contact details before client-facing work begins.",
    },
    {
      key: "activate-priority-lane",
      title: `Activate priority lane: ${titleCaseWords(session.priorityAgent.replace(/_/g, " "))}`,
      description:
        session.agentMission ||
        "Stand up the first operating lane the client should feel first, then keep the rest of the engine staged behind it.",
    },
  ];

  if (session.biggestPain) {
    needs.push({
      key: "translate-biggest-pain",
      title: "Turn the biggest pain into the first dashboard goal",
      description: `Use "${session.biggestPain}" as the first operator-facing goal and success check.`,
    });
  }

  if (session.serviceArea) {
    needs.push({
      key: "confirm-service-area",
      title: "Confirm service-area coverage",
      description: `Lock the service area captured in the conversation: ${session.serviceArea}.`,
    });
  }

  if (accountsToConnect.length) {
    needs.push({
      key: "connect-accounts",
      title: "Connect the first external systems",
      description: `Connect and verify: ${accountsToConnect.join(", ")}.`,
    });
  }

  return needs;
}

function createProvisioningRoutes(tenantId) {
  return {
    clientRoute: `/agent-architect?tenantId=${tenantId}`,
    operatorRoute: `/mission-control/${tenantId}`,
  };
}

function resolveRecommendedSubagentIds({ recommendedAgents = [], priorityAgent = "" }) {
  const mappedIds = uniqueStrings(
    uniqueStrings([...recommendedAgents, priorityAgent])
      .flatMap((agentKey) => RECOMMENDED_AGENT_TO_SUBAGENTS[String(agentKey || "").toLowerCase()] || [agentKey])
  ).filter((subagentId) => Boolean(getSubagentById(subagentId)));

  const defaultIds = getDefaultSubagents().map((subagent) => subagent.id);
  const filled = [...mappedIds];
  for (const defaultId of defaultIds) {
    if (filled.length >= STARTER_SUBAGENT_TARGET) {
      break;
    }
    if (!filled.includes(defaultId)) {
      filled.push(defaultId);
    }
  }

  return filled.slice(0, Math.max(STARTER_SUBAGENT_TARGET, filled.length || 0));
}

function deriveUniqueTenantId(businessName, existingTenantIds = []) {
  const baseTenantId = sanitizeTenantId(businessName);
  if (!baseTenantId) {
    throw new Error(`Could not derive a safe tenantId from business name "${businessName}".`);
  }

  const existing = new Set(uniqueStrings(existingTenantIds).map((tenantId) => sanitizeTenantId(tenantId)));
  if (!existing.has(baseTenantId)) {
    return baseTenantId;
  }

  let suffix = 2;
  while (existing.has(`${baseTenantId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseTenantId}-${suffix}`;
}

function buildProvisioningPayloadFromSession(session, { existingTenantIds = [], nowIso } = {}) {
  const tenantId = deriveUniqueTenantId(session.businessName, existingTenantIds);
  const serviceArea = parseServiceArea(session.serviceArea);
  const avatarName = session.agentName || DEFAULT_PUBLIC_AGENT_NAME;
  const industry = String(session.trade || "field-service").trim().toLowerCase();
  const accountsToConnect = deriveAccountsToConnect(session);
  const onboardingNeeds = buildOnboardingNeeds(session, accountsToConnect);
  const routes = createProvisioningRoutes(tenantId);

  return {
    sessionId: session.sessionId,
    sourceTenantId: session.tenantId || null,
    tenantId,
    brandName: session.businessName,
    avatarName,
    industry,
    accentColor: DEFAULT_ACCENT_COLOR,
    tradeLabel: titleCaseWords(session.trade),
    tradeRaw: session.trade,
    priorityAgent: session.priorityAgent,
    recommendedRoster: session.recommendedAgents,
    recommendedSubagentIds: resolveRecommendedSubagentIds(session),
    serviceArea,
    accountsToConnect,
    emailProvider: deriveEmailProvider(session.existingTools),
    existingTools: session.existingTools,
    onboardingNeeds,
    biggestPain: session.biggestPain,
    agentMission: session.agentMission,
    crewSize: session.crewSize,
    jobVolume: session.jobVolume,
    routes,
    nowIso,
  };
}

function buildFoundationDocumentsFromProvisioningPayload(payload) {
  const packet = createRawIntakePacket({
    packetId: `session-${payload.sessionId}`,
    tenantId: payload.tenantId,
    submittedAt: payload.nowIso,
    source: {
      channel: "nexi-conversation",
      capturedBy: payload.avatarName,
      notes: `Auto-provisioned from completed agentSessions/${payload.sessionId}.`,
    },
    intake: {
      businessName: payload.brandName,
      currentUrl: "",
      desiredUrl: "",
      primaryContact: {
        name: `${payload.brandName} operator`,
        role: "Pending confirmation",
        email: `pending-${payload.tenantId}@nexteam.invalid`,
        phone: "",
      },
      emailProvider: payload.emailProvider,
      branding: {
        primaryColor: payload.accentColor,
        secondaryColor: "",
        logoUrl: "",
        headingFont: "",
        bodyFont: "",
      },
      services: [payload.tradeLabel],
      targetCustomers: DEFAULT_TARGET_CUSTOMERS,
      accountsToConnect: payload.accountsToConnect,
      competitors: [],
      doRules: DEFAULT_DOS,
      dontRules: DEFAULT_DONTS,
      notes: uniqueStrings([
        payload.biggestPain ? `Biggest pain: ${payload.biggestPain}` : "",
        payload.agentMission ? `Agent mission: ${payload.agentMission}` : "",
        payload.serviceArea.territories.length ? `Service area: ${payload.serviceArea.territories.join(", ")}` : "",
      ]).join(" | "),
    },
    meta: {
      status: "reviewed",
      submittedByUserId: payload.sessionId,
      versionLabel: "conversation-provisioner-v1",
    },
  });

  const config = normalizeClientConfigFromIntakePacket(packet, {
    publicAgentName: payload.avatarName,
    industry: payload.industry,
    hqCity: payload.serviceArea.hqCity,
    hqState: payload.serviceArea.hqState,
    territories: payload.serviceArea.territories,
    workflow: {
      approvalMode: "draft_only",
      launchSequence: deriveLaunchSequence(payload.priorityAgent, payload.accountsToConnect),
      featureFlags: {
        modeA: payload.accountsToConnect.includes("gbp"),
        modeB: payload.accountsToConnect.includes("wordpress"),
        modeC: false,
      },
    },
    dashboard: {
      visibleKpis: ["onboarding_progress", "enabled_subagents", "connected_channels"],
      ownerGoals: uniqueStrings([
        payload.biggestPain,
        payload.agentMission,
        payload.tradeLabel ? `Build the first ${payload.tradeLabel.toLowerCase()} workflow` : "",
      ]),
    },
    meta: {
      tier: "starter",
      status: "onboarding",
      createdAt: payload.nowIso,
      updatedAt: payload.nowIso,
    },
  });

  const summary = buildTenantRuntimeSummaryFromConfig(config, {
    status: "onboarding",
    updatedAt: payload.nowIso,
  });

  return { packet, config, summary };
}

function buildStarterBlueprintFromProvisioningPayload(payload) {
  const agentRoster = [
    createBlueprintAgent({
      agentId: "nexi",
      agentName: payload.avatarName,
      role: "Client-facing intake guide",
      purpose: `Front-door client experience for ${payload.brandName}.`,
    }),
    ...payload.recommendedSubagentIds
      .map((subagentId) => getSubagentById(subagentId))
      .filter(Boolean)
      .map((subagent) =>
        createBlueprintAgent({
          agentId: subagent.id,
          agentName: subagent.name,
          role: subagent.role,
          purpose: subagent.description,
        })
      ),
  ];

  const onboardingTasks = payload.onboardingNeeds.map((need, index) =>
    createBlueprintTask({
      taskId: `${payload.tenantId}-task-${index + 1}`,
      title: need.title,
      description: need.description,
      assignedRole: "operator",
      estimatedMinutes: 20,
      order: index + 1,
    })
  );

  return createBlueprint({
    id: `starter-${payload.tenantId}`,
    name: `${payload.brandName} Starter Shell`,
    trade: payload.tradeRaw || payload.industry,
    industry: payload.industry,
    description:
      `Generated starter blueprint for ${payload.brandName} from completed Nexi conversation ${payload.sessionId}. ` +
      "This shell drives the first operator dashboard and onboarding flow.",
    state: BLUEPRINT_STATES.ACTIVE,
    version: 1,
    linkedSOPs: [],
    agentRoster,
    onboardingTasks,
    requiredIntegrations: payload.accountsToConnect,
    estimatedOnboardDays: 5,
    tags: uniqueStrings([payload.industry, payload.priorityAgent, ...payload.recommendedRoster]),
    createdBy: "conversation-to-tenant-provisioner",
    createdAt: payload.nowIso,
    updatedAt: payload.nowIso,
    sourceSessionId: payload.sessionId,
    recommendedRoster: payload.recommendedRoster,
    activeSubagentIds: payload.recommendedSubagentIds,
  });
}

function buildProvisionedOnboardingSession({ payload, blueprint }) {
  const session = instantiateOnboardingFromBlueprint(blueprint, {
    clientId: payload.tenantId,
    clientName: payload.brandName,
    assignedTo: "operator",
  });

  return {
    ...session,
    id: `onboarding-${payload.tenantId}`,
    tenantId: payload.tenantId,
    state: ONBOARDING_SESSION_STATES.ACTIVE,
    startedAt: payload.nowIso,
    createdAt: payload.nowIso,
    updatedAt: payload.nowIso,
    notes: `Generated from completed Nexi conversation ${payload.sessionId}.`,
    sourceSessionId: payload.sessionId,
    clientRoute: payload.routes.clientRoute,
    operatorRoute: payload.routes.operatorRoute,
  };
}

function buildTenantRootDocument({ payload, blueprintId, onboardingSessionId, activeSubagentIds }) {
  return {
    tenantId: payload.tenantId,
    brandName: payload.brandName,
    avatarName: payload.avatarName,
    industry: payload.industry,
    accentColor: payload.accentColor,
    missionControlEnabled: true,
    registryVisible: true,
    hostAgent: payload.avatarName,
    caseStudyMode: false,
    route: payload.routes.operatorRoute,
    activeSubagentIds,
    starterBlueprintId: blueprintId,
    starterOnboardingSessionId: onboardingSessionId,
    sourceSessionId: payload.sessionId,
    updatedAt: payload.nowIso,
  };
}

function buildProvisioningResult({
  created,
  payload,
  packet,
  blueprint,
  onboardingSession,
}) {
  return {
    ok: true,
    created,
    sessionId: payload.sessionId,
    tenantId: payload.tenantId,
    brandName: payload.brandName,
    avatarName: payload.avatarName,
    industry: payload.industry,
    priorityAgent: payload.priorityAgent,
    recommendedRoster: payload.recommendedRoster,
    activeSubagentIds: payload.recommendedSubagentIds,
    onboardingNeeds: payload.onboardingNeeds,
    clientRoute: payload.routes.clientRoute,
    operatorRoute: payload.routes.operatorRoute,
    packetId: packet.packetId,
    blueprintId: blueprint.id,
    onboardingSessionId: onboardingSession.id,
  };
}

function buildExistingProvisioningResult(session) {
  const provisioning = session.provisioning || {};
  return {
    ok: true,
    created: false,
    sessionId: session.sessionId,
    tenantId: provisioning.tenantId || null,
    brandName: provisioning.brandName || session.businessName || null,
    avatarName: provisioning.avatarName || session.agentName || DEFAULT_PUBLIC_AGENT_NAME,
    industry: provisioning.industry || session.trade || null,
    priorityAgent: provisioning.priorityAgent || session.priorityAgent || null,
    recommendedRoster: provisioning.recommendedRoster || session.recommendedAgents || [],
    activeSubagentIds: provisioning.activeSubagentIds || [],
    onboardingNeeds: provisioning.onboardingNeeds || [],
    clientRoute: provisioning.clientRoute || null,
    operatorRoute: provisioning.operatorRoute || null,
    packetId: provisioning.packetId || null,
    blueprintId: provisioning.blueprintId || null,
    onboardingSessionId: provisioning.onboardingSessionId || null,
  };
}

function requireDependency(dependencies, name) {
  if (typeof dependencies[name] !== "function") {
    throw new Error(`Conversation tenant provisioner requires dependency "${name}".`);
  }
  return dependencies[name];
}

export function createConversationTenantProvisioner({ dependencies = {}, now = () => new Date().toISOString() } = {}) {
  const readAgentSession = requireDependency(dependencies, "readAgentSession");
  const listExistingTenantIds = requireDependency(dependencies, "listExistingTenantIds");
  const tenantConfigExists = requireDependency(dependencies, "tenantConfigExists");
  const persistFoundationDocuments = requireDependency(dependencies, "persistFoundationDocuments");
  const initializeTenantSubagents = requireDependency(dependencies, "initializeTenantSubagents");
  const writeBlueprint = requireDependency(dependencies, "writeBlueprint");
  const writeOnboardingSession = requireDependency(dependencies, "writeOnboardingSession");
  const writeTenantRoot = requireDependency(dependencies, "writeTenantRoot");
  const markAgentSessionProvisioned = requireDependency(dependencies, "markAgentSessionProvisioned");

  async function provisionSession(rawSession) {
    const session = normalizeAgentSessionForProvisioning(rawSession);
    if (session.provisioning?.status === PROVISIONING_STATUS_PROVISIONED) {
      return buildExistingProvisioningResult(session);
    }

    assertProvisionableCompletedSession(session);

    const nowIso = now();
    const existingTenantIds = await Promise.resolve(listExistingTenantIds());
    const payload = buildProvisioningPayloadFromSession(session, {
      existingTenantIds,
      nowIso,
    });

    if (await Promise.resolve(tenantConfigExists(payload.tenantId))) {
      throw new Error(
        `Refusing to provision tenant "${payload.tenantId}" because config/current already exists.`
      );
    }

    const { packet, config, summary } = buildFoundationDocumentsFromProvisioningPayload(payload);
    await Promise.resolve(
      persistFoundationDocuments({
        tenantId: payload.tenantId,
        packet,
        config,
        summary,
      })
    );

    await Promise.resolve(
      initializeTenantSubagents({
        tenantId: payload.tenantId,
        tenantMeta: {
          brandName: payload.brandName,
          avatarName: payload.avatarName,
          industry: payload.industry,
          accentColor: payload.accentColor,
        },
        subagentIds: payload.recommendedSubagentIds,
      })
    );

    const blueprint = buildStarterBlueprintFromProvisioningPayload(payload);
    await Promise.resolve(writeBlueprint({ tenantId: payload.tenantId, blueprint }));

    const onboardingSession = buildProvisionedOnboardingSession({ payload, blueprint });
    await Promise.resolve(
      writeOnboardingSession({
        tenantId: payload.tenantId,
        onboardingSession,
      })
    );

    await Promise.resolve(
      writeTenantRoot(
        buildTenantRootDocument({
          payload,
          blueprintId: blueprint.id,
          onboardingSessionId: onboardingSession.id,
          activeSubagentIds: payload.recommendedSubagentIds,
        })
      )
    );

    const result = buildProvisioningResult({
      created: true,
      payload,
      packet,
      blueprint,
      onboardingSession,
    });

    await Promise.resolve(
      markAgentSessionProvisioned({
        sessionId: session.sessionId,
        provisioning: {
          status: PROVISIONING_STATUS_PROVISIONED,
          tenantId: result.tenantId,
          brandName: result.brandName,
          avatarName: result.avatarName,
          industry: result.industry,
          priorityAgent: result.priorityAgent,
          recommendedRoster: result.recommendedRoster,
          activeSubagentIds: result.activeSubagentIds,
          onboardingNeeds: result.onboardingNeeds,
          clientRoute: result.clientRoute,
          operatorRoute: result.operatorRoute,
          packetId: result.packetId,
          blueprintId: result.blueprintId,
          onboardingSessionId: result.onboardingSessionId,
          provisionedAt: nowIso,
        },
      })
    );

    return result;
  }

  async function provisionSessionById(sessionId) {
    const session = await Promise.resolve(readAgentSession(sessionId));
    if (!session) {
      throw new Error(`Agent session "${sessionId}" was not found.`);
    }
    return provisionSession(session);
  }

  return {
    provisionSession,
    provisionSessionById,
  };
}

export const conversationTenantProvisionerInternals = {
  normalizeAgentSessionForProvisioning,
  assertProvisionableCompletedSession,
  parseServiceArea,
  deriveEmailProvider,
  deriveAccountsToConnect,
  deriveLaunchSequence,
  buildOnboardingNeeds,
  createProvisioningRoutes,
  resolveRecommendedSubagentIds,
  deriveUniqueTenantId,
  buildProvisioningPayloadFromSession,
  buildFoundationDocumentsFromProvisioningPayload,
  buildStarterBlueprintFromProvisioningPayload,
  buildProvisionedOnboardingSession,
  buildTenantRootDocument,
};
