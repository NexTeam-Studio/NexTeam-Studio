export type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

export interface OperatorContext {
  tenantId: string | null;
  tenantUserId: string;
  role: TenantRole;
}
