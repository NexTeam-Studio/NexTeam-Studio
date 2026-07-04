import test from "node:test";
import assert from "node:assert/strict";
import { createRawIntakePacket } from "../../tenancy/schemas/clientIntakePacketSchema.js";
import { normalizeClientConfigFromIntakePacket } from "../../tenancy/schemas/clientConfigSchema.js";
import { buildTenantRuntimeSummaryFromConfig } from "../../tenancy/schemas/runtimeSummarySchema.js";
import { createInMemoryTenantDocumentStore } from "../../tenancy/services/tenantDocumentRepository.js";
import { createTenantFoundationRegistry } from "../../tenancy/services/tenantFoundationRegistry.js";
import {
  AQUATRACE_BRAND_NAME,
  AQUATRACE_TENANT_ID,
  buildAquatraceTenantFoundationDocuments,
} from "../../clients/aquatrace/aquatraceTenantFoundation.js";
import { aquatraceBragiModeBExtension } from "../../clients/aquatrace/bragiModeBClientProfile.js";
import {
  buildBragiModeBLinkPlan,
  createBragiModeBClientConfigRegistry,
  getBragiModeBClientConfig,
  normalizeBragiModeBLocation,
} from "./bragiModeBClientConfig.js";
import { bragiModeBArticleGeneratorInternals } from "./bragiModeBArticleGenerator.js";

function buildBlueHarborTenantDocuments() {
  const packet = createRawIntakePacket({
    tenantId: "blue-harbor",
    source: {
      channel: "operator",
      capturedBy: "atlas",
      notes: "Second-tenant proof fixture for Bragi Mode B foundation loading.",
    },
    intake: {
      businessName: "Blue Harbor Leak Diagnostics",
      currentUrl: "https://blueharbor.example.com",
      desiredUrl: "https://blueharbor.example.com",
      primaryContact: {
        name: "Jordan Lake",
        role: "Owner",
        email: "ops@blueharbor.example.com",
        phone: "912-555-0199",
      },
      emailProvider: "gmail",
      branding: {
        primaryColor: "#0b5fff",
        secondaryColor: "#06213d",
        logoUrl: "",
        headingFont: "Barlow Condensed",
        bodyFont: "Source Sans 3",
      },
      services: ["Pool leak detection", "Underwater leak inspection"],
      targetCustomers: ["Residential pool owners", "HOA managers"],
      accountsToConnect: ["wordpress", "email"],
      competitors: ["Regional leak check crews"],
      doRules: ["Stay diagnostic-first."],
      dontRules: ["Do not promise repairs."],
      notes: "Savannah and coastal Georgia leak-detection lane.",
    },
  });

  const config = normalizeClientConfigFromIntakePacket(packet, {
    publicAgentName: "Bragi",
    industry: "pool leak detection",
    hqCity: "Savannah",
    hqState: "GA",
    territories: ["GA"],
    claimsBoundariesRef: "docs://clients/blue-harbor/CLAIMS_BOUNDARIES.md",
    channels: {
      wordpress: {
        status: "connected",
        siteUrl: "https://blueharbor.example.com",
        authRef: "secrets://wordpress/blue-harbor/app-password",
        accountRef: "wordpress-user://blue-harbor-editor",
        provider: "wordpress-rest",
      },
      email: {
        status: "connected",
        authRef: "credentials://gmail/blue-harbor-oauth",
        accountRef: "gmail-account://ops@blueharbor.example.com",
        accountLabel: "ops@blueharbor.example.com",
        provider: "gmail-oauth",
      },
    },
    workflow: {
      approvalMode: "draft_only",
      launchSequence: ["wordpress_articles"],
      featureFlags: {
        modeA: false,
        modeB: true,
        modeC: false,
      },
    },
    dashboard: {
      visibleKpis: ["drafts_ready"],
      ownerGoals: ["More diagnostic calls"],
    },
    meta: {
      tier: "starter",
      status: "active",
    },
  });
  const summary = buildTenantRuntimeSummaryFromConfig(config);

  return {
    tenantId: "blue-harbor",
    packet,
    config,
    summary,
  };
}

function buildBlueHarborModeBExtension() {
  return {
    approval: {
      reviewRecipient: "ops@blueharbor.example.com",
      subjectPrefix: "[Blue Harbor Draft Review]",
    },
    locations: {
      "Savannah GA": {
        label: "Savannah GA",
        city: "Savannah",
        state: "GA",
        display: "Savannah, GA",
        stateName: "Georgia",
        regionTerms: ["coastal Georgia", "humid summers", "pool-heavy neighborhoods"],
        coordinates: { lat: 32.0809, lon: -81.0912 },
      },
    },
    brandVoice: [
      "Calm, field-based, homeowner-first.",
      "Diagnostics before repair guesses.",
    ],
    guardrails: {
      blockedScopePatterns: [/\bguaranteed\b/i],
    },
    topicProfiles: [
      {
        key: "general",
        matchers: [],
        intent: "diagnostics-first leak detection education",
        focusKeywordHint: "Savannah pool leak detection",
        categoryNames: ["Pool Leak Detection"],
        tagNames: ["Leak Diagnostics"],
      },
    ],
    internalLinks: [
      {
        url: "https://blueharbor.example.com/",
        purpose: "Brand homepage",
        anchors: ["Blue Harbor Leak Diagnostics"],
      },
      {
        url: "https://blueharbor.example.com/services/leak-detection/",
        purpose: "Core leak detection service page",
        anchors: ["pool leak detection", "leak detection service"],
        required: true,
      },
      {
        url: "https://blueharbor.example.com/request-service/",
        purpose: "Primary request path",
        anchors: ["request service", "book a diagnostic visit"],
        required: true,
      },
      {
        url: "https://blueharbor.example.com/georgia-service-area/",
        purpose: "Georgia service area",
        anchors: ["Georgia pool leak detection"],
        stateFilter: ["GA"],
      },
    ],
    externalLinks: [
      {
        url: "https://www.epa.gov/watersense/fix-leak-week",
        purpose: "Authoritative leak-waste reference",
        label: "EPA WaterSense leak guidance",
      },
    ],
  };
}

test("Aquatrace real tenant documents persist through the three-layer foundation store", () => {
  const aquatraceDocs = buildAquatraceTenantFoundationDocuments();
  const store = createInMemoryTenantDocumentStore();
  const registry = createTenantFoundationRegistry({ store });

  registry.registerTenantDocuments(aquatraceDocs);

  const paths = registry.listDocumentPaths(`tenants/${AQUATRACE_TENANT_ID}/`);
  assert.equal(paths.length, 3);
  assert.ok(paths.some((path) => path.startsWith(`tenants/${AQUATRACE_TENANT_ID}/intakePackets/`)));
  assert.ok(paths.includes(`tenants/${AQUATRACE_TENANT_ID}/config/current`));
  assert.ok(paths.includes(`tenants/${AQUATRACE_TENANT_ID}/runtimeSummary/current`));

  const foundationConfig = registry.getTenantConfig(AQUATRACE_TENANT_ID);
  const runtimeSummary = registry.getTenantRuntimeSummary(AQUATRACE_TENANT_ID);

  assert.equal(foundationConfig.profile.brandName, AQUATRACE_BRAND_NAME);
  assert.deepEqual(foundationConfig.profile.serviceArea.territories, ["SC", "FL", "GA", "NC"]);
  assert.equal(foundationConfig.channels.wordpress.siteUrl, "https://aquatraceleak.com");
  assert.equal(foundationConfig.channels.gbp.projectId, "nexteam-gbp-rail");
  assert.equal(foundationConfig.channels.gbp.status, "blocked");
  assert.equal(
    foundationConfig.businessRules.claimsBoundariesRef,
    "docs://clients/aquatrace/bragi/AQUATRACE_CLAIMS_BOUNDARIES.md"
  );
  assert.equal(runtimeSummary.brandName, AQUATRACE_BRAND_NAME);
  assert.equal(runtimeSummary.connectivity.connectedCount, 3);
  assert.equal(runtimeSummary.connectivity.blockedCount, 1);
});

test("default Bragi Mode B loader resolves Aquatrace from the tenant foundation", () => {
  const config = getBragiModeBClientConfig("aquatrace");
  const location = normalizeBragiModeBLocation("Charleston SC", config);
  const prompt = bragiModeBArticleGeneratorInternals.buildPrompt({
    topic: "Charleston pool leak detection and underwater inspection",
    location,
    config,
    linkPlan: buildBragiModeBLinkPlan({
      topic: "Charleston pool leak detection and underwater inspection",
      location,
      config,
    }),
    topicProfile: config.topicProfiles.at(-1),
  });

  assert.equal(config.profile.brandName, AQUATRACE_BRAND_NAME);
  assert.equal(config.channels.companycam.status, "connected");
  assert.equal(config.channels.gbp.status, "blocked");
  assert.equal(config.locations["Charleston SC"].display, "Charleston, SC");
  assert.match(prompt, /Aquatrace Swimming Pool Leak Detection/);
});

test("the same tenant-backed loader serves a second client with no engine code changes", () => {
  const foundationRegistry = createTenantFoundationRegistry();
  const configRegistry = createBragiModeBClientConfigRegistry({
    foundationRegistry,
    bootstrapDefaults: false,
  });

  const aquatraceDocs = buildAquatraceTenantFoundationDocuments();
  configRegistry.registerBragiModeBTenantSource("aquatrace", {
    tenantId: aquatraceDocs.tenantId,
    packet: aquatraceDocs.packet,
    config: aquatraceDocs.config,
    summary: aquatraceDocs.summary,
    modeBExtension: aquatraceBragiModeBExtension,
  });

  const blueHarborDocs = buildBlueHarborTenantDocuments();
  configRegistry.registerBragiModeBTenantSource("blue-harbor", {
    tenantId: blueHarborDocs.tenantId,
    packet: blueHarborDocs.packet,
    config: blueHarborDocs.config,
    summary: blueHarborDocs.summary,
    modeBExtension: buildBlueHarborModeBExtension(),
  });

  const blueHarborConfig = configRegistry.getBragiModeBClientConfig("blue-harbor");
  const blueHarborLocation = normalizeBragiModeBLocation("Savannah GA", blueHarborConfig);
  const linkPlan = buildBragiModeBLinkPlan({
    topic: "Savannah pool leak detection after suspicious water loss",
    location: blueHarborLocation,
    config: blueHarborConfig,
  });
  const prompt = bragiModeBArticleGeneratorInternals.buildPrompt({
    topic: "Savannah pool leak detection after suspicious water loss",
    location: blueHarborLocation,
    config: blueHarborConfig,
    linkPlan,
    topicProfile: blueHarborConfig.topicProfiles[0],
  });

  assert.equal(blueHarborConfig.profile.brandName, "Blue Harbor Leak Diagnostics");
  assert.equal(blueHarborConfig.channels.wordpress.siteUrl, "https://blueharbor.example.com");
  assert.equal(blueHarborConfig.businessRules.services[0], "Pool leak detection");
  assert.equal(blueHarborConfig.approval.reviewRecipient, "ops@blueharbor.example.com");
  assert.equal(blueHarborConfig.locations["Savannah GA"].display, "Savannah, GA");
  assert.ok(linkPlan.internalLinks.some((link) => link.url === "https://blueharbor.example.com/services/leak-detection/"));
  assert.ok(linkPlan.internalLinks.some((link) => link.url === "https://blueharbor.example.com/request-service/"));
  assert.ok(!linkPlan.internalLinks.some((link) => /aquatraceleak\.com/i.test(link.url)));
  assert.match(prompt, /Blue Harbor Leak Diagnostics/);
  assert.doesNotMatch(prompt, /Aquatrace/);
});
