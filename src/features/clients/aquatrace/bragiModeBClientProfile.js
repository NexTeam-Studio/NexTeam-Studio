import { buildAquatraceTenantClientConfig } from "./aquatraceTenantFoundation.js";
import { buildBragiModeBClientConfigFromTenant } from "../../missioncontrol/services/bragiModeBTenantConfigAdapter.js";

export const AQUATRACE_LOCATIONS = {
  "Fair Play SC": {
    label: "Fair Play SC",
    city: "Fair Play",
    state: "SC",
    display: "Fair Play, SC",
    stateName: "South Carolina",
    regionTerms: ["Lake Hartwell", "Upstate South Carolina", "lakefront pools"],
    coordinates: { lat: 34.5115, lon: -82.9921 },
  },
  "Gainesville FL": {
    label: "Gainesville FL",
    city: "Gainesville",
    state: "FL",
    display: "Gainesville, FL",
    stateName: "Florida",
    regionTerms: ["North Central Florida", "Alachua County", "Florida pool owners"],
    coordinates: { lat: 29.6516, lon: -82.3248 },
  },
  "Myrtle Beach SC": {
    label: "Myrtle Beach SC",
    city: "Myrtle Beach",
    state: "SC",
    display: "Myrtle Beach, SC",
    stateName: "South Carolina",
    regionTerms: ["Grand Strand", "coastal South Carolina", "vacation and rental pools"],
    coordinates: { lat: 33.6891, lon: -78.8867 },
  },
  "Charleston SC": {
    label: "Charleston SC",
    city: "Charleston",
    state: "SC",
    display: "Charleston, SC",
    stateName: "South Carolina",
    regionTerms: ["Lowcountry", "coastal pools", "Charleston-area properties"],
    coordinates: { lat: 32.7765, lon: -79.9311 },
  },
};

export const aquatraceBragiModeBExtension = {
  approval: {
    reviewRecipient: "aquatraceleak@gmail.com",
    subjectPrefix: "[Bragi Mode B Draft Review]",
  },
  locations: AQUATRACE_LOCATIONS,
  brandVoice: [
    "Warm, hook-first, plain-spoken expert.",
    "Diagnostics-first, never repair-first.",
    "Focused on saving pool owners money by finding the real problem before unnecessary work starts.",
    "Reassuring, evidence-based, low-pressure, and never hypey.",
    "Use VGB-safe wording when drain covers or commercial compliance questions appear.",
  ],
  guardrails: {
    blockedScopePatterns: [
      /\bwe repair\b/i,
      /\brepair crew\b/i,
      /\bpool repair company\b/i,
      /\bexcavation company\b/i,
      /\bmaintenance company\b/i,
      /\bwe fix leaks\b/i,
      /\bguaranteed results\b/i,
      /\b100%\s+guaranteed\b/i,
      /\balways find\b/i,
    ],
  },
  topicProfiles: [
    {
      key: "commercial-vgb",
      matchers: [/\b(vgb|virginia graeme baker|drain cover|commercial|main drain|compliance)\b/i],
      intent: "commercial VGB documentation and underwater verification",
      focusKeywordHint: "commercial pool VGB drain cover documentation",
      categoryNames: ["Swimming Pool Leak Detection Techniques and Procedures"],
      tagNames: ["Professional Leak Detection Services", "Latest Leak Detection Technologies"],
    },
    {
      key: "evaporation",
      matchers: [/\b(evaporation|bucket test|water loss|water bill|disappearing water)\b/i],
      intent: "homeowner education about suspicious water loss",
      focusKeywordHint: "pool leak detection",
      categoryNames: ["Swimming Pool Leak Detection"],
      tagNames: ["Why is my pool losing water", "Professional Leak Detection Services"],
    },
    {
      key: "general",
      matchers: [],
      intent: "diagnostics-first leak detection education",
      focusKeywordHint: "swimming pool leak detection",
      categoryNames: ["Swimming Pool Leak Detection"],
      tagNames: ["Professional Leak Detection Services", "Latest Leak Detection Technologies"],
    },
  ],
  internalLinks: [
    {
      url: "https://aquatraceleak.com/",
      purpose: "Brand homepage",
      anchors: ["Aquatrace", "Aquatrace Swimming Pool Leak Detection"],
    },
    {
      url: "https://aquatraceleak.com/services/pool-leaks/",
      purpose: "Core pool leak service page",
      anchors: ["pool leak detection", "swimming pool leak detection", "professional pool leak detection"],
      required: true,
    },
    {
      url: "https://aquatraceleak.com/services/swimming-pool-leak-detection",
      purpose: "Primary service-intent page variant",
      anchors: ["swimming pool leak detection", "pool leak detection services"],
    },
    {
      url: "https://aquatraceleak.com/services/underwater-pool-inspection",
      purpose: "Underwater inspection support",
      anchors: ["underwater pool inspection", "underwater documentation"],
      topicMatchers: [/\b(vgb|underwater|drain cover|commercial)\b/i],
    },
    {
      url: "https://aquatraceleak.com/commercial-pool-services",
      purpose: "Commercial pool services path",
      anchors: ["commercial pool leak detection services", "commercial pool diagnostics"],
      topicMatchers: [/\b(commercial|vgb|operator|hoa|hotel)\b/i],
    },
    {
      url: "https://aquatraceleak.com/do-you-have-a-leak/",
      purpose: "Evaporation and symptoms page",
      anchors: ["do you have a leak", "signs your pool may have a leak", "compare evaporation against a real leak"],
    },
    {
      url: "https://aquatraceleak.com/service-request/",
      purpose: "Primary request path",
      anchors: ["request service", "schedule a diagnostic visit", "start with a service request"],
      required: true,
    },
    {
      url: "https://aquatraceleak.com/contact",
      purpose: "General contact path",
      anchors: ["contact Aquatrace", "reach Aquatrace"],
    },
    {
      url: "https://aquatraceleak.com/aquatrace-swimming-pool-leak-detection-service-locations/florida-locations/",
      purpose: "Florida hub",
      anchors: ["Florida pool leak detection", "Florida service area"],
      stateFilter: ["FL"],
    },
    {
      url: "https://aquatraceleak.com/aquatrace-swimming-pool-leak-detection-service-locations/south-carolina-locations/",
      purpose: "South Carolina hub",
      anchors: ["South Carolina pool leak detection", "South Carolina service area"],
      stateFilter: ["SC"],
    },
  ],
  externalLinks: [
    {
      url: "https://www.epa.gov/watersense/fix-leak-week",
      purpose: "Authoritative leak-waste reference",
      label: "EPA WaterSense leak guidance",
    },
    {
      url: "https://www.poolsafely.gov/pool-spa-safety-act/",
      purpose: "Official VGB Act overview",
      label: "Pool Safely VGB Act overview",
      topicMatchers: [/\b(vgb|virginia graeme baker|drain cover|commercial)\b/i],
    },
  ],
};

export const aquatraceBragiModeBClientProfile = buildBragiModeBClientConfigFromTenant({
  clientId: "aquatrace",
  foundationConfig: buildAquatraceTenantClientConfig(),
  modeBExtension: aquatraceBragiModeBExtension,
});
