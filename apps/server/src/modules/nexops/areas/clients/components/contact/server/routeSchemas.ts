import { z } from "zod";
import { addressSchema, clientCommunicationSettingsSchema, clientContactSchema, personNameSchema } from "@nexteam/core";

export const customFieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const propertyAssetsBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  assets: z.array(z.object({
    id: z.string().min(1).optional(),
    kind: z.string().min(1).max(80),
    label: z.string().min(1).max(160),
    fields: z.record(customFieldValueSchema)
  })).max(100)
});

export const createClientPrimaryPropertySchema = z.object({
  siteName: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  address: addressSchema,
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  billingAddressSameAsClient: z.boolean().optional(),
  access: z.object({
    gateCode: z.string().optional(),
    accessNotes: z.string().optional()
  }).optional(),
  contacts: z.array(clientContactSchema).optional(),
  customFields: z.record(customFieldValueSchema).optional()
});

export const createPropertyBodySchema = createClientPrimaryPropertySchema.extend({
  tenantId: z.string().min(1).optional(),
  clientId: z.string().min(1)
});

export function hasClientCreatePhone(input: {
  phones?: string[] | undefined;
  contacts?: Array<{ phones?: Array<{ value?: string | undefined }> | undefined }> | undefined;
}): boolean {
  return (input.phones ?? []).some((phone) => phone.trim().length > 0)
    || (input.contacts ?? []).some((contact) => (contact.phones ?? []).some((phone) => (phone.value ?? "").trim().length > 0));
}

export function hasClientCreateAddress(input: {
  billingAddress?: unknown;
  primaryProperty?: { address?: unknown } | undefined;
}): boolean {
  const billingAddress = input.billingAddress as { street1?: string } | undefined;
  const propertyAddress = input.primaryProperty?.address as { street1?: string } | undefined;
  return Boolean(
    billingAddress?.street1?.trim()
    || propertyAddress?.street1?.trim()
  );
}

export const createClientBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1),
  company: z.string().min(1).optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  billingAddress: addressSchema.optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  consent: z.object({ email: z.boolean(), sms: z.boolean(), marketing: z.boolean().default(false) }).default({ email: false, sms: false, marketing: false }),
  customFields: z.record(customFieldValueSchema).optional(),
  primaryProperty: createClientPrimaryPropertySchema.optional()
}).superRefine((input, ctx) => {
  if (!hasClientCreateAddress(input)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Address is required before a client can be saved.",
      path: ["primaryProperty", "address"]
    });
  }
  if (!hasClientCreatePhone(input)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Telephone is required before a client can be saved.",
      path: ["phones"]
    });
  }
});

export const updateClientBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  company: z.string().min(1).nullable().optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  billingAddress: addressSchema.nullable().optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  emails: z.array(z.string()).optional(),
  phones: z.array(z.string()).optional(),
  customFields: z.record(customFieldValueSchema).optional(),
  consent: z.object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    marketing: z.boolean().optional()
  }).optional(),
  primaryProperty: createClientPrimaryPropertySchema.optional()
}).refine((input) => Boolean(
  input.name
  || input.company !== undefined
  || input.personName
  || input.displayNamePreference
  || input.billingAddress !== undefined
  || input.billingSameAsPrimaryProperty !== undefined
  || input.contacts
  || input.communicationSettings
  || input.emails
  || input.phones
  || input.consent
  || input.customFields
  || input.primaryProperty
), {
  message: "At least one client field update is required."
});
