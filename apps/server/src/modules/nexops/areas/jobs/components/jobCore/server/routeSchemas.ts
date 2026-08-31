import { z } from "zod";
import { intakeSnapshotSchema, lineItemSchema, paymentSchedulePlanSchema } from "@nexteam/core";

export const createJobBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  quoteId: z.string().min(1).optional(),
  title: z.string().min(1),
  lineItems: z.array(lineItemSchema).optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  intake: intakeSnapshotSchema.optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
  ,assignedOwnerId: z.string().min(1).optional()
});
export const updateJobBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  clientVisibility: z.object({
    hideFieldDocsFromPortal: z.boolean().optional()
  }).optional(),
  assignedOwnerId: z.string().min(1).nullable().optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

export const jobActionSchema = z.object({
  tenantId: z.string().min(1).optional(),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"]),
  completionOverrideReason: z.string().trim().min(1).max(2_000).optional()
});

export const customerDocumentPackageSelectionSchema = z.object({
  tenantId: z.string().min(1).optional(),
  expectedPackageVersion: z.number().int().min(1).optional(),
  selectedArtifactRefs: z.array(z.object({
    artifactId: z.string().min(1),
    source: z.enum(["nexdocs", "nexcam", "generated"]),
    kind: z.string().min(1).max(100),
    visitId: z.string().min(1).optional()
  })).max(200)
});

export const customerDocumentPackageDeliverySchema = z.object({
  tenantId: z.string().min(1).optional(),
  recipient: z.string().email(),
  subject: z.string().min(1).max(240),
  bodyText: z.string().min(1).max(20_000),
  copyTarget: z.string().email().optional(),
  sendCopy: z.boolean().optional(),
  selectedArtifactRefs: customerDocumentPackageSelectionSchema.shape.selectedArtifactRefs
});
