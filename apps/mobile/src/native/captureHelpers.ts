import { distanceMeters } from "../offline/geo.js";
import type { GeoPoint } from "../offline/schemas.js";
import type { CaptureRequestDraft, CaptureSessionDraft, MobileSession } from "./captureModels.js";

export const LOCAL_MOBILE_SESSION_MAX_AGE_HOURS = 168;
export const TODAY_VISIT_SUGGEST_RADIUS_METERS = 150;
export const KNOWN_PROPERTY_SUGGEST_RADIUS_METERS = 300;

export interface CaptureSuggestionCandidate {
  kind: "today_visit" | "known_property";
  clientId?: string | null | undefined;
  clientName?: string | null | undefined;
  propertyId?: string | null | undefined;
  propertyName?: string | null | undefined;
  jobId?: string | null | undefined;
  visitId?: string | null | undefined;
  priority?: number | null | undefined;
  serviceAddress: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    geo?: GeoPoint | undefined;
  };
}

export interface CaptureSuggestionMatch {
  candidate: CaptureSuggestionCandidate;
  distanceMeters: number;
  matchedBy: "today_visit" | "property_proximity";
}

export function shouldReauthenticate(
  session: Pick<MobileSession, "lastAuthenticatedAt">,
  nowIso: string = new Date().toISOString(),
  maxAgeHours: number = LOCAL_MOBILE_SESSION_MAX_AGE_HOURS
): boolean {
  const last = Date.parse(session.lastAuthenticatedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) {
    return true;
  }
  return (now - last) / (1000 * 60 * 60) >= maxAgeHours;
}

export function requestDraftFieldValues(draft: CaptureRequestDraft): Array<{
  key: string;
  value: string | number | boolean | string[];
}> {
  return [
    { key: "client_name", value: draft.clientName },
    ...(draft.email?.trim() ? [{ key: "email", value: draft.email.trim() }] : []),
    ...(draft.phone?.trim() ? [{ key: "phone", value: draft.phone.trim() }] : []),
    { key: "property_street1", value: draft.propertyStreet1 },
    { key: "property_city", value: draft.propertyCity },
    { key: "property_province", value: draft.propertyProvince },
    { key: "property_postal_code", value: draft.propertyPostalCode },
    { key: "issue_summary", value: draft.issueSummary },
    ...(draft.gateCode?.trim() ? [{ key: "gate_code", value: draft.gateCode.trim() }] : []),
    { key: "pet_present", value: draft.petPresent },
    ...(draft.petName?.trim() ? [{ key: "pet_name", value: draft.petName.trim() }] : []),
    ...(draft.poolType?.trim() ? [{ key: "pool_type", value: draft.poolType.trim() }] : [])
  ];
}

export function findCaptureSuggestion(
  point: GeoPoint | null | undefined,
  candidates: CaptureSuggestionCandidate[]
): CaptureSuggestionMatch | null {
  if (!point) {
    return null;
  }
  const ranked = candidates
    .filter((candidate) => candidate.serviceAddress.geo)
    .map((candidate) => ({
      candidate,
      distanceMeters: Math.round(distanceMeters(point, candidate.serviceAddress.geo!)),
      thresholdMeters: candidate.kind === "today_visit"
        ? TODAY_VISIT_SUGGEST_RADIUS_METERS
        : KNOWN_PROPERTY_SUGGEST_RADIUS_METERS
    }))
    .filter((entry) => entry.distanceMeters <= entry.thresholdMeters)
    .sort((left, right) => {
      const leftPriority = left.candidate.priority ?? (left.candidate.kind === "today_visit" ? 1 : 2);
      const rightPriority = right.candidate.priority ?? (right.candidate.kind === "today_visit" ? 1 : 2);
      return leftPriority - rightPriority || left.distanceMeters - right.distanceMeters;
    })[0];

  if (!ranked) {
    return null;
  }
  return {
    candidate: ranked.candidate,
    distanceMeters: ranked.distanceMeters,
    matchedBy: ranked.candidate.kind === "today_visit" ? "today_visit" : "property_proximity"
  };
}

export function sessionHasQueuedWork(session: CaptureSessionDraft): boolean {
  if (session.syncStatus === "queued" || session.syncStatus === "failed" || session.syncStatus === "syncing") {
    return true;
  }
  return session.photos.some((photo) => photo.syncStatus !== "synced")
    || session.checklists.some((checklist) => checklist.syncStatus !== "synced")
    || session.visitNarrations.some((narration) => narration.transcriptionStatus === "pending_sync" || narration.transcriptionStatus === "failed");
}

export function deriveSessionSyncStatus(session: CaptureSessionDraft): CaptureSessionDraft["syncStatus"] {
  const hasFailed = session.photos.some((photo) => photo.syncStatus === "failed")
    || session.checklists.some((checklist) => checklist.syncStatus === "failed")
    || session.visitNarrations.some((narration) => narration.transcriptionStatus === "failed");
  if (hasFailed || session.lastError) {
    return "failed";
  }
  const hasQueued = session.photos.some((photo) => photo.syncStatus !== "synced")
    || session.checklists.some((checklist) => checklist.syncStatus !== "synced")
    || session.visitNarrations.some((narration) => narration.transcriptionStatus !== "ready");
  if (hasQueued) {
    return "queued";
  }
  return session.remoteBatchId ? "synced" : "draft";
}
