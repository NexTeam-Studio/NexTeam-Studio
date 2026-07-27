import { createHash, randomBytes, randomUUID } from "node:crypto";
import { RailError, type Client, type EventBus, type Invoice, type Job, type Property } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../comms/gmailRegistry.js";
import type { LedgerRepository } from "./ledgerRepository.js";
import { type ReviewSequenceRecord, type ReviewSequenceRepository, type ReviewSequenceStopReason } from "./reviewSequenceRepository.js";
import { communicationChannelEnabled, resolveTemplateMessage, reviewTemplateVariables } from "./communicationTemplates.js";

function now(): string {
  return new Date().toISOString();
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function maxIso(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? now();
}



function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ReviewSequenceStatusView {
  sequences: ReviewSequenceRecord[];
  activeCount: number;
}

interface ReviewSequenceServiceDeps {
  crmRepository: NativeCrmRepository;
  ledgerRepository: LedgerRepository;
  repository: ReviewSequenceRepository;
  eventBus?: EventBus | undefined;
  commsRail?: CommsRail | undefined;
  publicBaseUrl: string;
}

export class ReviewSequenceService {
  constructor(private readonly deps: ReviewSequenceServiceDeps) {}

  private async jobState(tenantId: string, jobId: string): Promise<{
    job: Job;
    client: Client;
    property?: Property | undefined;
    invoices: Invoice[];
  }> {
    const [jobs, clients, properties, invoices] = await Promise.all([
      this.deps.crmRepository.listJobs(tenantId),
      this.deps.crmRepository.listClients(tenantId),
      this.deps.crmRepository.listProperties(tenantId),
      this.deps.crmRepository.listInvoices(tenantId)
    ]);
    const job = jobs.find((record) => record.id === jobId);
    if (!job) {
      throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "reviewSequenceJobState", status: 404 });
    }
    const client = clients.find((record) => record.id === job.clientId);
    if (!client) {
      throw new RailError(`Client ${job.clientId} was not found for job ${jobId}.`, { provider: "native", op: "reviewSequenceJobState", status: 404 });
    }
    return {
      job,
      client,
      ...(job.propertyId ? { property: properties.find((record) => record.id === job.propertyId) } : {}),
      invoices: invoices.filter((record) => record.jobId === job.id && record.status !== "void" && record.status !== "bad_debt")
    };
  }

  private reviewUrl(tenantId: string, clientId: string, jobId: string): string {
    const query = new URLSearchParams({
      tenantId,
      clientId,
      jobId
    });
    return `${this.deps.publicBaseUrl.replace(/\/$/, "")}/nexportal/review?${query.toString()}`;
  }

  private optOutUrl(record: ReviewSequenceRecord, plainToken: string): string {
    const query = new URLSearchParams({
      tenantId: record.tenantId,
      sequenceId: record.id,
      token: plainToken
    });
    return `${this.deps.publicBaseUrl.replace(/\/$/, "")}/nexportal/reviews/opt-out?${query.toString()}`;
  }

  private async emit(type: "review.sequence_started" | "review.sequence_step_sent" | "review.sequence_stopped" | "review.marked", tenantId: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.eventBus?.emit({
      tenantId,
      type,
      payload
    });
  }

  async listStatus(tenantId: string, filters: { clientId?: string; jobId?: string } = {}): Promise<ReviewSequenceStatusView> {
    const sequences = (await this.deps.repository.listReviewSequences(tenantId))
      .filter((record) => !filters.clientId || record.clientId === filters.clientId)
      .filter((record) => !filters.jobId || record.jobId === filters.jobId);
    return {
      sequences,
      activeCount: sequences.filter((record) => record.status === "active").length
    };
  }

  async maybeStartForJob(input: { tenantId: string; jobId: string; source?: "automatic" | "manual" }): Promise<ReviewSequenceRecord | null> {
    const settings = await this.deps.crmRepository.getCrmSettings(input.tenantId);
    if (!settings.reviewDefaults.enabled || !settings.reviewDefaults.steps.length) {
      return null;
    }
    const existing = (await this.deps.repository.listReviewSequences(input.tenantId)).find((record) => record.jobId === input.jobId);
    if (existing && input.source !== "manual") {
      return null;
    }
    const { job, invoices } = await this.jobState(input.tenantId, input.jobId);
    if (!job.closedAt) {
      return null;
    }
    if (!invoices.length || invoices.some((invoice) => invoice.status !== "paid")) {
      return null;
    }
    const anchorAt = maxIso([
      job.closedAt,
      ...invoices.map((invoice) => invoice.paidAt),
      ...invoices.map((invoice) => invoice.updatedAt)
    ]);
    const optOutPlainToken = randomBytes(18).toString("hex");
    const steps = settings.reviewDefaults.steps
      .slice()
      .sort((left, right) => left.offsetDays - right.offsetDays)
      .map((step) => ({
        id: `${existing?.id ?? `review_sequence_${randomUUID()}`}_${step.id}`,
        label: step.label,
        offsetDays: step.offsetDays,
        channels: step.channels,
        templateCategory: step.templateCategory,
        dueAt: addDaysIso(anchorAt, step.offsetDays),
        status: "pending" as const
      }));
    const record: ReviewSequenceRecord = {
      id: existing?.id ?? `review_sequence_${randomUUID()}`,
      tenantId: input.tenantId,
      clientId: job.clientId,
      jobId: job.id,
      invoiceId: invoices.at(-1)?.id,
      source: input.source ?? "automatic",
      providerState: "gbp_pending",
      status: "active",
      activeStepId: steps[0]?.id,
      nextSendAt: steps[0]?.dueAt,
      steps,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
      optOutTokenHash: hashToken(optOutPlainToken)
    } as ReviewSequenceRecord & { optOutTokenHash: string };
    const saved = await this.deps.repository.upsertReviewSequence(record);
    await this.emit("review.sequence_started", input.tenantId, {
      reviewSequenceId: saved.id,
      clientId: saved.clientId,
      jobId: saved.jobId,
      invoiceId: saved.invoiceId ?? null,
      nextSendAt: saved.nextSendAt ?? null,
      source: saved.source
    });
    return saved;
  }

  async stopSequence(input: { tenantId: string; reviewSequenceId: string; reason: Extract<ReviewSequenceStopReason, "manual" | "opt_out" | "reviewed"> }): Promise<ReviewSequenceRecord> {
    const existing = await this.deps.repository.getReviewSequence(input.tenantId, input.reviewSequenceId);
    if (!existing) {
      throw new RailError(`Review sequence ${input.reviewSequenceId} was not found.`, { provider: "native", op: "stopReviewSequence", status: 404 });
    }
    const timestamp = now();
    const saved = await this.deps.repository.upsertReviewSequence({
      ...existing,
      status: input.reason === "reviewed" ? "completed" : "stopped",
      stopReason: input.reason,
      ...(input.reason === "reviewed" ? { reviewedAt: timestamp } : {}),
      ...(input.reason === "opt_out" ? { optOutAt: timestamp } : {}),
      stoppedAt: timestamp,
      activeStepId: undefined,
      nextSendAt: undefined,
      steps: existing.steps.map((step) => step.status === "pending" ? { ...step, status: "stopped" } : step),
      updatedAt: timestamp
    });
    await this.emit(input.reason === "reviewed" ? "review.marked" : "review.sequence_stopped", input.tenantId, {
      reviewSequenceId: saved.id,
      clientId: saved.clientId,
      jobId: saved.jobId,
      stopReason: input.reason
    });
    if (input.reason === "reviewed") {
      await this.emit("review.sequence_stopped", input.tenantId, {
        reviewSequenceId: saved.id,
        clientId: saved.clientId,
        jobId: saved.jobId,
        stopReason: "reviewed"
      });
    }
    return saved;
  }

  async markReviewed(input: { tenantId: string; reviewSequenceId: string }): Promise<ReviewSequenceRecord> {
    return this.stopSequence({ ...input, reason: "reviewed" });
  }

  async optOut(input: { tenantId: string; reviewSequenceId: string; token: string }): Promise<ReviewSequenceRecord> {
    const existing = await this.deps.repository.getReviewSequence(input.tenantId, input.reviewSequenceId);
    if (!existing) {
      throw new RailError("Review sequence was not found.", { provider: "native", op: "reviewOptOut", status: 404 });
    }
    const hashed = hashToken(input.token);
    const optOutTokenHash = (existing as ReviewSequenceRecord & { optOutTokenHash?: string | undefined }).optOutTokenHash;
    if (!optOutTokenHash || optOutTokenHash !== hashed) {
      throw new RailError("Review opt-out token is invalid.", { provider: "native", op: "reviewOptOut", status: 403 });
    }
    return this.stopSequence({
      tenantId: input.tenantId,
      reviewSequenceId: input.reviewSequenceId,
      reason: "opt_out"
    });
  }

  async syncDueSequences(input: { tenantId: string; at?: string | undefined }): Promise<ReviewSequenceRecord[]> {
    const referenceTime = input.at ?? now();
    const all = await this.deps.repository.listReviewSequences(input.tenantId);
    const active = all.filter((record) => record.status === "active" && record.nextSendAt && record.nextSendAt <= referenceTime);
    const updated: ReviewSequenceRecord[] = [];
    for (const record of active) {
      const pendingStep = record.steps.find((step) => step.id === record.activeStepId) ?? record.steps.find((step) => step.status === "pending");
      if (!pendingStep) {
        updated.push(await this.stopSequence({
          tenantId: record.tenantId,
          reviewSequenceId: record.id,
          reason: "manual"
        }));
        continue;
      }
      const { job, client, property } = await this.jobState(record.tenantId, record.jobId);
      const plainToken = randomBytes(18).toString("hex");
      const nextOptOutHash = hashToken(plainToken);
      const variables = reviewTemplateVariables({
        tenantId: record.tenantId,
        client,
        reviewUrl: this.reviewUrl(record.tenantId, record.clientId, record.jobId),
        optOutUrl: this.optOutUrl(record, plainToken),
        job,
        property
      });
      const settings = await this.deps.crmRepository.getCrmSettings(record.tenantId);
      const sentChannels: string[] = [];
      if ((pendingStep.channels === "email" || pendingStep.channels === "both")
        && client.emails[0]
        && this.deps.commsRail?.sendAdapter
        && communicationChannelEnabled(settings, pendingStep.templateCategory, "email")) {
        const template = resolveTemplateMessage({
          settings,
          category: pendingStep.templateCategory,
          channel: "email",
          fallbackSubject: "How did the work go?",
          fallbackBodyText: `Thanks for working with ${client.name}. If you have a minute, leave a review here: ${variables.REVIEW_URL}\n\nStop review requests: ${variables.REVIEW_OPTOUT_URL}`,
          variables
        });
        if (template.enabled) {
          await this.deps.commsRail.sendAdapter.sendEmail({
            tenantId: record.tenantId,
            mailbox: this.deps.commsRail.sendAdapter.mailbox,
            to: [client.emails[0]],
            subject: template.subject,
            bodyText: template.bodyText
          });
          sentChannels.push("email");
        }
      }
      if ((pendingStep.channels === "sms" || pendingStep.channels === "both")
        && client.phones[0]
        && this.deps.commsRail?.sendSms
        && communicationChannelEnabled(settings, pendingStep.templateCategory, "sms")) {
        const template = resolveTemplateMessage({
          settings,
          category: pendingStep.templateCategory,
          channel: "sms",
          fallbackSubject: "Review request",
          fallbackBodyText: `If the visit went well, leave a review here: ${variables.REVIEW_URL}. Stop review requests: ${variables.REVIEW_OPTOUT_URL}`,
          variables
        });
        if (template.enabled) {
          await this.deps.commsRail.sendSms({
            tenantId: record.tenantId,
            to: client.phones[0],
            body: template.bodyText
          });
          sentChannels.push("sms");
        }
      }
      const timestamp = referenceTime;
      const steps = record.steps.map((step) => step.id === pendingStep.id ? {
        ...step,
        status: "sent" as const,
        sentAt: timestamp
      } : step);
      const nextPending = steps.find((step) => step.status === "pending");
      const nextRecord = await this.deps.repository.upsertReviewSequence({
        ...record,
        status: nextPending ? "active" : "completed",
        activeStepId: nextPending?.id,
        nextSendAt: nextPending?.dueAt,
        stopReason: nextPending ? undefined : "exhausted",
        stoppedAt: nextPending ? undefined : timestamp,
        steps,
        updatedAt: timestamp,
        optOutTokenHash: nextOptOutHash
      } as ReviewSequenceRecord & { optOutTokenHash: string });
      await this.emit("review.sequence_step_sent", record.tenantId, {
        reviewSequenceId: nextRecord.id,
        clientId: nextRecord.clientId,
        jobId: nextRecord.jobId,
        stepId: pendingStep.id,
        channels: sentChannels,
        sentAt: timestamp
      });
      if (!nextPending) {
        await this.emit("review.sequence_stopped", record.tenantId, {
          reviewSequenceId: nextRecord.id,
          clientId: nextRecord.clientId,
          jobId: nextRecord.jobId,
          stopReason: "exhausted"
        });
      }
      updated.push(nextRecord);
    }
    return updated;
  }
}
