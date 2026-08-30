import type { TenantUserRole } from "@nexteam/core";

/**
 * Tenant roles remain stable labels.  A member can receive per-area changes
 * without being silently reclassified into another tier.
 */
export const TEAM_PERMISSION_LEVELS = ["NONE", "READ", "CREATE", "WRITE", "MANAGE", "DELETE", "FULL"] as const;
export type TeamPermissionLevel = (typeof TEAM_PERMISSION_LEVELS)[number];

// Only areas with a NexOps/NexCam/NexDocs/NexPortal surface today are exposed.
// Deferred products do not receive speculative toggles.
export const TEAM_PERMISSION_AREAS = [
  "CLIENTS", "PROPERTIES", "REQUESTS", "QUOTES", "JOBS", "VISITS", "SCHEDULING",
  "PRODUCTS_AND_SERVICES", "INVOICES", "PAYMENTS", "REPORTS", "NEXDOCS", "NEXCAM",
  "TEAM", "SETTINGS", "COMMUNICATIONS", "AUTOMATIONS", "APPROVALS", "IMPORTS",
  "VIEW_AS_CLIENT"
] as const;
export type TeamPermissionArea = (typeof TEAM_PERMISSION_AREAS)[number];
export type TeamPermissionGrid = Record<TeamPermissionArea, TeamPermissionLevel>;
export type TeamPermissionOverrides = Partial<TeamPermissionGrid>;

const grid = (level: TeamPermissionLevel): TeamPermissionGrid => Object.fromEntries(
  TEAM_PERMISSION_AREAS.map((area) => [area, level])
) as TeamPermissionGrid;

const owner = grid("FULL");
const officeAdmin = grid("WRITE");
const technician = grid("NONE");

Object.assign(officeAdmin, {
  PRODUCTS_AND_SERVICES: "MANAGE", NEXDOCS: "MANAGE", SCHEDULING: "MANAGE", PAYMENTS: "READ", TEAM: "MANAGE", SETTINGS: "MANAGE", AUTOMATIONS: "MANAGE", APPROVALS: "MANAGE",
  IMPORTS: "MANAGE", VIEW_AS_CLIENT: "READ"
} satisfies Partial<TeamPermissionGrid>);

Object.assign(technician, {
  CLIENTS: "READ", PROPERTIES: "READ", JOBS: "READ", VISITS: "WRITE", SCHEDULING: "READ",
  NEXDOCS: "CREATE", NEXCAM: "CREATE", REPORTS: "READ", COMMUNICATIONS: "CREATE"
} satisfies Partial<TeamPermissionGrid>);

export const TEAM_ROLE_DEFAULTS: Readonly<Record<TenantUserRole, Readonly<TeamPermissionGrid>>> = Object.freeze({
  OWNER: Object.freeze(owner),
  OFFICE_ADMIN: Object.freeze(officeAdmin),
  TECHNICIAN: Object.freeze(technician)
});

const levelRank = new Map<TeamPermissionLevel, number>(TEAM_PERMISSION_LEVELS.map((level, index) => [level, index]));

export function permissionGridFor(role: TenantUserRole, overrides: TeamPermissionOverrides = {}): TeamPermissionGrid {
  return { ...TEAM_ROLE_DEFAULTS[role], ...overrides };
}

/** Tier changes intentionally discard individual overrides after confirmation. */
export function resetPermissionGridForRole(role: TenantUserRole): TeamPermissionGrid {
  return { ...TEAM_ROLE_DEFAULTS[role] };
}

export function hasPermissionLevel(
  grid: Pick<TeamPermissionGrid, TeamPermissionArea>,
  area: TeamPermissionArea,
  required: TeamPermissionLevel
): boolean {
  return (levelRank.get(grid[area]) ?? 0) >= (levelRank.get(required) ?? Number.MAX_SAFE_INTEGER);
}
