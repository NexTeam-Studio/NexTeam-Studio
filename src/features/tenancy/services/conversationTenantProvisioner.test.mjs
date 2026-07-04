import test from "node:test";
import assert from "node:assert/strict";
import { createConversationTenantProvisioner } from "./conversationTenantProvisioner.js";
import { createInMemoryTenantDocumentStore, persistTenantFoundationDocuments } from "./tenantDocumentRepository.js";
import { createTenantActorScope } from "./tenantAccessPolicy.js";
import { buildTenantSubagentBootstrapPlan } from "../../agentArchitect/services/tenantSubagentBootstrap.js";
import {
  tenantConfigDocPath,
  tenantRootDocPath,
  tenantSubagentDocPath,
} from "./tenantPathUtils.js";
import { blueprintDocPath, onboardingSessionDocPath } from "../../missioncontrol/services/firestorePaths.js";

function clone(value) {
  return structuredClone(value);
}

function buildCompletedSession(overrides = {}) {
  return {
    sessionId: overrides.sessionId || "session-blue-harbor",
    status: overrides.status || "completed",
    tenantId: overrides.tenantId || "nexteam-studio",
    businessName: overrides.businessName || "Blue Harbor Mechanical",
    trade: overrides.trade || "hvac service",
    crewSize: overrides.crewSize ?? 4,
    jobVolume: overrides.jobVolume || "35 jobs per week",
    serviceArea: overrides.serviceArea || "Savannah GA, Pooler GA",
    biggestPain: overrides.biggestPain || "Leads come in, but follow-up and scheduling are inconsistent.",
    existingTools: overrides.existingTools || ["Jobber", "Gmail", "WordPress"],
    recommendedAgents: overrides.recommendedAgents || ["scheduling", "crm", "google_social"],
    priorityAgent: overrides.priorityAgent || "google_social",
    agentName: overrides.agentName || "Nexi Harbor",
    agentMission:
      overrides.agentMission ||
      "Turn first-contact leads into booked service calls without dropping the handoff between marketing and ops.",
    missingFields: overrides.missingFields || [],
    provisioning: overrides.provisioning || null,
  };
}

function createProvisioningHarness({ sessions = [], seedDocuments = {} } = {}) {
  const store = createInMemoryTenantDocumentStore(seedDocuments);
  const actorScope = createTenantActorScope({ roles: ["platform_operator"] });
  const sessionMap = new Map(sessions.map((session) => [session.sessionId, clone(session)]));

  const dependencies = {
    readAgentSession(sessionId) {
      return sessionMap.has(sessionId) ? clone(sessionMap.get(sessionId)) : null;
    },

    listExistingTenantIds() {
      return store
        .listDocumentPaths("tenants/")
        .map((path) => path.split("/"))
        .filter((parts) => parts.length === 2 && parts[0] === "tenants")
        .map((parts) => parts[1]);
    },

    tenantConfigExists(tenantId) {
      return Boolean(store.readDocument(tenantConfigDocPath(tenantId, "current")));
    },

    persistFoundationDocuments({ tenantId, packet, config, summary }) {
      return persistTenantFoundationDocuments({
        actorScope,
        tenantId,
        packet,
        config,
        summary,
        store,
      });
    },

    initializeTenantSubagents({ tenantId, tenantMeta = {}, subagentIds = null }) {
      const bootstrapPlan = buildTenantSubagentBootstrapPlan({
        tenantId,
        tenantMeta,
        subagentIds,
      });

      store.writeDocument(tenantRootDocPath(tenantId), {
        ...bootstrapPlan.tenantRootPatch,
        updatedAt: "2026-06-29T12:00:00.000Z",
      });

      for (const subagentDocument of bootstrapPlan.subagentDocuments) {
        store.writeDocument(tenantSubagentDocPath(tenantId, subagentDocument.id), {
          ...subagentDocument,
          updatedAt: "2026-06-29T12:00:00.000Z",
        });
      }

      return bootstrapPlan;
    },

    writeBlueprint({ tenantId, blueprint }) {
      store.writeDocument(blueprintDocPath(tenantId, blueprint.id), blueprint);
      return { ok: true, id: blueprint.id };
    },

    writeOnboardingSession({ tenantId, onboardingSession }) {
      store.writeDocument(onboardingSessionDocPath(tenantId, onboardingSession.id), onboardingSession);
      return { ok: true, id: onboardingSession.id };
    },

    writeTenantRoot(rootDocument) {
      store.writeDocument(tenantRootDocPath(rootDocument.tenantId), rootDocument);
      return { ok: true, id: rootDocument.tenantId };
    },

    markAgentSessionProvisioned({ sessionId, provisioning }) {
      const current = sessionMap.get(sessionId);
      if (!current) {
        throw new Error(`Cannot mark missing session "${sessionId}" as provisioned.`);
      }
      sessionMap.set(sessionId, {
        ...current,
        provisioning: clone(provisioning),
      });
      return { ok: true };
    },
  };

  return {
    store,
    sessionMap,
    provisioner: createConversationTenantProvisioner({
      dependencies,
      now: () => "2026-06-29T12:00:00.000Z",
    }),
  };
}

test("completed Nexi session provisions a tenant root, foundation docs, subagents, blueprint, onboarding session, and routes", async () => {
  const session = buildCompletedSession();
  const harness = createProvisioningHarness({
    sessions: [session],
    seedDocuments: {
      "tenants/nexteam-studio": {
        tenantId: "nexteam-studio",
        brandName: "NexTeam-Studio",
        avatarName: "Nexi",
        industry: "field-service",
      },
    },
  });

  const result = await harness.provisioner.provisionSessionById(session.sessionId);

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.tenantId, "blue-harbor-mechanical");
  assert.equal(result.operatorRoute, "/mission-control/blue-harbor-mechanical");
  assert.equal(result.clientRoute, "/agent-architect?tenantId=blue-harbor-mechanical");
  assert.equal(result.blueprintId, "starter-blue-harbor-mechanical");
  assert.equal(result.onboardingSessionId, "onboarding-blue-harbor-mechanical");
  assert.ok(result.activeSubagentIds.length >= 5);

  const rootDoc = harness.store.readDocument("tenants/blue-harbor-mechanical");
  assert.equal(rootDoc.brandName, "Blue Harbor Mechanical");
  assert.equal(rootDoc.avatarName, "Nexi Harbor");
  assert.equal(rootDoc.missionControlEnabled, true);
  assert.equal(rootDoc.registryVisible, true);
  assert.equal(rootDoc.route, "/mission-control/blue-harbor-mechanical");
  assert.equal(rootDoc.starterBlueprintId, "starter-blue-harbor-mechanical");
  assert.equal(rootDoc.starterOnboardingSessionId, "onboarding-blue-harbor-mechanical");

  const configDoc = harness.store.readDocument("tenants/blue-harbor-mechanical/config/current");
  assert.equal(configDoc.profile.brandName, "Blue Harbor Mechanical");
  assert.equal(configDoc.profile.publicAgentName, "Nexi Harbor");
  assert.deepEqual(configDoc.profile.serviceArea.territories, ["Savannah GA", "Pooler GA"]);
  assert.equal(configDoc.channels.wordpress.enabled, true);
  assert.equal(configDoc.channels.jobber.enabled, true);
  assert.equal(configDoc.channels.email.enabled, true);
  assert.equal(configDoc.channels.gbp.enabled, true);

  const subagentDocs = harness.store
    .listDocumentPaths("tenants/blue-harbor-mechanical/subagents/")
    .map((path) => harness.store.readDocument(path));
  assert.equal(subagentDocs.length, result.activeSubagentIds.length);
  assert.ok(subagentDocs.every((doc) => doc.enabled === true));

  const blueprintDoc = harness.store.readDocument("tenants/blue-harbor-mechanical/blueprints/starter-blue-harbor-mechanical");
  assert.equal(blueprintDoc.name, "Blue Harbor Mechanical Starter Shell");
  assert.equal(blueprintDoc.sourceSessionId, session.sessionId);
  assert.ok(blueprintDoc.agentRoster.some((agent) => agent.agentId === "nexi"));
  assert.ok(blueprintDoc.agentRoster.some((agent) => agent.agentId === "bebop"));

  const onboardingDoc = harness.store.readDocument(
    "tenants/blue-harbor-mechanical/onboardingSessions/onboarding-blue-harbor-mechanical"
  );
  assert.equal(onboardingDoc.clientId, "blue-harbor-mechanical");
  assert.equal(onboardingDoc.state, "active");
  assert.equal(onboardingDoc.operatorRoute, "/mission-control/blue-harbor-mechanical");
  assert.ok(onboardingDoc.tasks.length >= 4);

  const sessionAfter = harness.sessionMap.get(session.sessionId);
  assert.equal(sessionAfter.provisioning.status, "provisioned");
  assert.equal(sessionAfter.provisioning.tenantId, "blue-harbor-mechanical");
});

test("provisioner rejects sessions that are not truly completed and writes nothing", async () => {
  const session = buildCompletedSession({
    sessionId: "session-incomplete",
    status: "in_progress",
    missingFields: ["priorityAgent"],
  });
  const harness = createProvisioningHarness({ sessions: [session] });

  await assert.rejects(
    () => harness.provisioner.provisionSessionById(session.sessionId),
    /status is "in_progress"|required completed-session field "priorityAgent"/i
  );

  assert.equal(harness.store.listDocumentPaths("tenants/").length, 0);
  assert.equal(harness.sessionMap.get(session.sessionId).provisioning, null);
});

test("provisioner refuses to overwrite an already provisioned tenant config", async () => {
  const session = buildCompletedSession({
    sessionId: "session-acme",
    businessName: "Acme Air",
  });
  const harness = createProvisioningHarness({
    sessions: [session],
    seedDocuments: {
      "tenants/acme-air/config/current": {
        documentType: "tenant-client-config",
        schemaVersion: 1,
        tenantId: "acme-air",
        profile: {
          brandName: "Acme Air",
          publicAgentName: "Nexi",
          industry: "hvac",
          website: { currentUrl: "", desiredUrl: "" },
          contact: {
            primaryName: "Existing Operator",
            primaryRole: "Owner",
            email: "existing@acme.invalid",
            phone: "",
          },
          serviceArea: { hqCity: "", hqState: "", territories: [] },
        },
        branding: {
          primaryColor: "#4F46E5",
          secondaryColor: "",
          logoUrl: "",
          headingFont: "",
          bodyFont: "",
        },
        businessRules: {
          services: ["HVAC"],
          targetCustomers: ["Current customers"],
          competitors: [],
          dos: [],
          donts: [],
          claimsBoundariesRef: null,
        },
        channels: {
          wordpress: { enabled: false, status: "not-needed", authRef: null, accountRef: null, siteUrl: "", projectId: "", accountLabel: "", provider: "" },
          gbp: { enabled: false, status: "not-needed", authRef: null, accountRef: null, siteUrl: "", projectId: "", accountLabel: "", provider: "" },
          companycam: { enabled: false, status: "not-needed", authRef: null, accountRef: null, siteUrl: "", projectId: "", accountLabel: "", provider: "" },
          jobber: { enabled: false, status: "not-needed", authRef: null, accountRef: null, siteUrl: "", projectId: "", accountLabel: "", provider: "" },
          email: { enabled: false, status: "not-needed", authRef: null, accountRef: null, siteUrl: "", projectId: "", accountLabel: "", provider: "" },
        },
        workflow: {
          approvalMode: "draft_only",
          launchSequence: [],
          featureFlags: { modeA: false, modeB: false, modeC: false },
        },
        dashboard: {
          visibleKpis: [],
          ownerGoals: [],
        },
        meta: {
          tier: "starter",
          status: "active",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      },
    },
  });

  await assert.rejects(
    () => harness.provisioner.provisionSessionById(session.sessionId),
    /config\/current already exists/i
  );
});

test("already-provisioned sessions return their existing routes without duplicating tenant artifacts", async () => {
  const session = buildCompletedSession({
    sessionId: "session-existing",
    provisioning: {
      status: "provisioned",
      tenantId: "existing-tenant",
      brandName: "Existing Tenant",
      clientRoute: "/agent-architect?tenantId=existing-tenant",
      operatorRoute: "/mission-control/existing-tenant",
      blueprintId: "starter-existing-tenant",
      onboardingSessionId: "onboarding-existing-tenant",
      activeSubagentIds: ["leonardo", "april"],
      onboardingNeeds: [{ key: "confirm-brand-contact", title: "Confirm brand", description: "..." }],
      recommendedRoster: ["crm"],
      avatarName: "Nexi Existing",
      industry: "hvac",
      priorityAgent: "crm",
      packetId: "session-session-existing",
    },
  });
  const harness = createProvisioningHarness({ sessions: [session] });

  const beforePaths = harness.store.listDocumentPaths("");
  const result = await harness.provisioner.provisionSessionById(session.sessionId);
  const afterPaths = harness.store.listDocumentPaths("");

  assert.equal(result.created, false);
  assert.equal(result.tenantId, "existing-tenant");
  assert.equal(result.operatorRoute, "/mission-control/existing-tenant");
  assert.deepEqual(beforePaths, afterPaths);
});

test("secret-like session content is rejected before tenant documents are persisted", async () => {
  const session = buildCompletedSession({
    sessionId: "session-secret",
    businessName: "ACME -----BEGIN TEST PRIVATE KEY----- Services",
  });
  const harness = createProvisioningHarness({ sessions: [session] });

  await assert.rejects(
    () => harness.provisioner.provisionSessionById(session.sessionId),
    /secret-like material/i
  );

  assert.equal(harness.store.listDocumentPaths("tenants/").length, 0);
});

test("tenant ids are collision-safe and suffix when a root doc already uses the base slug", async () => {
  const session = buildCompletedSession({
    sessionId: "session-collision",
    businessName: "Blue Harbor Mechanical",
  });
  const harness = createProvisioningHarness({
    sessions: [session],
    seedDocuments: {
      "tenants/blue-harbor-mechanical": {
        tenantId: "blue-harbor-mechanical",
        brandName: "Existing Blue Harbor",
        avatarName: "Nexi",
        industry: "field-service",
      },
    },
  });

  const result = await harness.provisioner.provisionSessionById(session.sessionId);
  assert.equal(result.tenantId, "blue-harbor-mechanical-2");
  assert.ok(harness.store.readDocument("tenants/blue-harbor-mechanical-2"));
});
