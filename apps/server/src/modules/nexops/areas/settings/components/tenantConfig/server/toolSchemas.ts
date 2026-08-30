import { z } from "zod";

export const listTeamMembersInputSchema = z.object({
  q: z.string().default(""),
  role: z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"]).optional(),
  activeOnly: z.boolean().default(true)
});

export const listCommunicationTemplatesInputSchema = z.object({
  q: z.string().default(""),
  category: z.string().optional()
});
export const saveCommunicationTemplateInputSchema = z.object({
  id: z.string().optional(),
  category: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  emailEnabled: z.boolean().default(true),
  smsEnabled: z.boolean().default(true),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  smsBody: z.string().optional()
});
