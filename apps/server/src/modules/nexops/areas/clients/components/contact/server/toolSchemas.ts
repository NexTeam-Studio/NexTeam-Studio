import { z } from "zod";
import { addressSchema, clientCommunicationSettingsSchema, clientContactSchema, personNameSchema } from "@nexteam/core";

export const clientLookupInputSchema = z.object({ q: z.string().default("") });
export const createClientInputSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1).optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  billingAddress: addressSchema.optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  address: z.string().min(1).optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  consent: z.object({ email: z.boolean(), sms: z.boolean(), marketing: z.boolean().optional() }).default({ email: false, sms: false, marketing: false })
});
export type CreateClientInput = z.infer<typeof createClientInputSchema>;

export const updateClientAddressInputSchema = z.object({
  clientQuery: z.string().trim().min(1),
  changeRequest: z.string().trim().min(1)
});
export type UpdateClientAddressInput = z.infer<typeof updateClientAddressInputSchema>;
