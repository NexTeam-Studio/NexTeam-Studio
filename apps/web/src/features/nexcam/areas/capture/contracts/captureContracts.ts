import type { FieldDocsMediaRecord } from "../../../../nexopsShell/contracts/workspaceContracts";

export interface CaptureBatchRecord {
  id: string;
  tenantId: string;
  status: "draft" | "unassigned" | "assigned";
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  mediaIds: string[];
  latestCapturedAt?: string;
  originGps?: { lat: number; lng: number };
  latestGps?: { lat: number; lng: number };
  assignedClientId?: string;
  assignedJobId?: string;
  assignedVisitId?: string;
  assignedRequestId?: string;
  assignmentMode?: "existing_client" | "request" | "decide_later";
  assignedAt?: string;
  media: FieldDocsMediaRecord[];
}

export interface CaptureBatchListResponse {
  ok: boolean;
  batches?: CaptureBatchRecord[];
  error?: string;
}

export interface CaptureBatchMutationResponse {
  ok: boolean;
  batch?: CaptureBatchRecord;
  media?: FieldDocsMediaRecord[];
  requestId?: string;
  clientId?: string;
  error?: string;
}

export interface CaptureClientTargetJob {
  id: string;
  number?: string;
  title: string;
  status: string;
  propertyId?: string;
}

export interface CaptureClientTargetVisit {
  id: string;
  jobId: string;
  title: string;
  status: string;
  start: string;
  end: string;
}

export interface CaptureClientTargetsResponse {
  ok: boolean;
  jobs?: CaptureClientTargetJob[];
  visits?: CaptureClientTargetVisit[];
  error?: string;
}

export type CaptureWorkspaceView = "session" | "unassigned";
export type CaptureSessionMode = "fresh" | "choose" | "new-client" | "existing-client" | "continued" | "unassigned";
export type CaptureSessionOrigin = "new" | "reopened";

export interface CaptureRequestIntent {
  batchId: string;
  mediaIds: string[];
}
