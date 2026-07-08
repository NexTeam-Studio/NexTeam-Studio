import { randomUUID } from "node:crypto";
import { RailError, type ApprovalItem, type ApprovalQueueService, type Tenant } from "@nexteam/core";
import { selectAudience } from "./audience.js";
import {
  complianceConfigFromEnv,
  outboundBoundary,
  quietHoursBlocked,
  renderStepForContact
} from "./compliance.js";
import { normalizeAudienceFilter, timestampedCampaign, type CampaignRepository } from "./repository.js";
import {
  campaignRunSchema,
  campaignSuppressionSchema,
  campaignTrackingEventSchema,
  type AudienceFilter,
  type Campaign,
  type CampaignContact,
  type CampaignTemplate,
  type CampaignTrackingEvent,
  type SequenceStep
} from "./schemas.js";
import { planSequenceSends, sequenceStateAfter } from "./sequenceEngine.js";

export interface CampaignServiceDeps {
  repository: CampaignRepository;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface QueueCampaignResult {
  campaign: Campaign;
  template: CampaignTemplate;
  audience: {
    selected: CampaignContact[];
    excluded: Array<{ contactId: string; reason: string }>;
  };
  plannedSends: ReturnType<typeof planSequenceSends>;
  queuedApprovals: ApprovalItem[];
  suppressed: Array<{ contactId: string; stepId: string; reason: string }>;
  boundary: ReturnType<typeof outboundBoundary>;
  machineState: string;
}

function baseUrl(env: NodeJS.ProcessEnv): string {
  return (env.NEXTEAM_BASE_URL || env.PUBLIC_BASE_URL || "https://nexteam-studio-staging.up.railway.app").replace(/\/$/, "");
}

function trackingId(): string {
  return `camptrk_${randomUUID()}`;
}

function approvalTitle(contact: CampaignContact, step: SequenceStep): string {
  return `${step.channel.toUpperCase()} campaign step for ${contact.company || contact.name}`;
}

function approvalBody(rendered: { subject: string; bodyText: string }, step: SequenceStep): string {
  return step.channel === "email"
    ? `Subject: ${rendered.subject}\n\n${rendered.bodyText}`
    : rendered.bodyText;
}

function outboundArgs(input: {
  tenant: Tenant;
  contact: CampaignContact;
  step: SequenceStep;
  campaignId: string;
  rendered: { subject: string; bodyText: string };
  executionBlocked: boolean;
}): unknown {
  if (input.step.channel === "email") {
    return {
      campaignId: input.campaignId,
      stepId: input.step.id,
      contactId: input.contact.id,
      executionBlocked: input.executionBlocked,
      outbound: {
        tenantId: input.tenant.id,
        mailbox: "nexi",
        to: [input.contact.emails[0]].filter(Boolean),
        subject: input.rendered.subject,
        bodyText: input.rendered.bodyText
      }
    };
  }
  return {
    campaignId: input.campaignId,
    stepId: input.step.id,
    contactId: input.contact.id,
    executionBlocked: true,
    outbound: {
      tenantId: input.tenant.id,
      to: input.contact.phones[0],
      body: input.rendered.bodyText
    }
  };
}

function withActor(args: unknown, actorId: string): unknown {
  return args && typeof args === "object" && !Array.isArray(args)
    ? { ...(args as Record<string, unknown>), actorId }
    : { actorId, payload: args };
}

async function recordTracking(input: {
  repository: CampaignRepository;
  tenantId: string;
  campaignId: string;
  contactId: string;
  channel: SequenceStep["channel"];
  type: CampaignTrackingEvent["type"];
  stepId?: string | undefined;
  url?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}): Promise<CampaignTrackingEvent> {
  return input.repository.recordTracking(campaignTrackingEventSchema.parse({
    id: trackingId(),
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    contactId: input.contactId,
    channel: input.channel,
    type: input.type,
    stepId: input.stepId,
    url: input.url,
    createdAt: new Date().toISOString(),
    metadata: input.metadata ?? {}
  }));
}

export class CampaignService {
  constructor(private readonly deps: CampaignServiceDeps) {}

  async previewAudience(tenant: Tenant, filterInput: unknown): Promise<{
    filter: AudienceFilter;
    selected: CampaignContact[];
    excluded: Array<{ contactId: string; reason: string }>;
  }> {
    const filter = normalizeAudienceFilter(filterInput, tenant.id);
    const audience = await selectAudience({ repository: this.deps.repository, tenantId: tenant.id, filter });
    return { filter, selected: audience.contacts, excluded: audience.excluded };
  }

  async queueTemplateCampaign(tenant: Tenant, raw: unknown, actorId = "unknown-actor"): Promise<QueueCampaignResult> {
    const input = campaignRunSchema.parse(raw);
    const template = await this.deps.repository.getTemplate(tenant.id, input.templateId);
    if (!template) {
      throw new RailError(`Campaign template ${input.templateId} was not found.`, { provider: "native", op: "queueCampaign", status: 404 });
    }
    const audienceFilter = normalizeAudienceFilter(input.audience ?? template.audience, tenant.id);
    const audience = await selectAudience({ repository: this.deps.repository, tenantId: tenant.id, filter: audienceFilter });
    const campaign = await this.deps.repository.saveCampaign(timestampedCampaign({
      id: `camp_${randomUUID()}`,
      tenantId: tenant.id,
      name: input.name ?? template.name,
      templateId: template.id,
      audience: audienceFilter,
      sequence: template.sequence,
      status: "approval_queued"
    }));
    return this.queueStep(tenant, campaign.id, template.sequence[0]?.id ?? "", audience.contacts, actorId);
  }

  async queueStep(
    tenant: Tenant,
    campaignId: string,
    stepId: string,
    contactsOverride?: CampaignContact[] | undefined,
    actorId = "unknown-actor"
  ): Promise<QueueCampaignResult> {
    const campaign = await this.deps.repository.getCampaign(tenant.id, campaignId);
    if (!campaign) {
      throw new RailError(`Campaign ${campaignId} was not found.`, { provider: "native", op: "queueCampaignStep", status: 404 });
    }
    const template = campaign.templateId
      ? await this.deps.repository.getTemplate(tenant.id, campaign.templateId)
      : null;
    const step = campaign.sequence.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new RailError(`Campaign step ${stepId} was not found.`, { provider: "native", op: "queueCampaignStep", status: 404 });
    }
    const config = complianceConfigFromEnv(this.deps.env ?? process.env);
    const boundary = outboundBoundary(config, step.channel);
    const audience = contactsOverride
      ? { contacts: contactsOverride, excluded: [] }
      : await selectAudience({
        repository: this.deps.repository,
        tenantId: tenant.id,
        filter: { ...campaign.audience, excludeSuppressed: false }
      });
    const plannedSends = planSequenceSends({
      campaignId,
      contacts: audience.contacts,
      sequence: [step]
    });
    const queuedApprovals: ApprovalItem[] = [];
    const suppressed: Array<{ contactId: string; stepId: string; reason: string }> = [];

    for (const contact of audience.contacts) {
      const sendPlan = plannedSends.find((plan) => plan.contactId === contact.id && plan.stepId === step.id);
      const sendAt = sendPlan ? new Date(sendPlan.sendAt) : new Date();
      const isSuppressed = await this.deps.repository.isSuppressed(tenant.id, contact.id, step.channel);
      if (isSuppressed || quietHoursBlocked({ channel: step.channel, sendAt, config })) {
        const reason = isSuppressed ? "suppressed" : "sms_quiet_hours";
        suppressed.push({ contactId: contact.id, stepId: step.id, reason });
        await recordTracking({
          repository: this.deps.repository,
          tenantId: tenant.id,
          campaignId,
          contactId: contact.id,
          channel: step.channel,
          type: "suppressed",
          stepId: step.id,
          metadata: { reason }
        });
        continue;
      }
      const rendered = renderStepForContact({
        tenant,
        contact,
        step,
        campaignId,
        baseUrl: baseUrl(this.deps.env ?? process.env)
      });
      const approval = await this.deps.approvalQueue.create({
        tenantId: tenant.id,
        kind: step.channel === "email" ? "email" : "sms",
        preview: {
          title: approvalTitle(contact, step),
          body: approvalBody(rendered, step)
        },
        execute: {
          service: "campaigns",
          op: boundary.executionBlocked ? "bulkExecutionBlocked" : "approvalRequired",
          args: withActor(outboundArgs({
            tenant,
            contact,
            step,
            campaignId,
            rendered,
            executionBlocked: boundary.executionBlocked
          }), actorId)
        },
        createdBy: "user"
      });
      queuedApprovals.push(approval);
      await recordTracking({
        repository: this.deps.repository,
        tenantId: tenant.id,
        campaignId,
        contactId: contact.id,
        channel: step.channel,
        type: "queued",
        stepId: step.id,
        metadata: { approvalId: approval.id, sendAt: sendPlan?.sendAt, executionBlocked: boundary.executionBlocked }
      });
    }

    return {
      campaign,
      template: template ?? {
        id: campaign.templateId ?? campaign.id,
        tenantId: tenant.id,
        name: campaign.name,
        description: campaign.name,
        audience: campaign.audience,
        sequence: campaign.sequence,
        complianceNotes: []
      },
      audience: { selected: audience.contacts, excluded: audience.excluded },
      plannedSends,
      queuedApprovals,
      suppressed,
      boundary,
      machineState: sequenceStateAfter(["PLAN", queuedApprovals.length ? "QUEUE" : "SUPPRESS"])
    };
  }

  async unsubscribe(tenant: Tenant, input: {
    campaignId: string;
    contactId: string;
    channel: SequenceStep["channel"];
    reason: "unsubscribed" | "manual" | "bounce" | "spam_complaint";
  }): Promise<{ suppression: unknown; tracking: CampaignTrackingEvent }> {
    const suppression = await this.deps.repository.saveSuppression(campaignSuppressionSchema.parse({
      id: `supp_${randomUUID()}`,
      tenantId: tenant.id,
      contactId: input.contactId,
      channel: input.channel,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      source: `campaign:${input.campaignId}`
    }));
    const tracking = await recordTracking({
      repository: this.deps.repository,
      tenantId: tenant.id,
      campaignId: input.campaignId,
      contactId: input.contactId,
      channel: input.channel,
      type: "unsubscribe",
      metadata: { suppressionId: suppression.id, reason: input.reason }
    });
    return { suppression, tracking };
  }

  async recordOpenOrClick(tenant: Tenant, input: {
    campaignId: string;
    contactId: string;
    channel: SequenceStep["channel"];
    type: "open" | "click";
    stepId?: string | undefined;
    url?: string | undefined;
  }): Promise<CampaignTrackingEvent> {
    return recordTracking({
      repository: this.deps.repository,
      tenantId: tenant.id,
      campaignId: input.campaignId,
      contactId: input.contactId,
      channel: input.channel,
      type: input.type,
      stepId: input.stepId,
      url: input.url
    });
  }

  async stats(tenant: Tenant): Promise<{
    campaigns: Campaign[];
    suppressions: unknown[];
    tracking: CampaignTrackingEvent[];
    totals: Record<string, number>;
  }> {
    const [campaigns, suppressions, tracking] = await Promise.all([
      this.deps.repository.listCampaigns(tenant.id),
      this.deps.repository.listSuppressions(tenant.id),
      this.deps.repository.listTracking(tenant.id)
    ]);
    const totals = tracking.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});
    return { campaigns, suppressions, tracking, totals };
  }

  async queueTransactionalReportDelivery(tenant: Tenant, input: {
    to: string;
    reportTitle: string;
    reportRef: string;
  }, actorId = "unknown-actor"): Promise<ApprovalItem> {
    return this.deps.approvalQueue.create({
      tenantId: tenant.id,
      kind: "email",
      preview: {
        title: `Report delivery: ${input.reportTitle}`,
        body: `Subject: ${input.reportTitle}\n\nYour Aquatrace report is ready for review.\n\nReport: ${input.reportRef}`
      },
      execute: {
        service: "campaigns",
        op: "transactionalApprovalRequired",
        args: {
          actorId,
          outbound: {
            tenantId: tenant.id,
            to: [input.to],
            subject: input.reportTitle,
            bodyText: `Your Aquatrace report is ready for review.\n\nReport: ${input.reportRef}`
          }
        }
      },
      createdBy: "user"
    });
  }

  async queueInvoicePaidReviewRequest(tenant: Tenant, input: {
    to: string;
    invoiceId: string;
    clientName: string;
  }, actorId = "unknown-actor"): Promise<ApprovalItem> {
    return this.deps.approvalQueue.create({
      tenantId: tenant.id,
      kind: "email",
      preview: {
        title: `Review request queued for ${input.clientName}`,
        body: `Subject: Thank you from Aquatrace\n\nThanks again for trusting Aquatrace. If the service helped, a short review would mean a lot. This is queued with a 2-day delay after invoice ${input.invoiceId}.`
      },
      execute: {
        service: "campaigns",
        op: "transactionalApprovalRequiredAfterDelay",
        args: {
          actorId,
          delayHours: 48,
          invoiceId: input.invoiceId,
          outbound: {
            tenantId: tenant.id,
            to: [input.to],
            subject: "Thank you from Aquatrace",
            bodyText: "Thanks again for trusting Aquatrace. If the service helped, a short review would mean a lot."
          }
        }
      },
      createdBy: "user"
    });
  }
}
