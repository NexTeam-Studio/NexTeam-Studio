import { createRawIntakePacket } from "../../tenancy/schemas/clientIntakePacketSchema.js";
import { normalizeClientConfigFromIntakePacket } from "../../tenancy/schemas/clientConfigSchema.js";
import { buildTenantRuntimeSummaryFromConfig } from "../../tenancy/schemas/runtimeSummarySchema.js";

export const AQUATRACE_TENANT_ID = "aquatrace";
export const AQUATRACE_BRAND_NAME = "Aquatrace Swimming Pool Leak Detection";

function getAquatraceTenantConfigOverrides() {
  return {
    publicAgentName: "Bragi",
    industry: "pool leak detection",
    hqCity: "Fair Play",
    hqState: "SC",
    territories: ["SC", "FL", "GA", "NC"],
    claimsBoundariesRef: "docs://clients/aquatrace/bragi/AQUATRACE_CLAIMS_BOUNDARIES.md",
    channels: {
      wordpress: {
        status: "connected",
        siteUrl: "https://aquatraceleak.com",
        authRef: "secrets://wordpress/aquatrace/application-password",
        accountRef: "wordpress-user://aquatrace-bragi",
        provider: "wordpress-rest",
      },
      gbp: {
        status: "blocked",
        projectId: "nexteam-gbp-rail",
        authRef: "credentials://nexteam-gbp-rail-oauth-json",
        accountRef: "google-account://aquatraceleak@gmail.com",
        accountLabel: "aquatraceleak@gmail.com",
        provider: "google-business-profile",
      },
      companycam: {
        status: "connected",
        authRef: "env://COMPANYCAM_API_TOKEN",
        accountRef: "companycam-company://aquatrace",
        provider: "companycam",
      },
      email: {
        status: "connected",
        authRef: "credentials://nexteam-gmail-oauth-json",
        accountRef: "gmail-account://service@aquatraceleak.com",
        accountLabel: "service@aquatraceleak.com",
        provider: "gmail-oauth",
      },
      jobber: {
        enabled: false,
        status: "not-needed",
        authRef: null,
        accountRef: null,
        provider: "",
      },
    },
    workflow: {
      approvalMode: "draft_only",
      launchSequence: ["wordpress_articles", "google_business_profile"],
      featureFlags: {
        modeA: true,
        modeB: true,
        modeC: false,
      },
    },
    dashboard: {
      visibleKpis: ["drafts_ready", "gbp_accounts_connected", "photos_available"],
      ownerGoals: ["More booked diagnostics", "More findable organic content", "Revenue growth without more manual prospecting"],
    },
    meta: {
      tier: "custom",
      status: "active",
    },
  };
}

export function buildAquatraceRawIntakePacket() {
  return createRawIntakePacket({
    tenantId: AQUATRACE_TENANT_ID,
    source: {
      channel: "operator",
      capturedBy: "atlas",
      notes: "Aquatrace tenant-zero foundation packet built from verified Bragi, GBP, WordPress, and founder-context docs.",
    },
    intake: {
      businessName: AQUATRACE_BRAND_NAME,
      currentUrl: "https://aquatraceleak.com",
      desiredUrl: "https://aquatraceleak.com",
      primaryContact: {
        name: "Chris Sears",
        role: "Owner",
        email: "chris@aquatraceleak.com",
        phone: "864-710-8636",
      },
      emailProvider: "gmail",
      branding: {
        primaryColor: "#00ffff",
        secondaryColor: "#1c1c1c",
        logoUrl: "",
        headingFont: "Montserrat",
        bodyFont: "Josefin Sans",
      },
      services: [
        "Swimming pool leak detection",
        "Commercial pool leak diagnostics",
        "Underwater pool inspection",
        "VGB drain cover documentation",
      ],
      targetCustomers: [
        "Residential pool owners",
        "Commercial pool operators",
        "HOA managers",
        "Property managers",
        "Hotel managers",
      ],
      accountsToConnect: ["wordpress", "gbp", "companycam", "email"],
      competitors: ["Red Rhino"],
      doRules: [
        "Stay diagnostic-first.",
        "Use plain-English field explanations.",
        "Document what is visible and testable before recommending next steps.",
      ],
      dontRules: [
        "Do not present Aquatrace as a general repair company.",
        "Do not promise guaranteed results.",
        "Do not make legal, engineering, or compliance certification claims.",
      ],
      notes:
        "Aquatrace is based in Fair Play, SC and serves South Carolina, Florida, Georgia, and North Carolina. Current proven locations in the GBP rail are Fair Play SC, Gainesville FL, Myrtle Beach SC, and Charleston SC.",
    },
  });
}

export function buildAquatraceTenantClientConfig() {
  const packet = buildAquatraceRawIntakePacket();
  return normalizeClientConfigFromIntakePacket(packet, getAquatraceTenantConfigOverrides());
}

export function buildAquatraceTenantRuntimeSummary() {
  const config = buildAquatraceTenantClientConfig();
  return buildTenantRuntimeSummaryFromConfig(config);
}

export function buildAquatraceTenantFoundationDocuments() {
  const packet = buildAquatraceRawIntakePacket();
  const config = normalizeClientConfigFromIntakePacket(packet, getAquatraceTenantConfigOverrides());
  const summary = buildTenantRuntimeSummaryFromConfig(config);

  return {
    tenantId: AQUATRACE_TENANT_ID,
    packet,
    config,
    summary,
  };
}
