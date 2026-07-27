import { dominantActionStateSchema, type DominantActionState, type VisitLifecycleStatus, type VisitScheduleStatus, type VisitTravelStatus } from "@nexteam/core";

export function deriveVisitDominantAction(input: {
  scheduleStatus: VisitScheduleStatus;
  travelStatus: VisitTravelStatus;
  visitStatus: VisitLifecycleStatus;
  fieldDocumentationComplete: boolean;
  blockedByCapacity?: boolean | undefined;
}): DominantActionState {
  if (input.scheduleStatus === "unscheduled") {
    return dominantActionStateSchema.parse({
      label: "Schedule visit",
      tone: "dominant",
      reason: "Unscheduled work needs a booked time before field work can start.",
      nextCommandId: "job.schedule_visit"
    });
  }
  if (input.visitStatus === "not_started" && input.travelStatus === "not_started") {
    return dominantActionStateSchema.parse({
      label: "Start travel",
      tone: "dominant",
      reason: "The visit is scheduled and ready for the crew to head out.",
      nextCommandId: "visit.start_travel"
    });
  }
  if (input.visitStatus === "not_started" && input.travelStatus === "traveling") {
    return dominantActionStateSchema.parse({
      label: "Mark arrived",
      tone: "dominant",
      reason: "Travel has started and the next field state is arrival.",
      nextCommandId: "visit.mark_arrived"
    });
  }
  if (input.visitStatus === "in_progress" && !input.fieldDocumentationComplete) {
    return dominantActionStateSchema.parse({
      label: "Complete visit",
      tone: "blocked",
      reason: "The visit can finish once the required documentation is complete.",
      blockedBy: "Field documentation incomplete",
      nextCommandId: "visit.complete"
    });
  }
  if (input.visitStatus === "in_progress" || input.visitStatus === "paused") {
    return dominantActionStateSchema.parse({
      label: "Complete visit",
      tone: "dominant",
      reason: "Field work is underway and can be completed now.",
      nextCommandId: "visit.complete"
    });
  }
  if (input.blockedByCapacity) {
    return dominantActionStateSchema.parse({
      label: "Reschedule visit",
      tone: "blocked",
      reason: "The requested window is full.",
      blockedBy: "Capacity conflict",
      nextCommandId: "visit.reschedule"
    });
  }
  return dominantActionStateSchema.parse({
    label: "View visit",
    tone: "quiet",
    reason: "This visit is either completed or canceled."
  });
}
