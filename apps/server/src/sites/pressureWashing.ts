import { generatedSiteSchema, siteGenerationInputSchema, type GeneratedSite, type SiteBlock, type SiteGenerationInput } from "./schemas.js";
import { renderStaticSite } from "./renderer.js";

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const defaultServices: Extract<SiteBlock, { type: "services" }>["services"] = [
  { name: "House Wash", description: "Soft-wash exterior siding, soffits, fascia, and trim for a clean finish.", startingAt: "Starting at $249" },
  { name: "Large House Wash", description: "Exterior soft washing for larger homes over 3,000 square feet.", startingAt: "Starting at $349" },
  { name: "Estate House Wash", description: "Detailed exterior soft washing for homes over 3,500 square feet.", startingAt: "Starting at $449" },
  { name: "Driveway Cleaning", description: "Remove surface dirt, mold, stains, and buildup from concrete.", startingAt: "Starting at $149" },
  { name: "Sidewalk and Walkway Cleaning", description: "High-pressure cleaning for sidewalks and walkways.", startingAt: "Starting at $79" },
  { name: "Patio Cleaning", description: "High-pressure cleaning for patios, porches, and outdoor areas.", startingAt: "Starting at $149" },
  { name: "Roof Soft Wash", description: "Low-pressure cleaning for roofs with a safer approach to delicate surfaces.", startingAt: "Starting at $499" },
  { name: "Gutter Cleaning", description: "Remove leaves and debris, then flush and check downspouts.", startingAt: "Starting at $149" },
  { name: "Deck Cleaning", description: "Restore wood and vinyl surfaces with a thorough wash.", startingAt: "Starting at $199" },
  { name: "Fence Cleaning", description: "Clean wood, vinyl, and other fence surfaces.", startingAt: "Starting at $199" },
  { name: "Commercial Building Washing", description: "Building exteriors, storefronts, walkways, and more.", startingAt: "Starting at $0.20 per sq. ft." },
  { name: "Dumpster Pad Cleaning", description: "Eliminate grease, odors, and buildup.", startingAt: "Starting at $199" },
  { name: "Fleet Washing", description: "Keep work vehicles looking clean and professional.", startingAt: "$35–$60 per vehicle" },
  { name: "Rust Removal", description: "Remove stubborn rust stains from exterior surfaces.", startingAt: "Starting at $99" },
  { name: "Oxidation Removal", description: "Restore oxidized exterior surfaces.", startingAt: "Starting at $299" },
  { name: "Window Cleaning", description: "Streak-free exterior window cleaning.", startingAt: "Starting at $149" },
  { name: "Solar Panel Cleaning", description: "Improve panel efficiency with a professional cleaning.", startingAt: "Starting at $149" }
];

export function generatePressureWashingSite(input: SiteGenerationInput = {}, now = new Date().toISOString()): GeneratedSite {
  const parsed = siteGenerationInputSchema.parse(input);
  const tenantId = parsed.tenantId ?? "pressure-washing-demo";
  const businessName = parsed.businessName ?? "Exterior Cleaning Professionals";
  const slug = slugify(parsed.slug ?? businessName);
  const phone = parsed.phone ?? "Call for an estimate";
  const website = parsed.website;
  const services = parsed.services ?? defaultServices;
  const websiteLabel = website ? website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "Residential and commercial";
  const blocks: SiteBlock[] = [
    {
      id: "hero", type: "hero", eyebrow: parsed.tagline ?? "Cleaner surfaces. Better impressions.",
      headline: "Tough work. Clean results.",
      subhead: `${businessName} provides detailed exterior cleaning for homes, businesses, and properties that need to look their best.`,
      primaryCta: { label: "Call for an estimate", href: phone.startsWith("+") || /^\d/.test(phone) ? `tel:${phone.replace(/[^+\d]/g, "")}` : "#contact" },
      proofPoints: ["Residential and commercial", "Exterior cleaning professionals", phone, websiteLabel],
      imageSrc: parsed.logoUrl,
      imageAlt: `${businessName} logo`,
      faviconSrc: parsed.faviconUrl
    },
    { id: "services", type: "services", heading: "Exterior cleaning that makes the whole property look cared for.", services },
    {
      id: "packages", type: "services", heading: "Popular package deals.", services: [
        { name: "Bronze Package", description: "House wash and front walkway.", startingAt: "$349" },
        { name: "Silver Package", description: "House wash, driveway, and sidewalk cleaning.", startingAt: "$549" },
        { name: "Gold Package", description: "House wash, roof soft wash, driveway, and gutters.", startingAt: "$899" }
      ]
    },
    { id: "area", type: "service_area_map", heading: "A cleaner property starts with one good call.", center: parsed.serviceArea?.[0] ?? "Your area", areas: parsed.serviceArea ?? ["Residential properties", "Commercial properties", "Property managers"] },
    { id: "badges", type: "compliance_badges", heading: "What we clean", badges: ["House washing", "Roof cleaning", "Concrete cleaning", "Gutter cleaning", "Residential and commercial", "Military and first responder discounts"] },
    { id: "contact", type: "contact", heading: "Ready for a cleaner property?", intro: `Call ${phone} to talk through your project and request an estimate.`, phone, website }
  ];
  const siteWithoutHtml = {
    id: `site_${tenantId}_${slug}`, tenantId, slug, title: businessName, theme: "pressure_washing" as const, blocks,
    internalUrl: `/sites/${slug}`, status: "staged" as const, customDomainStatus: "pending_cloudflare" as const, createdAt: now, updatedAt: now
  };
  return generatedSiteSchema.parse({ ...siteWithoutHtml, html: renderStaticSite(siteWithoutHtml) }) as GeneratedSite;
}
