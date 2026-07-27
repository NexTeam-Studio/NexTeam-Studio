import type { ID } from "@nexteam/core";
import {
  audienceFilterSchema,
  campaignContactSchema,
  campaignSchema,
  campaignSuppressionSchema,
  campaignTemplateSchema,
  campaignTrackingEventSchema,
  type AudienceFilter,
  type Campaign,
  type CampaignChannel,
  type CampaignContact,
  type CampaignSuppression,
  type CampaignTemplate,
  type CampaignTrackingEvent
} from "./schemas.js";
import { aquatraceCampaignContacts, vgbHotelGmTemplate } from "../tenantPacks/aquatrace/campaignFixtures.js";

export { vgbHotelGmTemplate } from "../tenantPacks/aquatrace/campaignFixtures.js";

export interface CampaignRepository {
  listContacts(tenantId: ID): Promise<CampaignContact[]>;
  upsertContact(contact: CampaignContact): Promise<CampaignContact>;
  listTemplates(tenantId: ID): Promise<CampaignTemplate[]>;
  getTemplate(tenantId: ID, templateId: ID): Promise<CampaignTemplate | null>;
  saveTemplate(template: CampaignTemplate): Promise<CampaignTemplate>;
  saveCampaign(campaign: Campaign): Promise<Campaign>;
  getCampaign(tenantId: ID, campaignId: ID): Promise<Campaign | null>;
  listCampaigns(tenantId: ID): Promise<Campaign[]>;
  saveSuppression(entry: CampaignSuppression): Promise<CampaignSuppression>;
  isSuppressed(tenantId: ID, contactId: ID, channel: CampaignChannel): Promise<boolean>;
  listSuppressions(tenantId: ID): Promise<CampaignSuppression[]>;
  recordTracking(event: CampaignTrackingEvent): Promise<CampaignTrackingEvent>;
  listTracking(tenantId: ID, campaignId?: ID | undefined): Promise<CampaignTrackingEvent[]>;
}

function now(): string {
  return new Date().toISOString();
}

export class InMemoryCampaignRepository implements CampaignRepository {
  private readonly contacts = new Map<ID, CampaignContact>();
  private readonly templates = new Map<ID, CampaignTemplate>();
  private readonly campaigns = new Map<ID, Campaign>();
  private readonly suppressions = new Map<ID, CampaignSuppression>();
  private readonly tracking = new Map<ID, CampaignTrackingEvent>();

  constructor(private readonly defaultTenantId: string, seedFixtureData = true) {
    if (!defaultTenantId.trim()) {
      throw new Error("InMemoryCampaignRepository requires an explicit tenantId.");
    }
    if (!seedFixtureData) {
      return;
    }
    for (const contact of aquatraceCampaignContacts(defaultTenantId)) {
      this.contacts.set(contact.id, contact);
    }
    const template = vgbHotelGmTemplate(defaultTenantId);
    this.templates.set(template.id, template);
  }

  async listContacts(tenantId: ID): Promise<CampaignContact[]> {
    const seeded = [...this.contacts.values()].filter((contact) => contact.tenantId === tenantId);
    if (seeded.length > 0 || tenantId === this.defaultTenantId) {
      return seeded;
    }
    return [];
  }

  async upsertContact(contact: CampaignContact): Promise<CampaignContact> {
    const parsed = campaignContactSchema.parse(contact);
    this.contacts.set(parsed.id, parsed);
    return parsed;
  }

  async listTemplates(tenantId: ID): Promise<CampaignTemplate[]> {
    const templates = [...this.templates.values()].filter((template) => template.tenantId === tenantId);
    return templates;
  }

  async getTemplate(tenantId: ID, templateId: ID): Promise<CampaignTemplate | null> {
    const template = this.templates.get(templateId);
    if (template?.tenantId === tenantId) {
      return template;
    }
    return null;
  }

  async saveTemplate(template: CampaignTemplate): Promise<CampaignTemplate> {
    const parsed = campaignTemplateSchema.parse(template);
    this.templates.set(parsed.id, parsed);
    return parsed;
  }

  async saveCampaign(campaign: Campaign): Promise<Campaign> {
    const parsed = campaignSchema.parse(campaign);
    this.campaigns.set(parsed.id, parsed);
    return parsed;
  }

  async getCampaign(tenantId: ID, campaignId: ID): Promise<Campaign | null> {
    const campaign = this.campaigns.get(campaignId);
    return campaign?.tenantId === tenantId ? campaign : null;
  }

  async listCampaigns(tenantId: ID): Promise<Campaign[]> {
    return [...this.campaigns.values()]
      .filter((campaign) => campaign.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveSuppression(entry: CampaignSuppression): Promise<CampaignSuppression> {
    const parsed = campaignSuppressionSchema.parse(entry);
    this.suppressions.set(parsed.id, parsed);
    return parsed;
  }

  async isSuppressed(tenantId: ID, contactId: ID, channel: CampaignChannel): Promise<boolean> {
    return [...this.suppressions.values()].some((entry) =>
      entry.tenantId === tenantId && entry.contactId === contactId && entry.channel === channel
    );
  }

  async listSuppressions(tenantId: ID): Promise<CampaignSuppression[]> {
    return [...this.suppressions.values()].filter((entry) => entry.tenantId === tenantId);
  }

  async recordTracking(event: CampaignTrackingEvent): Promise<CampaignTrackingEvent> {
    const parsed = campaignTrackingEventSchema.parse(event);
    this.tracking.set(parsed.id, parsed);
    return parsed;
  }

  async listTracking(tenantId: ID, campaignId?: ID | undefined): Promise<CampaignTrackingEvent[]> {
    return [...this.tracking.values()]
      .filter((entry) => entry.tenantId === tenantId && (!campaignId || entry.campaignId === campaignId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}

export function normalizeAudienceFilter(input: unknown, tenantId: ID): AudienceFilter {
  return audienceFilterSchema.parse({ tenantId, ...(input && typeof input === "object" ? input : {}) });
}

export function timestampedCampaign(input: Omit<Campaign, "createdAt" | "updatedAt">): Campaign {
  const ts = now();
  return campaignSchema.parse({ ...input, createdAt: ts, updatedAt: ts });
}
