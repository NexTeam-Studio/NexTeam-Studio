import crypto from "crypto";
import { sanitizeTenantId } from "../features/tenancy/services/tenantPathUtils.js";
import {
  createClientOrganizationDeliveryState,
  createClientOrganizationDocument,
  createClientOrganizationInviteDocument,
  createClientOrganizationMemberDocument,
} from "./firebaseBlueprintRequestRepository.js";

export const BLUEPRINT_REQUEST_STATUSES = {
  requested: "requested",
  checkoutStarted: "checkout-started",
  successPageViewed: "success-page-viewed",
  paidConfirmed: "paid-confirmed",
};

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return normalizeText(value).toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureRequired(value, message) {
  if (!normalizeText(value)) {
    throw new Error(message);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function buildRequestId(randomId = crypto.randomUUID()) {
  const safe = sanitizeTenantId(randomId);
  if (!safe) {
    throw new Error("Could not generate a safe blueprint request id.");
  }
  return safe;
}

function buildClientId(request = {}, provisioning = {}) {
  return sanitizeTenantId(
    provisioning?.tenantId ||
      request?.clientId ||
      request?.businessName ||
      request?.sessionId ||
      crypto.randomUUID()
  );
}

function buildLifecyclePatch(request = {}, patch = {}) {
  const lifecycle = {
    ...(request.lifecycle && typeof request.lifecycle === "object" ? request.lifecycle : {}),
    ...(patch.lifecycle && typeof patch.lifecycle === "object" ? patch.lifecycle : {}),
  };

  return {
    ...patch,
    lifecycle,
  };
}

function buildRequestEvent({ type, requestId, now, source, metadata = {}, actor = null }) {
  return {
    type,
    requestId,
    source: normalizeText(source),
    actor: actor && typeof actor === "object" ? clonePlainData(actor) : null,
    metadata: clonePlainData(metadata),
    createdAt: now,
  };
}

export function validateBlueprintRequestPayload(payload = {}) {
  const normalized = {
    requestId: payload.requestId ? sanitizeTenantId(payload.requestId) : "",
    sessionId: normalizeText(payload.sessionId),
    agentId: normalizeText(payload.agentId),
    tenantId: sanitizeTenantId(payload.tenantId || "nexteam-studio"),
    contactName: normalizeText(payload.contactName),
    contactEmail: normalizeEmail(payload.contactEmail),
    contactPhone: normalizeText(payload.contactPhone),
    businessName: normalizeText(payload.businessName),
    legalName: normalizeText(payload.legalName),
    trade: normalizeText(payload.trade),
    serviceArea: normalizeText(payload.serviceArea),
    website: normalizeText(payload.website),
    teamSize: normalizeText(payload.teamSize),
    bottleneck: normalizeText(payload.bottleneck),
    agentName: normalizeText(payload.agentName),
    priorityAgent: normalizeText(payload.priorityAgent),
    recommendedAgents: uniqueStrings(payload.recommendedAgents),
    source: normalizeText(payload.source || "agent-architect"),
  };

  const errors = [];
  if (!normalized.sessionId) errors.push("sessionId is required.");
  if (!normalized.agentId) errors.push("agentId is required.");
  if (!normalized.businessName) errors.push("businessName is required.");
  if (normalized.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.contactEmail)) {
    errors.push("contactEmail must be valid when provided.");
  }
  if (!normalized.tenantId) errors.push("tenantId is required.");

  return {
    ok: errors.length === 0,
    errors,
    value: normalized,
  };
}

function createRequestedDocument(requestId, payload, createdAt) {
  return {
    documentType: "blueprint-request",
    requestId,
    sessionId: payload.sessionId,
    agentId: payload.agentId,
    tenantId: payload.tenantId,
    businessName: payload.businessName,
    legalName: payload.legalName || payload.businessName,
    trade: payload.trade,
    serviceArea: payload.serviceArea,
    website: payload.website,
    teamSize: payload.teamSize,
    bottleneck: payload.bottleneck,
    agentName: payload.agentName,
    priorityAgent: payload.priorityAgent,
    recommendedAgents: payload.recommendedAgents,
    contactName: payload.contactName,
    contactEmail: payload.contactEmail,
    contactPhone: payload.contactPhone,
    source: payload.source,
    status: BLUEPRINT_REQUEST_STATUSES.requested,
    lifecycle: {
      requestedAt: createdAt,
      checkoutStartedAt: null,
      successPageViewedAt: null,
      paidConfirmedAt: null,
      provisionedAt: null,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function assertTransitionAllowed(request, nextStatus) {
  const current = normalizeText(request?.status);
  if (!current) {
    throw new Error("Blueprint request is missing status.");
  }

  const allowed = {
    [BLUEPRINT_REQUEST_STATUSES.requested]: [BLUEPRINT_REQUEST_STATUSES.checkoutStarted],
    [BLUEPRINT_REQUEST_STATUSES.checkoutStarted]: [BLUEPRINT_REQUEST_STATUSES.successPageViewed],
    [BLUEPRINT_REQUEST_STATUSES.successPageViewed]: [BLUEPRINT_REQUEST_STATUSES.paidConfirmed],
    [BLUEPRINT_REQUEST_STATUSES.paidConfirmed]: [],
  };

  if (!allowed[current]?.includes(nextStatus) && current !== nextStatus) {
    throw new Error(`Blueprint request "${request.requestId}" cannot transition from "${current}" to "${nextStatus}".`);
  }
}

export function createBlueprintRequestLifecycleService({
  repository,
  provisioner,
  readAgentSession,
  now = nowIso,
} = {}) {
  if (!repository) {
    throw new Error("Blueprint request lifecycle service requires a repository.");
  }
  if (typeof repository.createRequest !== "function" || typeof repository.getRequest !== "function") {
    throw new Error("Blueprint request lifecycle repository is missing required functions.");
  }
  if (typeof repository.updateRequest !== "function" || typeof repository.appendEvent !== "function") {
    throw new Error("Blueprint request lifecycle repository must support updateRequest and appendEvent.");
  }
  if (typeof readAgentSession !== "function") {
    throw new Error("Blueprint request lifecycle service requires readAgentSession(sessionId).");
  }
  if (!provisioner || typeof provisioner.provisionSession !== "function") {
    throw new Error("Blueprint request lifecycle service requires provisioner.provisionSession(session).");
  }

  async function createRequest(payload = {}) {
    const validation = validateBlueprintRequestPayload(payload);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    const currentNow = now();
    const requestId = validation.value.requestId || buildRequestId();
    const document = createRequestedDocument(requestId, validation.value, currentNow);
    await repository.createRequest(document);
    await repository.appendEvent(
      requestId,
      buildRequestEvent({
        type: "requested",
        requestId,
        now: currentNow,
        source: document.source,
        metadata: {
          businessName: document.businessName,
          sessionId: document.sessionId,
        },
      })
    );

    return {
      ok: true,
      requestId,
      status: document.status,
      sessionId: document.sessionId,
      createdAt: currentNow,
    };
  }

  async function loadRequest(requestId) {
    ensureRequired(requestId, "requestId is required.");
    const request = await repository.getRequest(requestId);
    if (!request) {
      throw new Error(`Blueprint request "${requestId}" was not found.`);
    }
    return request;
  }

  async function updateLifecycleStatus({
    requestId,
    nextStatus,
    source,
    lifecyclePatch,
    eventType,
    metadata = {},
    actor = null,
  }) {
    const request = await loadRequest(requestId);
    assertTransitionAllowed(request, nextStatus);
    const currentNow = now();
    const patch = buildLifecyclePatch(request, {
      status: nextStatus,
      updatedAt: currentNow,
      lifecycle: lifecyclePatch,
      lastEventType: eventType,
    });
    await repository.updateRequest(requestId, patch);
    await repository.appendEvent(
      requestId,
      buildRequestEvent({
        type: eventType,
        requestId,
        now: currentNow,
        source,
        metadata,
        actor,
      })
    );

    return {
      ok: true,
      requestId,
      status: nextStatus,
      updatedAt: currentNow,
    };
  }

  async function markCheckoutStarted({ requestId, source = "stripe-payment-link", actor = null, metadata = {} } = {}) {
    return updateLifecycleStatus({
      requestId,
      nextStatus: BLUEPRINT_REQUEST_STATUSES.checkoutStarted,
      source,
      eventType: "checkout-started",
      lifecyclePatch: {
        checkoutStartedAt: now(),
      },
      metadata,
      actor,
    });
  }

  async function markSuccessPageViewed({ requestId, source = "success-screen", actor = null, metadata = {} } = {}) {
    return updateLifecycleStatus({
      requestId,
      nextStatus: BLUEPRINT_REQUEST_STATUSES.successPageViewed,
      source,
      eventType: "success-page-viewed",
      lifecyclePatch: {
        successPageViewedAt: now(),
      },
      metadata,
      actor,
    });
  }

  async function confirmPaidAndProvision({
    requestId,
    actor = null,
    paymentMode = "stripe-payment-link-manual-confirm",
    source = "operator-paid-confirmation",
    metadata = {},
  } = {}) {
    const request = await loadRequest(requestId);
    assertTransitionAllowed(request, BLUEPRINT_REQUEST_STATUSES.paidConfirmed);

    const session = await readAgentSession(request.sessionId);
    if (!session) {
      throw new Error(`Blueprint request "${requestId}" references missing agent session "${request.sessionId}".`);
    }

    const provisioning = await provisioner.provisionSession(session);
    const currentNow = now();
    const clientId = buildClientId(request, provisioning);
    const clientDocument = createClientOrganizationDocument({
      clientId,
      tenantId: provisioning.tenantId,
      request,
      provisioning,
      memberAttached: false,
      createdAt: currentNow,
    });

    let membershipAttachment = {
      mode: "none",
      memberUid: null,
      inviteId: null,
      inviteEmail: request.contactEmail || null,
    };

    const authUser = request.contactEmail ? await repository.lookupAuthUserByEmail(request.contactEmail) : null;
    if (authUser?.uid && authUser.disabled !== true) {
      const memberDocument = createClientOrganizationMemberDocument({
        clientId,
        tenantId: provisioning.tenantId,
        uid: authUser.uid,
        email: authUser.email,
        contactName: request.contactName,
        createdAt: currentNow,
      });
      await repository.upsertClientOrganizationMember({
        clientId,
        uid: authUser.uid,
        memberDocument,
      });
      clientDocument.portalStatus = "active";
      clientDocument.onboardingStatus.inviteAccepted = true;
      membershipAttachment = {
        mode: "member-attached",
        memberUid: authUser.uid,
        inviteId: null,
        inviteEmail: authUser.email,
      };
    } else if (request.contactEmail) {
      const inviteDocument = createClientOrganizationInviteDocument({
        clientId,
        tenantId: provisioning.tenantId,
        email: request.contactEmail,
        contactName: request.contactName,
        createdAt: currentNow,
      });
      const inviteId = sanitizeTenantId(`invite-${request.requestId}`);
      await repository.upsertClientOrganizationInvite({
        clientId,
        inviteId,
        inviteDocument,
      });
      membershipAttachment = {
        mode: "invite-created",
        memberUid: null,
        inviteId,
        inviteEmail: request.contactEmail,
      };
    }

    await repository.upsertClientOrganization(clientDocument);
    await repository.upsertClientOrganizationDeliveryState({
      clientId,
      stateId: "current",
      deliveryState: createClientOrganizationDeliveryState({
        clientId,
        tenantId: provisioning.tenantId,
        currentStage: BLUEPRINT_REQUEST_STATUSES.paidConfirmed,
        requestId,
        createdAt: currentNow,
      }),
    });

    const paidPatch = buildLifecyclePatch(request, {
      status: BLUEPRINT_REQUEST_STATUSES.paidConfirmed,
      updatedAt: currentNow,
      paymentMode,
      clientId,
      clientOrganizationId: clientId,
      lastEventType: "paid-confirmed",
      provisioning: {
        tenantId: provisioning.tenantId,
        clientRoute: provisioning.clientRoute,
        operatorRoute: provisioning.operatorRoute,
        packetId: provisioning.packetId,
        blueprintId: provisioning.blueprintId,
        onboardingSessionId: provisioning.onboardingSessionId,
        created: provisioning.created === true,
      },
      lifecycle: {
        paidConfirmedAt: currentNow,
        provisionedAt: currentNow,
      },
      membershipAttachment,
    });

    await repository.updateRequest(requestId, paidPatch);
    await repository.appendEvent(
      requestId,
      buildRequestEvent({
        type: "paid-confirmed",
        requestId,
        now: currentNow,
        source,
        actor,
        metadata: {
          ...metadata,
          paymentMode,
          tenantId: provisioning.tenantId,
          clientId,
          membershipMode: membershipAttachment.mode,
          operatorRoute: provisioning.operatorRoute,
          clientRoute: provisioning.clientRoute,
        },
      })
    );

    return {
      ok: true,
      requestId,
      status: BLUEPRINT_REQUEST_STATUSES.paidConfirmed,
      tenantId: provisioning.tenantId,
      clientId,
      clientOrganizationId: clientId,
      clientRoute: provisioning.clientRoute,
      operatorRoute: provisioning.operatorRoute,
      provisioning,
      membershipAttachment,
      updatedAt: currentNow,
    };
  }

  return {
    createRequest,
    loadRequest,
    markCheckoutStarted,
    markSuccessPageViewed,
    confirmPaidAndProvision,
  };
}

export const blueprintRequestLifecycleServiceInternals = {
  buildClientId,
  buildLifecyclePatch,
  buildRequestEvent,
  buildRequestId,
  createRequestedDocument,
  validateBlueprintRequestPayload,
  assertTransitionAllowed,
};
