import type { Auth, User } from "firebase/auth";

export type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

export interface LocalAuthProfileSummary {
  id: string;
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
  email: string;
  displayName: string;
  label: string;
}

export interface AuthBootstrap {
  auth: Auth | null;
  authRequired: boolean;
  localUser: User | null;
  localAuthEnabled: boolean;
  localTenantId: string;
  localProfiles: LocalAuthProfileSummary[];
}
