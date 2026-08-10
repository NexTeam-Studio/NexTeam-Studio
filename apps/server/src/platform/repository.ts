import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  jobAccessLinkSchema,
  platformBackupRecordSchema,
  platformSupportEscalationSchema,
  platformSubscriptionAssignmentSchema,
  prospectIntakeSchema,
  prospectSchema,
  tenantBrandingSchema,
  tenantAdapterStatusSchema,
  tenantOnboardingBlueprintRevisionSchema,
  tenantOnboardingBlueprintSchema,
  tenantBlockerSchema,
  tenantMigrationRecordSchema,
  tenantSchema,
  tenantSubscriptionSchema,
  tenantUserSchema,
  usageLogRecordSchema,
  type JobAccessLink,
  type PlatformBackupRecord,
  type PlatformSupportEscalation,
  type PlatformSubscriptionAssignment,
  type Prospect,
  type ProspectIntake,
  type Tenant,
  type TenantBlocker,
  type TenantMigrationRecord,
  type TenantAdapterStatus,
  type TenantOnboardingBlueprint,
  type TenantOnboardingBlueprintRevision,
  type TenantBranding,
  type TenantCostSummary,
  type TenantDataExport,
  type TenantPlan,
  type TenantSubscription,
  type TenantUser,
  type TenantMembershipAudit,
  tenantMembershipAuditSchema,
  type UsageLogRecord
} from "@nexteam/core";
import { PLATFORM_PLANS } from "./plans.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import { setPlatformOwnedDocument, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";
import type { TenantOwnerInvite } from "./tenantOwnerInvite.js";
import { platformUserAuditSchema, platformUserSchema, type PlatformUser, type PlatformUserAudit } from "./team.js";
import { platformSecurityAuditSchema, platformSessionSchema, type PlatformSecurityAudit, type PlatformSession } from "./sessionSecurity.js";

function defaultApproval(): Tenant["approval"] {
  return {
    client: { autoApprove: false, cleanStreak: 0 },
    job: { autoApprove: false, cleanStreak: 0 },
    tenant_provisioning: { autoApprove: false, cleanStreak: 0 },
    email: { autoApprove: false, cleanStreak: 0 },
    sms: { autoApprove: false, cleanStreak: 0 },
    payment: { autoApprove: false, cleanStreak: 0 },
    document: { autoApprove: false, cleanStreak: 0 },
    gbp_post: { autoApprove: false, cleanStreak: 0 },
    social_post: { autoApprove: false, cleanStreak: 0 },
    article: { autoApprove: false, cleanStreak: 0 },
    quote: { autoApprove: false, cleanStreak: 0 },
    invoice: { autoApprove: false, cleanStreak: 0 },
    site_publish: { autoApprove: false, cleanStreak: 0 },
    gbp_profile_update: { autoApprove: false, cleanStreak: 0 },
    seo_fix: { autoApprove: false, cleanStreak: 0 },
    review_reply: { autoApprove: false, cleanStreak: 0 }
  };
}

export function defaultTenant(tenantId = configuredTenantId(process.env, "defaultTenant"), plan: TenantPlan = "suite"): Tenant {
  const configuredId = process.env.TENANT_ID?.trim();
  return {
    id: tenantId,
    name: tenantId === configuredId ? process.env.TENANT_NAME?.trim() || tenantId : tenantId,
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: defaultApproval(),
    timezone: "America/New_York",
    plan
  };
}

export function defaultTenantBranding(tenant: Tenant | string = defaultTenant()): TenantBranding {
  const tenantId = typeof tenant === "string" ? tenant : tenant.id;
  const displayName = typeof tenant === "string" ? tenantId : tenant.name;
  const updatedAt = "2026-07-10T00:00:00.000Z";
  return {
    tenantId,
    displayName,
    colors: {
      primary: "#26352c",
      secondary: "#315f58",
      accent: "#e4bf73",
      accentText: "#26352c",
      background: "#dfe8d8",
      surface: "#fff8ea",
      text: "#26352c",
      mutedText: "#6d7b6f",
      userBubble: "#315f58",
      assistantBubble: "#fff8ea"
    },
    fontFamily: "Montserrat, Aptos, Segoe UI, Helvetica Neue, sans-serif",
    source: "default",
    updatedBy: "system",
    updatedAt
  };
}

function firestoreDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function docData(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function now(): string {
  return new Date().toISOString();
}

export interface PlatformRepository {
  listPlatformUsers(): Promise<PlatformUser[]>;
  getPlatformUser(userId: string): Promise<PlatformUser | null>;
  getPlatformUserByAuthUid(authUid: string): Promise<PlatformUser | null>;
  savePlatformUser(user: PlatformUser): Promise<PlatformUser>;
  listPlatformUserAudits(userId?: string): Promise<PlatformUserAudit[]>;
  appendPlatformUserAudit(audit: PlatformUserAudit): Promise<PlatformUserAudit>;
  getPlatformSessionByTokenHash(tokenHash: string): Promise<PlatformSession | null>;
  savePlatformSession(session: PlatformSession): Promise<PlatformSession>;
  appendPlatformSecurityAudit(audit: PlatformSecurityAudit): Promise<PlatformSecurityAudit>;
  listPlatformSecurityAudits(): Promise<PlatformSecurityAudit[]>;
  listProspects(): Promise<Prospect[]>;
  getProspect(prospectId: string): Promise<Prospect | null>;
  saveProspect(prospect: Prospect): Promise<Prospect>;
  getProspectIntake(prospectId: string): Promise<ProspectIntake | null>;
  saveProspectIntake(intake: ProspectIntake): Promise<ProspectIntake>;
  createTenantOnboardingBlueprint(onboardingPlan: TenantOnboardingBlueprint): Promise<TenantOnboardingBlueprint>;
  listTenantOnboardingBlueprints(): Promise<TenantOnboardingBlueprint[]>;
  getTenantOnboardingBlueprint(blueprintId: string): Promise<TenantOnboardingBlueprint | null>;
  listTenantOnboardingBlueprintRevisions(blueprintId: string): Promise<TenantOnboardingBlueprintRevision[]>;
  appendTenantOnboardingBlueprintRevision(revision: TenantOnboardingBlueprintRevision): Promise<TenantOnboardingBlueprintRevision>;
  listTenantBlockers(tenantId?: string): Promise<TenantBlocker[]>;
  getTenantBlocker(blockerId: string): Promise<TenantBlocker | null>;
  saveTenantBlocker(blocker: TenantBlocker): Promise<TenantBlocker>;
  listTenantMigrationRecords(tenantId?: string): Promise<TenantMigrationRecord[]>;
  getTenantMigrationRecord(migrationId: string): Promise<TenantMigrationRecord | null>;
  saveTenantMigrationRecord(record: TenantMigrationRecord): Promise<TenantMigrationRecord>;
  listPlatformSupportEscalations(tenantId?: string): Promise<PlatformSupportEscalation[]>;
  getPlatformSupportEscalation(escalationId: string): Promise<PlatformSupportEscalation | null>;
  savePlatformSupportEscalation(escalation: PlatformSupportEscalation): Promise<PlatformSupportEscalation>;
  getPlatformSubscriptionAssignment(prospectId: string): Promise<PlatformSubscriptionAssignment | null>;
  savePlatformSubscriptionAssignment(assignment: PlatformSubscriptionAssignment): Promise<PlatformSubscriptionAssignment>;
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  upsertTenant(tenant: Tenant): Promise<Tenant>;
  getTenantBranding(tenantId: string): Promise<TenantBranding | null>;
  saveTenantBranding(branding: TenantBranding): Promise<TenantBranding>;
  listTenantUsers(tenantId: string): Promise<TenantUser[]>;
  getTenantUser(tenantId: string, id: string): Promise<TenantUser | null>;
  upsertTenantUser(user: TenantUser): Promise<TenantUser>;
  listTenantMembershipAudits(tenantId: string): Promise<TenantMembershipAudit[]>;
  saveTenantMembershipAudit(audit: TenantMembershipAudit): Promise<TenantMembershipAudit>;
  getTenantOwnerInvite(tenantId: string, ownerUserId: string): Promise<TenantOwnerInvite | null>;
  saveTenantOwnerInvite(invite: TenantOwnerInvite): Promise<TenantOwnerInvite>;
  listJobAccessLinks(tenantId: string, jobId?: string | undefined): Promise<JobAccessLink[]>;
  saveJobAccessLink(link: JobAccessLink): Promise<JobAccessLink>;
  revokeJobAccessLink(tenantId: string, id: string, revokedAt: string): Promise<JobAccessLink | null>;
  getSubscription(tenantId: string): Promise<TenantSubscription | null>;
  saveSubscription(subscription: TenantSubscription): Promise<TenantSubscription>;
  listAdapterStatuses(tenantId: string): Promise<TenantAdapterStatus[]>;
  saveAdapterStatuses(statuses: TenantAdapterStatus[]): Promise<void>;
  summarizeCost(tenantId: string, period: { start: string; end: string }): Promise<TenantCostSummary>;
  exportTenantData(tenantId: string): Promise<TenantDataExport>;
  recordBackup(record: PlatformBackupRecord): Promise<PlatformBackupRecord>;
  listBackups(tenantId: string): Promise<PlatformBackupRecord[]>;
}

export function defaultTenantUsers(_tenantId = configuredTenantId(process.env, "defaultTenantUsers")): TenantUser[] {
  return [];
}

function starterSubscription(tenant: Tenant): TenantSubscription {
  return {
    id: `sub_${tenant.id}`,
    tenantId: tenant.id,
    plan: tenant.plan,
    status: "trialing",
    updatedAt: now()
  };
}

export class InMemoryPlatformRepository implements PlatformRepository {
  private readonly platformUsers = new Map<string, PlatformUser>();
  private readonly platformUserAudits: PlatformUserAudit[] = [];
  private readonly platformSessions = new Map<string, PlatformSession>();
  private readonly platformSecurityAudits: PlatformSecurityAudit[] = [];
  private readonly prospects = new Map<string, Prospect>();
  private readonly prospectIntakes = new Map<string, ProspectIntake>();
  private readonly onboardingBlueprints = new Map<string, TenantOnboardingBlueprint>();
  private readonly onboardingBlueprintRevisions = new Map<string, TenantOnboardingBlueprintRevision[]>();
  private readonly tenantBlockers = new Map<string, TenantBlocker>();
  private readonly tenantMigrationRecords = new Map<string, TenantMigrationRecord>();
  private readonly supportEscalations = new Map<string, PlatformSupportEscalation>();
  private readonly subscriptionAssignments = new Map<string, PlatformSubscriptionAssignment>();
  private readonly tenants = new Map<string, Tenant>();
  private readonly tenantBranding = new Map<string, TenantBranding>();
  private readonly tenantUsers = new Map<string, TenantUser[]>();
  private readonly membershipAudits = new Map<string, TenantMembershipAudit[]>();
  private readonly ownerInvites = new Map<string, TenantOwnerInvite>();
  private readonly jobAccessLinks = new Map<string, JobAccessLink[]>();
  private readonly subscriptions = new Map<string, TenantSubscription>();
  private readonly statuses = new Map<string, TenantAdapterStatus[]>();
  private readonly usage = new Map<string, UsageLogRecord[]>();
  private readonly backups = new Map<string, PlatformBackupRecord[]>();

  constructor(seed: Tenant[] = [defaultTenant()]) {
    for (const tenant of seed) {
      this.tenants.set(tenant.id, tenantSchema.parse(tenant) as Tenant);
      this.tenantBranding.set(tenant.id, defaultTenantBranding(tenant));
      this.subscriptions.set(tenant.id, starterSubscription(tenant));
      this.tenantUsers.set(tenant.id, defaultTenantUsers(tenant.id).map((user) => tenantUserSchema.parse(user) as TenantUser));
    }
  }

  async listTenants(): Promise<Tenant[]> {
    return [...this.tenants.values()];
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async upsertTenant(tenant: Tenant): Promise<Tenant> {
    const parsed = tenantSchema.parse(tenant) as Tenant;
    this.tenants.set(parsed.id, parsed);
    if (!this.subscriptions.has(parsed.id)) {
      this.subscriptions.set(parsed.id, starterSubscription(parsed));
    }
    if (!this.tenantUsers.has(parsed.id)) {
      this.tenantUsers.set(parsed.id, defaultTenantUsers(parsed.id).map((user) => tenantUserSchema.parse(user) as TenantUser));
    }
    if (!this.tenantBranding.has(parsed.id)) {
      this.tenantBranding.set(parsed.id, defaultTenantBranding(parsed));
    }
    return parsed;
  }

  async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    return this.tenantBranding.get(tenantId) ?? null;
  }

  async saveTenantBranding(branding: TenantBranding): Promise<TenantBranding> {
    const parsed = tenantBrandingSchema.parse(branding) as TenantBranding;
    this.tenantBranding.set(parsed.tenantId, parsed);
    return parsed;
  }

  async listTenantUsers(tenantId: string): Promise<TenantUser[]> {
    return this.tenantUsers.get(tenantId) ?? [];
  }

  async getTenantUser(tenantId: string, id: string): Promise<TenantUser | null> {
    return (this.tenantUsers.get(tenantId) ?? []).find((user) => user.id === id) ?? null;
  }

  async upsertTenantUser(user: TenantUser): Promise<TenantUser> {
    const parsed = tenantUserSchema.parse(user) as TenantUser;
    const current = (this.tenantUsers.get(parsed.tenantId) ?? []).filter((entry) => entry.id !== parsed.id);
    current.push(parsed);
    this.tenantUsers.set(parsed.tenantId, current);
    return parsed;
  }

  async listPlatformUsers(): Promise<PlatformUser[]> { return [...this.platformUsers.values()].map(firestoreDoc); }
  async getPlatformUser(userId: string): Promise<PlatformUser | null> { const user = this.platformUsers.get(userId); return user ? firestoreDoc(user) : null; }
  async getPlatformUserByAuthUid(authUid: string): Promise<PlatformUser | null> { const user = [...this.platformUsers.values()].find((entry) => entry.authUid === authUid); return user ? firestoreDoc(user) : null; }
  async savePlatformUser(user: PlatformUser): Promise<PlatformUser> { const parsed = platformUserSchema.parse(user) as PlatformUser; this.platformUsers.set(parsed.id, firestoreDoc(parsed)); return firestoreDoc(parsed); }
  async listPlatformUserAudits(userId?: string): Promise<PlatformUserAudit[]> { return this.platformUserAudits.filter((audit) => !userId || audit.userId === userId).map(firestoreDoc); }
  async appendPlatformUserAudit(audit: PlatformUserAudit): Promise<PlatformUserAudit> { const parsed = platformUserAuditSchema.parse(audit) as PlatformUserAudit; this.platformUserAudits.push(firestoreDoc(parsed)); return firestoreDoc(parsed); }
  async getPlatformSessionByTokenHash(tokenHash: string): Promise<PlatformSession | null> { const session = [...this.platformSessions.values()].find((entry) => entry.tokenHash === tokenHash); return session ? firestoreDoc(session) : null; }
  async savePlatformSession(session: PlatformSession): Promise<PlatformSession> { const parsed = platformSessionSchema.parse(session) as PlatformSession; this.platformSessions.set(parsed.id, firestoreDoc(parsed)); return firestoreDoc(parsed); }
  async appendPlatformSecurityAudit(audit: PlatformSecurityAudit): Promise<PlatformSecurityAudit> { const parsed = platformSecurityAuditSchema.parse(audit) as PlatformSecurityAudit; this.platformSecurityAudits.push(firestoreDoc(parsed)); return firestoreDoc(parsed); }
  async listPlatformSecurityAudits(): Promise<PlatformSecurityAudit[]> { return this.platformSecurityAudits.map(firestoreDoc); }

  async getTenantOwnerInvite(tenantId: string, ownerUserId: string): Promise<TenantOwnerInvite | null> {
    return this.ownerInvites.get(`owner_invite_${tenantId}_${ownerUserId}`) ?? null;
  }

  async saveTenantOwnerInvite(invite: TenantOwnerInvite): Promise<TenantOwnerInvite> {
    this.ownerInvites.set(invite.id, firestoreDoc(invite));
    return firestoreDoc(invite);
  }

  async listProspects(): Promise<Prospect[]> {
    return [...this.prospects.values()].map(firestoreDoc);
  }

  async getProspect(prospectId: string): Promise<Prospect | null> {
    const prospect = this.prospects.get(prospectId);
    return prospect ? firestoreDoc(prospect) : null;
  }

  async saveProspect(prospect: Prospect): Promise<Prospect> {
    const parsed = prospectSchema.parse(prospect) as Prospect;
    this.prospects.set(parsed.id, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async getProspectIntake(prospectId: string): Promise<ProspectIntake | null> {
    const intake = this.prospectIntakes.get(prospectId);
    return intake ? firestoreDoc(intake) : null;
  }

  async saveProspectIntake(intake: ProspectIntake): Promise<ProspectIntake> {
    const parsed = prospectIntakeSchema.parse(intake) as ProspectIntake;
    if (!this.prospects.has(parsed.prospectId)) {
      throw new Error(`Prospect ${parsed.prospectId} does not exist.`);
    }
    this.prospectIntakes.set(parsed.prospectId, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async createTenantOnboardingBlueprint(onboardingPlan: TenantOnboardingBlueprint): Promise<TenantOnboardingBlueprint> {
    const parsed = tenantOnboardingBlueprintSchema.parse(onboardingPlan) as TenantOnboardingBlueprint;
    if (!this.prospects.has(parsed.prospectId)) {
      throw new Error(`Prospect ${parsed.prospectId} does not exist.`);
    }
    if (this.onboardingBlueprints.has(parsed.id)) {
      throw new Error(`Onboarding plan ${parsed.id} is immutable and already exists.`);
    }
    this.onboardingBlueprints.set(parsed.id, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async listTenantOnboardingBlueprints(): Promise<TenantOnboardingBlueprint[]> {
    return [...this.onboardingBlueprints.values()].map(firestoreDoc);
  }

  async getTenantOnboardingBlueprint(blueprintId: string): Promise<TenantOnboardingBlueprint | null> {
    const onboardingPlan = this.onboardingBlueprints.get(blueprintId);
    return onboardingPlan ? firestoreDoc(onboardingPlan) : null;
  }

  async listTenantOnboardingBlueprintRevisions(blueprintId: string): Promise<TenantOnboardingBlueprintRevision[]> {
    return (this.onboardingBlueprintRevisions.get(blueprintId) ?? []).map(firestoreDoc);
  }

  async appendTenantOnboardingBlueprintRevision(revision: TenantOnboardingBlueprintRevision): Promise<TenantOnboardingBlueprintRevision> {
    const parsed = tenantOnboardingBlueprintRevisionSchema.parse(revision) as TenantOnboardingBlueprintRevision;
    const onboardingPlan = this.onboardingBlueprints.get(parsed.blueprintId);
    if (!onboardingPlan || onboardingPlan.prospectId !== parsed.prospectId) {
      throw new Error("Onboarding plan revision must reference an existing plan for the same prospect.");
    }
    const current = this.onboardingBlueprintRevisions.get(parsed.blueprintId) ?? [];
    if (current.some((entry) => entry.id === parsed.id)) {
      throw new Error(`Onboarding plan revision ${parsed.id} is immutable and already exists.`);
    }
    const prior = current.at(-1);
    if (parsed.revisionNumber !== current.length + 1 || parsed.previousRevisionId !== prior?.id) {
      throw new Error("Onboarding plan revisions must append in order and reference the immediate prior revision.");
    }
    this.onboardingBlueprintRevisions.set(parsed.blueprintId, [...current, firestoreDoc(parsed)]);
    return firestoreDoc(parsed);
  }

  async listTenantBlockers(tenantId?: string): Promise<TenantBlocker[]> {
    return [...this.tenantBlockers.values()].filter((entry) => !tenantId || entry.tenantId === tenantId).map(firestoreDoc);
  }

  async getTenantBlocker(blockerId: string): Promise<TenantBlocker | null> {
    const blocker = this.tenantBlockers.get(blockerId);
    return blocker ? firestoreDoc(blocker) : null;
  }

  async saveTenantBlocker(blocker: TenantBlocker): Promise<TenantBlocker> {
    const parsed = tenantBlockerSchema.parse(blocker) as TenantBlocker;
    if (!this.tenants.has(parsed.tenantId)) throw new Error(`Tenant ${parsed.tenantId} does not exist.`);
    this.tenantBlockers.set(parsed.id, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async listTenantMigrationRecords(tenantId?: string): Promise<TenantMigrationRecord[]> {
    return [...this.tenantMigrationRecords.values()].filter((entry) => !tenantId || entry.tenantId === tenantId).map(firestoreDoc);
  }

  async getTenantMigrationRecord(migrationId: string): Promise<TenantMigrationRecord | null> {
    const record = this.tenantMigrationRecords.get(migrationId);
    return record ? firestoreDoc(record) : null;
  }

  async saveTenantMigrationRecord(record: TenantMigrationRecord): Promise<TenantMigrationRecord> {
    const parsed = tenantMigrationRecordSchema.parse(record) as TenantMigrationRecord;
    if (!this.tenants.has(parsed.tenantId)) throw new Error(`Tenant ${parsed.tenantId} does not exist.`);
    this.tenantMigrationRecords.set(parsed.id, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async listPlatformSupportEscalations(tenantId?: string): Promise<PlatformSupportEscalation[]> {
    return [...this.supportEscalations.values()].filter((entry) => !tenantId || entry.tenantId === tenantId).map(firestoreDoc);
  }

  async getPlatformSupportEscalation(escalationId: string): Promise<PlatformSupportEscalation | null> {
    const escalation = this.supportEscalations.get(escalationId);
    return escalation ? firestoreDoc(escalation) : null;
  }

  async savePlatformSupportEscalation(escalation: PlatformSupportEscalation): Promise<PlatformSupportEscalation> {
    const parsed = platformSupportEscalationSchema.parse(escalation) as PlatformSupportEscalation;
    const blocker = this.tenantBlockers.get(parsed.blockerId);
    if (!blocker || blocker.tenantId !== parsed.tenantId) throw new Error("Support escalation must reference a blocker for the same tenant.");
    this.supportEscalations.set(parsed.id, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async getPlatformSubscriptionAssignment(prospectId: string): Promise<PlatformSubscriptionAssignment | null> {
    const assignment = this.subscriptionAssignments.get(prospectId);
    return assignment ? firestoreDoc(assignment) : null;
  }

  async savePlatformSubscriptionAssignment(assignment: PlatformSubscriptionAssignment): Promise<PlatformSubscriptionAssignment> {
    const parsed = platformSubscriptionAssignmentSchema.parse(assignment) as PlatformSubscriptionAssignment;
    if (!this.prospects.has(parsed.prospectId)) throw new Error(`Prospect ${parsed.prospectId} does not exist.`);
    this.subscriptionAssignments.set(parsed.prospectId, firestoreDoc(parsed));
    return firestoreDoc(parsed);
  }

  async listTenantMembershipAudits(tenantId: string): Promise<TenantMembershipAudit[]> {
    return this.membershipAudits.get(tenantId) ?? [];
  }

  async saveTenantMembershipAudit(audit: TenantMembershipAudit): Promise<TenantMembershipAudit> {
    const parsed = tenantMembershipAuditSchema.parse(audit) as TenantMembershipAudit;
    this.membershipAudits.set(parsed.tenantId, [...(this.membershipAudits.get(parsed.tenantId) ?? []), parsed]);
    return parsed;
  }

  async listJobAccessLinks(tenantId: string, jobId?: string | undefined): Promise<JobAccessLink[]> {
    return (this.jobAccessLinks.get(tenantId) ?? [])
      .filter((link) => !jobId || link.jobId === jobId);
  }

  async saveJobAccessLink(link: JobAccessLink): Promise<JobAccessLink> {
    const parsed = jobAccessLinkSchema.parse(link) as JobAccessLink;
    const current = (this.jobAccessLinks.get(parsed.tenantId) ?? []).filter((entry) => entry.id !== parsed.id);
    current.push(parsed);
    this.jobAccessLinks.set(parsed.tenantId, current);
    return parsed;
  }

  async revokeJobAccessLink(tenantId: string, id: string, revokedAt: string): Promise<JobAccessLink | null> {
    const existing = (this.jobAccessLinks.get(tenantId) ?? []).find((entry) => entry.id === id);
    if (!existing) {
      return null;
    }
    return this.saveJobAccessLink({ ...existing, revokedAt });
  }

  async getSubscription(tenantId: string): Promise<TenantSubscription | null> {
    return this.subscriptions.get(tenantId) ?? null;
  }

  async saveSubscription(subscription: TenantSubscription): Promise<TenantSubscription> {
    const parsed = tenantSubscriptionSchema.parse(subscription) as TenantSubscription;
    this.subscriptions.set(parsed.tenantId, parsed);
    const tenant = this.tenants.get(parsed.tenantId);
    if (tenant && tenant.plan !== parsed.plan) {
      this.tenants.set(tenant.id, { ...tenant, plan: parsed.plan });
    }
    return parsed;
  }

  async listAdapterStatuses(tenantId: string): Promise<TenantAdapterStatus[]> {
    return this.statuses.get(tenantId) ?? [];
  }

  async saveAdapterStatuses(statuses: TenantAdapterStatus[]): Promise<void> {
    for (const status of statuses.map((entry) => tenantAdapterStatusSchema.parse(entry) as TenantAdapterStatus)) {
      const current = this.statuses.get(status.tenantId) ?? [];
      const next = current.filter((entry) => entry.adapter !== status.adapter);
      next.push(status);
      this.statuses.set(status.tenantId, next);
    }
  }

  seedUsage(record: UsageLogRecord): void {
    const parsed = usageLogRecordSchema.parse(record) as UsageLogRecord;
    this.usage.set(parsed.tenantId, [...(this.usage.get(parsed.tenantId) ?? []), parsed]);
  }

  async summarizeCost(tenantId: string, period: { start: string; end: string }): Promise<TenantCostSummary> {
    const records = (this.usage.get(tenantId) ?? []).filter((record) => record.createdAt >= period.start && record.createdAt <= period.end);
    return {
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
      usageLogCount: records.length,
      estimatedCostUsd: records.reduce((sum, record) => sum + (record.estimatedCostUsd ?? 0), 0)
    };
  }

  async exportTenantData(tenantId: string): Promise<TenantDataExport> {
    return {
      tenantId,
      exportedAt: now(),
      collections: {
        tenants: [...(this.tenants.has(tenantId) ? [this.tenants.get(tenantId)] : [])],
        tenantUsers: this.tenantUsers.get(tenantId) ?? [],
        jobAccessLinks: this.jobAccessLinks.get(tenantId) ?? [],
        tenantSubscriptions: [...(this.subscriptions.has(tenantId) ? [this.subscriptions.get(tenantId)] : [])],
        tenantBranding: [...(this.tenantBranding.has(tenantId) ? [this.tenantBranding.get(tenantId)] : [])],
        tenantAdapterStatuses: this.statuses.get(tenantId) ?? [],
        usageLog: this.usage.get(tenantId) ?? [],
        platformBackups: this.backups.get(tenantId) ?? []
      }
    };
  }

  async recordBackup(record: PlatformBackupRecord): Promise<PlatformBackupRecord> {
    const parsed = platformBackupRecordSchema.parse(record) as PlatformBackupRecord;
    this.backups.set(parsed.tenantId, [...(this.backups.get(parsed.tenantId) ?? []), parsed]);
    return parsed;
  }

  async listBackups(tenantId: string): Promise<PlatformBackupRecord[]> {
    return this.backups.get(tenantId) ?? [];
  }
}

export class FirestorePlatformRepository implements PlatformRepository {
  constructor(private readonly db: Firestore) {}

  private parseTenantCandidate(data: unknown): Tenant | null {
    const parsed = tenantSchema.safeParse(data);
    return parsed.success ? parsed.data as Tenant : null;
  }

  async listTenants(): Promise<Tenant[]> {
    // @platform-admin-read: platform operator console intentionally lists tenant roots.
    const snapshot = await this.db.collection("tenants").get();
    if (snapshot.empty) {
      return [defaultTenant()];
    }
    const tenants = snapshot.docs
      .map((doc) => this.parseTenantCandidate(doc.data()))
      .filter((tenant): tenant is Tenant => tenant !== null);
    return tenants.length > 0 ? tenants : [defaultTenant()];
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const direct = await this.db.collection("tenants").doc(tenantId).get();
    if (direct.exists) {
      const tenant = this.parseTenantCandidate(direct.data());
      if (tenant) {
        return tenant;
      }
    }

    const snapshot = await this.db.collection("tenants").where("tenantId", "==", tenantId).get();
    for (const doc of snapshot.docs) {
      const tenant = this.parseTenantCandidate(doc.data());
      if (tenant) {
        return tenant;
      }
    }

    const configuredId = configuredTenantId(process.env, "platformTenantLookup");
    return tenantId === configuredId ? defaultTenant(configuredId) : null;
  }

  async upsertTenant(tenant: Tenant): Promise<Tenant> {
    const parsed = tenantSchema.parse(tenant) as Tenant;
    await setTenantOwnedDocument({ db: this.db, collection: "tenants", id: parsed.id, tenantId: parsed.id, data: { ...docData(parsed), tenantId: parsed.id }, label: `Tenant ${parsed.id}` });
    return parsed;
  }

  async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    const direct = await this.db.collection("tenantBranding").doc(tenantId).get();
    if (direct.exists) {
      const parsed = tenantBrandingSchema.safeParse(direct.data());
      if (parsed.success) {
        return parsed.data as TenantBranding;
      }
    }
    const tenant = await this.getTenant(tenantId);
    return tenant ? defaultTenantBranding(tenant) : null;
  }

  async saveTenantBranding(branding: TenantBranding): Promise<TenantBranding> {
    const parsed = tenantBrandingSchema.parse(branding) as TenantBranding;
    await setTenantOwnedDocument({ db: this.db, collection: "tenantBranding", id: parsed.tenantId, tenantId: parsed.tenantId, data: docData(parsed), label: `Tenant branding ${parsed.tenantId}` });
    return parsed;
  }

  async listTenantUsers(tenantId: string): Promise<TenantUser[]> {
    const snapshot = await this.db.collection("tenantUsers").where("tenantId", "==", tenantId).get();
    const users = snapshot.docs.map((doc) => tenantUserSchema.parse(doc.data()) as TenantUser);
    return users.length > 0 ? users : defaultTenantUsers(tenantId);
  }

  async getTenantUser(tenantId: string, id: string): Promise<TenantUser | null> {
    const snapshot = await this.db.collection("tenantUsers").doc(id).get();
    if (!snapshot.exists) {
      return defaultTenantUsers(tenantId).find((user) => user.id === id) ?? null;
    }
    const parsed = tenantUserSchema.parse(snapshot.data()) as TenantUser;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertTenantUser(user: TenantUser): Promise<TenantUser> {
    const parsed = tenantUserSchema.parse(user) as TenantUser;
    await setTenantOwnedDocument({ db: this.db, collection: "tenantUsers", id: parsed.id, tenantId: parsed.tenantId, data: docData(parsed), label: `Tenant user ${parsed.id}` });
    return parsed;
  }

  async listPlatformUsers(): Promise<PlatformUser[]> {
    const snapshot = await this.db.collection("platformUsers").orderBy("updatedAt", "desc").get();
    return snapshot.docs.map((doc) => platformUserSchema.parse(doc.data()) as PlatformUser);
  }
  async getPlatformUser(userId: string): Promise<PlatformUser | null> {
    const snapshot = await this.db.collection("platformUsers").doc(userId).get();
    return snapshot.exists ? platformUserSchema.parse(snapshot.data()) as PlatformUser : null;
  }
  async getPlatformUserByAuthUid(authUid: string): Promise<PlatformUser | null> {
    const snapshot = await this.db.collection("platformUsers").where("authUid", "==", authUid).limit(1).get();
    return snapshot.empty ? null : platformUserSchema.parse(snapshot.docs[0]?.data()) as PlatformUser;
  }
  async savePlatformUser(user: PlatformUser): Promise<PlatformUser> {
    const parsed = platformUserSchema.parse(user) as PlatformUser;
    await setPlatformOwnedDocument({ db: this.db, collection: "platformUsers", id: parsed.id, data: docData(parsed) });
    return parsed;
  }
  async listPlatformUserAudits(userId?: string): Promise<PlatformUserAudit[]> {
    let query = this.db.collection("platformUserAudits").orderBy("createdAt", "desc");
    if (userId) query = query.where("userId", "==", userId).orderBy("createdAt", "desc");
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => platformUserAuditSchema.parse(doc.data()) as PlatformUserAudit);
  }
  async appendPlatformUserAudit(audit: PlatformUserAudit): Promise<PlatformUserAudit> {
    const parsed = platformUserAuditSchema.parse(audit) as PlatformUserAudit;
    await this.db.collection("platformUserAudits").doc(parsed.id).create(docData(parsed));
    return parsed;
  }
  async getPlatformSessionByTokenHash(tokenHash: string): Promise<PlatformSession | null> {
    const snapshot = await this.db.collection("platformSessions").where("tokenHash", "==", tokenHash).limit(1).get();
    return snapshot.empty ? null : platformSessionSchema.parse(snapshot.docs[0]?.data()) as PlatformSession;
  }
  async savePlatformSession(session: PlatformSession): Promise<PlatformSession> {
    const parsed = platformSessionSchema.parse(session) as PlatformSession;
    await setPlatformOwnedDocument({ db: this.db, collection: "platformSessions", id: parsed.id, data: docData(parsed) });
    return parsed;
  }
  async appendPlatformSecurityAudit(audit: PlatformSecurityAudit): Promise<PlatformSecurityAudit> {
    const parsed = platformSecurityAuditSchema.parse(audit) as PlatformSecurityAudit;
    await this.db.collection("platformSecurityAudits").doc(parsed.id).create(docData(parsed));
    return parsed;
  }
  async listPlatformSecurityAudits(): Promise<PlatformSecurityAudit[]> {
    const snapshot = await this.db.collection("platformSecurityAudits").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => platformSecurityAuditSchema.parse(doc.data()) as PlatformSecurityAudit);
  }

  async listProspects(): Promise<Prospect[]> {
    // Platform-owned intake records intentionally exist before a tenant exists.
    const snapshot = await this.db.collection("platformProspects").orderBy("updatedAt", "desc").get();
    return snapshot.docs.map((doc) => prospectSchema.parse(doc.data()) as Prospect);
  }

  async getProspect(prospectId: string): Promise<Prospect | null> {
    const snapshot = await this.db.collection("platformProspects").doc(prospectId).get();
    return snapshot.exists ? prospectSchema.parse(snapshot.data()) as Prospect : null;
  }

  async saveProspect(prospect: Prospect): Promise<Prospect> {
    const parsed = prospectSchema.parse(prospect) as Prospect;
    await setPlatformOwnedDocument({ db: this.db, collection: "platformProspects", id: parsed.id, data: docData(parsed) });
    return parsed;
  }

  async getProspectIntake(prospectId: string): Promise<ProspectIntake | null> {
    const snapshot = await this.db.collection("platformProspectIntakes").doc(prospectId).get();
    return snapshot.exists ? prospectIntakeSchema.parse(snapshot.data()) as ProspectIntake : null;
  }

  async saveProspectIntake(intake: ProspectIntake): Promise<ProspectIntake> {
    const parsed = prospectIntakeSchema.parse(intake) as ProspectIntake;
    if (!await this.getProspect(parsed.prospectId)) {
      throw new Error(`Prospect ${parsed.prospectId} does not exist.`);
    }
    await setPlatformOwnedDocument({ db: this.db, collection: "platformProspectIntakes", id: parsed.prospectId, data: docData(parsed) });
    return parsed;
  }

  async createTenantOnboardingBlueprint(onboardingPlan: TenantOnboardingBlueprint): Promise<TenantOnboardingBlueprint> {
    const parsed = tenantOnboardingBlueprintSchema.parse(onboardingPlan) as TenantOnboardingBlueprint;
    if (!await this.getProspect(parsed.prospectId)) {
      throw new Error(`Prospect ${parsed.prospectId} does not exist.`);
    }
    await this.db.collection("platformOnboardingBlueprints").doc(parsed.id).create(docData(parsed));
    return parsed;
  }

  async listTenantOnboardingBlueprints(): Promise<TenantOnboardingBlueprint[]> {
    const snapshot = await this.db.collection("platformOnboardingBlueprints").get();
    return snapshot.docs.map((doc) => tenantOnboardingBlueprintSchema.parse(doc.data()) as TenantOnboardingBlueprint);
  }

  async getTenantOnboardingBlueprint(blueprintId: string): Promise<TenantOnboardingBlueprint | null> {
    const snapshot = await this.db.collection("platformOnboardingBlueprints").doc(blueprintId).get();
    return snapshot.exists ? tenantOnboardingBlueprintSchema.parse(snapshot.data()) as TenantOnboardingBlueprint : null;
  }

  async listTenantOnboardingBlueprintRevisions(blueprintId: string): Promise<TenantOnboardingBlueprintRevision[]> {
    const snapshot = await this.db.collection("platformOnboardingBlueprintRevisions").where("blueprintId", "==", blueprintId).orderBy("revisionNumber", "asc").get();
    return snapshot.docs.map((doc) => tenantOnboardingBlueprintRevisionSchema.parse(doc.data()) as TenantOnboardingBlueprintRevision);
  }

  async appendTenantOnboardingBlueprintRevision(revision: TenantOnboardingBlueprintRevision): Promise<TenantOnboardingBlueprintRevision> {
    const parsed = tenantOnboardingBlueprintRevisionSchema.parse(revision) as TenantOnboardingBlueprintRevision;
    const onboardingPlan = await this.getTenantOnboardingBlueprint(parsed.blueprintId);
    if (!onboardingPlan || onboardingPlan.prospectId !== parsed.prospectId) {
      throw new Error("Onboarding plan revision must reference an existing plan for the same prospect.");
    }
    const current = await this.listTenantOnboardingBlueprintRevisions(parsed.blueprintId);
    const prior = current.at(-1);
    if (parsed.revisionNumber !== current.length + 1 || parsed.previousRevisionId !== prior?.id) {
      throw new Error("Onboarding plan revisions must append in order and reference the immediate prior revision.");
    }
    await this.db.collection("platformOnboardingBlueprintRevisions").doc(parsed.id).create(docData(parsed));
    return parsed;
  }

  async listTenantBlockers(tenantId?: string): Promise<TenantBlocker[]> {
    const collection = this.db.collection("platformTenantBlockers");
    const snapshot = tenantId
      ? await collection.where("tenantId", "==", tenantId).orderBy("updatedAt", "desc").get()
      : await collection.orderBy("updatedAt", "desc").get();
    return snapshot.docs.map((doc) => tenantBlockerSchema.parse(doc.data()) as TenantBlocker);
  }

  async getTenantBlocker(blockerId: string): Promise<TenantBlocker | null> {
    const snapshot = await this.db.collection("platformTenantBlockers").doc(blockerId).get();
    return snapshot.exists ? tenantBlockerSchema.parse(snapshot.data()) as TenantBlocker : null;
  }

  async saveTenantBlocker(blocker: TenantBlocker): Promise<TenantBlocker> {
    const parsed = tenantBlockerSchema.parse(blocker) as TenantBlocker;
    if (!await this.getTenant(parsed.tenantId)) throw new Error(`Tenant ${parsed.tenantId} does not exist.`);
    await setPlatformOwnedDocument({ db: this.db, collection: "platformTenantBlockers", id: parsed.id, data: docData(parsed) });
    return parsed;
  }

  async listTenantMigrationRecords(tenantId?: string): Promise<TenantMigrationRecord[]> {
    const collection = this.db.collection("platformTenantMigrationRecords");
    const snapshot = tenantId
      ? await collection.where("tenantId", "==", tenantId).orderBy("updatedAt", "desc").get()
      : await collection.orderBy("updatedAt", "desc").get();
    return snapshot.docs.map((doc) => tenantMigrationRecordSchema.parse(doc.data()) as TenantMigrationRecord);
  }

  async getTenantMigrationRecord(migrationId: string): Promise<TenantMigrationRecord | null> {
    const snapshot = await this.db.collection("platformTenantMigrationRecords").doc(migrationId).get();
    return snapshot.exists ? tenantMigrationRecordSchema.parse(snapshot.data()) as TenantMigrationRecord : null;
  }

  async saveTenantMigrationRecord(record: TenantMigrationRecord): Promise<TenantMigrationRecord> {
    const parsed = tenantMigrationRecordSchema.parse(record) as TenantMigrationRecord;
    if (!await this.getTenant(parsed.tenantId)) throw new Error(`Tenant ${parsed.tenantId} does not exist.`);
    await setPlatformOwnedDocument({ db: this.db, collection: "platformTenantMigrationRecords", id: parsed.id, data: docData(parsed) });
    return parsed;
  }

  async listPlatformSupportEscalations(tenantId?: string): Promise<PlatformSupportEscalation[]> {
    const collection = this.db.collection("platformSupportEscalations");
    const snapshot = tenantId
      ? await collection.where("tenantId", "==", tenantId).orderBy("updatedAt", "desc").get()
      : await collection.orderBy("updatedAt", "desc").get();
    return snapshot.docs.map((doc) => platformSupportEscalationSchema.parse(doc.data()) as PlatformSupportEscalation);
  }

  async getPlatformSupportEscalation(escalationId: string): Promise<PlatformSupportEscalation | null> {
    const snapshot = await this.db.collection("platformSupportEscalations").doc(escalationId).get();
    return snapshot.exists ? platformSupportEscalationSchema.parse(snapshot.data()) as PlatformSupportEscalation : null;
  }

  async savePlatformSupportEscalation(escalation: PlatformSupportEscalation): Promise<PlatformSupportEscalation> {
    const parsed = platformSupportEscalationSchema.parse(escalation) as PlatformSupportEscalation;
    const blocker = await this.getTenantBlocker(parsed.blockerId);
    if (!blocker || blocker.tenantId !== parsed.tenantId) throw new Error("Support escalation must reference a blocker for the same tenant.");
    await setPlatformOwnedDocument({ db: this.db, collection: "platformSupportEscalations", id: parsed.id, data: docData(parsed) });
    return parsed;
  }

  async getPlatformSubscriptionAssignment(prospectId: string): Promise<PlatformSubscriptionAssignment | null> {
    const snapshot = await this.db.collection("platformSubscriptionAssignments").doc(prospectId).get();
    return snapshot.exists ? platformSubscriptionAssignmentSchema.parse(snapshot.data()) as PlatformSubscriptionAssignment : null;
  }

  async savePlatformSubscriptionAssignment(assignment: PlatformSubscriptionAssignment): Promise<PlatformSubscriptionAssignment> {
    const parsed = platformSubscriptionAssignmentSchema.parse(assignment) as PlatformSubscriptionAssignment;
    if (!await this.getProspect(parsed.prospectId)) throw new Error(`Prospect ${parsed.prospectId} does not exist.`);
    await setPlatformOwnedDocument({ db: this.db, collection: "platformSubscriptionAssignments", id: parsed.prospectId, data: docData(parsed) });
    return parsed;
  }

  async listTenantMembershipAudits(tenantId: string): Promise<TenantMembershipAudit[]> {
    const snapshot = await this.db.collection("tenantMembershipAudits").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => tenantMembershipAuditSchema.parse(doc.data()) as TenantMembershipAudit);
  }

  async saveTenantMembershipAudit(audit: TenantMembershipAudit): Promise<TenantMembershipAudit> {
    const parsed = tenantMembershipAuditSchema.parse(audit) as TenantMembershipAudit;
    await setTenantOwnedDocument({ db: this.db, collection: "tenantMembershipAudits", id: parsed.id, tenantId: parsed.tenantId, data: docData(parsed), label: `Tenant membership audit ${parsed.id}` });
    return parsed;
  }

  async getTenantOwnerInvite(tenantId: string, ownerUserId: string): Promise<TenantOwnerInvite | null> {
    const id = `owner_invite_${tenantId}_${ownerUserId}`;
    const snapshot = await this.db.collection("tenantOwnerInvites").doc(id).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as TenantOwnerInvite;
    return data.tenantId === tenantId && data.ownerUserId === ownerUserId ? firestoreDoc(data) : null;
  }

  async saveTenantOwnerInvite(invite: TenantOwnerInvite): Promise<TenantOwnerInvite> {
    await setTenantOwnedDocument({ db: this.db, collection: "tenantOwnerInvites", id: invite.id, tenantId: invite.tenantId, data: docData(invite), label: `Tenant owner invite ${invite.id}` });
    return firestoreDoc(invite);
  }

  async listJobAccessLinks(tenantId: string, jobId?: string | undefined): Promise<JobAccessLink[]> {
    let query = this.db.collection("jobAccessLinks").where("tenantId", "==", tenantId);
    if (jobId) {
      query = query.where("jobId", "==", jobId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => jobAccessLinkSchema.parse(doc.data()) as JobAccessLink);
  }

  async saveJobAccessLink(link: JobAccessLink): Promise<JobAccessLink> {
    const parsed = jobAccessLinkSchema.parse(link) as JobAccessLink;
    await setTenantOwnedDocument({ db: this.db, collection: "jobAccessLinks", id: parsed.id, tenantId: parsed.tenantId, data: docData(parsed), label: `Job access link ${parsed.id}` });
    return parsed;
  }

  async revokeJobAccessLink(tenantId: string, id: string, revokedAt: string): Promise<JobAccessLink | null> {
    const existing = await this.db.collection("jobAccessLinks").doc(id).get();
    if (!existing.exists) {
      return null;
    }
    const parsed = jobAccessLinkSchema.parse(existing.data()) as JobAccessLink;
    if (parsed.tenantId !== tenantId) {
      return null;
    }
    return this.saveJobAccessLink({ ...parsed, revokedAt });
  }

  async getSubscription(tenantId: string): Promise<TenantSubscription | null> {
    const snapshot = await this.db.collection("tenantSubscriptions").where("tenantId", "==", tenantId).get();
    const data = snapshot.docs[0]?.data();
    return data ? tenantSubscriptionSchema.parse(data) as TenantSubscription : null;
  }

  async saveSubscription(subscription: TenantSubscription): Promise<TenantSubscription> {
    const parsed = tenantSubscriptionSchema.parse(subscription) as TenantSubscription;
    await setTenantOwnedDocument({ db: this.db, collection: "tenantSubscriptions", id: parsed.id, tenantId: parsed.tenantId, data: docData(parsed), label: `Tenant subscription ${parsed.id}` });
    const tenant = await this.getTenant(parsed.tenantId);
    if (tenant) {
      await this.upsertTenant({ ...tenant, plan: parsed.plan });
    }
    return parsed;
  }

  async listAdapterStatuses(tenantId: string): Promise<TenantAdapterStatus[]> {
    const snapshot = await this.db.collection("tenantAdapterStatuses").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => tenantAdapterStatusSchema.parse(doc.data()) as TenantAdapterStatus);
  }

  async saveAdapterStatuses(statuses: TenantAdapterStatus[]): Promise<void> {
    await Promise.all(statuses.map((entry) => tenantAdapterStatusSchema.parse(entry) as TenantAdapterStatus).map((status) => {
      const id = `${status.tenantId}_${status.adapter}`;
      return setTenantOwnedDocument({ db: this.db, collection: "tenantAdapterStatuses", id, tenantId: status.tenantId, data: docData(status), label: `Tenant adapter status ${id}` });
    }));
  }

  async summarizeCost(tenantId: string, period: { start: string; end: string }): Promise<TenantCostSummary> {
    const snapshot = await this.db.collection("usageLog")
      .where("tenantId", "==", tenantId)
      .where("createdAt", ">=", period.start)
      .where("createdAt", "<=", period.end)
      .get();
    const records = snapshot.docs.map((doc) => usageLogRecordSchema.parse(doc.data()) as UsageLogRecord);
    return {
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
      usageLogCount: records.length,
      estimatedCostUsd: records.reduce((sum, record) => sum + (record.estimatedCostUsd ?? 0), 0)
    };
  }

  async exportTenantData(tenantId: string): Promise<TenantDataExport> {
    const collections = ["tenants", "tenantBranding", "tenantUsers", "jobAccessLinks", "tenantSubscriptions", "tenantAdapterStatuses", "clients", "properties", "jobs", "quotes", "invoices", "media", "siteJobBlueprints", "conversations", "failureLog", "usageLog", "platformBackups"];
    const entries = await Promise.all(collections.map(async (collectionName) => {
      const snapshot = await this.db.collection(collectionName).where("tenantId", "==", tenantId).get();
      return [collectionName, snapshot.docs.map((doc) => firestoreDoc(doc.data()))] as const;
    }));
    return { tenantId, exportedAt: now(), collections: Object.fromEntries(entries) };
  }

  async recordBackup(record: PlatformBackupRecord): Promise<PlatformBackupRecord> {
    const parsed = platformBackupRecordSchema.parse(record) as PlatformBackupRecord;
    await setTenantOwnedDocument({ db: this.db, collection: "platformBackups", id: parsed.id, tenantId: parsed.tenantId, data: docData(parsed), label: `Platform backup ${parsed.id}` });
    return parsed;
  }

  async listBackups(tenantId: string): Promise<PlatformBackupRecord[]> {
    const snapshot = await this.db.collection("platformBackups").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => platformBackupRecordSchema.parse(doc.data()) as PlatformBackupRecord);
  }
}

export function subscriptionFromStripe(input: {
  tenantId: string;
  plan: TenantPlan;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  status?: TenantSubscription["status"] | undefined;
}): TenantSubscription {
  return {
    id: `sub_${input.tenantId}_${randomUUID()}`,
    tenantId: input.tenantId,
    plan: input.plan,
    status: input.status ?? "active",
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    updatedAt: now()
  };
}

export function planCatalog(): typeof PLATFORM_PLANS {
  return PLATFORM_PLANS;
}
