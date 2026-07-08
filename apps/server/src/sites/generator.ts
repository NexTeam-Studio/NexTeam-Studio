import { generatedSiteSchema, siteGenerationInputSchema, type GeneratedSite, type SiteBlock, type SiteGenerationInput } from "./schemas.js";
import { renderStaticSite } from "./renderer.js";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultServices(): Extract<SiteBlock, { type: "services" }>["services"] {
  return [
    {
      name: "Pool Leak Detection",
      description: "Pressure testing, dye testing, equipment checks, and plain-English findings for pool owners who need the real answer.",
      startingAt: "Standard pool-only detection from $595"
    },
    {
      name: "Pool + Spa Leak Detection",
      description: "A full pool and attached-spa diagnostic visit with findings organized for the owner, builder, or property manager.",
      startingAt: "Pool + spa detection from $795"
    },
    {
      name: "Commercial/VGB Field Documentation",
      description: "Underwater documentation and drain-cover reporting for commercial pools that need clean records without draining.",
      startingAt: "Quoted by route and site"
    }
  ];
}

function defaultGallery(): Extract<SiteBlock, { type: "gallery" }>["items"] {
  return [
    {
      mediaId: "aquatrace-field-proof-1",
      thumbRef: "native://media/aquatrace-field-proof-1",
      caption: "Dye testing around a suspected leak point"
    },
    {
      mediaId: "aquatrace-field-proof-2",
      thumbRef: "native://media/aquatrace-field-proof-2",
      caption: "Pressure test setup before repair planning"
    },
    {
      mediaId: "aquatrace-field-proof-3",
      thumbRef: "native://media/aquatrace-field-proof-3",
      caption: "Underwater documentation for commercial pools"
    }
  ];
}

function defaultReviews(): Extract<SiteBlock, { type: "reviews" }>["reviews"] {
  return [
    {
      quote: "They found what everyone else missed and explained it without making us feel dumb.",
      attribution: "Residential pool owner"
    },
    {
      quote: "The report was clear enough for our maintenance team and ownership group.",
      attribution: "Commercial property manager"
    }
  ];
}

function defaultArticles(): Extract<SiteBlock, { type: "article_index" }>["articles"] {
  return [
    {
      title: "Bucket test or real leak?",
      excerpt: "A simple way to tell when water loss is more than normal evaporation.",
      href: "/guides/bucket-test"
    },
    {
      title: "What happens during a leak detection visit",
      excerpt: "Pressure testing, dye checks, and what your report should include.",
      href: "/guides/leak-detection-visit"
    }
  ];
}

export function generatePoolLeakSite(input: SiteGenerationInput = {}, now = new Date().toISOString()): GeneratedSite {
  const parsed = siteGenerationInputSchema.parse(input);
  const tenantId = parsed.tenantId ?? "aquatrace";
  const businessName = parsed.businessName ?? "Aquatrace Swimming Pool Leak Detection";
  const slug = slugify(parsed.slug ?? businessName);
  const serviceArea = parsed.serviceArea ?? ["Fair Play", "Seneca", "Anderson", "Greenville", "Bryson City", "Western North Carolina"];
  const phone = parsed.phone ?? "Call or send a message";

  const blocks: SiteBlock[] = [
    {
      id: "hero",
      type: "hero",
      eyebrow: "Leak answers without draining the pool",
      headline: "Find the leak. Keep the water.",
      subhead: `${businessName} helps pool owners, builders, and property managers figure out where water is going with pressure testing, dye testing, underwater documentation, and reports people can actually use.`,
      primaryCta: { label: "Request leak help", href: "#estimate" },
      proofPoints: ["Pool stays full", "Photo-backed reports", "Residential and commercial", phone]
    },
    {
      id: "services",
      type: "services",
      heading: "Straight answers for the problems that waste water, time, and money.",
      services: parsed.services ?? defaultServices()
    },
    {
      id: "service-area",
      type: "service_area_map",
      heading: "Built for routes across the Upstate, western NC, and nearby commercial pools.",
      center: "Fair Play, SC",
      areas: serviceArea
    },
    {
      id: "gallery",
      type: "gallery",
      heading: "Proof from the field, not guesswork from the deck.",
      items: parsed.gallery ?? defaultGallery()
    },
    {
      id: "reviews",
      type: "reviews",
      heading: "Owners hire Aquatrace when they need a clear answer.",
      reviews: parsed.reviews ?? defaultReviews()
    },
    {
      id: "badges",
      type: "compliance_badges",
      heading: "Field standards",
      badges: ["Pressure testing", "Dye testing", "Underwater documentation", "Photo-backed findings", "Approval-gated follow-up"]
    },
    {
      id: "articles",
      type: "article_index",
      heading: "Helpful leak guides before you book.",
      articles: parsed.articles ?? defaultArticles()
    },
    {
      id: "lead-form",
      type: "lead_form",
      heading: "Tell us what the pool is doing.",
      intro: "Share the city, how much water you are losing, and whether it is a pool, spa, or commercial site. Nexi will park the request for owner review.",
      action: `/api/sites/${slug}/leads`
    }
  ];

  const siteWithoutHtml = {
    id: `site_${tenantId}_${slug}`,
    tenantId,
    slug,
    title: businessName,
    theme: "pool_leak" as const,
    blocks,
    internalUrl: `/sites/${slug}`,
    status: "staged" as const,
    customDomainStatus: "pending_cloudflare" as const,
    createdAt: now,
    updatedAt: now
  };

  return generatedSiteSchema.parse({
    ...siteWithoutHtml,
    html: renderStaticSite(siteWithoutHtml)
  }) as GeneratedSite;
}
