import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl,
  resolveServiceAccountPath,
  resolveOperatorProofIdentity,
} from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();
const operatorIdentity = resolveOperatorProofIdentity();
const operatorEmail = operatorIdentity.email;
const serviceAccountPath = resolveServiceAccountPath();
const keepArtifacts = process.env.KEEP_BLUEPRINT_LIVE_PROOF === "1";

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const credentials = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  const adminApp = initializeApp(
    {
      credential: cert(credentials),
      projectId: credentials.project_id,
    },
    `blueprint-live-proof-${Date.now()}`
  );
  const db = getFirestore(adminApp);

  const testSlug = `readiness-proof-${Date.now()}`;
  const businessName = `Readiness Proof Mechanical ${Date.now()}`;
  const sessionId = `proof-session-${randomUUID()}`;
  const requestPayload = {
    sessionId,
    agentId: `proof-agent-${randomUUID()}`,
    tenantId: "nexteam-studio",
    businessName,
    legalName: `${businessName} LLC`,
    trade: "hvac",
    serviceArea: "Greenville, SC",
    teamSize: "3 technicians",
    bottleneck: "Dispatch and callback lag",
    website: "https://example.com",
    agentName: "Nexi",
    priorityAgent: "scheduling",
    recommendedAgents: ["scheduling", "crm"],
    contactName: "Readiness Proof Operator",
    contactEmail: operatorEmail,
    contactPhone: "864-555-0100",
    source: "live-readiness-proof",
  };

  const seedSessionDocument = {
    sessionId,
    tenantId: "nexteam-studio",
    status: "completed",
    businessName,
    trade: "hvac",
    crewSize: 3,
    jobVolume: "40 jobs per month",
    serviceArea: "Greenville, SC",
    biggestPain: "Dispatch and callback lag",
    existingTools: ["Jobber", "Gmail"],
    recommendedAgents: ["scheduling", "crm"],
    priorityAgent: "scheduling",
    agentName: "Nexi",
    agentMission: "Handle new calls, scheduling, and follow-up without dropping leads.",
    missingFields: [],
    stage: "confirm",
    confirmed: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: nowIso(),
  };

  let requestId = null;
  let provisionedTenantId = null;
  let clientId = null;
  let result = null;
  let cleanupStatus = keepArtifacts ? "skipped" : "pending";

  try {
    await db.doc(`agentSessions/${sessionId}`).set(seedSessionDocument);

    const session = await createOperatorProofSession({ identity: operatorIdentity });
    const idToken = session.idToken;

    try {
      const createRequest = await fetchJson(`${baseUrl}/api/public/blueprint-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });
      requestId = createRequest.json?.requestId || null;

      const checkoutStarted = requestId
        ? await fetchJson(`${baseUrl}/api/public/blueprint-requests/${encodeURIComponent(requestId)}/checkout-started`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              proofMode: true,
            }),
          })
        : null;

      const successViewed = requestId
        ? await fetchJson(`${baseUrl}/api/public/blueprint-requests/${encodeURIComponent(requestId)}/success-page-viewed`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              proofMode: true,
            }),
          })
        : null;

      const beforeConfirm = requestId
        ? await fetchJson(`${baseUrl}/api/internal/blueprint-requests/${encodeURIComponent(requestId)}`, {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          })
        : null;

      const paidConfirmed = requestId
        ? await fetchJson(`${baseUrl}/api/internal/blueprint-requests/${encodeURIComponent(requestId)}/confirm-paid`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              proofMode: true,
            }),
          })
        : null;

      provisionedTenantId = paidConfirmed?.json?.tenantId || null;
      clientId = paidConfirmed?.json?.clientId || null;

      const requestDoc = requestId ? await db.doc(`blueprintRequests/${requestId}`).get() : null;
      const eventSnapshot = requestId
        ? await db.collection(`blueprintRequests/${requestId}/events`).get()
        : null;
      const tenantRoot = provisionedTenantId ? await db.doc(`tenants/${provisionedTenantId}`).get() : null;
      const configDoc = provisionedTenantId ? await db.doc(`tenants/${provisionedTenantId}/config/current`).get() : null;
      const runtimeSummaryDoc = provisionedTenantId
        ? await db.doc(`tenants/${provisionedTenantId}/runtimeSummary/current`).get()
        : null;
      const clientOrgDoc = clientId ? await db.doc(`clientOrganizations/${clientId}`).get() : null;
      const memberSnapshot = clientId ? await db.collection(`clientOrganizations/${clientId}/members`).get() : null;

      result = {
        ok:
          createRequest.ok &&
          createRequest.status === 201 &&
          checkoutStarted?.ok === true &&
          successViewed?.ok === true &&
          beforeConfirm?.ok === true &&
          paidConfirmed?.ok === true &&
          requestDoc?.exists === true &&
          tenantRoot?.exists === true &&
          tenantRoot?.data()?.registryVisible === true &&
          configDoc?.exists === true &&
          runtimeSummaryDoc?.exists === true &&
          clientOrgDoc?.exists === true &&
          (memberSnapshot?.size || 0) >= 1,
        baseUrl,
        authMode: session.mode,
        createdArtifacts: {
          sessionId,
          requestId,
          tenantId: provisionedTenantId,
          clientId,
        },
        routeResponses: {
          createRequest: {
            status: createRequest.status,
            body: createRequest.json || createRequest.text,
          },
          checkoutStarted: checkoutStarted
            ? {
                status: checkoutStarted.status,
                body: checkoutStarted.json || checkoutStarted.text,
              }
            : null,
          successViewed: successViewed
            ? {
                status: successViewed.status,
                body: successViewed.json || successViewed.text,
              }
            : null,
          beforeConfirm: beforeConfirm
            ? {
                status: beforeConfirm.status,
                body: beforeConfirm.json || beforeConfirm.text,
              }
            : null,
          paidConfirmed: paidConfirmed
            ? {
                status: paidConfirmed.status,
                body: paidConfirmed.json || paidConfirmed.text,
              }
            : null,
        },
        firestoreProof: {
          requestStatus: requestDoc?.data()?.status || null,
          eventTypes: eventSnapshot?.docs.map((doc) => doc.data().type) || [],
          tenantRoot: tenantRoot?.data() || null,
          configExists: configDoc?.exists || false,
          runtimeSummaryExists: runtimeSummaryDoc?.exists || false,
          clientOrganization: clientOrgDoc?.data() || null,
          memberCount: memberSnapshot?.size || 0,
        },
        cleanup: cleanupStatus,
      };
    } finally {
      await session.dispose();
    }
  } finally {
    if (!keepArtifacts) {
      const deletes = [];
      if (requestId) {
        deletes.push(db.recursiveDelete(db.doc(`blueprintRequests/${requestId}`)));
      }
      if (clientId) {
        deletes.push(db.recursiveDelete(db.doc(`clientOrganizations/${clientId}`)));
      }
      if (provisionedTenantId) {
        deletes.push(db.recursiveDelete(db.doc(`tenants/${provisionedTenantId}`)));
      }
      deletes.push(db.doc(`agentSessions/${sessionId}`).delete().catch(() => {}));
      const settled = await Promise.allSettled(deletes);
      cleanupStatus = settled.every((entry) => entry.status === "fulfilled") ? "completed" : "partial";
    }

    if (result) {
      result.cleanup = cleanupStatus;
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    }

    await deleteApp(adminApp).catch(() => {});
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(error?.message || error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
