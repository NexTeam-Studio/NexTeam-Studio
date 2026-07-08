import { z } from "zod";

export const siteThemeSchema = z.enum(["pool_leak"]);

const blockBaseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1)
});

export const heroBlockSchema = blockBaseSchema.extend({
  type: z.literal("hero"),
  eyebrow: z.string().min(1),
  headline: z.string().min(1),
  subhead: z.string().min(1),
  primaryCta: z.object({ label: z.string().min(1), href: z.string().min(1) }),
  proofPoints: z.array(z.string().min(1))
});

export const servicesBlockSchema = blockBaseSchema.extend({
  type: z.literal("services"),
  heading: z.string().min(1),
  services: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    startingAt: z.string().optional()
  })).min(1)
});

export const serviceAreaMapBlockSchema = blockBaseSchema.extend({
  type: z.literal("service_area_map"),
  heading: z.string().min(1),
  center: z.string().min(1),
  areas: z.array(z.string().min(1)).min(1)
});

export const galleryBlockSchema = blockBaseSchema.extend({
  type: z.literal("gallery"),
  heading: z.string().min(1),
  items: z.array(z.object({
    mediaId: z.string().min(1),
    thumbRef: z.string().min(1),
    caption: z.string().min(1)
  })).default([])
});

export const reviewsBlockSchema = blockBaseSchema.extend({
  type: z.literal("reviews"),
  heading: z.string().min(1),
  reviews: z.array(z.object({
    quote: z.string().min(1),
    attribution: z.string().min(1)
  })).default([])
});

export const complianceBadgesBlockSchema = blockBaseSchema.extend({
  type: z.literal("compliance_badges"),
  heading: z.string().min(1),
  badges: z.array(z.string().min(1)).min(1)
});

export const articleIndexBlockSchema = blockBaseSchema.extend({
  type: z.literal("article_index"),
  heading: z.string().min(1),
  articles: z.array(z.object({
    title: z.string().min(1),
    excerpt: z.string().min(1),
    href: z.string().min(1)
  })).default([])
});

export const leadFormBlockSchema = blockBaseSchema.extend({
  type: z.literal("lead_form"),
  heading: z.string().min(1),
  intro: z.string().min(1),
  action: z.string().min(1)
});

export const siteBlockSchema = z.discriminatedUnion("type", [
  heroBlockSchema,
  servicesBlockSchema,
  serviceAreaMapBlockSchema,
  galleryBlockSchema,
  reviewsBlockSchema,
  complianceBadgesBlockSchema,
  articleIndexBlockSchema,
  leadFormBlockSchema
]);

export const generatedSiteSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  theme: siteThemeSchema,
  blocks: z.array(siteBlockSchema).min(1),
  html: z.string().min(1),
  internalUrl: z.string().min(1),
  status: z.enum(["staged", "publish_ready"]),
  customDomainStatus: z.enum(["pending_cloudflare", "not_requested"]),
  approvalId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const siteLeadSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  siteId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  city: z.string().optional(),
  message: z.string().min(1),
  consent: z.object({
    email: z.boolean(),
    sms: z.boolean()
  }),
  source: z.literal("m8_site_form"),
  status: z.enum(["new", "reviewed"]),
  createdAt: z.string().min(1)
});

export const operatorUiColorsSchema = z.object({
  shellBackground: z.string().min(1).optional(),
  panelBackground: z.string().min(1).optional(),
  headerBackground: z.string().min(1).optional(),
  accent: z.string().min(1).optional(),
  accentText: z.string().min(1).optional(),
  userBubble: z.string().min(1).optional(),
  assistantBubble: z.string().min(1).optional(),
  text: z.string().min(1).optional()
});

export const operatorUiThemeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  surface: z.literal("job_desk"),
  name: z.string().min(1),
  colors: operatorUiColorsSchema,
  density: z.enum(["comfortable", "compact"]),
  updatedBy: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const operatorUiThemeInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  preset: z.enum(["aquatrace", "deep_water", "high_contrast", "sandbar"]).optional(),
  colors: operatorUiColorsSchema.default({}),
  density: z.enum(["comfortable", "compact"]).optional()
});

export const siteGenerationInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  businessName: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  phone: z.string().min(7).optional(),
  serviceArea: z.array(z.string().min(1)).optional(),
  services: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    startingAt: z.string().optional()
  })).optional(),
  gallery: z.array(z.object({
    mediaId: z.string().min(1),
    thumbRef: z.string().min(1),
    caption: z.string().min(1)
  })).optional(),
  reviews: z.array(z.object({
    quote: z.string().min(1),
    attribution: z.string().min(1)
  })).optional(),
  articles: z.array(z.object({
    title: z.string().min(1),
    excerpt: z.string().min(1),
    href: z.string().min(1)
  })).optional()
});

export const leadSubmissionSchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  city: z.string().optional(),
  message: z.string().min(1),
  consent: z.object({
    email: z.boolean().default(true),
    sms: z.boolean().default(false)
  }).default({ email: true, sms: false })
}).refine((input) => input.email || input.phone, {
  message: "Lead must include an email or phone number."
});

export type SiteBlock = z.infer<typeof siteBlockSchema>;
export type GeneratedSite = z.infer<typeof generatedSiteSchema>;
export type SiteLead = z.infer<typeof siteLeadSchema>;
export type OperatorUiTheme = z.infer<typeof operatorUiThemeSchema>;
export type OperatorUiThemeInput = z.infer<typeof operatorUiThemeInputSchema>;
export type SiteGenerationInput = z.infer<typeof siteGenerationInputSchema>;
export type LeadSubmissionInput = z.infer<typeof leadSubmissionSchema>;
