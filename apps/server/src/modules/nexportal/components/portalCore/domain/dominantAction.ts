import { dominantActionStateSchema, type DominantActionState, type ClientScheduleRequestStatus } from "@nexteam/core";

export function deriveClientScheduleRequestDominantAction(status: ClientScheduleRequestStatus): DominantActionState {
  if (status === "pending") {
    return dominantActionStateSchema.parse({
      label: "Resolve request",
      tone: "dominant",
      reason: "Client schedule requests never auto-apply; staff has to act.",
      nextCommandId: "client_schedule_request.accept_reschedule"
    });
  }
  if (status === "counter_proposed") {
    return dominantActionStateSchema.parse({
      label: "Wait for customer",
      tone: "quiet",
      reason: "A counter-proposal is already out and the current state is passive."
    });
  }
  return dominantActionStateSchema.parse({
    label: "View resolution",
    tone: "quiet",
    reason: "This request already has a final staff decision."
  });
}
