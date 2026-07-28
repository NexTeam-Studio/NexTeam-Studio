import { z } from "zod";

export const workspaceRoleSchema = z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"]);
export const workspaceAccessInputFields = {
  role: workspaceRoleSchema.optional(),
  tenantUserId: z.string().optional(),
  tenantUserQuery: z.string().optional()
} as const;
