import type { ApprovalItem, ApprovalQueueService } from "@nexteam/core";
import type { ScheduledVisit } from "./schedulingEngine.js";

export type ScheduleNotificationKind = "booking" | "reminder" | "on_my_way";
export type ScheduleNotificationChannel = "email" | "sms";

export interface QueueScheduleNotificationInput {
  approvalQueue: ApprovalQueueService;
  tenantId: string;
  visit: ScheduledVisit;
  notificationKind: ScheduleNotificationKind;
  channel?: ScheduleNotificationChannel | undefined;
  to?: string | null | undefined;
  etaMinutes?: number | undefined;
}

function notificationTitle(kind: ScheduleNotificationKind, visit: ScheduledVisit): string {
  if (kind === "reminder") {
    return `Visit reminder: ${visit.title}`;
  }
  if (kind === "on_my_way") {
    return `On-my-way message: ${visit.title}`;
  }
  return `Booking notification: ${visit.title}`;
}

function notificationBody(input: QueueScheduleNotificationInput): string {
  if (input.notificationKind === "reminder") {
    return `Reminder draft for ${input.visit.title}: ${input.visit.start} - ${input.visit.end}. Outbound message requires approval.`;
  }
  if (input.notificationKind === "on_my_way") {
    const eta = input.etaMinutes ? ` ETA ${input.etaMinutes} minutes.` : "";
    return `On-my-way draft for ${input.visit.title}.${eta} Outbound message requires approval.`;
  }
  return `Visit is parked for ${input.visit.start} - ${input.visit.end}. Outbound notification requires approval.`;
}

function opForKind(kind: ScheduleNotificationKind): string {
  if (kind === "reminder") {
    return "sendVisitReminder";
  }
  if (kind === "on_my_way") {
    return "sendOnMyWayMessage";
  }
  return "sendBookingNotification";
}

export async function queueScheduleNotification(input: QueueScheduleNotificationInput): Promise<ApprovalItem> {
  const channel = input.channel ?? "email";
  return input.approvalQueue.create({
    tenantId: input.tenantId,
    kind: channel,
    preview: {
      title: notificationTitle(input.notificationKind, input.visit),
      body: notificationBody(input)
    },
    execute: {
      service: "scheduling",
      op: opForKind(input.notificationKind),
      args: {
        visitId: input.visit.id,
        to: input.to ?? null,
        channel,
        etaMinutes: input.etaMinutes ?? null
      }
    },
    createdBy: "nexi"
  });
}
