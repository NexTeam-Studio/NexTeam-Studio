import test from "node:test";
import assert from "node:assert/strict";
import {
  createRawIntakePacket,
  assertValidRawIntakePacket,
} from "./clientIntakePacketSchema.js";
import {
  createTenantClientConfig,
  normalizeClientConfigFromIntakePacket,
  validateTenantClientConfig,
  assertValidTenantClientConfig,
} from "./clientConfigSchema.js";
import {
  buildTenantRuntimeSummaryFromConfig,
  validateTenantRuntimeSummary,
} from "./runtimeSummarySchema.js";

function buildValidIntakePacket() {
  return createRawIntakePacket({
    tenantId: "acme-pools",
    intake: {
      businessName: "Acme Pools",
      currentUrl: "https://acmepools.example.com",
      desiredUrl: "https://www.acmepools.example.com",
      primaryContact: {
        name: "Chris Sears",
        role: "Owner",
        email: "chris@example.com",
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
      services: ["Pool leak detection", "VGB documentation"],
      targetCustomers: ["Homeowners", "HOAs"],
      accountsToConnect: ["wordpress", "gbp", "companycam", "email"],
      competitors: ["Red Rhino"],
      doRules: ["Stay diagnostic-first"],
      dontRules: ["Do not promise repairs"],
    },
  });
}

test("good raw intake packet passes validation", () => {
  const packet = buildValidIntakePacket();
  assert.doesNotThrow(() => assertValidRawIntakePacket(packet));
});

test("normalized client config passes validation", () => {
  const config = normalizeClientConfigFromIntakePacket(buildValidIntakePacket(), {
    territories: ["SC", "GA"],
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

  assert.doesNotThrow(() => assertValidTenantClientConfig(config));
  assert.equal(config.channels.wordpress.status, "pending");
  assert.equal(config.channels.jobber.status, "not-needed");
});

test("invalid client config is rejected", () => {
  const config = createTenantClientConfig({
    tenantId: "bad tenant id",
    profile: {
      brandName: "",
      publicAgentName: "N",
      industry: "",
      contact: { primaryName: "", primaryRole: "", email: "nope", phone: "abc" },
      website: { currentUrl: "not-a-url", desiredUrl: "" },
      serviceArea: { hqCity: "", hqState: "", territories: [] },
    },
    businessRules: {
      services: [],
      targetCustomers: [],
    },
    meta: {
      tier: "ultra",
      status: "mystery",
      createdAt: "yesterday",
      updatedAt: "tomorrow",
    },
  });

  const errors = validateTenantClientConfig(config);
  assert.match(errors.join("\n"), /Invalid tenantId|tenantId/i);
  assert.match(errors.join("\n"), /brandName/i);
  assert.match(errors.join("\n"), /services/i);
  assert.match(errors.join("\n"), /targetCustomers/i);
  assert.match(errors.join("\n"), /meta\.tier/i);
});

test("secret-like values in client config are blocked deterministically", () => {
  const config = normalizeClientConfigFromIntakePacket(buildValidIntakePacket(), {
    territories: ["SC"],
    meta: { tier: "starter", status: "config-ready" },
  });
  config.channels.wordpress.authRef = "ya29.secret-token-value";

  assert.throws(
    () => assertValidTenantClientConfig(config),
    /secret-like material|Google OAuth token/i
  );
});

test("secret-like field names in client config are blocked deterministically", () => {
  const config = normalizeClientConfigFromIntakePacket(buildValidIntakePacket(), {
    territories: ["SC"],
    meta: { tier: "starter", status: "config-ready" },
  });
  config.channels.wordpress.accessToken = "not-allowed";

  assert.throws(
    () => assertValidTenantClientConfig(config),
    /secret-like field name|accessToken/i
  );
});

test("runtime summary derives from config and stays separate from config shape", () => {
  const config = normalizeClientConfigFromIntakePacket(buildValidIntakePacket(), {
    territories: ["SC"],
    meta: { tier: "starter", status: "config-ready" },
    workflow: {
      approvalMode: "draft_only",
      launchSequence: ["wordpress_articles"],
      featureFlags: { modeA: false, modeB: true, modeC: false },
    },
    dashboard: {
      visibleKpis: ["drafts_ready"],
      ownerGoals: ["More diagnostics"],
    },
  });

  const summary = buildTenantRuntimeSummaryFromConfig(config);
  const errors = validateTenantRuntimeSummary(summary);

  assert.equal(errors.length, 0);
  assert.equal(summary.documentType, "tenant-runtime-summary");
  assert.notEqual(summary.documentType, config.documentType);
  assert.ok(!("channels" in summary));
  assert.deepEqual(summary.connectivity.statusByChannel.wordpress, "pending");
});
