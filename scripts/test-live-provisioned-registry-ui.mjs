import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "playwright";
import {
  optionalEnv,
  fetchJson,
  resolveBaseUrl,
  resolveFirebaseWebConfig,
  resolveServiceAccountPath,
  signInWithCustomTokenRest,
  signInWithPasswordRest,
} from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();
const firebaseConfig = resolveFirebaseWebConfig();
const serviceAccountPath = resolveServiceAccountPath();
const operatorEmail =
  optionalEnv("NEXTEAM_OPERATOR_EMAIL") ||
  optionalEnv("FIREBASE_PLATFORM_OPERATOR_EMAILS").split(",")[0]?.trim() ||
  "owner@aquatrace.com";
const operatorPassword = optionalEnv("NEXTEAM_OPERATOR_PASSWORD");
const operatorUid =
  optionalEnv("NEXTEAM_OPERATOR_UID") ||
  optionalEnv("FIREBASE_PLATFORM_OPERATOR_UIDS").split(",")[0]?.trim() ||
  "H7ht0iJdWqhQjPaKozon5ndmonJ2";
const operatorRole = optionalEnv("FIREBASE_PLATFORM_OPERATOR_ROLE", "platform_operator") || "platform_operator";

function nowIso() {
  return new Date().toISOString();
}

async function waitForBodyText(page, predicate, timeoutMs = 45000) {
  const startedAt = Date.now();
  let lastText = "";

  while (Date.now() - startedAt < timeoutMs) {
    lastText = await page.locator("body").innerText().catch(() => "");
    if (predicate(lastText)) {
      return lastText;
    }
    await page.waitForTimeout(750);
  }

  throw new Error(`Timed out waiting for expected body text. Last body snapshot:\n${lastText}`);
}

async function getOperatorIdToken({ adminApp }) {
  if (operatorEmail && operatorPassword) {
    const signIn = await signInWithPasswordRest({
      apiKey: firebaseConfig.apiKey,
      email: operatorEmail,
      password: operatorPassword,
    });
    return {
      mode: "email-password",
      idToken: signIn.idToken,
      customToken: null,
    };
  }

  if (!operatorUid) {
    throw new Error(
      "Missing operator login path. Set NEXTEAM_OPERATOR_EMAIL/NEXTEAM_OPERATOR_PASSWORD or NEXTEAM_OPERATOR_UID/FIREBASE_PLATFORM_OPERATOR_UIDS."
    );
  }

  const customToken = await getAdminAuth(adminApp).createCustomToken(operatorUid, {
    tenantId: "nexteam-studio",
    role: operatorRole,
  });
  const signIn = await signInWithCustomTokenRest({
    apiKey: firebaseConfig.apiKey,
    token: customToken,
  });

  return {
    mode: "custom-token",
    idToken: signIn.idToken,
    customToken,
  };
}

async function createProvisionedTenantProof({ db, idToken }) {
  const suffix = Date.now();
  const sessionId = `registry-proof-session-${randomUUID()}`;
  const businessName = `Registry Proof Mechanical ${suffix}`;
  const requestPayload = {
    sessionId,
    agentId: `registry-proof-agent-${randomUUID()}`,
    tenantId: "nexteam-studio",
    businessName,
    legalName: `${businessName} LLC`,
    trade: "hvac",
    serviceArea: "Greenville, SC",
    teamSize: "4 technicians",
    bottleneck: "Dispatch handoff lag",
    website: "https://example.com",
    agentName: "Nexi",
    priorityAgent: "scheduling",
    recommendedAgents: ["scheduling", "crm"],
    contactName: "Registry Proof Operator",
    contactEmail: operatorEmail,
    contactPhone: "864-555-0199",
    source: "registry-ui-live-proof",
  };

  const seedSessionDocument = {
    sessionId,
    tenantId: "nexteam-studio",
    status: "completed",
    businessName,
    trade: "hvac",
    crewSize: 4,
    jobVolume: "55 jobs per month",
    serviceArea: "Greenville, SC",
    biggestPain: "Dispatch handoff lag",
    existingTools: ["Jobber", "Gmail"],
    recommendedAgents: ["scheduling", "crm"],
    priorityAgent: "scheduling",
    agentName: "Nexi",
    agentMission: "Handle intake, scheduling, and follow-up without dropped callbacks.",
    missingFields: [],
    stage: "confirm",
    confirmed: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: nowIso(),
  };

  await db.doc(`agentSessions/${sessionId}`).set(seedSessionDocument);

  const createRequest = await fetchJson(`${baseUrl}/api/public/blueprint-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });
  const requestId = createRequest.json?.requestId || null;

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

  return {
    sessionId,
    requestId,
    businessName,
    createRequest,
    checkoutStarted,
    successViewed,
    paidConfirmed,
    tenantId: paidConfirmed?.json?.tenantId || null,
    clientId: paidConfirmed?.json?.clientId || null,
    operatorRoute: paidConfirmed?.json?.operatorRoute || null,
  };
}

async function proveRegistryAndWorkspace({ tenantId, businessName, operatorRoute, customToken }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);

  const proof = {
    pageErrors: [],
    consoleErrors: [],
    steps: [],
  };

  page.on("pageerror", (error) => {
    proof.pageErrors.push(String(error?.message || error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      proof.consoleErrors.push(message.text());
    }
  });

  try {
    await page.goto(`${baseUrl}/mission-control/clients`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      async ({ injectedFirebaseConfig, injectedCustomToken }) => {
        const firebaseAppModule = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js");
        const firebaseAuthModule = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
        const app = firebaseAppModule.getApps().length
          ? firebaseAppModule.getApp()
          : firebaseAppModule.initializeApp(injectedFirebaseConfig);
        const auth = firebaseAuthModule.getAuth(app);
        await firebaseAuthModule.setPersistence(auth, firebaseAuthModule.browserLocalPersistence);
        await firebaseAuthModule.signInWithCustomToken(auth, injectedCustomToken);
        if (typeof auth.authStateReady === "function") {
          await auth.authStateReady();
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      },
      {
        injectedFirebaseConfig: firebaseConfig,
        injectedCustomToken: customToken,
      }
    );
    await page.reload({ waitUntil: "domcontentloaded" });

    const registryText = await waitForBodyText(
      page,
      (text) =>
        /client host-agent registry/i.test(text) &&
        text.includes(businessName) &&
        text.includes(tenantId),
      45000
    );
    proof.steps.push({
      step: "registry-visible",
      ok:
        registryText.includes(businessName) &&
        registryText.includes(tenantId) &&
        registryText.toLowerCase().includes("live registry"),
      url: page.url(),
    });

    await page.goto(`${baseUrl}${operatorRoute}`, { waitUntil: "domcontentloaded" });
    const workspaceText = await waitForBodyText(
      page,
      (text) =>
        text.includes(businessName) &&
        text.includes(tenantId) &&
        text.includes("Mission Control enabled: true"),
      45000
    );
    proof.steps.push({
      step: "workspace-visible",
      ok:
        workspaceText.includes(businessName) &&
        workspaceText.includes(tenantId) &&
        workspaceText.includes("Mission Control enabled: true") &&
        workspaceText.includes("Registry visible: true"),
      url: page.url(),
    });
  } finally {
    await browser.close();
  }

  proof.ok =
    proof.steps.every((step) => step.ok) &&
    proof.pageErrors.length === 0 &&
    proof.consoleErrors.length === 0;

  return proof;
}

async function cleanupArtifacts({ db, sessionId, requestId, tenantId, clientId }) {
  const deletes = [];
  if (requestId) {
    deletes.push(db.recursiveDelete(db.doc(`blueprintRequests/${requestId}`)));
  }
  if (clientId) {
    deletes.push(db.recursiveDelete(db.doc(`clientOrganizations/${clientId}`)));
  }
  if (tenantId) {
    deletes.push(db.recursiveDelete(db.doc(`tenants/${tenantId}`)));
  }
  if (sessionId) {
    deletes.push(db.doc(`agentSessions/${sessionId}`).delete().catch(() => {}));
  }

  const settled = await Promise.allSettled(deletes);
  return settled.every((entry) => entry.status === "fulfilled") ? "completed" : "partial";
}

async function main() {
  const credentials = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  const adminApp = initializeApp(
    {
      credential: cert(credentials),
      projectId: credentials.project_id,
    },
    `registry-ui-live-proof-${Date.now()}`
  );
  const db = getFirestore(adminApp);

  let result = null;
  let cleanup = "pending";

  try {
    const authSession = await getOperatorIdToken({ adminApp });
    const idToken = authSession.idToken;

    const provision = await createProvisionedTenantProof({ db, idToken });
    const registryProof =
      provision.tenantId && provision.operatorRoute
        ? await proveRegistryAndWorkspace({
            tenantId: provision.tenantId,
            businessName: provision.businessName,
            operatorRoute: provision.operatorRoute,
            customToken: authSession.customToken || (await getAdminAuth(adminApp).createCustomToken(operatorUid, {
              tenantId: "nexteam-studio",
              role: operatorRole,
            })),
          })
        : {
            ok: false,
            steps: [],
            pageErrors: [],
            consoleErrors: [],
          };

    result = {
      ok:
        provision.createRequest.ok &&
        provision.checkoutStarted?.ok === true &&
        provision.successViewed?.ok === true &&
        provision.paidConfirmed?.ok === true &&
        registryProof.ok === true,
      baseUrl,
      createdArtifacts: {
        sessionId: provision.sessionId,
        requestId: provision.requestId,
        tenantId: provision.tenantId,
        clientId: provision.clientId,
        operatorRoute: provision.operatorRoute,
      },
      authMode: authSession.mode,
      routeResponses: {
        createRequest: {
          status: provision.createRequest.status,
          body: provision.createRequest.json || provision.createRequest.text,
        },
        checkoutStarted: provision.checkoutStarted
          ? {
              status: provision.checkoutStarted.status,
              body: provision.checkoutStarted.json || provision.checkoutStarted.text,
            }
          : null,
        successViewed: provision.successViewed
          ? {
              status: provision.successViewed.status,
              body: provision.successViewed.json || provision.successViewed.text,
            }
          : null,
        paidConfirmed: provision.paidConfirmed
          ? {
              status: provision.paidConfirmed.status,
              body: provision.paidConfirmed.json || provision.paidConfirmed.text,
            }
          : null,
      },
      registryProof,
      cleanup,
    };

    cleanup = await cleanupArtifacts({
      db,
      sessionId: provision.sessionId,
      requestId: provision.requestId,
      tenantId: provision.tenantId,
      clientId: provision.clientId,
    });
    result.cleanup = cleanup;
  } finally {
    if (result) {
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
