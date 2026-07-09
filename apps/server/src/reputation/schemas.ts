import { z } from "zod";

export const reputationReviewSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  provider: z.enum(["gbp", "native"]),
  locationId: z.string().min(1),
  authorName: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().default(""),
  reviewedAt: z.string().min(1),
  replyText: z.string().optional(),
  replyApprovalId: z.string().optional(),
  replyStatus: z.enum(["none", "drafted", "approved", "published_deferred"]).default("none"),
  externalIds: z.object({ gbp: z.string().optional() }).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const reputationProfileSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  hours: z.record(z.string()).default({}),
  services: z.array(z.string().min(1)).default([]),
  qas: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1)
  })).default([]),
  status: z.enum(["draft", "approval_pending", "publish_ready", "published_deferred"]).default("draft"),
  approvalId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const gbpReviewInputSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  authorName: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().default(""),
  reviewedAt: z.string().min(1),
  externalIds: z.object({ gbp: z.string().optional() }).optional()
});

export const profileSyncInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  locationId: z.string().min(1).default("aquatrace-primary"),
  hours: z.record(z.string()).default({
    monday: "8:00 AM-5:00 PM",
    tuesday: "8:00 AM-5:00 PM",
    wednesday: "8:00 AM-5:00 PM",
    thursday: "8:00 AM-5:00 PM",
    friday: "8:00 AM-5:00 PM"
  }),
  services: z.array(z.string().min(1)).default([
    "Swimming pool leak detection",
    "Pool and spa pressure testing",
    "Commercial pool documentation"
  ]),
  qas: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1)
  })).default([
    {
      question: "Do you service residential and commercial pools?",
      answer: "Yes. Aquatrace works on residential pools, pool/spa combinations, and commercial documentation jobs."
    }
  ])
});

export const reviewRequestInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  to: z.string().email(),
  invoiceId: z.string().min(1),
  clientName: z.string().min(1)
});

export type ReputationReview = z.infer<typeof reputationReviewSchema>;
export type ReputationProfile = z.infer<typeof reputationProfileSchema>;
export type GbpReviewInput = z.infer<typeof gbpReviewInputSchema>;
export type ProfileSyncInput = z.infer<typeof profileSyncInputSchema>;
export type ReviewRequestInput = z.infer<typeof reviewRequestInputSchema>;
