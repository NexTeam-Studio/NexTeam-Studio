import { randomUUID } from "node:crypto";
import type { TenantUser } from "@nexteam/core";
import type { SchedulingRepository } from "../../../../../../../scheduling/repository.js";
import type { ScheduledVisit } from "../../../../../../../scheduling/schedulingEngine.js";
import type { CommsRail } from "../../../../../../../comms/gmailRegistry.js";
import type { JobDetailRecord } from "../../../../jobs/components/jobCore/server/jobLifecycleService.js";
import { pendingVisitRemindersForVisit, requireJobLifecycleRecord, type JobActionAlertRecord, type JobLifecycleEventRecord, type JobLifecycleRepository, type VisitReminderRecord } from "../../../../jobs/components/jobCore/server/jobLifecycleRepository.js";

export interface ScheduleJobVisitInput {
  tenantId: string;
  jobId: string;
  title?: string | undefined;
  start: string;
  end: string;
  assignedTo?: string[] | undefined;
  details?: string | undefined;
  customFields?: ScheduledVisit["customFields"] | undefined;
}

export interface ScheduleJobVisitSeriesInput {
  tenantId: string;
  jobId: string;
  visits: Array<Omit<ScheduleJobVisitInput, "tenantId" | "jobId">>;
}

export interface MoveJobVisitInput {
  tenantId: string;
  visitId: string;
  start: string;
  end: string;
}

export interface MoveJobVisitSeriesInput extends MoveJobVisitInput {
  shiftRemaining?: boolean | undefined;
}

export interface CompleteJobVisitInput {
  tenantId: string;
  visitId: string;
  actorId: string;
}

interface VisitCoreDeps {
  schedulingRepository: SchedulingRepository;
  lifecycleRepository: JobLifecycleRepository;
  commsRail?: CommsRail;
  getJobDetail: (tenantId: string, jobId: string, referenceTime?: string) => Promise<JobDetailRecord | null>;
  getReminderJobDetail: (tenantId: string, jobId: string, referenceTime: string) => Promise<JobDetailRecord | null>;
  tenantUsers: (tenantId: string) => Promise<TenantUser[]>;
  emitLifecycleEvent: (record: Omit<JobLifecycleEventRecord, "id">) => Promise<JobLifecycleEventRecord>;
}

function now(): string {
  return new Date().toISOString();
}

function activeVisit(visit: ScheduledVisit): boolean {
  return visit.status !== "complete" && visit.status !== "cancelled";
}

function shiftIso(value: string, deltaMs: number): string {
  return new Date(new Date(value).getTime() + deltaMs).toISOString();
}

function jobLocationLabel(job: JobDetailRecord): string {
  if (job.property?.siteName?.trim()) return job.property.siteName.trim();
  if (job.property?.label?.trim()) return job.property.label.trim();
  if (job.property?.address) {
    return [job.property.address.street1, job.property.address.city, job.property.address.province, job.property.address.postalCode].filter(Boolean).join(", ");
  }
  return job.client?.name ?? "Service address";
}

function technicianNames(users: TenantUser[], assignedTo: string[]): string {
  const names = assignedTo
    .map((userId) => users.find((candidate) => candidate.id === userId)?.displayName)
    .filter((value): value is string => Boolean(value?.trim()));
  return names.length ? names.join(", ") : "your assigned technician";
}

function reminderAccessNote(job: JobDetailRecord): string | undefined {
  const gateCode = job.property?.access?.gateCode
    || (typeof job.intake?.fieldIndex?.gate_code === "string" ? job.intake.fieldIndex.gate_code : undefined);
  const accessNotes = job.property?.access?.accessNotes;
  if (gateCode && accessNotes) return `Gate code ${gateCode}. ${accessNotes}`;
  if (gateCode) return `Gate code ${gateCode}.`;
  return accessNotes;
}

function reminderChannelsAllowed(job: JobDetailRecord): { email: boolean; sms: boolean } {
  const channel = job.client?.communicationSettings?.jobReminders ?? "both";
  return {
    email: job.client?.consent.email !== false && (channel === "email" || channel === "both"),
    sms: job.client?.consent.sms !== false && (channel === "sms" || channel === "both")
  };
}

async function sendLifecycleEmail(commsRail: CommsRail | undefined, outbound: { tenantId: string; to: string[]; subject: string; bodyText: string }): Promise<void> {
  if (!commsRail?.sendAdapter || !outbound.to.length) return;
  await commsRail.sendAdapter.sendEmail({
    tenantId: outbound.tenantId,
    mailbox: commsRail.sendAdapter.mailbox,
    to: outbound.to,
    subject: outbound.subject,
    bodyText: outbound.bodyText
  });
}

async function sendLifecycleSms(commsRail: CommsRail | undefined, outbound: { tenantId: string; to: string; body: string }): Promise<void> {
  if (!commsRail?.sendSms || !outbound.to.trim()) return;
  await commsRail.sendSms(outbound);
}

export class VisitCoreService {
  constructor(private readonly deps: VisitCoreDeps) {}

  private async regenerateReminders(tenantId: string, jobId: string, visit: ScheduledVisit): Promise<VisitReminderRecord[]> {
    const existing = (await this.deps.lifecycleRepository.listVisitReminders(tenantId))
      .filter((record) => record.visitId === visit.id && record.status === "pending");
    const cancelledAt = now();
    for (const reminder of existing) {
      await this.deps.lifecycleRepository.upsertVisitReminder({ ...reminder, status: "cancelled", cancelledAt });
    }
    if (!activeVisit(visit)) return [];
    const start = new Date(visit.start).getTime();
    const reminders: VisitReminderRecord[] = [
      { id: `visit_reminder_${randomUUID()}`, tenantId, jobId, visitId: visit.id, channel: "email", trigger: "day_before_email", dueAt: new Date(start - 86400000).toISOString(), status: "pending", createdAt: now() },
      { id: `visit_reminder_${randomUUID()}`, tenantId, jobId, visitId: visit.id, channel: "sms", trigger: "hour_before_sms", dueAt: new Date(start - 3600000).toISOString(), status: "pending", createdAt: now() }
    ];
    for (const reminder of reminders) await this.deps.lifecycleRepository.upsertVisitReminder(reminder);
    return reminders;
  }

  async processDueVisitReminders(tenantId: string, referenceTime = now()): Promise<void> {
    const reminders = await this.deps.lifecycleRepository.listVisitReminders(tenantId);
    for (const reminder of reminders.filter((record) => record.status === "pending" && record.dueAt <= referenceTime)) {
      const visit = await this.deps.schedulingRepository.getVisit(tenantId, reminder.visitId);
      const job = await this.deps.getReminderJobDetail(tenantId, reminder.jobId, referenceTime);
      if (!visit || !job || !activeVisit(visit)) {
        await this.deps.lifecycleRepository.upsertVisitReminder({ ...reminder, status: "cancelled", cancelledAt: referenceTime });
        continue;
      }
      const allowed = reminderChannelsAllowed(job);
      const accessNote = reminderAccessNote(job);
      const techSummary = technicianNames(await this.deps.tenantUsers(tenantId), visit.assignedTo);
      if (reminder.channel === "email" && allowed.email && job.client?.emails[0]) {
        await sendLifecycleEmail(this.deps.commsRail, {
          tenantId,
          to: [job.client.emails[0]],
          subject: `Visit reminder for ${job.title}`,
          bodyText: [
            `Your visit for ${job.title} is scheduled for ${new Date(visit.start).toLocaleString()}.`,
            `Arrival window: ${new Date(visit.start).toLocaleTimeString()} to ${new Date(visit.end).toLocaleTimeString()}.`,
            `Technician: ${techSummary}.`,
            `Location: ${jobLocationLabel(job)}.`,
            accessNote ? `Access note: ${accessNote}` : ""
          ].filter(Boolean).join("\n")
        });
      }
      if (reminder.channel === "sms" && allowed.sms && job.client?.phones[0]) {
        await sendLifecycleSms(this.deps.commsRail, {
          tenantId,
          to: job.client.phones[0],
          body: [
            `${job.title} arrival window: ${new Date(visit.start).toLocaleTimeString()}-${new Date(visit.end).toLocaleTimeString()}.`,
            `Tech: ${techSummary}.`,
            accessNote ?? ""
          ].filter(Boolean).join(" ")
        });
      }
      await this.deps.lifecycleRepository.upsertVisitReminder({ ...reminder, status: "sent", sentAt: referenceTime });
    }
  }

  async scheduleVisit(input: ScheduleJobVisitInput): Promise<ScheduledVisit> {
    const job = requireJobLifecycleRecord(await this.deps.getJobDetail(input.tenantId, input.jobId), `Native job ${input.jobId} was not found.`, "scheduleVisit");
    const visit: ScheduledVisit = {
      id: `visit_${randomUUID()}`,
      tenantId: input.tenantId,
      jobId: input.jobId,
      requestId: job.requestId,
      title: input.title?.trim() || job.title,
      start: input.start,
      end: input.end,
      assignedTo: input.assignedTo ?? [],
      location: { label: jobLocationLabel(job), ...(job.property?.address ? { address: job.property.address } : {}) },
      status: "scheduled",
      ...(job.intake ? { intake: job.intake } : {}),
      ...(input.details?.trim() ? { details: input.details.trim() } : {}),
      ...(input.customFields ? { customFields: input.customFields } : {})
    };
    const saved = await this.deps.schedulingRepository.saveVisit(visit);
    await this.regenerateReminders(input.tenantId, input.jobId, saved);
    await this.deps.emitLifecycleEvent({ tenantId: input.tenantId, jobId: input.jobId, type: "visit.booked", createdAt: now(), payload: { visitId: saved.id, start: saved.start, end: saved.end } });
    return saved;
  }

  async scheduleVisitSeries(input: ScheduleJobVisitSeriesInput): Promise<ScheduledVisit[]> {
    const created: ScheduledVisit[] = [];
    for (const visit of input.visits) created.push(await this.scheduleVisit({ tenantId: input.tenantId, jobId: input.jobId, ...visit }));
    return created;
  }

  async moveVisit(input: MoveJobVisitInput): Promise<ScheduledVisit> {
    const visit = requireJobLifecycleRecord(await this.deps.schedulingRepository.getVisit(input.tenantId, input.visitId), `Visit ${input.visitId} was not found.`, "moveVisit");
    const moved = await this.deps.schedulingRepository.saveVisit({ ...visit, start: input.start, end: input.end });
    await this.regenerateReminders(input.tenantId, moved.jobId, moved);
    await this.deps.emitLifecycleEvent({ tenantId: input.tenantId, jobId: moved.jobId, type: "job.state_changed", createdAt: now(), payload: { reason: "visit_rescheduled", visitId: moved.id, start: moved.start, end: moved.end } });
    return moved;
  }

  async moveVisitSeries(input: MoveJobVisitSeriesInput): Promise<{ visit: ScheduledVisit; shiftedVisits: ScheduledVisit[] }> {
    const original = requireJobLifecycleRecord(await this.deps.schedulingRepository.getVisit(input.tenantId, input.visitId), `Visit ${input.visitId} was not found.`, "moveVisitSeries");
    const moved = await this.moveVisit(input);
    const deltaMs = new Date(input.start).getTime() - new Date(original.start).getTime();
    if (!input.shiftRemaining || !Number.isFinite(deltaMs) || deltaMs === 0) return { visit: moved, shiftedVisits: [] };
    const following = (await this.deps.schedulingRepository.listVisits(input.tenantId, { from: original.start }))
      .filter((candidate) => candidate.jobId === original.jobId && candidate.id !== original.id && activeVisit(candidate) && candidate.start >= original.start)
      .sort((left, right) => left.start.localeCompare(right.start));
    const shiftedVisits: ScheduledVisit[] = [];
    for (const candidate of following) {
      const shifted = await this.deps.schedulingRepository.saveVisit({ ...candidate, start: shiftIso(candidate.start, deltaMs), end: shiftIso(candidate.end, deltaMs) });
      await this.regenerateReminders(input.tenantId, shifted.jobId, shifted);
      await this.deps.emitLifecycleEvent({ tenantId: input.tenantId, jobId: shifted.jobId, type: "job.state_changed", createdAt: now(), payload: { reason: "visit_shifted_with_series", visitId: shifted.id, anchorVisitId: moved.id, offsetMinutes: Math.round(deltaMs / 60000), start: shifted.start, end: shifted.end } });
      shiftedVisits.push(shifted);
    }
    return { visit: moved, shiftedVisits };
  }

  async completeVisit(input: CompleteJobVisitInput): Promise<{ visit: ScheduledVisit; job: JobDetailRecord; actionAlert?: JobActionAlertRecord }> {
    const visit = requireJobLifecycleRecord(await this.deps.schedulingRepository.getVisit(input.tenantId, input.visitId), `Visit ${input.visitId} was not found.`, "completeVisit");
    const completedAt = now();
    const savedVisit = await this.deps.schedulingRepository.saveVisit({ ...visit, status: "complete", completedAt, completedBy: input.actorId });
    for (const reminder of pendingVisitRemindersForVisit(await this.deps.lifecycleRepository.listVisitReminders(input.tenantId), savedVisit.id)) {
      await this.deps.lifecycleRepository.upsertVisitReminder({ ...reminder, status: "cancelled", cancelledAt: completedAt });
    }
    await this.deps.emitLifecycleEvent({ tenantId: input.tenantId, jobId: savedVisit.jobId, type: "visit.completed", createdAt: completedAt, payload: { visitId: savedVisit.id, completedBy: input.actorId } });
    const detail = requireJobLifecycleRecord(await this.deps.getJobDetail(input.tenantId, savedVisit.jobId, completedAt), `Native job ${savedVisit.jobId} was not found.`, "completeVisit");
    let actionAlert: JobActionAlertRecord | undefined;
    if (!detail.visits.some(activeVisit) && !detail.reminders.invoice) {
      actionAlert = await this.deps.lifecycleRepository.upsertJobActionAlert(detail.reminders.actionAlert ?? {
        id: `job_alert_${randomUUID()}`, tenantId: input.tenantId, jobId: detail.id, kind: "close_or_invoice_review", status: "pending", createdAt: completedAt,
        note: "Last scheduled visit completed. Owner or office admin must close, invoice, or both."
      });
      const users = await this.deps.tenantUsers(input.tenantId);
      const recipients = [...new Set(users.filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN")).flatMap((user) => user.email ? [user.email.trim().toLowerCase()] : []).filter(Boolean))];
      await sendLifecycleEmail(this.deps.commsRail, { tenantId: input.tenantId, to: recipients, subject: `Job ready for office review: ${detail.title}`, bodyText: `${detail.title} has no remaining scheduled visits.\nChoose Close, Invoice, or Close and Invoice from the job screen or in chat.` });
    }
    const refreshed = requireJobLifecycleRecord(await this.deps.getJobDetail(input.tenantId, savedVisit.jobId, completedAt), `Native job ${savedVisit.jobId} was not found.`, "completeVisit");
    return { visit: savedVisit, job: refreshed, ...(actionAlert ? { actionAlert } : {}) };
  }
}
