export interface VisitCompletionState {
  readOnly?: boolean;
  status: string;
}

export function visitCanBeCompleted(visit: VisitCompletionState): boolean {
  const status = visit.status.trim().toLowerCase();
  return !visit.readOnly && status !== "complete" && status !== "completed" && status !== "cancelled" && status !== "canceled";
}
