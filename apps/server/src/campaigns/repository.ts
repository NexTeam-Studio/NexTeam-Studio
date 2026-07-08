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

export function vgbHotelGmTemplate(tenantId: ID): CampaignTemplate {
  return campaignTemplateSchema.parse({
    id: "vgb-hotel-gm-outreach",
    tenantId,
    name: "VGB Hotel GM Outreach",
    description: "Approval-gated starter sequence for commercial pool operators who may need VGB drain-cover help.",
    audience: {
      tenantId,
      channel: "email",
      tagsAny: ["vgb", "commercial", "hotel"],
      consentRequired: true,
      excludeSuppressed: true,
      maxResults: 100
    },
    sequence: [
      {
        id: "step_1_intro",
        channel: "email",
        delayHours: 0,
        subject: "Quick VGB safety check for {{companyOrName}}",
        body: "Hi {{name}},\n\nAquatrace helps commercial pool operators confirm whether their drain covers and documentation are ready before inspection season. If you want a quick review, reply here and we can point you in the right direction.\n\n{{unsubscribeLink}}",
        stopOnReply: true,
        stopOnUnsubscribe: true
      },
      {
        id: "step_2_followup",
        channel: "email",
        delayHours: 72,
        subject: "Following up on VGB drain-cover readiness",
        body: "Hi {{name}},\n\nJust closing the loop. If VGB documentation is already handled, no action needed. If not, Aquatrace can help verify the pool and map the next steps.\n\n{{unsubscribeLink}}",
        stopOnReply: true,
        stopOnUnsubscribe: true
      }
    ],
    complianceNotes: [
      "Existing-contact or explicit opt-in only.",
      "One-click unsubscribe must be present before queueing.",
      "Bulk/list execution is blocked until SPF, DKIM, and DMARC are confirmed."
    ]
  });
}

function seedContacts(tenantId: ID): CampaignContact[] {
  return [
    {
      id: "contact_chris_owner",
      tenantId,
      name: "Chris Owner Test",
      company: "Aquatrace",
      emails: ["chris1bata@gmail.com"],
      phones: [],
      tags: ["vgb", "commercial", "hotel", "test"],
      consent: { email: true, sms: false }
    },
    {
      id: "contact_nexi_sender",
      tenantId,
      name: "Nexi Mailbox Test",
      company: "Aquatrace",
      emails: ["nexi@aquatraceleak.com"],
      phones: [],
      tags: ["vgb", "commercial", "test"],
      consent: { email: true, sms: false }
    },
    {
      id: "contact_no_email_consent",
      tenantId,
      name: "No Consent Example",
      company: "Do Not Send",
      emails: ["nosend@example.test"],
      phones: [],
      tags: ["vgb", "commercial"],
      consent: { email: false, sms: false }
    }
  ].map((contact) => campaignContactSchema.parse(contact));
}

export class InMemoryCampaignRepository implements CampaignRepository {
  private readonly contacts = new Map<ID, CampaignContact>();
  private readonly templates = new Map<ID, CampaignTemplate>();
  private readonly campaigns = new Map<ID, Campaign>();
  private readonly suppressions = new Map<ID, CampaignSuppression>();
  private readonly tracking = new Map<ID, CampaignTrackingEvent>();

  constructor(private readonly defaultTenantId = "aquatrace") {
    for (const contact of seedContacts(defaultTenantId)) {
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
    return seedContacts(tenantId);
  }

  async upsertContact(contact: CampaignContact): Promise<CampaignContact> {
    const parsed = campaignContactSchema.parse(contact);
    this.contacts.set(parsed.id, parsed);
    return parsed;
  }

  async listTemplates(tenantId: ID): Promise<CampaignTemplate[]> {
    const templates = [...this.templates.values()].filter((template) => template.tenantId === tenantId);
    return templates.length ? templates : [vgbHotelGmTemplate(tenantId)];
  }

  async getTemplate(tenantId: ID, templateId: ID): Promise<CampaignTemplate | null> {
    const template = this.templates.get(templateId);
    if (template?.tenantId === tenantId) {
      return template;
    }
    const fallback = vgbHotelGmTemplate(tenantId);
    return fallback.id === templateId ? fallback : null;
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
