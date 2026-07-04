import test from "node:test";
import assert from "node:assert/strict";
import { createTenantActorScope } from "./tenantAccessPolicy.js";
import { prepareRawIntakePacketWrite, prepareTenantClientConfigWrite, prepareTenantRuntimeSummaryWrite } from "./tenantDocumentRepository.js";
import { createRawIntakePacket } from "../schemas/clientIntakePacketSchema.js";
import { normalizeClientConfigFromIntakePacket } from "../schemas/clientConfigSchema.js";
import { buildTenantRuntimeSummaryFromConfig } from "../schemas/runtimeSummarySchema.js";

function buildFoundationDocs(tenantId = "acme-pools") {
  const packet = createRawIntakePacket({
    tenantId,
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
      services: ["Pool leak detection"],
      targetCustomers: ["Homeowners"],
      accountsToConnect: ["wordpress", "email"],
      competitors: ["Red Rhino"],
      doRules: ["Stay diagnostic-first"],
      dontRules: ["No repair promises"],
    },
  });

  const config = normalizeClientConfigFromIntakePacket(packet, {
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

  const summary = buildTenantRuntimeSummaryFromConfig(config);
  return { packet, config, summary };
}

test("raw intake, normalized config, and runtime summary write to separate storage paths", () => {
  const actorScope = createTenantActorScope({ tenantId: "acme-pools" });
  const { packet, config, summary } = buildFoundationDocs();

  const intakeWrite = prepareRawIntakePacketWrite({ actorScope, tenantId: "acme-pools", packet });
  const configWrite = prepareTenantClientConfigWrite({ actorScope, tenantId: "acme-pools", config });
  const summaryWrite = prepareTenantRuntimeSummaryWrite({ actorScope, tenantId: "acme-pools", summary });

  assert.match(intakeWrite.path, /^tenants\/acme-pools\/intakePackets\//);
  assert.equal(configWrite.path, "tenants/acme-pools/config/current");
  assert.equal(summaryWrite.path, "tenants/acme-pools/runtimeSummary/current");
});

test("cross-shape writes are rejected even for the correct tenant", () => {
  const actorScope = createTenantActorScope({ tenantId: "acme-pools" });
  const { config, summary } = buildFoundationDocs();

  assert.throws(
    () => prepareRawIntakePacketWrite({ actorScope, tenantId: "acme-pools", packet: config }),
    /Invalid raw intake packet|documentType/i
  );

  assert.throws(
    () => prepareTenantClientConfigWrite({ actorScope, tenantId: "acme-pools", config: summary }),
    /Invalid tenant client config|documentType/i
  );
});

test("cross-tenant write access is denied in code", () => {
  const actorScope = createTenantActorScope({ tenantId: "acme-pools" });
  const { packet } = buildFoundationDocs("other-tenant");

  assert.throws(
    () => prepareRawIntakePacketWrite({ actorScope, tenantId: "other-tenant", packet }),
    /Tenant access denied/i
  );
});

test("platform operators can prepare writes across tenants", () => {
  const actorScope = createTenantActorScope({ roles: ["platform_operator"] });
  const { config } = buildFoundationDocs("other-tenant");

  const write = prepareTenantClientConfigWrite({ actorScope, tenantId: "other-tenant", config });
  assert.equal(write.path, "tenants/other-tenant/config/current");
});
