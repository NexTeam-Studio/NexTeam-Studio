import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  jobAccessLinkSchema,
  platformBackupRecordSchema,
  tenantBrandingSchema,
  tenantAdapterStatusSchema,
  tenantSchema,
  tenantSubscriptionSchema,
  tenantUserSchema,
  usageLogRecordSchema,
  type JobAccessLink,
  type PlatformBackupRecord,
  type Tenant,
  type TenantAdapterStatus,
  type TenantBranding,
  type TenantCostSummary,
  type TenantDataExport,
  type TenantPlan,
  type TenantSubscription,
  type TenantUser,
  type UsageLogRecord
} from "@nexteam/core";
import { PLATFORM_PLANS } from "./plans.js";

const DEFAULT_TENANT_ID = "aquatrace";

function defaultApproval(): Tenant["approval"] {
  return {
    client: { autoApprove: false, cleanStreak: 0 },
    tenant_provisioning: { autoApprove: false, cleanStreak: 0 },
    email: { autoApprove: false, cleanStreak: 0 },
    sms: { autoApprove: false, cleanStreak: 0 },
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

export function defaultTenant(tenantId = DEFAULT_TENANT_ID, plan: TenantPlan = "suite"): Tenant {
  return {
    id: tenantId,
    name: tenantId === DEFAULT_TENANT_ID ? "Aquatrace" : tenantId,
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
    approval: defaultApproval(),
    timezone: "America/New_York",
    plan
  };
}

export function defaultTenantBranding(tenant: Tenant | string = defaultTenant()): TenantBranding {
  const tenantId = typeof tenant === "string" ? tenant : tenant.id;
  const displayName = typeof tenant === "string" ? (tenantId === DEFAULT_TENANT_ID ? "Aquatrace" : tenantId) : tenant.name;
  const updatedAt = "2026-07-10T00:00:00.000Z";
  if (tenantId === DEFAULT_TENANT_ID) {
    return {
      tenantId,
      displayName: "Aquatrace",
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
      fontFamily: "Georgia, 'Times New Roman', serif",
      source: "default",
      updatedBy: "system",
      updatedAt
    };
  }
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
    fontFamily: "Georgia, 'Times New Roman', serif",
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
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  upsertTenant(tenant: Tenant): Promise<Tenant>;
  getTenantBranding(tenantId: string): Promise<TenantBranding | null>;
  saveTenantBranding(branding: TenantBranding): Promise<TenantBranding>;
  listTenantUsers(tenantId: string): Promise<TenantUser[]>;
  getTenantUser(tenantId: string, id: string): Promise<TenantUser | null>;
  upsertTenantUser(user: TenantUser): Promise<TenantUser>;
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

export function defaultTenantUsers(tenantId = DEFAULT_TENANT_ID): TenantUser[] {
  const createdAt = "2026-07-08T00:00:00.000Z";
  if (tenantId !== DEFAULT_TENANT_ID) {
    return [];
  }
  return [
    {
      id: "tenant_user_chris",
      tenantId,
      email: "chris@aquatraceleak.com",
      displayName: "Chris",
      role: "OWNER",
      active: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "tech_catherine",
      tenantId,
      displayName: "Catherine",
      role: "TECHNICIAN",
      active: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "tech_logan",
      tenantId,
      displayName: "Logan",
      role: "TECHNICIAN",
      active: true,
      createdAt,
      updatedAt: createdAt
    }
  ];
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
  private readonly tenants = new Map<string, Tenant>();
  private readonly tenantBranding = new Map<string, TenantBranding>();
  private readonly tenantUsers = new Map<string, TenantUser[]>();
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

    return tenantId === DEFAULT_TENANT_ID ? defaultTenant() : null;
  }

  async upsertTenant(tenant: Tenant): Promise<Tenant> {
    const parsed = tenantSchema.parse(tenant) as Tenant;
    await this.db.collection("tenants").doc(parsed.id).set({ ...docData(parsed), tenantId: parsed.id }, { merge: true });
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
    await this.db.collection("tenantBranding").doc(parsed.tenantId).set(docData(parsed), { merge: true });
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
    await this.db.collection("tenantUsers").doc(parsed.id).set(docData(parsed), { merge: true });
    return parsed;
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
    await this.db.collection("jobAccessLinks").doc(parsed.id).set(docData(parsed), { merge: true });
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
    await this.db.collection("tenantSubscriptions").doc(parsed.id).set(docData(parsed), { merge: true });
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
    const batch = this.db.batch();
    for (const status of statuses.map((entry) => tenantAdapterStatusSchema.parse(entry) as TenantAdapterStatus)) {
      batch.set(this.db.collection("tenantAdapterStatuses").doc(`${status.tenantId}_${status.adapter}`), docData(status), { merge: true });
    }
    await batch.commit();
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
    await this.db.collection("platformBackups").doc(parsed.id).set(docData(parsed));
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
