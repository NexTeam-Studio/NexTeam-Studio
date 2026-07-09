import { randomUUID } from "node:crypto";
import {
  RailError,
  nexiBlueprintSchema,
  type ApprovalQueueService,
  type ArtifactKind,
  type NexiBlueprint,
  type ServiceDef,
  type Tenant
} from "@nexteam/core";
import type { PlatformRepository } from "../platform/repository.js";
import { nextIntakeStep, questionForStep } from "./machine.js";
import {
  answerIntakeInputSchema,
  appStackItemSchema,
  finalizeIntakeInputSchema,
  provisioningPlanSchema,
  startIntakeInputSchema,
  type AppStackItem,
  type IntakeField,
  type IntakeSession,
  type ProvisioningPlan
} from "./schemas.js";
import type { IntakeRepository } from "./repository.js";

const ALL_APPROVAL_KINDS: ArtifactKind[] = [
  "client",
  "tenant_provisioning",
  "email",
  "sms",
  "gbp_post",
  "social_post",
  "article",
  "quote",
  "invoice",
  "site_publish",
  "review_reply"
];

function now(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `tenant-${randomUUID().slice(0, 8)}`;
}

function defaultApproval(): Tenant["approval"] {
  return Object.fromEntries(ALL_APPROVAL_KINDS.map((kind) => [kind, { autoApprove: false, cleanStreak: 0 }])) as Tenant["approval"];
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,;\n]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function asAppStack(value: unknown): AppStackItem[] {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry && typeof entry === "object") {
        return appStackItemSchema.parse(entry);
      }
      return appStackItemSchema.parse({
        category: "operations",
        currentTool: String(entry),
        decision: "COEXIST",
        notes: "Captured from intake notes."
      });
    });
  }
  if (typeof value === "string") {
    return value.split(/[,;\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => appStackItemSchema.parse({
        category: "operations",
        currentTool: entry,
        decision: "COEXIST",
        notes: "Keep working beside this app until the owner changes the decision."
      }));
  }
  return [];
}

function servicesFromAnswers(answers: Record<string, unknown>, businessName: string): ServiceDef[] {
  const names = asStringList(answers.services);
  const serviceNames = names.length ? names : ["Core service"];
  return serviceNames.map((name, index) => ({
    id: `svc_${slugify(name)}_${index + 1}`,
    name,
    description: `${name} for ${businessName}`,
    active: true
  }));
}

function buildTenant(input: {
  tenantId: string;
  name: string;
  industryPack: Tenant["industryPack"];
  plan: Tenant["plan"];
  timezone: string;
}): Tenant {
  return {
    id: input.tenantId,
    name: input.name,
    industryPack: input.industryPack,
    branding: {
      assistantName: "Nexi",
      colors: {
        accent: "#0e7490",
        background: "#f8fafc"
      }
    },
    adapters: {
      crm: "native",
      media: "native",
      email: "gmail_relay"
    },
    approval: defaultApproval(),
    timezone: input.timezone,
    plan: input.plan
  };
}

function buildBlueprint(input: {
  targetTenantId: string;
  businessName: string;
  answers: Record<string, unknown>;
}): NexiBlueprint {
  const candidate = {
    id: `nexi_plan_${input.targetTenantId}`,
    tenantId: input.targetTenantId,
    services: servicesFromAnswers(input.answers, input.businessName),
    pricingNotes: typeof input.answers.pricingNotes === "string" ? input.answers.pricingNotes : "Pricing must be confirmed by the owner before quoting.",
    serviceArea: asStringList(input.answers.serviceArea),
    brandVoice: typeof input.answers.brandVoice === "string" ? input.answers.brandVoice : "Plain-spoken, reliable, and helpful.",
    terminology: {
      customer: "client",
      job: "job",
      estimate: "quote"
    }
  };
  return nexiBlueprintSchema.parse(candidate) as NexiBlueprint;
}

function buildProvisioningPlan(session: IntakeSession): ProvisioningPlan {
  const businessName = session.businessName ?? String(session.answers.businessName ?? session.targetTenantId);
  const tenant = buildTenant({
    tenantId: session.targetTenantId,
    name: businessName,
    industryPack: session.industryPack,
    plan: session.plan,
    timezone: typeof session.answers.timezone === "string" ? session.answers.timezone : "America/New_York"
  });
  const nexiPlan = buildBlueprint({
    targetTenantId: session.targetTenantId,
    businessName,
    answers: session.answers
  });
  const plan = {
    tenant,
    nexiBlueprint: nexiPlan,
    siteDraft: {
      slug: session.targetTenantId,
      theme: session.industryPack === "pool_leak" ? "pool_leak" : "service_business",
      sections: ["hero", "services", "service-area", "lead-form"],
      qualityBar: "Draft only; custom domain, SSL, and publishing require owner approval."
    },
    calendarSeed: {
      timezone: tenant.timezone,
      workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      defaultWindow: "8:00 AM - 5:00 PM",
      notes: "Calendar starts with native booking only until external calendar OAuth is completed."
    },
    templates: [
      {
        key: "job_confirmed",
        channel: "email" as const,
        subject: "Your appointment is confirmed",
        body: "Hi {{clientName}}, this confirms {{businessName}} is scheduled for {{scheduledWindow}}.",
        variables: ["clientName", "businessName", "scheduledWindow"]
      },
      {
        key: "reminder",
        channel: "sms" as const,
        body: "{{businessName}} reminder: we are scheduled for {{scheduledWindow}}.",
        variables: ["businessName", "scheduledWindow"]
      }
    ],
    oauthSteps: [
      {
        provider: "gmail",
        label: "Connect the tenant email account",
        required: true,
        status: "needs_owner" as const,
        instructions: "Owner must complete Google consent in NexTeam. Tokens stay in Railway or Firebase secrets only."
      },
      {
        provider: "calendar",
        label: "Connect calendar if the tenant wants external calendar sync",
        required: false,
        status: "deferred" as const,
        instructions: "Calendar OAuth is deferred unless the owner chooses external calendar sync."
      }
    ],
    appStack: session.appStack,
    safeguards: [
      "No outbound sends are enabled by tenant provisioning.",
      "Publishing stays parked until owner approval and domain/DNS setup.",
      "External OAuth steps require owner consent and are never guessed by Nexi."
    ]
  };
  return provisioningPlanSchema.parse(plan) as ProvisioningPlan;
}

function updateAnswer(answers: Record<string, unknown>, field: IntakeField, value: unknown): Record<string, unknown> {
  return { ...answers, [field]: value };
}

export class IntakeService {
  constructor(
    private readonly repository: IntakeRepository,
    private readonly platformRepository: PlatformRepository
  ) {}

  async start(input: unknown, tenantId: string): Promise<IntakeSession> {
    const parsed = startIntakeInputSchema.parse(input);
    const businessName = parsed.businessName?.trim();
    const targetTenantId = parsed.targetTenantId?.trim() || slugify(businessName ?? `tenant-${randomUUID().slice(0, 8)}`);
    const timestamp = now();
    const answers: Record<string, unknown> = {
      ...(businessName ? { businessName } : {}),
      timezone: parsed.timezone
    };
    const step = nextIntakeStep(answers);
    return this.repository.save({
      id: `intake_${randomUUID()}`,
      tenantId,
      targetTenantId,
      ...(businessName ? { businessName } : {}),
      status: "interviewing",
      industryPack: parsed.industryPack,
      plan: parsed.plan,
      answers,
      appStack: [],
      nextQuestion: questionForStep(step),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async answer(input: unknown, tenantId: string): Promise<IntakeSession> {
    const parsed = answerIntakeInputSchema.parse(input);
    const session = await this.repository.get(tenantId, parsed.sessionId);
    if (!session) {
      throw new RailError("Intake session was not found.", { provider: "native", op: "answerIntake", status: 404 });
    }
    const answers = updateAnswer(session.answers, parsed.field, parsed.value);
    const businessName = parsed.field === "businessName" && typeof parsed.value === "string"
      ? parsed.value
      : session.businessName;
    const appStack = parsed.field === "appStack" ? asAppStack(parsed.value) : session.appStack;
    const step = nextIntakeStep(answers);
    return this.repository.save({
      ...session,
      ...(businessName ? { businessName } : {}),
      answers,
      appStack,
      status: step === "plan" ? "plan_ready" : "interviewing",
      nextQuestion: questionForStep(step),
      updatedAt: now()
    });
  }

  async finalize(input: unknown, tenantId: string, approvalQueue: ApprovalQueueService, actorId: string): Promise<{ session: IntakeSession; approvalId: string }> {
    const parsed = finalizeIntakeInputSchema.parse(input);
    const session = await this.repository.get(tenantId, parsed.sessionId);
    if (!session) {
      throw new RailError("Intake session was not found.", { provider: "native", op: "finalizeIntake", status: 404 });
    }
    const plan = buildProvisioningPlan(session);
    const approval = await approvalQueue.create({
      tenantId,
      kind: "tenant_provisioning",
      preview: {
        title: `Provision tenant: ${plan.tenant.name}`,
        body: [
          `Plan: ${plan.tenant.plan}`,
          `Industry pack: ${plan.tenant.industryPack}`,
          `Services: ${plan.nexiBlueprint.services.map((service) => service.name).join(", ")}`,
          `Service area: ${plan.nexiBlueprint.serviceArea.join(", ") || "owner to confirm"}`,
          `OAuth steps: ${plan.oauthSteps.map((step) => `${step.provider} ${step.status}`).join(", ")}`,
          "Executing this approval creates native NexTeam tenant records only. No external accounts, emails, posts, or deploys happen."
        ].join("\n")
      },
      execute: {
        service: "intake",
        op: "provisionTenant",
        args: {
          tenantId,
          sessionId: session.id,
          targetTenantId: plan.tenant.id,
          actorId,
          provisioningPlan: plan,
          externalProvisioningDeferred: true
        }
      },
      createdBy: "nexi"
    });
    const saved = await this.repository.save({
      ...session,
      status: "approval_queued",
      nexiBlueprint: plan.nexiBlueprint,
      provisioningPlan: plan,
      approvalId: approval.id,
      nextQuestion: questionForStep("approval"),
      updatedAt: now()
    });
    return { session: saved, approvalId: approval.id };
  }

  async provisionFromApproval(input: { tenantId: string; sessionId: string; provisioningPlan: ProvisioningPlan; actorId?: string | undefined }): Promise<{ tenant: Tenant; session: IntakeSession; actorId?: string | undefined }> {
    const session = await this.repository.get(input.tenantId, input.sessionId);
    if (!session) {
      throw new RailError("Intake session was not found.", { provider: "native", op: "provisionTenant", status: 404 });
    }
    const plan = provisioningPlanSchema.parse(input.provisioningPlan) as ProvisioningPlan;
    const tenant = await this.platformRepository.upsertTenant(plan.tenant as Tenant);
    const saved = await this.repository.save({
      ...session,
      status: "provisioned",
      nexiBlueprint: plan.nexiBlueprint,
      provisioningPlan: plan,
      nextQuestion: questionForStep("provisioned"),
      updatedAt: now()
    });
    return { tenant, session: saved, ...(input.actorId ? { actorId: input.actorId } : {}) };
  }

  getSession(tenantId: string, sessionId: string): Promise<IntakeSession | null> {
    return this.repository.get(tenantId, sessionId);
  }

  listSessions(tenantId: string): Promise<IntakeSession[]> {
    return this.repository.listByTenant(tenantId);
  }
}
