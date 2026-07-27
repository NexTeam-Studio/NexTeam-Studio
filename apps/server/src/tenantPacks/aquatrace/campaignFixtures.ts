import type { ID } from "@nexteam/core";
import {
  campaignContactSchema,
  campaignTemplateSchema,
  type CampaignContact,
  type CampaignTemplate
} from "../../campaigns/schemas.js";

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
    variables: [
      { key: "companyOrName", label: "Company or contact name", description: "Defaults to company name when present, otherwise the contact name.", required: true },
      { key: "businessName", label: "Tenant business name", required: true }
    ],
    complianceNotes: [
      "Existing-contact or explicit opt-in only.",
      "One-click unsubscribe must be present before queueing.",
      "Bulk/list execution is blocked until SPF, DKIM, and DMARC are confirmed."
    ]
  });
}

export function aquatraceCampaignContacts(tenantId: ID): CampaignContact[] {
  return [
    {
      id: "contact_chris_owner",
      tenantId,
      name: "Owner Test",
      company: "Aquatrace",
      emails: ["owner@example.test"],
      phones: [],
      tags: ["vgb", "commercial", "hotel", "test"],
      consent: { email: true, sms: false }
    },
    {
      id: "contact_nexi_sender",
      tenantId,
      name: "Mailbox Test",
      company: "Aquatrace",
      emails: ["mailbox@example.test"],
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
