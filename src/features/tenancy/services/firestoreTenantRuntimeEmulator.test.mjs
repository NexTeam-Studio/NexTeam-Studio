import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  createRawIntakePacket,
  INTAKE_PACKET_DOCUMENT_TYPE,
} from "../schemas/clientIntakePacketSchema.js";
import {
  CLIENT_CONFIG_DOCUMENT_TYPE,
  normalizeClientConfigFromIntakePacket,
} from "../schemas/clientConfigSchema.js";
import {
  buildTenantRuntimeSummaryFromConfig,
  RUNTIME_SUMMARY_DOCUMENT_TYPE,
} from "../schemas/runtimeSummarySchema.js";

const SHOULD_RUN = process.env.RUN_FIRESTORE_EMULATOR_TESTS === "1";

if (!SHOULD_RUN) {
  test("firestore emulator tenant runtime tests", { skip: "Run via npm run test:firestore-rules:emulator" }, () => {});
} else {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  const [host = "127.0.0.1", portValue = "8080"] = emulatorHost.split(":");
  const port = Number(portValue);
  const projectId = "demo-nexteam-studio";

  /** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
  let testEnv;

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
        accountsToConnect: ["wordpress", "gbp", "companycam", "email"],
        competitors: ["Red Rhino"],
        doRules: ["Stay diagnostic-first"],
        dontRules: ["Do not promise repairs"],
      },
    });
  }

  function buildConfig(tenantId) {
    return normalizeClientConfigFromIntakePacket(buildIntakePacket(tenantId), {
      territories: ["SC"],
      hqCity: "Fair Play",
      hqState: "SC",
      workflow: {
        approvalMode: "draft_only",
        launchSequence: ["wordpress_articles", "gbp"],
        featureFlags: { modeA: true, modeB: true, modeC: false },
      },
      dashboard: {
        visibleKpis: ["drafts_ready", "approval_pending"],
        ownerGoals: ["More booked diagnostics"],
      },
      meta: {
        tier: "pro",
        status: "config-ready",
      },
    });
  }

  function buildRuntimeSummary(tenantId) {
    return buildTenantRuntimeSummaryFromConfig(buildConfig(tenantId));
  }

  function buildTenantRootDoc(tenantId) {
    return {
      tenantId,
      brandName: `${tenantId} Pools`,
      avatarName: "Nexi",
      industry: "field-service",
    };
  }

  function buildSubagentDoc(subagentId = "writer") {
    return {
      id: subagentId,
      name: "Writer",
      role: "content_writer",
      enabled: true,
    };
  }

  function authenticatedDb(tenantId) {
    return testEnv
      .authenticatedContext(`user-${tenantId}`, {
        tenantId,
      })
      .firestore();
  }

  function platformDb() {
    return testEnv
      .authenticatedContext("platform-operator", {
        role: "platform_operator",
      })
      .firestore();
  }

  async function seedTenantData(tenantId) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `tenants/${tenantId}`), buildTenantRootDoc(tenantId));
      await setDoc(doc(db, `tenants/${tenantId}/intakePackets/current`), buildIntakePacket(tenantId, "current"));
      await setDoc(doc(db, `tenants/${tenantId}/config/current`), buildConfig(tenantId));
      await setDoc(doc(db, `tenants/${tenantId}/runtimeSummary/current`), buildRuntimeSummary(tenantId));
      await setDoc(doc(db, `tenants/${tenantId}/subagents/writer`), buildSubagentDoc("writer"));
    });
  }

  function buildCollectionCases(tenantId) {
    return [
      {
        label: "intakePackets",
        path: `tenants/${tenantId}/intakePackets/current`,
        buildValidDoc: (targetTenantId) => buildIntakePacket(targetTenantId, "current"),
        invalidDoc: {
          documentType: "wrong-document-type",
          tenantId,
          packetId: "current",
          submittedAt: new Date().toISOString(),
          intake: {},
          meta: {},
        },
      },
      {
        label: "config",
        path: `tenants/${tenantId}/config/current`,
        buildValidDoc: (targetTenantId) => buildConfig(targetTenantId),
        invalidDoc: {
          documentType: "wrong-document-type",
          tenantId,
          profile: {},
          branding: {},
          businessRules: {},
          channels: {},
          workflow: {},
          dashboard: {},
          meta: {},
        },
      },
      {
        label: "runtimeSummary",
        path: `tenants/${tenantId}/runtimeSummary/current`,
        buildValidDoc: (targetTenantId) => buildRuntimeSummary(targetTenantId),
        invalidDoc: {
          documentType: "wrong-document-type",
          tenantId,
          brandName: "Broken",
          publicAgentName: "Nexi",
          workflow: {},
          connectivity: {},
          dashboard: {},
          updatedAt: new Date().toISOString(),
        },
      },
      {
        label: "subagents",
        path: `tenants/${tenantId}/subagents/writer`,
        buildValidDoc: () => buildSubagentDoc("writer"),
        invalidDoc: {
          id: "writer",
          name: "Writer",
          enabled: true,
        },
      },
    ];
  }

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host,
        port,
        rules,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  test("tenant can read and write its own tenant root document at runtime", async () => {
    const db = authenticatedDb("acme-pools");
    const ref = doc(db, "tenants/acme-pools");
    const payload = buildTenantRootDoc("acme-pools");

    await assertSucceeds(setDoc(ref, payload));
    const snapshot = await assertSucceeds(getDoc(ref));

    assert.equal(snapshot.exists(), true);
    assert.equal(snapshot.data().tenantId, "acme-pools");
  });

  test("tenant cannot read or write another tenant root document at runtime", async () => {
    await seedTenantData("other-tenant");
    const db = authenticatedDb("acme-pools");
    const ref = doc(db, "tenants/other-tenant");

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, buildTenantRootDoc("other-tenant")));
  });

  for (const collectionCase of buildCollectionCases("acme-pools")) {
    test(`tenant can read and write its own ${collectionCase.label} document at runtime`, async () => {
      const db = authenticatedDb("acme-pools");
      const ref = doc(db, collectionCase.path);

      await assertSucceeds(setDoc(ref, collectionCase.buildValidDoc("acme-pools")));
      const snapshot = await assertSucceeds(getDoc(ref));

      assert.equal(snapshot.exists(), true);
    });

    test(`tenant cannot read or write another tenant's ${collectionCase.label} document at runtime`, async () => {
      await seedTenantData("other-tenant");
      const db = authenticatedDb("acme-pools");
      const otherPath = collectionCase.path.replaceAll("acme-pools", "other-tenant");
      const ref = doc(db, otherPath);

      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, collectionCase.buildValidDoc("other-tenant")));
    });

    test(`${collectionCase.label} runtime rules reject invalid document shapes for the owning tenant`, async () => {
      const db = authenticatedDb("acme-pools");
      const ref = doc(db, collectionCase.path);

      await assertFails(setDoc(ref, collectionCase.invalidDoc));
    });
  }

  test("platform operator can read and write across tenants at runtime", async () => {
    await seedTenantData("other-tenant");
    const db = platformDb();
    const configRef = doc(db, "tenants/other-tenant/config/current");
    const updatedConfig = buildConfig("other-tenant");
    updatedConfig.meta.status = "active";

    await assertSucceeds(getDoc(configRef));
    await assertSucceeds(setDoc(configRef, updatedConfig));

    const snapshot = await assertSucceeds(getDoc(configRef));
    assert.equal(snapshot.data().documentType, CLIENT_CONFIG_DOCUMENT_TYPE);
    assert.equal(snapshot.data().meta.status, "active");
  });

  test("runtime fixture builders use the expected tenant foundation document types", () => {
    assert.equal(buildIntakePacket("acme-pools").documentType, INTAKE_PACKET_DOCUMENT_TYPE);
    assert.equal(buildConfig("acme-pools").documentType, CLIENT_CONFIG_DOCUMENT_TYPE);
    assert.equal(buildRuntimeSummary("acme-pools").documentType, RUNTIME_SUMMARY_DOCUMENT_TYPE);
  });
}
