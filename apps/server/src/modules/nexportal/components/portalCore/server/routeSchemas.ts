import { z } from "zod";
import { portalQuoteApprovalInputSchema, portalQuoteChangeRequestInputSchema } from "../../../../nexops/areas/quotes/components/quoteEngine/domain/quoteFoundation.js";

export const sendPortalLinkBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  target: z.string().optional(),
  preferredChannel: z.enum(["email", "sms"]).optional(),
  sourceObjectType: z.enum(["quote", "invoice"]).optional(),
  sourceObjectId: z.string().min(1).optional()
});

export const portalPhoneReverifyBodySchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  last4: z.string().min(4).max(4),
  returnPath: z.string().optional()
});
export const portalSessionQuoteApprovalBodySchema = portalQuoteApprovalInputSchema.omit({
  token: true
});
export const portalSessionQuoteChangeRequestBodySchema = portalQuoteChangeRequestInputSchema.omit({
  token: true
});
export const portalNexDocsUploadBodySchema = z.object({
  tenantId: z.string().min(1),
  folderId: z.string().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileBase64: z.string().min(1)
});
