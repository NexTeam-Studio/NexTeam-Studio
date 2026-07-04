import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  applyTenantBootstrapClaims,
  verifyFirebaseIdTokenFromAuthorizationHeader,
} from "./firebaseAuthClaimsService.js";
import { getFirebaseAdminDb, resetFirebaseAdminAppForTests } from "./firebaseAdminApp.js";
import {
  adminUpsertTenantRootDocument,
  adminWriteValidatedTenantFoundationDocuments,
} from "./firebaseTenantAdminRepository.js";
import { createRawIntakePacket } from "../features/tenancy/schemas/clientIntakePacketSchema.js";
import { normalizeClientConfigFromIntakePacket } from "../features/tenancy/schemas/clientConfigSchema.js";
import { buildTenantRuntimeSummaryFromConfig } from "../features/tenancy/schemas/runtimeSummarySchema.js";

const SHOULD_RUN = process.env.RUN_FIREBASE_AUTH_ADMIN_EMULATOR_TESTS === "1";

if (!SHOULD_RUN) {
  test("firebase auth/admin emulator tests", { skip: "Run via npm run test:firebase-auth-admin:emulator" }, () => {});
} else {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
  const projectId = "demo-nexteam-studio";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  const [firestoreHostName = "127.0.0.1", firestorePortValue = "8080"] = firestoreHost.split(":");
  const firestorePort = Number(firestorePortValue);

  process.env.FIREBASE_ADMIN_PROJECT_ID = projectId;
  process.env.FIREBASE_DEFAULT_TENANT_ID = "acme-pools";
  process.env.FIREBASE_PLATFORM_OPERATOR_EMAILS = "ops@example.com";
  process.env.FIREBASE_PLATFORM_OPERATOR_UIDS = "";
  process.env.FIREBASE_PLATFORM_OPERATOR_ROLE = "platform_operator";

  /** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
  let testEnv;
  const clientApps = [];

  function buildTenantRootDoc(tenantId) {
    return {
      tenantId,
      brandName: `${tenantId} Pools`,
      avatarName: "Nexi",
      industry: "field-service",
      missionControlEnabled: true,
      registryVisible: true,
      updatedAt: new Date().toISOString(),
    };
  }

  function buildIntakePacket(tenantId, packetId = `intake-${tenantId}`) {
    return createRawIntakePacket({
      packetId,
      tenantId,
      intake: {
        businessName: `${tenantId} Pools`,
        currentUrl: `https://${tenantId}.example.com`,
        desiredUrl: `https://www.${tenantId}.example.com`,
        primaryContact: {
          name: "Chris Sears",
          role: "Owner",
          email: `${tenantId}@example.com`,
          phone: "864-555-1212",
        },
        emailProvider: "gmail",
        branding: {
          primaryColor: "#0EA5E9",
          secondaryColor: "#1E293B",
          logoUrl: "https://cdn.example.com/logo.png",
          headingFont: "Barlow Condensed",
          bodyFont: "Source Sans 3",
        },
        services: ["Pool leak detection"],
        targetCustomers: ["Homeowners"],
        accountsToConnect: ["wordpress", "companycam", "email"],
        competitors: ["Red Rhino"],
        doRules: ["Stay diagnostic-first"],
        dontRules: ["Do not promise repairs"],
      },
    });
  }

  function buildTenantConfig(tenantId) {
    return normalizeClientConfigFromIntakePacket(buildIntakePacket(tenantId), {
      territories: ["SC"],
      hqCity: "Fair Play",
      hqState: "SC",
      workflow: {
        approvalMode: "draft_only",
        launchSequence: ["wordpress_articles"],
        featureFlags: { modeA: false, modeB: true, modeC: false },
      },
      dashboard: {
        visibleKpis: ["drafts_ready"],
        ownerGoals: ["More diagnostics"],
      },
      meta: {
        tier: "starter",
        status: "config-ready",
      },
    });
  }

  function buildRuntimeSummary(tenantId) {
    return buildTenantRuntimeSummaryFromConfig(buildTenantConfig(tenantId));
  }

  async function clearAuthEmulator() {
    await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, {
      method: "DELETE",
    });
  }

  async function createClientSession({ email, password }) {
    const app = initializeClientApp(
      {
        apiKey: "demo-api-key",
        authDomain: "127.0.0.1",
        projectId,
      },
      `client-${email}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    clientApps.push(app);

    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, firestoreHostName, firestorePort);

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return {
      app,
      auth,
      db,
      user: credential.user,
    };
  }

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: firestoreHostName,
        port: firestorePort,
        rules,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await clearAuthEmulator();
    await resetFirebaseAdminAppForTests();
  });

  after(async () => {
    await Promise.all(clientApps.map((app) => deleteClientApp(app)));
    await testEnv.cleanup();
    await resetFirebaseAdminAppForTests();
  });

  test("signed-in user without tenant claims is denied by Firestore runtime rules", async () => {
    const session = await createClientSession({
      email: "member@example.com",
      password: "Passw0rd!",
    });

    await assertFails(setDoc(doc(session.db, "tenants/acme-pools"), buildTenantRootDoc("acme-pools")));
  });

  test("tenant bootstrap applies a real tenant claim that Firestore rules honor at runtime", async () => {
    const session = await createClientSession({
      email: "member@example.com",
      password: "Passw0rd!",
    });

    const initialIdToken = await session.user.getIdToken();
    const bootstrap = await applyTenantBootstrapClaims({
      idToken: initialIdToken,
      env: process.env,
    });
    const refreshedTokenResult = await session.user.getIdTokenResult(true);

    assert.equal(bootstrap.claims.tenantId, "acme-pools");
    assert.equal(refreshedTokenResult.claims.tenantId, "acme-pools");

    await assertSucceeds(setDoc(doc(session.db, "tenants/acme-pools"), buildTenantRootDoc("acme-pools")));
    await assertFails(setDoc(doc(session.db, "tenants/other-tenant"), buildTenantRootDoc("other-tenant")));
  });

  test("non-operator users cannot bootstrap arbitrary tenant claims", async () => {
    const session = await createClientSession({
      email: "member@example.com",
      password: "Passw0rd!",
    });
    const initialIdToken = await session.user.getIdToken();

    await assert.rejects(
      () =>
        applyTenantBootstrapClaims({
          idToken: initialIdToken,
          requestedTenantId: "other-tenant",
          env: process.env,
        }),
      /Non-operator users cannot request arbitrary tenant access/i
    );
  });

  test("operator identity receives a verified platform role claim and can cross tenant boundaries", async () => {
    const session = await createClientSession({
      email: "ops@example.com",
      password: "Passw0rd!",
    });

    await adminUpsertTenantRootDocument({
      tenantId: "other-tenant",
      brandName: "Other Tenant Pools",
      env: process.env,
    });

    const initialIdToken = await session.user.getIdToken();
    const bootstrap = await applyTenantBootstrapClaims({
      idToken: initialIdToken,
      requestedTenantId: "other-tenant",
      env: process.env,
    });
    const refreshedTokenResult = await session.user.getIdTokenResult(true);

    assert.equal(bootstrap.claims.role, "platform_operator");
    assert.equal(refreshedTokenResult.claims.role, "platform_operator");

    const otherTenantRef = doc(session.db, "tenants/other-tenant");
    await assertSucceeds(getDoc(otherTenantRef));
    await assertSucceeds(
      setDoc(otherTenantRef, {
        ...buildTenantRootDoc("other-tenant"),
        brandName: "Other Tenant Pools Updated",
      })
    );
  });

  test("verified bearer tokens map into tenant actor scopes correctly", async () => {
    const session = await createClientSession({
      email: "ops@example.com",
      password: "Passw0rd!",
    });

    const initialIdToken = await session.user.getIdToken();
    await applyTenantBootstrapClaims({
      idToken: initialIdToken,
      requestedTenantId: "other-tenant",
      env: process.env,
    });
    const refreshedIdToken = await session.user.getIdToken(true);

    const verified = await verifyFirebaseIdTokenFromAuthorizationHeader(`Bearer ${refreshedIdToken}`, process.env);
    assert.equal(verified.actorScope.tenantId, "other-tenant");
    assert.deepEqual(verified.actorScope.roles, ["platform_operator"]);
  });

  test("Admin SDK writes bypass client rules and can persist validated tenant foundation documents", async () => {
    const packet = buildIntakePacket("acme-pools", "current");
    const config = buildTenantConfig("acme-pools");
    const summary = buildRuntimeSummary("acme-pools");

    await adminUpsertTenantRootDocument({
      tenantId: "acme-pools",
      brandName: "Acme Pools",
      env: process.env,
    });

    await adminWriteValidatedTenantFoundationDocuments({
      tenantId: "acme-pools",
      packet,
      config,
      summary,
      env: process.env,
    });

    const adminDb = getFirebaseAdminDb(process.env);
    const configSnap = await adminDb.doc("tenants/acme-pools/config/current").get();
    const summarySnap = await adminDb.doc("tenants/acme-pools/runtimeSummary/current").get();

    assert.equal(configSnap.exists, true);
    assert.equal(configSnap.data().documentType, "tenant-client-config");
    assert.equal(summarySnap.exists, true);
    assert.equal(summarySnap.data().documentType, "tenant-runtime-summary");
  });
}
