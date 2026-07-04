import test from "node:test";
import assert from "node:assert/strict";
import {
  BLUEPRINT_REQUEST_STATUSES,
  createBlueprintRequestLifecycleService,
} from "./blueprintRequestLifecycleService.js";

function createHarness() {
  const requests = new Map();
  const events = [];
  const clientOrganizations = new Map();
  const members = new Map();
  const invites = new Map();
  const deliveryStates = new Map();
  const sessions = new Map();

  const repository = {
    async createRequest(request) {
      requests.set(request.requestId, JSON.parse(JSON.stringify(request)));
      return { ok: true };
    },
    async getRequest(requestId) {
      const record = requests.get(requestId);
      return record ? JSON.parse(JSON.stringify(record)) : null;
    },
    async updateRequest(requestId, patch) {
      const current = requests.get(requestId);
      if (!current) throw new Error(`Missing request ${requestId}`);
      requests.set(requestId, {
        ...current,
        ...JSON.parse(JSON.stringify(patch)),
        lifecycle: {
          ...(current.lifecycle || {}),
          ...(patch.lifecycle || {}),
        },
      });
      return { ok: true };
    },
    async appendEvent(requestId, event) {
      events.push({ requestId, ...JSON.parse(JSON.stringify(event)) });
      return { ok: true };
    },
    async lookupAuthUserByEmail(email) {
      if (String(email).toLowerCase() === "owner@example.com") {
        return {
          uid: "owner-uid",
          email: "owner@example.com",
          disabled: false,
        };
      }
      return null;
    },
    async upsertClientOrganization(document) {
      clientOrganizations.set(document.clientId, JSON.parse(JSON.stringify(document)));
      return { ok: true };
    },
    async upsertClientOrganizationMember({ clientId, uid, memberDocument }) {
      members.set(`${clientId}:${uid}`, JSON.parse(JSON.stringify(memberDocument)));
      return { ok: true };
    },
    async upsertClientOrganizationInvite({ clientId, inviteId, inviteDocument }) {
      invites.set(`${clientId}:${inviteId}`, JSON.parse(JSON.stringify(inviteDocument)));
      return { ok: true };
    },
    async upsertClientOrganizationDeliveryState({ clientId, stateId, deliveryState }) {
      deliveryStates.set(`${clientId}:${stateId}`, JSON.parse(JSON.stringify(deliveryState)));
      return { ok: true };
    },
  };

  const provisioner = {
    async provisionSession(session) {
      if (session.provisioning?.status === "provisioned") {
        return {
          ok: true,
          created: false,
          tenantId: session.provisioning.tenantId,
          clientRoute: session.provisioning.clientRoute,
          operatorRoute: session.provisioning.operatorRoute,
          packetId: session.provisioning.packetId,
          blueprintId: session.provisioning.blueprintId,
          onboardingSessionId: session.provisioning.onboardingSessionId,
        };
      }

      return {
        ok: true,
        created: true,
        sessionId: session.sessionId,
        tenantId: "blue-harbor-mechanical",
        clientRoute: "/agent-architect?tenantId=blue-harbor-mechanical",
        operatorRoute: "/mission-control/blue-harbor-mechanical",
        packetId: "session-session-123",
        blueprintId: "starter-blue-harbor-mechanical",
        onboardingSessionId: "onboarding-blue-harbor-mechanical",
        brandName: session.businessName,
        accentColor: "#4F46E5",
      };
    },
  };

  const service = createBlueprintRequestLifecycleService({
    repository,
    provisioner,
    readAgentSession: async (sessionId) => sessions.get(sessionId) || null,
    now: () => "2026-06-30T12:00:00.000Z",
  });

  return {
    service,
    requests,
    events,
    clientOrganizations,
    members,
    invites,
    deliveryStates,
    sessions,
  };
}

function seedCompletedSession(overrides = {}) {
  return {
    sessionId: "session-123",
    tenantId: "nexteam-studio",
    status: "completed",
    businessName: "Blue Harbor Mechanical",
    trade: "hvac",
    serviceArea: "Greenville, SC",
    priorityAgent: "scheduling",
    agentName: "Nexi",
    recommendedAgents: ["scheduling", "crm"],
    missingFields: [],
    provisioning: null,
    ...overrides,
  };
}

test("blueprint request creation writes requested status and first event", async () => {
  const harness = createHarness();
  const result = await harness.service.createRequest({
    sessionId: "session-123",
    agentId: "agent-123",
    businessName: "Blue Harbor Mechanical",
    trade: "hvac",
    source: "agent-architect-review",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, BLUEPRINT_REQUEST_STATUSES.requested);
  assert.equal(harness.events.length, 1);

  const stored = harness.requests.get(result.requestId);
  assert.equal(stored.businessName, "Blue Harbor Mechanical");
  assert.equal(stored.status, BLUEPRINT_REQUEST_STATUSES.requested);
  assert.equal(stored.lifecycle.requestedAt, "2026-06-30T12:00:00.000Z");
});

test("checkout-started and success-page-viewed transition in order", async () => {
  const harness = createHarness();
  const created = await harness.service.createRequest({
    sessionId: "session-123",
    agentId: "agent-123",
    businessName: "Blue Harbor Mechanical",
  });

  const checkout = await harness.service.markCheckoutStarted({ requestId: created.requestId });
  const success = await harness.service.markSuccessPageViewed({ requestId: created.requestId });

  assert.equal(checkout.status, BLUEPRINT_REQUEST_STATUSES.checkoutStarted);
  assert.equal(success.status, BLUEPRINT_REQUEST_STATUSES.successPageViewed);

  const stored = harness.requests.get(created.requestId);
  assert.equal(stored.lifecycle.checkoutStartedAt, "2026-06-30T12:00:00.000Z");
  assert.equal(stored.lifecycle.successPageViewedAt, "2026-06-30T12:00:00.000Z");
  assert.equal(harness.events.map((event) => event.type).join(","), "requested,checkout-started,success-page-viewed");
});

test("paid confirmation provisions the tenant and attaches an existing member when auth user exists", async () => {
  const harness = createHarness();
  harness.sessions.set("session-123", seedCompletedSession());

  const created = await harness.service.createRequest({
    sessionId: "session-123",
    agentId: "agent-123",
    businessName: "Blue Harbor Mechanical",
    contactName: "Owner",
    contactEmail: "owner@example.com",
  });
  await harness.service.markCheckoutStarted({ requestId: created.requestId });
  await harness.service.markSuccessPageViewed({ requestId: created.requestId });

  const result = await harness.service.confirmPaidAndProvision({
    requestId: created.requestId,
    actor: { uid: "operator-1", role: "platform_operator" },
  });

  assert.equal(result.status, BLUEPRINT_REQUEST_STATUSES.paidConfirmed);
  assert.equal(result.tenantId, "blue-harbor-mechanical");
  assert.equal(result.membershipAttachment.mode, "member-attached");

  const org = harness.clientOrganizations.get("blue-harbor-mechanical");
  assert.equal(org.purchaseStatus, "paid");
  assert.equal(org.portalStatus, "active");

  const member = harness.members.get("blue-harbor-mechanical:owner-uid");
  assert.equal(member.email, "owner@example.com");
  assert.equal(member.role, "client_admin");
});

test("paid confirmation creates an invite when no auth user exists", async () => {
  const harness = createHarness();
  harness.sessions.set("session-123", seedCompletedSession());

  const created = await harness.service.createRequest({
    sessionId: "session-123",
    agentId: "agent-123",
    businessName: "Blue Harbor Mechanical",
    contactName: "Owner",
    contactEmail: "new-owner@example.com",
  });
  await harness.service.markCheckoutStarted({ requestId: created.requestId });
  await harness.service.markSuccessPageViewed({ requestId: created.requestId });

  const result = await harness.service.confirmPaidAndProvision({ requestId: created.requestId });

  assert.equal(result.membershipAttachment.mode, "invite-created");
  assert.equal(harness.invites.size, 1);
  const [invite] = [...harness.invites.values()];
  assert.equal(invite.email, "new-owner@example.com");
  assert.equal(invite.status, "pending");
});
